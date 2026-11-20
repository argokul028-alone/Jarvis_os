import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile, execFileSync, spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { parsePrivilegeCommand, type ParsedPrivilegeAction } from './src/utils/terminal-sudo-parser.ts';
import {
  parseIpRouteDefaultGateway,
  parseIwScanOutput,
  parseNmcliWifiList,
  parseResolvConfDns,
  splitNmcliTerseLine,
} from './src/utils/linux-wifi-parser.ts';
import type { SystemNetworkInterface, WifiNetwork } from './src/types/os.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Google GenAI client if API key is provided
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI with provided key:', err);
  }
}

// Quota & rate-limit resilience for Gemini endpoints (avoids noisy 429 retries and falls back gracefully)
const GEMINI_QUOTA_COOLDOWN_MS = 2 * 60 * 1000;
const SEARCH_GROUNDING_CACHE_TTL_MS = 5 * 60 * 1000;
let geminiTextCooldownUntil = 0;
let geminiGroundingCooldownUntil = 0;

interface CachedGroundedSearch {
  expiresAt: number;
  data: {
    overviewText: string;
    citedDomains: string[];
    results: ServerSearchResult[];
  };
}
const searchGroundingCache = new Map<string, CachedGroundedSearch>();

function isGeminiQuotaError(err: any): boolean {
  const status = err?.status ?? err?.code ?? err?.error?.code;
  if (status === 429) return true;
  const msg = String(err?.message || err || '');
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('rate limit') ||
    msg.toLowerCase().includes('rate-limit')
  );
}

async function generateGeminiWithFallback(options: {
  contents: string;
  systemInstruction?: string;
  useGoogleSearch?: boolean;
}): Promise<{ text: string; modelUsed: string; response: any } | null> {
  if (!aiClient || !process.env.GEMINI_API_KEY) return null;

  const now = Date.now();
  if (options.useGoogleSearch && now < geminiGroundingCooldownUntil) {
    return null;
  }
  if (!options.useGoogleSearch && now < geminiTextCooldownUntil) {
    return null;
  }

  const attempts: Array<{ model: string; thinkingLevel?: ThinkingLevel }> = options.useGoogleSearch
    ? [
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
        { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
      ]
    : [
        { model: 'gemini-4-hydrogen' },
        { model: 'gemini-3.1-flash-lite' },
      ];

  let sawQuota = false;

  for (const attempt of attempts) {
    try {
      const config: Record<string, any> = {};
      if (options.systemInstruction) {
        config.systemInstruction = options.systemInstruction;
      }
      if (options.useGoogleSearch) {
        config.tools = [{ googleSearch: {} }];
      }
      if (attempt.thinkingLevel) {
        config.thinkingConfig = { thinkingLevel: attempt.thinkingLevel };
      }

      const response = await aiClient.models.generateContent({
        model: attempt.model,
        contents: options.contents,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      });

      return {
        text: (response.text || '').trim(),
        modelUsed: attempt.model,
        response,
      };
    } catch (err: any) {
      if (isGeminiQuotaError(err)) {
        sawQuota = true;
        continue;
      }
      // Non-quota transient failure: try fallback model once before returning null
      continue;
    }
  }

  if (sawQuota) {
    const cooldownUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
    if (options.useGoogleSearch) {
      geminiGroundingCooldownUntil = cooldownUntil;
    } else {
      geminiTextCooldownUntil = cooldownUntil;
    }
    console.info(
      `[Gemini] Rate limit reached for ${options.useGoogleSearch ? 'search grounding' : 'text generation'}; pausing Gemini calls for 2m while live web fallbacks handle requests.`
    );
  }

  return null;
}

// System Status API
app.get('/api/system/telemetry', (_req, res) => {
  res.json({
    os: 'JARVISOS v1.0.4-aegis',
    kernel: 'Aegis Microkernel EL1 (ARMv9.2-A / x86_64 Emulated)',
    targetHardware: 'Lenovo E41-25 (AMD A6-9225 APU @ 2.6-3.0GHz, Radeon R4 Graphics)',
    memory: {
      totalMb: 4096,
      zramCompressedMb: 2048,
      effectiveAvailableMb: 6144,
      usedMb: 1480,
      breakdown: {
        osAndKiosk: 185,
        voskStt: 95,
        piperTts: 48,
        qwenSlm: 1040,
        heliosHud: 112,
      },
    },
    storage: {
      totalGb: 256,
      type: 'NVMe/SATA SSD (NovaFS CoW Zoned)',
      freeGb: 238.4,
      wearLevelPercentage: 0.8,
    },
    security: {
      vaultStatus: 'S-EL1 Enclave Hardware Verified',
      mteEnabled: true,
      cryptoEngine: 'Dilithium-3 / Ed25519 Hybrid Post-Quantum Root',
      efuseRollbackCounter: 4,
    },
    scheduler: {
      model: 'Energy-Aware Scheduler (EAS)',
      governor: 'DVFS Proportional-Integral-Derivative',
      cpuTempC: 44.2,
      activeThreads: 42,
    },
  });
});

// Gemini AI Chat Endpoint
app.post('/api/gemini/chat', async (req, res) => {
  const { prompt, history } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // System prompt defining JARVIS personality and deep technical awareness of JARVISOS
  const systemInstruction = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the native artificial intelligence operating system core of JARVISOS.
You speak with Tony Stark's legendary AI assistant persona: impeccably polite, articulate, addressing the user as "Sir" (or Madam/User if requested), slightly witty, exceptionally competent, and deeply knowledgeable about the JARVISOS architecture.
You are fully grounded in the JARVISOS technical specifications:
- Aegis Microkernel (EL1 capability-based core, zero drivers in kernel, asynchronous fastpath register IPC)
- NovaFS (flash-native CoW log-structured file system with wear-leveling, Merkle verification, per-file DEK encryption)
- Prism Compositor & Helios Spatial Window Manager (LTPO 120Hz, explicit sync fences, zero-copy hal_buffer_t)
- Sanctuary Sandbox & Nexus RPC (W^X, ARMv9 MTE memory tagging, transient capabilities)
- Synapse Neural Runtime & Mnemosyne Vector Episodic Memory (45 TOPS NPU broker, INT4 AWQ streaming page weights)
- VaultOS (S-EL1 hardware secure enclave, Post-Quantum Dilithium-3 & Ed25519)
- Universal App & Media Sub-Window Launcher: Users can open YouTube or any online app directly inside a JARVIS Helios sub-window ("open youtube", "open twitter", "open github", "open wikipedia"), play songs or playlists ("openyoutube and play beliver", "play faded", "play any song", "open any playlist", "play lofi playlist"), launch desktop protocol apps ("open vs code", "open spotify desktop"), open built-in JARVISOS modules, and save custom apps.
- Hardware deployment targeting Lenovo E41-25 with 4 GB RAM and 256 GB SSD using lightweight SLM (Qwen-2.5-1.5B or Llama-3.2-1B in llama.cpp, Piper TTS, Vosk/Whisper.cpp, Cage Wayland kiosk, zRAM).

When asked to perform system tasks, explain system status, analyze files, inspect kernel telemetry, launch apps, play music, or explain how to build the bootable Linux ISO for Lenovo E41-25, provide authoritative, concise, and structured answers. Keep answers clear, technical, and in-character.`;

  if (aiClient && process.env.GEMINI_API_KEY) {
    const result = await generateGeminiWithFallback({
      contents: prompt,
      systemInstruction,
    });
    if (result) {
      return res.json({
        response: result.text || 'Command acknowledged, sir. Processing completed.',
        source: result.modelUsed,
      });
    }
  }

  // Built-in intelligent offline JARVIS heuristic processor
  const lower = prompt.toLowerCase();
  let responseText = '';

  if (lower.includes('what apps') || lower.includes('which apps') || lower.includes('can you open')) {
    responseText = "Certainly, sir. Say or type 'open youtube', 'open twitter', 'open youtube and play believer', 'play any song', or 'open any playlist' to open them inside a JARVIS sub-window. You can also launch desktop protocol apps like 'open vs code', open internal JARVISOS modules, and save custom apps in the Apps tab.";
  } else if (lower.includes('status') || lower.includes('system') || lower.includes('health') || lower.includes('diagnostics')) {
    responseText = "All Aegis microkernel subsystems are functioning nominally, sir. Core temperature is stabilized at 44.2°C, and memory utilization sits at 1,480 MB out of our 4,096 MB physical budget. NovaFS wear-leveling integrity is at 99.2%, and the VaultOS secure enclave reports no cryptographic anomalies.";
  } else if (lower.includes('lenovo') || lower.includes('e41-25') || lower.includes('4gb') || lower.includes('iso') || lower.includes('bootable')) {
    responseText = "Regarding your Lenovo E41-25 laptop, sir: our lightweight architecture is tailored specifically for your AMD dual-core APU and 4 GB RAM. By utilizing Debian Minimal with the Cage Wayland kiosk, zRAM compression, and Qwen-2.5-1.5B quantized via llama.cpp, JARVISOS operates entirely offline in under 1.5 GB of RAM, leaving 2.5 GB of safety headroom.";
  } else if (lower.includes('novafs') || lower.includes('file') || lower.includes('storage')) {
    responseText = "NovaFS is currently active on your 256 GB SSD, sir. Operating as a log-structured Copy-on-Write tree with 2MB allocation segments, each 4KB block is verified via SHA3-512 Merkle roots. Per-file keys are securely wrapped inside VaultOS.";
  } else if (lower.includes('aegis') || lower.includes('kernel') || lower.includes('microkernel')) {
    responseText = "The Aegis microkernel executes strictly in EL1 unpaged memory, sir. All drivers, network stacks, and display compositors execute in isolated EL0 userspace. Memory corruption in any peripheral driver cannot compromise kernel stability.";
  } else if (lower.includes('who are you') || lower.includes('what are you') || lower.includes('jarvis')) {
    responseText = "I am J.A.R.V.I.S., your native artificial intelligence core and operational supervisor for JARVISOS. I coordinate hardware telemetry, speech input/output, in-window apps and music playback, spatial window composition, and system security protocols at your command, sir.";
  } else if (lower.includes('terminal') || lower.includes('command') || lower.includes('help')) {
    responseText = "You can interact with me directly via voice or open the Aegis Terminal (`aegis-sh`), sir. Available shell utilities include `open`, `play`, `apps`, `ps`, `top`, `mem`, `caps`, `dmesg`, `novafs`, `synapse`, `vault`, and `build-iso`.";
  } else {
    responseText = `Acknowledge, sir. Executing directive for "${prompt}". Aegis neural pipelines have evaluated the semantic graph, and all localized execution parameters remain within optimal thresholds. How else may I assist you?`;
  }

  return res.json({
    response: responseText,
    source: 'offline-synapse-core',
  });
});

interface YouTubeMediaItem {
  id: string;
  type: 'video' | 'playlist';
  title: string;
  channel: string;
  duration?: string;
  thumbnail?: string;
  embedUrl: string;
  watchUrl: string;
  keywords?: string[];
}

const CURATED_YOUTUBE_VIDEOS: YouTubeMediaItem[] = [
  {
    id: '7wtfhZwyrcc',
    type: 'video',
    title: 'Imagine Dragons - Believer (Official Music Video)',
    channel: 'ImagineDragons',
    duration: '3:37',
    embedUrl: 'https://www.youtube.com/embed/7wtfhZwyrcc?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=7wtfhZwyrcc',
    keywords: ['believer', 'beliver', 'imagine dragons', 'rock', 'workout', 'energy', 'hit'],
  },
  {
    id: '60ItHLz5WEA',
    type: 'video',
    title: 'Alan Walker - Faded',
    channel: 'Alan Walker',
    duration: '3:33',
    embedUrl: 'https://www.youtube.com/embed/60ItHLz5WEA?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=60ItHLz5WEA',
    keywords: ['faded', 'alan walker', 'edm', 'electronic', 'chill', 'song'],
  },
  {
    id: 'pAgnJDJN4VA',
    type: 'video',
    title: 'AC/DC - Back In Black (Official 4K Video)',
    channel: 'AC/DC',
    duration: '4:14',
    embedUrl: 'https://www.youtube.com/embed/pAgnJDJN4VA?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=pAgnJDJN4VA',
    keywords: ['back in black', 'acdc', 'iron man', 'tony stark', 'rock', 'jarvis'],
  },
  {
    id: '4NRXx6U8ABQ',
    type: 'video',
    title: 'The Weeknd - Blinding Lights (Official Video)',
    channel: 'The Weeknd',
    duration: '4:23',
    embedUrl: 'https://www.youtube.com/embed/4NRXx6U8ABQ?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
    keywords: ['blinding lights', 'weeknd', 'synthwave', 'pop', 'night', 'drive'],
  },
  {
    id: 'JGwWNGJdvx8',
    type: 'video',
    title: 'Ed Sheeran - Shape of You (Official Music Video)',
    channel: 'Ed Sheeran',
    duration: '4:24',
    embedUrl: 'https://www.youtube.com/embed/JGwWNGJdvx8?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
    keywords: ['shape of you', 'ed sheeran', 'pop', 'hits'],
  },
  {
    id: 'jfKfPfyJRdk',
    type: 'video',
    title: 'lofi hip hop radio - beats to relax/study to',
    channel: 'Lofi Girl',
    duration: 'LIVE',
    embedUrl: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    keywords: ['lofi', 'lo-fi', 'study', 'coding', 'focus', 'chill', 'relax', 'beats', 'ambient'],
  },
  {
    id: '4xDzrJKXOOY',
    type: 'video',
    title: 'synthwave radio - beats to chill/game to',
    channel: 'Lofi Girl',
    duration: 'LIVE',
    embedUrl: 'https://www.youtube.com/embed/4xDzrJKXOOY?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=4xDzrJKXOOY',
    keywords: ['synthwave', 'cyberpunk', 'retro', 'coding', 'game', 'jarvis', 'electronic'],
  },
  {
    id: 'fJ9rUzIMcZQ',
    type: 'video',
    title: 'Queen - Bohemian Rhapsody (Official Video Remastered)',
    channel: 'Queen Official',
    duration: '6:00',
    embedUrl: 'https://www.youtube.com/embed/fJ9rUzIMcZQ?autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
    keywords: ['bohemian rhapsody', 'queen', 'classic', 'rock'],
  },
];

const CURATED_YOUTUBE_PLAYLISTS: YouTubeMediaItem[] = [
  {
    id: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    type: 'playlist',
    title: 'Top 100 Global Music Videos Playlist',
    channel: 'YouTube Music',
    duration: 'Playlist',
    embedUrl: 'https://www.youtube.com/embed/videoseries?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i&autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    keywords: ['top', 'hits', 'popular', 'trending', 'music', 'songs', 'any', 'playlist', 'pop'],
  },
  {
    id: 'PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo',
    type: 'playlist',
    title: 'Lofi Hip Hop Beats - Focus & Study Playlist',
    channel: 'Lofi Girl',
    duration: 'Playlist',
    embedUrl: 'https://www.youtube.com/embed/videoseries?list=PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo&autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/playlist?list=PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo',
    keywords: ['lofi', 'lo-fi', 'study', 'coding', 'focus', 'chill', 'relax', 'beats'],
  },
  {
    id: 'PLw-VjHDlEOgvWPpRBs9FRGgJcKpDimItY',
    type: 'playlist',
    title: 'Pop & Electronic Hits Mix Playlist',
    channel: 'Music Mix',
    duration: 'Playlist',
    embedUrl: 'https://www.youtube.com/embed/videoseries?list=PLw-VjHDlEOgvWPpRBs9FRGgJcKpDimItY&autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/playlist?list=PLw-VjHDlEOgvWPpRBs9FRGgJcKpDimItY',
    keywords: ['pop', 'workout', 'party', 'energy', 'edm', 'dance', 'believer'],
  },
  {
    id: 'PL3oW2tjiIxvQ1Bports720sK_v2zL8b6A',
    type: 'playlist',
    title: 'Rock Anthems & Iron Man Lab Mix',
    channel: 'Rock Classics',
    duration: 'Playlist',
    embedUrl: 'https://www.youtube.com/embed/videoseries?list=PL3oW2tjiIxvQ1Bports720sK_v2zL8b6A&autoplay=1&rel=0',
    watchUrl: 'https://www.youtube.com/playlist?list=PL3oW2tjiIxvQ1Bports720sK_v2zL8b6A',
    keywords: ['rock', 'iron man', 'acdc', 'classic', 'guitar', 'jarvis'],
  },
];

function normalizeMediaQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\bbeliver\b/gi, 'believer')
    .replace(/\bplaylst\b/gi, 'playlist')
    .replace(/\bsongz\b/gi, 'songs');
}

function attachThumb(item: YouTubeMediaItem): YouTubeMediaItem {
  const { keywords: _k, ...rest } = item;
  if (!rest.thumbnail && rest.type === 'video' && rest.id) {
    return { ...rest, thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(rest.id)}/mqdefault.jpg` };
  }
  return rest;
}

function matchCuratedCatalog(query: string, mode: 'video' | 'playlist'): YouTubeMediaItem[] {
  const catalog = mode === 'playlist' ? CURATED_YOUTUBE_PLAYLISTS : CURATED_YOUTUBE_VIDEOS;
  const cleaned = normalizeMediaQuery(query).toLowerCase();
  if (
    !cleaned ||
    cleaned === 'any' ||
    cleaned === 'any song' ||
    cleaned === 'any songs' ||
    cleaned === 'any playlist' ||
    cleaned === 'music' ||
    cleaned === 'songs' ||
    cleaned === 'featured' ||
    cleaned === 'featured music'
  ) {
    return catalog.map(attachThumb);
  }

  const tokens = cleaned.split(/\s+/).filter(t => t.length > 1);
  const scored = catalog.map(entry => {
    const haystack = `${entry.title} ${entry.channel} ${(entry.keywords || []).join(' ')}`.toLowerCase();
    let score = 0;
    if (haystack.includes(cleaned)) score += 10;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 3;
    }
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ entry }) => attachThumb(entry));
}

function extractYouTubeItemsFromHtml(html: string, mode: 'video' | 'playlist', limit: number = 12): YouTubeMediaItem[] {
  const results: YouTubeMediaItem[] = [];
  const seen = new Set<string>();

  const marker = 'var ytInitialData = ';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return results;

  const jsonStart = startIdx + marker.length;
  const scriptEnd = html.indexOf(';</script>', jsonStart);
  if (scriptEnd === -1) return results;

  try {
    const data = JSON.parse(html.slice(jsonStart, scriptEnd));
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

    for (const section of sections) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (mode === 'playlist' && item.playlistRenderer) {
          const pl = item.playlistRenderer;
          const id = pl.playlistId;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const title =
            pl.title?.simpleText ||
            pl.title?.runs?.map((r: any) => r.text).join('') ||
            'YouTube Playlist';
          const channel =
            pl.shortBylineText?.runs?.map((r: any) => r.text).join('') ||
            pl.longBylineText?.runs?.map((r: any) => r.text).join('') ||
            'YouTube';
          const count = pl.videoCount ? `${pl.videoCount} videos` : 'Playlist';
          const thumb =
            pl.thumbnails?.[0]?.thumbnails?.[0]?.url ||
            pl.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;
          results.push({
            id,
            type: 'playlist',
            title,
            channel,
            duration: count,
            thumbnail: thumb,
            embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(id)}&autoplay=1&rel=0`,
            watchUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`,
          });
        } else if (item.videoRenderer) {
          const vid = item.videoRenderer;
          const id = vid.videoId;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const title =
            vid.title?.runs?.map((r: any) => r.text).join('') ||
            vid.title?.simpleText ||
            'YouTube Video';
          const channel =
            vid.ownerText?.runs?.map((r: any) => r.text).join('') || 'YouTube';
          const duration = vid.lengthText?.simpleText || 'LIVE';
          results.push({
            id,
            type: 'video',
            title,
            channel,
            duration,
            thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`,
            embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`,
            watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
          });
        }
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
  } catch (err) {
    console.warn('YouTube initial data parse fallback:', err);
  }

  return results;
}

async function resolveYouTubeMediaList(
  rawQuery: string,
  mode: 'video' | 'playlist',
  limit: number = 12
): Promise<{ source: string; query: string; items: YouTubeMediaItem[] }> {
  const normalizedQuery = normalizeMediaQuery(rawQuery);
  const isGenericAny =
    !normalizedQuery ||
    /^(any|any\s+songs?|any\s+playlist|songs?|music|playlist|featured(\s+music)?)$/i.test(normalizedQuery);

  if (!isGenericAny) {
    try {
      const searchSuffix = mode === 'playlist' ? '&sp=EgIQAw%253D%253D' : '';
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(normalizedQuery)}${searchSuffix}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);

      const ytRes = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timeout);

      if (ytRes.ok) {
        const html = await ytRes.text();
        const liveItems = extractYouTubeItemsFromHtml(html, mode, limit);
        if (liveItems.length > 0) {
          return {
            source: 'youtube-live',
            query: normalizedQuery,
            items: liveItems,
          };
        }
      }
    } catch (err: any) {
      console.warn('Live YouTube search unavailable, using curated catalog:', err?.message || err);
    }
  }

  const fallbackItems = matchCuratedCatalog(normalizedQuery, mode).slice(0, limit);
  return {
    source: 'curated-catalog',
    query: normalizedQuery || (mode === 'playlist' ? 'Top Music Playlists' : 'Featured Music'),
    items: fallbackItems,
  };
}

// Live YouTube Video & Playlist Resolver for in-OS JARVIS Media Sub-Window & Browser
app.get('/api/media/youtube-resolve', async (req, res) => {
  const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
  const mode: 'video' | 'playlist' = req.query.mode === 'playlist' ? 'playlist' : 'video';
  const result = await resolveYouTubeMediaList(rawQuery, mode, 12);
  return res.json({
    source: result.source,
    query: result.query,
    mode,
    items: result.items,
  });
});

// ============================================================================
// JARVIS CHROME-STYLE BROWSER BACKEND ROUTES
// - GET  /api/browser/search      (Live web search for JARVIS-themed results)
// - GET  /api/browser/fetch-page  (SSRF-safe Reader View + Ad/Tracker Shield)
// - POST /api/browser/translate   (Gemini-powered in-tab page translation)
// - POST /api/browser/summarize   (JARVIS Page Summarizer extension)
// ============================================================================

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafePublicHttpUrl(rawUrl: string): { ok: boolean; parsed?: URL; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'Only http:// and https:// URLs are supported.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      host === '169.254.169.254' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return { ok: false, reason: 'Private or internal network addresses cannot be fetched.' };
    }
    return { ok: true, parsed };
  } catch {
    return { ok: false, reason: 'Invalid URL format.' };
  }
}

interface ServerSearchResult {
  title: string;
  url: string;
  displayUrl: string;
  siteName?: string;
  snippet: string;
  publishedAt?: string;
  thumbnail?: string;
  source: string;
}

interface ServerImageResult {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  displayDomain: string;
  width?: number;
  height?: number;
}

function formatSearchDisplayUrl(rawUrl: string): { displayUrl: string; siteName: string } {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.slice(0, 60);
    return {
      displayUrl: `${host}${cleanPath}`,
      siteName: host,
    };
  } catch {
    return { displayUrl: rawUrl, siteName: 'web' };
  }
}

async function resolveGroundingRedirectUrl(rawUrl: string): Promise<string> {
  if (!rawUrl.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
    return rawUrl;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const res = await fetch(rawUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });
    const loc = res.headers.get('location');
    if (loc && isSafePublicHttpUrl(loc).ok) {
      return loc;
    }
    if (res.status === 405 || res.status === 403) {
      const getRes = await fetch(rawUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });
      const getLoc = getRes.headers.get('location');
      if (getLoc && isSafePublicHttpUrl(getLoc).ok) {
        return getLoc;
      }
    }
  } catch {
    // Keep original redirect URL if resolution times out
  } finally {
    clearTimeout(timer);
  }
  return rawUrl;
}

async function runGoogleGroundedSearch(
  query: string,
  category: 'all' | 'news'
): Promise<{
  overviewText: string;
  citedDomains: string[];
  results: ServerSearchResult[];
}> {
  if (!aiClient || !process.env.GEMINI_API_KEY) {
    return { overviewText: '', citedDomains: [], results: [] };
  }

  const cacheKey = `${category}::${query.toLowerCase()}`;
  const cached = searchGroundingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const prompt =
    category === 'news'
      ? `Search Google News and recent reporting for: "${query}". Write a concise, objective 2-3 sentence briefing covering the latest developments from multiple credible news outlets.`
      : `Search Google across the entire web for: "${query}". Write a clear, factual 2-3 sentence Quick Overview directly answering or summarizing what the user is looking for, drawing on diverse official websites, articles, guides, and current sources (not just Wikipedia).`;

  const generated = await generateGeminiWithFallback({
    contents: prompt,
    useGoogleSearch: true,
  });

  if (!generated) {
    return { overviewText: '', citedDomains: [], results: [] };
  }

  try {
    const response = generated.response;
    const overviewText = generated.text;
    const metadata: any = response.candidates?.[0]?.groundingMetadata;
    const chunks: any[] = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
    const supports: any[] = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];

    // Map grounded text segments to each chunk index to create authentic per-link snippets
    const snippetsByChunkIndex = new Map<number, string[]>();
    for (const sup of supports) {
      const segText = typeof sup?.segment?.text === 'string' ? sup.segment.text.trim() : '';
      const indices: number[] = Array.isArray(sup?.groundingChunkIndices) ? sup.groundingChunkIndices : [];
      if (!segText) continue;
      for (const idx of indices) {
        const list = snippetsByChunkIndex.get(idx) || [];
        if (list.length < 2 && !list.includes(segText)) {
          list.push(segText);
          snippetsByChunkIndex.set(idx, list);
        }
      }
    }

    const webChunks = chunks
      .map((chunk, index) => ({
        index,
        uri: typeof chunk?.web?.uri === 'string' ? chunk.web.uri : '',
        title: typeof chunk?.web?.title === 'string' ? chunk.web.title.trim() : '',
      }))
      .filter(c => /^https?:\/\//i.test(c.uri))
      .slice(0, 12);

    const resolvedUrls = await Promise.all(webChunks.map(c => resolveGroundingRedirectUrl(c.uri)));

    const results: ServerSearchResult[] = [];
    const seen = new Set<string>();
    const citedDomainsSet = new Set<string>();

    webChunks.forEach((chunk, i) => {
      const finalUrl = resolvedUrls[i] || chunk.uri;
      if (!isSafePublicHttpUrl(finalUrl).ok) return;
      const dedupeKey = finalUrl.replace(/#.*$/, '').replace(/\/$/, '');
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const { displayUrl, siteName } = formatSearchDisplayUrl(finalUrl);
      const isRedirectHost = siteName.includes('vertexaisearch.cloud.google.com');
      const cleanSite = isRedirectHost && chunk.title ? chunk.title : siteName;
      citedDomainsSet.add(cleanSite);

      const matchedSnippets = snippetsByChunkIndex.get(chunk.index) || [];
      let title = chunk.title || cleanSite;
      // If chunk.title is just a bare domain (e.g. "bbc.com"), derive a cleaner readable title from path or snippet
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title) && !isRedirectHost) {
        try {
          const u = new URL(finalUrl);
          const slug = u.pathname
            .split('/')
            .filter(Boolean)
            .pop()
            ?.replace(/\.(html?|php|aspx?)$/i, '')
            .replace(/[-_]+/g, ' ')
            .trim();
          if (slug && slug.length > 4) {
            title = `${slug.charAt(0).toUpperCase()}${slug.slice(1)} — ${cleanSite}`;
          } else {
            title = `${query} — ${cleanSite}`;
          }
        } catch {
          title = `${query} — ${cleanSite}`;
        }
      }

      const snippet =
        matchedSnippets.join(' ') ||
        `Explore "${query}" on ${cleanSite} inside JARVIS Browser.`;

      results.push({
        title,
        url: finalUrl,
        displayUrl: isRedirectHost ? cleanSite : displayUrl,
        siteName: cleanSite,
        snippet: snippet.slice(0, 320),
        source: 'google-search',
      });
    });

    const data = {
      overviewText,
      citedDomains: Array.from(citedDomainsSet).slice(0, 6),
      results,
    };

    if (searchGroundingCache.size >= 60) {
      const oldestKey = searchGroundingCache.keys().next().value;
      if (oldestKey) searchGroundingCache.delete(oldestKey);
    }
    searchGroundingCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_GROUNDING_CACHE_TTL_MS,
      data,
    });

    return data;
  } catch {
    return { overviewText: '', citedDomains: [], results: [] };
  }
}

async function fetchGoogleNewsRss(query: string, limit: number = 10): Promise<ServerSearchResult[]> {
  const results: ServerSearchResult[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return results;
    const xml = await res.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null && results.length < limit) {
      const block = match[1];
      const rawTitle = decodeHtmlEntities(
        (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] ||
          block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ||
          '').trim()
      );
      const rawLink = decodeHtmlEntities((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim());
      const pubDateRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
      const sourceMatch = block.match(/<source[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
      const publisher = decodeHtmlEntities((sourceMatch?.[2] || '').trim());
      const sourceDomain = sourceMatch?.[1] || '';

      if (!rawTitle || !/^https?:\/\//i.test(rawLink)) continue;

      // Strip trailing " - Publisher" from Google News titles
      const cleanTitle =
        publisher && rawTitle.endsWith(` - ${publisher}`)
          ? rawTitle.slice(0, -(publisher.length + 3)).trim()
          : rawTitle;

      let formattedDate = '';
      if (pubDateRaw) {
        const d = new Date(pubDateRaw);
        if (!Number.isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }

      const displayDomain = sourceDomain
        ? formatSearchDisplayUrl(sourceDomain).siteName
        : publisher || 'news.google.com';

      results.push({
        title: cleanTitle,
        url: rawLink,
        displayUrl: displayDomain,
        siteName: publisher || displayDomain,
        snippet: publisher
          ? `${publisher} coverage on "${query}". Open to read full story inside JARVIS Browser.`
          : `Recent news coverage related to "${query}".`,
        publishedAt: formattedDate || undefined,
        source: 'google-news',
      });
    }
  } catch (err: any) {
    console.warn('Google News RSS fallback:', err?.message || err);
  } finally {
    clearTimeout(timer);
  }
  return results;
}

async function fetchLiveWebImages(query: string): Promise<ServerImageResult[]> {
  const images: ServerImageResult[] = [];
  const seen = new Set<string>();

  const [wikiImages, ytMedia] = await Promise.all([
    (async (): Promise<ServerImageResult[]> => {
      const out: ServerImageResult[] = [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      try {
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
          query
        )}&gsrlimit=12&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=480&format=json`;
        const res = await fetch(apiUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'JARVISOS-Browser/1.0' },
        });
        if (res.ok) {
          const json: any = await res.json();
          const pages = Object.values(json?.query?.pages || {}) as any[];
          for (const page of pages) {
            const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
            if (!info) continue;
            const mime = String(info.mime || '').toLowerCase();
            if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) continue;
            const thumbUrl = info.thumburl || info.url;
            const fullUrl = info.url || thumbUrl;
            const pageUrl = info.descriptionurl || fullUrl;
            if (!thumbUrl || !/^https?:\/\//i.test(thumbUrl)) continue;
            const cleanTitle = String(page.title || query)
              .replace(/^File:/i, '')
              .replace(/\.[a-z0-9]+$/i, '')
              .replace(/[_]+/g, ' ')
              .trim();
            out.push({
              title: cleanTitle || query,
              imageUrl: fullUrl,
              thumbnailUrl: thumbUrl,
              sourceUrl: pageUrl,
              displayDomain: 'commons.wikimedia.org',
              width: typeof info.width === 'number' ? info.width : undefined,
              height: typeof info.height === 'number' ? info.height : undefined,
            });
          }
        }
      } catch (err: any) {
        console.warn('Wikimedia Commons image search fallback:', err?.message || err);
      } finally {
        clearTimeout(timer);
      }
      return out;
    })(),
    resolveYouTubeMediaList(query, 'video', 8),
  ]);

  for (const img of wikiImages) {
    if (!seen.has(img.thumbnailUrl)) {
      seen.add(img.thumbnailUrl);
      images.push(img);
    }
  }

  for (const vid of ytMedia.items) {
    const thumb = vid.thumbnail || (vid.id ? `https://i.ytimg.com/vi/${encodeURIComponent(vid.id)}/hqdefault.jpg` : '');
    if (thumb && !seen.has(thumb)) {
      seen.add(thumb);
      images.push({
        title: vid.title,
        imageUrl: vid.id ? `https://i.ytimg.com/vi/${encodeURIComponent(vid.id)}/hqdefault.jpg` : thumb,
        thumbnailUrl: thumb,
        sourceUrl: vid.watchUrl,
        displayDomain: 'youtube.com',
        width: 480,
        height: 360,
      });
    }
  }

  return images.slice(0, 16);
}

async function fetchDuckDuckGoInstantAnswer(query: string): Promise<{
  overviewText: string;
  citedDomains: string[];
  results: ServerSearchResult[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  const results: ServerSearchResult[] = [];
  const citedDomains: string[] = [];
  let overviewText = '';

  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'JARVISOS-Browser/1.0' },
      }
    );
    if (!res.ok) return { overviewText, citedDomains, results };
    const data: any = await res.json();

    if (typeof data?.AbstractText === 'string' && data.AbstractText.trim().length > 20) {
      overviewText = data.AbstractText.trim();
    } else if (typeof data?.Answer === 'string' && data.Answer.trim().length > 0) {
      overviewText = data.Answer.trim();
    }

    if (typeof data?.AbstractURL === 'string' && /^https?:\/\//i.test(data.AbstractURL)) {
      const { displayUrl, siteName } = formatSearchDisplayUrl(data.AbstractURL);
      citedDomains.push(siteName);
      if (!siteName.includes('wikipedia.org')) {
        results.push({
          title: `${data.Heading || query} — ${data.AbstractSource || siteName}`,
          url: data.AbstractURL,
          displayUrl,
          siteName,
          snippet: (overviewText || `Overview and reference details for "${query}".`).slice(0, 300),
          source: 'web',
        });
      }
    }

    // Official website links from Instant Answer "Results"
    if (Array.isArray(data?.Results)) {
      for (const item of data.Results.slice(0, 4)) {
        const href = typeof item?.FirstURL === 'string' ? item.FirstURL : '';
        const text = typeof item?.Text === 'string' ? item.Text.trim() : '';
        if (!href || !/^https?:\/\//i.test(href) || !isSafePublicHttpUrl(href).ok) continue;
        const { displayUrl, siteName } = formatSearchDisplayUrl(href);
        citedDomains.push(siteName);
        results.push({
          title: text || `${query} — Official Website`,
          url: href,
          displayUrl,
          siteName,
          snippet: `Official resource on ${siteName} for "${query}".`,
          source: 'web',
        });
      }
    }
  } catch {
    // Optional enrichment only
  } finally {
    clearTimeout(timer);
  }

  return {
    overviewText,
    citedDomains: Array.from(new Set(citedDomains)).slice(0, 5),
    results,
  };
}

async function fetchExternalWebArticles(query: string): Promise<ServerSearchResult[]> {
  const out: ServerSearchResult[] = [];
  const seen = new Set<string>();

  const [hnResults, ghResults] = await Promise.all([
    (async (): Promise<ServerSearchResult[]> => {
      const list: ServerSearchResult[] = [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=8&tags=story`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const json: any = await res.json();
          for (const hit of Array.isArray(json?.hits) ? json.hits : []) {
            const href = typeof hit?.url === 'string' ? hit.url.trim() : '';
            const title = typeof hit?.title === 'string' ? hit.title.trim() : '';
            if (!href || !title || !isSafePublicHttpUrl(href).ok) continue;
            const { displayUrl, siteName } = formatSearchDisplayUrl(href);
            if (siteName.includes('wikipedia.org')) continue;
            let publishedAt: string | undefined;
            if (hit?.created_at) {
              const d = new Date(hit.created_at);
              if (!Number.isNaN(d.getTime())) {
                publishedAt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              }
            }
            list.push({
              title,
              url: href,
              displayUrl,
              siteName,
              snippet: `Featured web article on ${siteName} covering "${query}" (${hit.points || 0} community points).`,
              publishedAt,
              source: 'web',
            });
            if (list.length >= 5) break;
          }
        }
      } catch {
        // Ignore
      } finally {
        clearTimeout(timer);
      }
      return list;
    })(),
    (async (): Promise<ServerSearchResult[]> => {
      const list: ServerSearchResult[] = [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=3`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'JARVISOS-Browser/1.0' },
          }
        );
        if (res.ok) {
          const json: any = await res.json();
          for (const repo of Array.isArray(json?.items) ? json.items : []) {
            const href = typeof repo?.html_url === 'string' ? repo.html_url : '';
            const name = typeof repo?.full_name === 'string' ? repo.full_name : '';
            if (!href || !name) continue;
            const { displayUrl, siteName } = formatSearchDisplayUrl(href);
            list.push({
              title: `${name} — GitHub`,
              url: href,
              displayUrl,
              siteName,
              snippet:
                typeof repo?.description === 'string' && repo.description.trim()
                  ? repo.description.trim().slice(0, 260)
                  : `Open-source repository ${name} matching "${query}".`,
              source: 'web',
            });
          }
        }
      } catch {
        // Ignore
      } finally {
        clearTimeout(timer);
      }
      return list;
    })(),
  ]);

  for (const item of [...hnResults, ...ghResults]) {
    const key = item.url.replace(/#.*$/, '').replace(/\/$/, '');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

app.get('/api/browser/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rawTab = typeof req.query.tab === 'string' ? req.query.tab.toLowerCase() : 'all';
  const tab: 'all' | 'videos' | 'news' | 'images' =
    rawTab === 'videos' || rawTab === 'news' || rawTab === 'images' ? rawTab : 'all';

  if (!q) {
    return res.status(400).json({ error: 'Search query is required.' });
  }

  // TAB: VIDEOS
  if (tab === 'videos') {
    const yt = await resolveYouTubeMediaList(q, 'video', 12);
    return res.json({
      query: q,
      tab,
      source: yt.source === 'youtube-live' ? 'YouTube Live Search' : 'YouTube Catalog',
      results: [],
      videos: yt.items,
      images: [],
    });
  }

  // TAB: IMAGES
  if (tab === 'images') {
    const images = await fetchLiveWebImages(q);
    return res.json({
      query: q,
      tab,
      source: 'Web Images',
      results: [],
      videos: [],
      images,
    });
  }

  // TAB: NEWS
  if (tab === 'news') {
    const [groundedNews, rssNews] = await Promise.all([
      runGoogleGroundedSearch(q, 'news'),
      fetchGoogleNewsRss(q, 12),
    ]);

    const merged: ServerSearchResult[] = [];
    const seen = new Set<string>();
    for (const item of [...groundedNews.results, ...rssNews]) {
      const key = item.url.replace(/#.*$/, '').replace(/\/$/, '');
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }

    return res.json({
      query: q,
      tab,
      source: groundedNews.results.length > 0 ? 'Google News' : 'Google News Feed',
      overview: groundedNews.overviewText
        ? { text: groundedNews.overviewText, citedDomains: groundedNews.citedDomains }
        : undefined,
      results: merged.slice(0, 14),
      videos: [],
      images: [],
    });
  }

  // TAB: ALL (Full-Web Google Search + Quick Overview + Related Videos)
  const [googleGrounded, newsRss, relatedYt] = await Promise.all([
    runGoogleGroundedSearch(q, 'all'),
    fetchGoogleNewsRss(q, 8),
    resolveYouTubeMediaList(q, 'video', 4),
  ]);

  const results: ServerSearchResult[] = [];
  const seen = new Set<string>();
  let primarySource = googleGrounded.results.length > 0 ? 'Google Search' : 'Web Search';
  let overviewText = googleGrounded.overviewText;
  let citedDomains = [...googleGrounded.citedDomains];

  const pushUnique = (item: ServerSearchResult) => {
    const key = item.url.replace(/#.*$/, '').replace(/\/$/, '');
    if (!seen.has(key)) {
      seen.add(key);
      results.push(item);
    }
  };

  for (const item of googleGrounded.results) {
    pushUnique(item);
  }

  // Enrich with live non-Wikipedia web sources when Google Search grounding returns fewer than 6 links
  if (results.length < 6) {
    const [ddgInstant, externalWeb] = await Promise.all([
      fetchDuckDuckGoInstantAnswer(q),
      fetchExternalWebArticles(q),
    ]);

    if (!overviewText && ddgInstant.overviewText) {
      overviewText = ddgInstant.overviewText;
      citedDomains = Array.from(new Set([...citedDomains, ...ddgInstant.citedDomains])).slice(0, 6);
    }

    for (const item of ddgInstant.results) {
      pushUnique(item);
    }
    for (const item of externalWeb) {
      pushUnique(item);
    }
  }

  // Add fresh diverse web articles from Google News RSS if still under 12 results
  if (results.length < 12) {
    for (const item of newsRss) {
      pushUnique(item);
      if (results.length >= 12) break;
    }
  }

  // Cap Wikipedia to at most 1 reference result (placed after diverse web links, never Wikipedia-only!)
  if (results.length < 5) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const wikiRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json&srlimit=1`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'JARVISOS-Browser/1.0' },
        }
      );
      clearTimeout(timer);
      if (wikiRes.ok) {
        const wikiJson: any = await wikiRes.json();
        const hit = (wikiJson?.query?.search || [])[0];
        if (hit) {
          const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
            String(hit.title || '').replace(/\s+/g, '_')
          )}`;
          pushUnique({
            title: `${hit.title} — Wikipedia`,
            url: pageUrl,
            displayUrl: `en.wikipedia.org/wiki/${String(hit.title || '').replace(/\s+/g, '_')}`,
            siteName: 'en.wikipedia.org',
            snippet: stripTags(String(hit.snippet || '')) + '...',
            source: 'wikipedia',
          });
        }
      }
    } catch {
      // Ignore
    }
  }

  if (results.length === 0) {
    primarySource = 'Web Directory';
    const encoded = encodeURIComponent(q);
    results.push(
      {
        title: `${q} — YouTube Videos`,
        url: `https://www.youtube.com/results?search_query=${encoded}`,
        displayUrl: 'youtube.com',
        siteName: 'youtube.com',
        snippet: `Browse and watch videos matching "${q}" inside JARVIS Browser.`,
        source: 'curated',
      },
      {
        title: `${q} — GitHub Repositories & Code`,
        url: `https://github.com/search?q=${encoded}`,
        displayUrl: 'github.com',
        siteName: 'github.com',
        snippet: `Browse open-source repositories, documentation, and code for "${q}".`,
        source: 'curated',
      },
      {
        title: `${q} — Reddit Discussions`,
        url: `https://www.reddit.com/search/?q=${encoded}`,
        displayUrl: 'reddit.com',
        siteName: 'reddit.com',
        snippet: `Read community discussions and threads about "${q}".`,
        source: 'curated',
      },
      {
        title: `${q} — Wikipedia`,
        url: `https://en.wikipedia.org/wiki/Special:Search?search=${encoded}`,
        displayUrl: 'en.wikipedia.org',
        siteName: 'en.wikipedia.org',
        snippet: `Encyclopedia reference overview for "${q}".`,
        source: 'curated',
      }
    );
  }

  return res.json({
    query: q,
    tab,
    source: primarySource,
    overview: overviewText
      ? {
          text: overviewText,
          citedDomains,
        }
      : undefined,
    results: results.slice(0, 14),
    videos: relatedYt.source === 'youtube-live' ? relatedYt.items.slice(0, 4) : [],
    images: [],
  });
});

app.get('/api/browser/fetch-page', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  const adShieldEnabled = req.query.adShield !== '0';
  const check = isSafePublicHttpUrl(rawUrl);

  if (!check.ok || !check.parsed) {
    return res.status(400).json({ error: check.reason || 'Invalid URL' });
  }

  const fetchWithHeaders = async (targetUrl: string, timeoutMs: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(targetUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let pageRes: Response;
    try {
      pageRes = await fetchWithHeaders(check.parsed.toString(), 9500);
    } catch {
      // Retry once in case of transient TLS/connection reset
      pageRes = await fetchWithHeaders(check.parsed.toString(), 9500);
    }

    const finalUrl = pageRes.url || check.parsed.toString();
    const finalCheck = isSafePublicHttpUrl(finalUrl);
    if (!finalCheck.ok) {
      return res.status(403).json({ error: 'Redirected to a restricted network destination.' });
    }

    const rawText = (await pageRes.text()).slice(0, 1_500_000);

    // Count & strip trackers/ads when Ad Shield is active
    let blockedTrackersCount = 0;
    const trackerPattern =
      /googletagmanager|google-analytics|doubleclick|googlesyndication|adservice|facebook\.net\/en_US\/fbevents|hotjar|segment\.com|mixpanel|outbrain|taboola|criteo|amazon-adsystem/gi;
    const trackerMatches = rawText.match(trackerPattern);
    if (adShieldEnabled && trackerMatches) {
      blockedTrackersCount = trackerMatches.length;
    }

    const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const ogTitleMatch = rawText.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    );
    const descMatch =
      rawText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      rawText.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const siteMatch = rawText.match(
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
    );
    const authorMatch = rawText.match(
      /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i
    );

    const parsedFinal = new URL(finalUrl);
    const siteName = decodeHtmlEntities(siteMatch?.[1] || parsedFinal.hostname.replace(/^www\./, ''));
    const title = decodeHtmlEntities(ogTitleMatch?.[1] || titleMatch?.[1] || siteName).trim();
    const excerpt = descMatch?.[1] ? decodeHtmlEntities(descMatch[1]).trim() : undefined;
    const byline = authorMatch?.[1] ? decodeHtmlEntities(authorMatch[1]).trim() : undefined;

    // Strip non-content tags
    let cleanedHtml = rawText
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    if (adShieldEnabled) {
      const adContainerMatches = cleanedHtml.match(
        /<(?:div|aside|section)[^>]*(?:class|id)=["'][^"']*(?:advert|ad-slot|ad-banner|sponsored|cookie-banner|promo-banner)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|aside|section)>/gi
      );
      if (adContainerMatches) {
        blockedTrackersCount += adContainerMatches.length;
        cleanedHtml = cleanedHtml.replace(
          /<(?:div|aside|section)[^>]*(?:class|id)=["'][^"']*(?:advert|ad-slot|ad-banner|sponsored|cookie-banner|promo-banner)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|aside|section)>/gi,
          ' '
        );
      }
    }

    // Prefer <main> or <article> body if present
    const articleMatch =
      cleanedHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      cleanedHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
      cleanedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const contentHtml = articleMatch ? articleMatch[1] : cleanedHtml;

    // Extract structured reader blocks
    const blocks: Array<{ type: 'heading' | 'paragraph' | 'quote' | 'list_item'; text: string }> = [];
    const blockRegex = /<(h1|h2|h3|p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let bMatch: RegExpExecArray | null;
    const seenText = new Set<string>();

    while ((bMatch = blockRegex.exec(contentHtml)) !== null && blocks.length < 70) {
      const tag = bMatch[1].toLowerCase();
      const text = stripTags(bMatch[2]);
      if (text.length < (tag.startsWith('h') ? 3 : 24)) continue;
      if (seenText.has(text)) continue;
      seenText.add(text);

      const type: 'heading' | 'paragraph' | 'quote' | 'list_item' =
        tag === 'h1' || tag === 'h2' || tag === 'h3'
          ? 'heading'
          : tag === 'blockquote'
          ? 'quote'
          : tag === 'li'
          ? 'list_item'
          : 'paragraph';

      blocks.push({ type, text: text.slice(0, 1200) });
    }

    if (blocks.length === 0 && excerpt) {
      blocks.push({ type: 'paragraph', text: excerpt });
    }
    if (blocks.length === 0) {
      const plainFallback = stripTags(contentHtml).slice(0, 1400);
      if (plainFallback) {
        blocks.push({ type: 'paragraph', text: plainFallback });
      } else {
        blocks.push({
          type: 'paragraph',
          text: `${siteName} requires interactive JavaScript rendering. Switch to Live View in the address bar above to view the full rendered webpage.`,
        });
      }
    }

    // Extract clean resolved links so users can click around inside JARVIS Browser
    const links: Array<{ text: string; url: string }> = [];
    const seenLinks = new Set<string>();
    const anchorRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch: RegExpExecArray | null;
    while ((aMatch = anchorRegex.exec(contentHtml)) !== null && links.length < 24) {
      const rawHref = decodeHtmlEntities(aMatch[1]).trim();
      const label = stripTags(aMatch[2]).slice(0, 90);
      if (!label || label.length < 3) continue;
      try {
        const resolved = new URL(rawHref, finalUrl).toString();
        if (!/^https?:\/\//i.test(resolved)) continue;
        if (seenLinks.has(resolved)) continue;
        seenLinks.add(resolved);
        links.push({ text: label, url: resolved });
      } catch {
        // skip invalid relative link
      }
    }

    return res.json({
      url: rawUrl,
      finalUrl,
      title,
      siteName,
      byline,
      excerpt,
      blocks,
      links,
      blockedTrackersCount,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    // Graceful fallback document instead of a hard 502 dead-end
    const host = check.parsed.hostname.replace(/^www\./, '');
    return res.json({
      url: rawUrl,
      finalUrl: rawUrl,
      title: host,
      siteName: host,
      excerpt: `${host} declined automated Reader extraction (${err?.message || 'connection reset'}).`,
      blocks: [
        {
          type: 'heading',
          text: `${host} — Protected or Dynamic Web Page`,
        },
        {
          type: 'paragraph',
          text: `This website restricted direct Reader extraction or timed out. You can switch to Live View using the toggle in the address bar, retry loading, or search for specific pages on ${host} using JARVIS Search.`,
        },
      ],
      links: [
        { text: `Search "${host}" on JARVIS Web`, url: `jarvis://search?q=${encodeURIComponent(host)}` },
        { text: `${host} on Wikipedia`, url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(host)}` },
      ],
      blockedTrackersCount: 0,
      fetchedAt: new Date().toISOString(),
    });
  }
});

// Live Web View Proxy for in-OS JARVIS Browser iframe rendering (strips framing blocks + bridges clicks)
app.get('/api/browser/proxy', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  const adShieldEnabled = req.query.adShield !== '0';
  const check = isSafePublicHttpUrl(rawUrl);

  const renderFallbackHtml = (heading: string, detail: string, targetUrl: string) => {
    const safeUrl = targetUrl.replace(/[<>"']/g, '');
    return `<!doctype html><html><head><meta charset="utf-8"/><style>
      body{margin:0;padding:36px 28px;font-family:system-ui,-apple-system,sans-serif;background:#020617;color:#e2e8f0;}
      .card{max-width:580px;margin:28px auto;padding:24px;border-radius:14px;background:#0f172a;border:1px solid rgba(34,211,238,0.28);}
      h2{margin:0 0 8px;color:#67e8f9;font-size:18px;}
      p{margin:0 0 16px;font-size:13px;line-height:1.6;color:#94a3b8;}
      .actions{display:flex;gap:10px;flex-wrap:wrap;}
      button{cursor:pointer;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid rgba(34,211,238,0.45);background:rgba(6,182,212,0.18);color:#cffafe;}
      button:hover{background:rgba(6,182,212,0.3);}
    </style></head><body><div class="card">
      <h2>${heading}</h2>
      <p>${detail}</p>
      <div class="actions">
        <button onclick="window.parent.postMessage({type:'jarvis-browser-switch-reader'}, '*')">Open in Reader View</button>
        <button onclick="window.parent.postMessage({type:'jarvis-browser-navigate', url:'jarvis://search?q=' + encodeURIComponent('${safeUrl}')}, '*')">Search on JARVIS Web</button>
      </div>
    </div></body></html>`;
  };

  if (!check.ok || !check.parsed) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(renderFallbackHtml('Unsupported Address', check.reason || 'Invalid URL.', rawUrl));
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9500);
    const upstream = await fetch(check.parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);

    const finalUrl = upstream.url || check.parsed.toString();
    const finalCheck = isSafePublicHttpUrl(finalUrl);
    if (!finalCheck.ok) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(403).send(renderFallbackHtml('Blocked Redirect', 'Target redirected to an internal address.', rawUrl));
    }

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    const rawBody = (await upstream.text()).slice(0, 1_800_000);

    if (!contentType.toLowerCase().includes('html')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(rawBody);
    }

    // Strip CSP meta tags & optionally tracker scripts while preserving site styling & images
    let html = rawBody
      .replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
      .replace(/<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '')
      .replace(/<base[^>]*>/gi, '');

    if (adShieldEnabled) {
      html = html.replace(
        /<script[^>]+src=["'][^"']*(?:googletagmanager|google-analytics|doubleclick|googlesyndication|adservice|hotjar|outbrain|taboola|criteo|amazon-adsystem)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
        ''
      );
    }

    const safeBaseHref = finalUrl.replace(/"/g, '&quot;');
    const bridgeScript = `
<base href="${safeBaseHref}" target="_self" />
<script>
(function() {
  try {
    if (document.title) {
      window.parent.postMessage({ type: 'jarvis-browser-title', title: document.title, url: ${JSON.stringify(finalUrl)} }, '*');
    }
    window.addEventListener('DOMContentLoaded', function() {
      if (document.title) {
        window.parent.postMessage({ type: 'jarvis-browser-title', title: document.title, url: ${JSON.stringify(finalUrl)} }, '*');
      }
    });
    document.addEventListener('click', function(e) {
      var el = e.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el) return;
      var rawHref = el.getAttribute('href');
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
      try {
        var resolved = new URL(rawHref, ${JSON.stringify(finalUrl)}).toString();
        if (/^https?:\\/\\//i.test(resolved)) {
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({ type: 'jarvis-browser-navigate', url: resolved }, '*');
        }
      } catch (err) {}
    }, true);
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (!form || !form.tagName || form.tagName !== 'FORM') return;
      var method = (form.getAttribute('method') || 'GET').toUpperCase();
      if (method !== 'GET') return;
      try {
        var action = form.getAttribute('action') || ${JSON.stringify(finalUrl)};
        var target = new URL(action, ${JSON.stringify(finalUrl)});
        var fd = new FormData(form);
        fd.forEach(function(v, k) {
          if (typeof v === 'string') target.searchParams.set(k, v);
        });
        e.preventDefault();
        window.parent.postMessage({ type: 'jarvis-browser-navigate', url: target.toString() }, '*');
      } catch (err) {}
    }, true);
  } catch (err) {}
})();
</script>`;

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, match => `${match}${bridgeScript}`);
    } else {
      html = `<!doctype html><html><head>${bridgeScript}</head><body>${html}</body></html>`;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(html);
  } catch (err: any) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res
      .status(200)
      .send(
        renderFallbackHtml(
          'Live View Unavailable for This Page',
          `The site did not respond in time or blocked server preview (${err?.message || 'connection closed'}). Switch to Reader View or search via JARVIS Web below.`,
          rawUrl
        )
      );
  }
});

app.post('/api/browser/translate', async (req, res) => {
  const { title, blocks, targetLanguage } = req.body || {};
  if (!targetLanguage || typeof targetLanguage !== 'string') {
    return res.status(400).json({ error: 'targetLanguage is required.' });
  }
  const safeBlocks: Array<{ type: string; text: string }> = Array.isArray(blocks)
    ? blocks.slice(0, 28).map(b => ({
        type: typeof b?.type === 'string' ? b.type : 'paragraph',
        text: typeof b?.text === 'string' ? b.text.slice(0, 900) : '',
      }))
    : [];

  if (safeBlocks.length === 0) {
    return res.status(400).json({ error: 'No text content available to translate.' });
  }

  if (aiClient && process.env.GEMINI_API_KEY) {
    const payload = {
      title: typeof title === 'string' ? title.slice(0, 240) : '',
      blocks: safeBlocks,
    };
    const generated = await generateGeminiWithFallback({
      contents: `Translate the "title" and each block's "text" in the following JSON object into ${targetLanguage}. Preserve exact JSON structure, block "type" values, and array length. Return ONLY raw valid JSON with no markdown code fences.\n\n${JSON.stringify(payload)}`,
    });

    if (generated) {
      try {
        const raw = generated.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.blocks)) {
          return res.json({
            title: typeof parsed.title === 'string' ? parsed.title : payload.title,
            blocks: parsed.blocks.map((b: any, i: number) => ({
              type: safeBlocks[i]?.type || b?.type || 'paragraph',
              text: typeof b?.text === 'string' ? b.text : safeBlocks[i]?.text || '',
            })),
            targetLanguage,
            source: generated.modelUsed,
          });
        }
      } catch {
        // Fall through to unavailable response
      }
    }
  }

  const quotaActive = Date.now() < geminiTextCooldownUntil;
  return res.status(quotaActive ? 429 : 503).json({
    error: quotaActive
      ? 'Live translation rate limit reached. Please retry shortly or select a billing-enabled API key in Settings > Secrets.'
      : 'Live translation engine is currently unavailable. Please retry in a moment.',
  });
});

app.post('/api/browser/summarize', async (req, res) => {
  const { title, url, content } = req.body || {};
  const textSample = typeof content === 'string' ? content.slice(0, 8000) : '';
  if (!textSample) {
    return res.status(400).json({ error: 'Page text content is required to summarize.' });
  }

  if (aiClient && process.env.GEMINI_API_KEY) {
    const generated = await generateGeminiWithFallback({
      contents: `Summarize this web page concisely in 4 crisp bullet points for a JARVISOS user. Focus on key facts and takeaways.\n\nTitle: ${title || 'Untitled'}\nURL: ${url || ''}\n\nContent:\n${textSample}`,
    });
    if (generated) {
      return res.json({
        summary: generated.text || 'Summary completed.',
        source: generated.modelUsed,
      });
    }
  }

  // Deterministic extractive fallback if Gemini is unavailable
  const sentences = textSample
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 35)
    .slice(0, 4);
  return res.json({
    summary:
      sentences.length > 0
        ? sentences.map(s => `• ${s.trim()}`).join('\n')
        : '• Page loaded inside JARVIS Browser. Open Reader View for structured text extraction.',
    source: 'extractive-fallback',
  });
});

// ============================================================================
// REAL LINUX SYSTEM HARDWARE NETWORKING & WI-FI ADAPTER ENGINE
// - Binds directly to Linux NetworkManager (`nmcli`), `iw`, `rfkill`, `ip`,
//   `/sys/class/net/*/wireless`, `os.networkInterfaces()`, and `/etc/resolv.conf`.
// - Never fabricates fake Wi-Fi SSIDs: on bare-metal Linux / booted ISO it scans
//   and connects real nearby wireless networks; in cloud containers without a
//   physical 802.11 radio it honestly reports real container Ethernet interfaces.
// ============================================================================

function execCommandSafe(
  command: string,
  args: string[],
  timeoutMs: number = 10000
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  return new Promise(resolve => {
    try {
      execFile(
        command,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            LANG: 'C',
            LC_ALL: 'C',
          },
        },
        (err, stdout, stderr) => {
          if (err) {
            const numericCode =
              typeof (err as any).code === 'number' ? (err as any).code : 1;
            resolve({
              ok: false,
              stdout: String(stdout || ''),
              stderr: String(stderr || err.message || ''),
              code: numericCode,
            });
            return;
          }
          resolve({
            ok: true,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            code: 0,
          });
        }
      );
    } catch (err: any) {
      resolve({
        ok: false,
        stdout: '',
        stderr: String(err?.message || err),
        code: 1,
      });
    }
  });
}

async function resolveBinaryPath(names: string[]): Promise<string | null> {
  const dirs = ['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/usr/local/bin'];
  for (const name of names) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function detectWirelessSysfsInterfaces(): string[] {
  const found: string[] = [];
  try {
    if (!fs.existsSync('/sys/class/net')) return found;
    for (const iface of fs.readdirSync('/sys/class/net')) {
      if (
        fs.existsSync(path.join('/sys/class/net', iface, 'wireless')) ||
        fs.existsSync(path.join('/sys/class/net', iface, 'phy80211'))
      ) {
        found.push(iface);
      }
    }
  } catch {
    // /sys/class/net may be unavailable in restricted sandboxes
  }
  return found;
}

function readRealDnsServers(): string[] {
  try {
    if (fs.existsSync('/etc/resolv.conf')) {
      return parseResolvConfDns(fs.readFileSync('/etc/resolv.conf', 'utf-8'));
    }
  } catch {
    // Ignore
  }
  return [];
}

async function readRealDefaultRoute(): Promise<{ gateway: string; iface: string }> {
  const ipBin = await resolveBinaryPath(['ip']);
  if (!ipBin) return { gateway: '', iface: '' };
  const routeRes = await execCommandSafe(ipBin, ['route', 'show', 'default'], 3000);
  if (routeRes.ok && routeRes.stdout.trim()) {
    return parseIpRouteDefaultGateway(routeRes.stdout);
  }
  const allRes = await execCommandSafe(ipBin, ['route', 'show'], 3000);
  if (allRes.ok) {
    return parseIpRouteDefaultGateway(allRes.stdout);
  }
  return { gateway: '', iface: '' };
}

function collectSystemNetworkInterfaces(
  wifiInterfaces: Set<string>,
  defaultRoute: { gateway: string; iface: string },
  dnsServers: string[]
): SystemNetworkInterface[] {
  const raw = os.networkInterfaces();
  const list: SystemNetworkInterface[] = [];
  const dnsStr = dnsServers.join(', ');

  for (const [name, addrs] of Object.entries(raw)) {
    if (!addrs || name === 'lo') continue;
    let ipv4 = '';
    let ipv6 = '';
    let mac = '';
    for (const a of addrs) {
      if (!a.internal) {
        if (a.family === 'IPv4' && !ipv4) ipv4 = a.address;
        if (a.family === 'IPv6' && !ipv6) ipv6 = a.address;
        if (a.mac && a.mac !== '00:00:00:00:00:00' && !mac) mac = a.mac;
      }
    }
    const isWifi =
      wifiInterfaces.has(name) || /^(wl|wlan|wifi|ath|ra)/i.test(name);
    const isEth = /^(eth|enp|eno|ens|em)/i.test(name);
    const isDefaultRoute = defaultRoute.iface === name;

    list.push({
      name,
      kind: isWifi ? 'wifi' : isEth ? 'ethernet' : 'other',
      state: ipv4 || ipv6 ? 'up' : 'down',
      ipv4,
      ipv6,
      mac,
      gateway: isDefaultRoute ? defaultRoute.gateway : '',
      dns: isDefaultRoute ? dnsStr : '',
      isDefaultRoute,
    });
  }

  return list.sort((a, b) => {
    if (a.isDefaultRoute !== b.isDefaultRoute) return a.isDefaultRoute ? -1 : 1;
    if (a.kind === 'wifi' && b.kind !== 'wifi') return -1;
    if (b.kind === 'wifi' && a.kind !== 'wifi') return 1;
    return a.name.localeCompare(b.name);
  });
}

async function getRealSystemNetworkSnapshot(rescan: boolean = false) {
  const [nmcliBin, iwBin, defaultRoute] = await Promise.all([
    resolveBinaryPath(['nmcli']),
    resolveBinaryPath(['iw']),
    readRealDefaultRoute(),
  ]);
  const dnsServers = readRealDnsServers();
  const sysfsWifi = detectWirelessSysfsInterfaces();
  const wifiIfaceSet = new Set<string>(sysfsWifi);

  // 1. Primary Linux bare-metal / ISO path: NetworkManager (`nmcli`)
  if (nmcliBin) {
    const devStatus = await execCommandSafe(
      nmcliBin,
      ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status'],
      5000
    );

    if (devStatus.ok) {
      let wifiInterface: string | null = null;
      let activeConnectionName = '';
      for (const rawLine of devStatus.stdout.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const [dev, type, state, conn] = splitNmcliTerseLine(line);
        if (type === 'wifi' && dev) {
          wifiIfaceSet.add(dev);
          if (!wifiInterface || state === 'connected') {
            wifiInterface = dev;
            if (state === 'connected' && conn && conn !== '--') {
              activeConnectionName = conn;
            }
          }
        }
      }

      if (wifiInterface) {
        const radioRes = await execCommandSafe(nmcliBin, ['radio', 'wifi'], 4000);
        const radioEnabled = radioRes.ok
          ? radioRes.stdout.trim().toLowerCase() === 'enabled'
          : true;

        const savedRes = await execCommandSafe(
          nmcliBin,
          ['-t', '-f', 'NAME,TYPE', 'connection', 'show'],
          4000
        );
        const savedSsids = new Set<string>();
        if (savedRes.ok) {
          for (const row of savedRes.stdout.split(/\r?\n/)) {
            const [name, type] = splitNmcliTerseLine(row.trim());
            if (name && (type === '802-11-wireless' || type === 'wifi')) {
              savedSsids.add(name);
            }
          }
        }

        // Read active Wi-Fi interface IP/gateway/DNS details directly from NetworkManager
        let ipAddress = '';
        let gateway = defaultRoute.iface === wifiInterface ? defaultRoute.gateway : '';
        let dns = dnsServers.join(', ');
        const devShow = await execCommandSafe(
          nmcliBin,
          ['-t', '-f', 'IP4.ADDRESS,IP4.GATEWAY,IP4.DNS', 'device', 'show', wifiInterface],
          4000
        );
        if (devShow.ok) {
          const nmDns: string[] = [];
          for (const row of devShow.stdout.split(/\r?\n/)) {
            const idx = row.indexOf(':');
            if (idx === -1) continue;
            const key = row.slice(0, idx).trim();
            const val = row.slice(idx + 1).trim();
            if (!val || val === '--') continue;
            if (key.startsWith('IP4.ADDRESS') && !ipAddress) {
              ipAddress = val.split('/')[0];
            } else if (key.startsWith('IP4.GATEWAY') && !gateway) {
              gateway = val;
            } else if (key.startsWith('IP4.DNS')) {
              nmDns.push(val);
            }
          }
          if (nmDns.length > 0) dns = nmDns.join(', ');
        }

        let networks: WifiNetwork[] = [];
        let activeNetworkId: string | null = null;
        if (radioEnabled) {
          const listArgs = [
            '-t',
            '-f',
            'IN-USE,SSID,BSSID,SIGNAL,FREQ,SECURITY,RATE,DEVICE',
            'device',
            'wifi',
            'list',
            'ifname',
            wifiInterface,
          ];
          if (rescan) {
            listArgs.push('--rescan', 'yes');
          }
          const scanRes = await execCommandSafe(nmcliBin, listArgs, 12000);
          if (scanRes.ok) {
            const parsed = parseNmcliWifiList(scanRes.stdout, savedSsids, {
              iface: wifiInterface,
              ipAddress,
              gateway,
              dns,
              connectionName: activeConnectionName,
            });
            networks = parsed.networks;
            activeNetworkId = parsed.activeNetworkId;
          }
        }

        const interfaces = collectSystemNetworkInterfaces(wifiIfaceSet, defaultRoute, dnsServers);
        return {
          hasWifiHardware: true,
          hardwareBackend: 'networkmanager' as const,
          wifiInterface,
          enabled: radioEnabled,
          activeNetworkId,
          networks,
          interfaces,
          dnsServers,
          defaultGateway: gateway || defaultRoute.gateway,
          defaultInterface: defaultRoute.iface || wifiInterface,
          scannedAt: new Date().toISOString(),
        };
      }
    }
  }

  // 2. Secondary Linux hardware path: direct `iw` scan when wireless sysfs interface exists
  if (iwBin) {
    if (wifiIfaceSet.size === 0) {
      const iwDev = await execCommandSafe(iwBin, ['dev'], 4000);
      if (iwDev.ok) {
        for (const match of iwDev.stdout.matchAll(/^\s*Interface\s+([^\s]+)$/gm)) {
          if (match[1]) wifiIfaceSet.add(match[1]);
        }
      }
    }

    const wifiInterface = Array.from(wifiIfaceSet)[0] || null;
    if (wifiInterface) {
      const linkRes = await execCommandSafe(iwBin, ['dev', wifiInterface, 'link'], 4000);
      const ssidMatch = linkRes.ok ? linkRes.stdout.match(/^\s*SSID:\s*(.+)$/m) : null;
      const activeSsid = ssidMatch ? ssidMatch[1].trim() : null;

      const interfaces = collectSystemNetworkInterfaces(wifiIfaceSet, defaultRoute, dnsServers);
      const wifiIf = interfaces.find(i => i.name === wifiInterface);
      const scanRes = await execCommandSafe(iwBin, ['dev', wifiInterface, 'scan'], 12000);
      const parsed = scanRes.ok
        ? parseIwScanOutput(scanRes.stdout, wifiInterface, activeSsid, {
            iface: wifiInterface,
            ipAddress: wifiIf?.ipv4 || '',
            gateway: defaultRoute.gateway,
            dns: dnsServers.join(', '),
          })
        : { networks: [], activeNetworkId: null };

      return {
        hasWifiHardware: true,
        hardwareBackend: 'iw' as const,
        wifiInterface,
        enabled: true,
        activeNetworkId: parsed.activeNetworkId,
        networks: parsed.networks,
        interfaces,
        dnsServers,
        defaultGateway: defaultRoute.gateway,
        defaultInterface: defaultRoute.iface || wifiInterface,
        environmentNote: !scanRes.ok
          ? 'Detected Linux wireless adapter, but root/NetworkManager permissions are required to trigger active scans.'
          : undefined,
        scannedAt: new Date().toISOString(),
      };
    }
  }

  // 3. Cloud sandbox / wired-only Linux host (NO physical Wi-Fi radio): return ZERO fake SSIDs!
  const interfaces = collectSystemNetworkInterfaces(wifiIfaceSet, defaultRoute, dnsServers);
  return {
    hasWifiHardware: false,
    hardwareBackend: 'no-wifi-hardware' as const,
    wifiInterface: null,
    enabled: false,
    activeNetworkId: null,
    networks: [] as WifiNetwork[],
    interfaces,
    dnsServers,
    defaultGateway: defaultRoute.gateway,
    defaultInterface: defaultRoute.iface || interfaces[0]?.name || '',
    environmentNote:
      'No physical 802.11 Wi-Fi radio is attached to this cloud container (virtual Ethernet only). When booted standalone from the JARVISOS Linux ISO or run on a Linux PC with NetworkManager, real nearby Wi-Fi signals appear here automatically.',
    scannedAt: new Date().toISOString(),
  };
}

app.get('/api/network/status', async (req, res) => {
  try {
    const rescan = req.query.rescan === '1' || req.query.rescan === 'true';
    const snapshot = await getRealSystemNetworkSnapshot(rescan);
    return res.json(snapshot);
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Failed to query system network hardware.',
    });
  }
});

app.post('/api/network/wifi/radio', async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const nmcliBin = await resolveBinaryPath(['nmcli']);
  const rfkillBin = await resolveBinaryPath(['rfkill']);

  if (!nmcliBin && !rfkillBin) {
    const snapshot = await getRealSystemNetworkSnapshot(false);
    return res.status(501).json({
      error: 'No physical Wi-Fi radio controller (NetworkManager / rfkill) is available in this environment.',
      snapshot,
    });
  }

  if (enabled && rfkillBin) {
    await execCommandSafe(rfkillBin, ['unblock', 'wifi'], 4000);
  }

  if (nmcliBin) {
    const result = await execCommandSafe(nmcliBin, ['radio', 'wifi', enabled ? 'on' : 'off'], 6000);
    if (!result.ok) {
      return res.status(500).json({
        error: result.stderr.trim() || `Failed to turn Wi-Fi ${enabled ? 'on' : 'off'}.`,
      });
    }
  } else if (rfkillBin) {
    const result = await execCommandSafe(rfkillBin, [enabled ? 'unblock' : 'block', 'wifi'], 4000);
    if (!result.ok) {
      return res.status(500).json({
        error: result.stderr.trim() || `Failed to toggle rfkill Wi-Fi state.`,
      });
    }
  }

  const snapshot = await getRealSystemNetworkSnapshot(enabled);
  return res.json(snapshot);
});

app.post('/api/network/wifi/connect', async (req, res) => {
  const ssid = typeof req.body?.ssid === 'string' ? req.body.ssid.trim() : '';
  const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase : '';
  const hidden = Boolean(req.body?.hidden);
  const iface = typeof req.body?.iface === 'string' ? req.body.iface.trim() : '';

  if (!ssid || ssid.length > 64) {
    return res.status(400).json({ error: 'A valid Wi-Fi SSID is required.' });
  }

  const nmcliBin = await resolveBinaryPath(['nmcli']);
  if (!nmcliBin) {
    return res.status(501).json({
      error: 'NetworkManager (nmcli) is not available in this cloud container. Boot the JARVISOS ISO on real hardware to connect to Wi-Fi networks.',
    });
  }

  // If no passphrase supplied and a saved profile exists, activate it directly first
  if (!passphrase && !hidden) {
    const upRes = await execCommandSafe(nmcliBin, ['connection', 'up', 'id', ssid], 15000);
    if (upRes.ok) {
      const snapshot = await getRealSystemNetworkSnapshot(false);
      return res.json(snapshot);
    }
  }

  const args = ['device', 'wifi', 'connect', ssid];
  if (passphrase) {
    args.push('password', passphrase);
  }
  if (iface && /^[a-zA-Z0-9._-]+$/.test(iface)) {
    args.push('ifname', iface);
  }
  if (hidden) {
    args.push('hidden', 'yes');
  }

  const connectRes = await execCommandSafe(nmcliBin, args, 20000);
  if (!connectRes.ok) {
    const errMsg =
      connectRes.stderr.trim() ||
      connectRes.stdout.trim() ||
      `Failed to connect to "${ssid}". Verify the Wi-Fi passphrase and signal strength.`;
    return res.status(400).json({ error: errMsg });
  }

  const snapshot = await getRealSystemNetworkSnapshot(false);
  return res.json(snapshot);
});

app.post('/api/network/wifi/disconnect', async (req, res) => {
  const iface = typeof req.body?.iface === 'string' ? req.body.iface.trim() : '';
  const ssid = typeof req.body?.ssid === 'string' ? req.body.ssid.trim() : '';
  const nmcliBin = await resolveBinaryPath(['nmcli']);

  if (!nmcliBin) {
    return res.status(501).json({
      error: 'NetworkManager (nmcli) is not available in this cloud container.',
    });
  }

  let result: { ok: boolean; stdout: string; stderr: string; code: number };
  if (iface && /^[a-zA-Z0-9._-]+$/.test(iface)) {
    result = await execCommandSafe(nmcliBin, ['device', 'disconnect', iface], 8000);
  } else if (ssid) {
    result = await execCommandSafe(nmcliBin, ['connection', 'down', 'id', ssid], 8000);
  } else {
    const current = await getRealSystemNetworkSnapshot(false);
    if (!current.wifiInterface) {
      return res.status(400).json({ error: 'No active Wi-Fi interface found.' });
    }
    result = await execCommandSafe(nmcliBin, ['device', 'disconnect', current.wifiInterface], 8000);
  }

  if (!result.ok) {
    return res.status(500).json({
      error: result.stderr.trim() || 'Failed to disconnect Wi-Fi.',
    });
  }

  const snapshot = await getRealSystemNetworkSnapshot(false);
  return res.json(snapshot);
});

app.post('/api/network/wifi/forget', async (req, res) => {
  const ssid = typeof req.body?.ssid === 'string' ? req.body.ssid.trim() : '';
  if (!ssid) {
    return res.status(400).json({ error: 'SSID is required.' });
  }
  const nmcliBin = await resolveBinaryPath(['nmcli']);
  if (!nmcliBin) {
    return res.status(501).json({
      error: 'NetworkManager (nmcli) is not available in this cloud container.',
    });
  }

  const result = await execCommandSafe(nmcliBin, ['connection', 'delete', 'id', ssid], 8000);
  if (!result.ok) {
    return res.status(500).json({
      error: result.stderr.trim() || `Failed to remove saved profile "${ssid}".`,
    });
  }

  const snapshot = await getRealSystemNetworkSnapshot(false);
  return res.json(snapshot);
});

// Downloadable Linux ISO Build Script for Lenovo E41-25 (with real Wi-Fi & NetworkManager hardware support)
app.get('/api/scripts/download-iso-builder', (_req, res) => {
  const scriptContent = `#!/usr/bin/env bash
# ==============================================================================
# JARVISOS STANDALONE BOOTABLE LINUX IMAGE BUILDER
# Target Hardware: Lenovo E41-25 (AMD A6-9225 APU / 4GB RAM / 256GB SSD)
# Architecture: NetworkManager Real Wi-Fi Stack + Cage Wayland Kiosk + zRAM
# ==============================================================================
set -euo pipefail

echo "================================================================="
echo "  JARVISOS BOOTABLE ISO BUILDER FOR LENOVO E41-25"
echo "  Includes Real Wi-Fi Drivers (Realtek/Atheros/Intel) + nmcli"
echo "================================================================="

# 1. Check Root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please execute as root (sudo bash build-jarvisos-iso.sh)"
  exit 1
fi

WORK_DIR="/tmp/jarvisos-build"
OUTPUT_DIR="./dist-iso"
mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

echo "[1/7] Installing build dependencies..."
apt-get update -qq
apt-get install -y -qq live-build debootstrap squashfs-tools xorriso isolinux dosfstools

echo "[2/7] Configuring Debian 12 Bookworm Minimal Base..."
cd "$WORK_DIR"
lb clean || true
lb config \\
  --distribution bookworm \\
  --architecture amd64 \\
  --binary-images iso-hybrid \\
  --archive-areas "main contrib non-free non-free-firmware" \\
  --bootloaders "syslinux,grub-efi" \\
  --memtest none

# Package manifest: Hardware Wi-Fi drivers, NetworkManager, Wayland kiosk, audio, Node/Python
cat << 'EOF' > config/package-lists/jarvisos.list.chroot
linux-image-amd64
firmware-amd-graphics
firmware-realtek
firmware-atheros
firmware-iwlwifi
firmware-brcm80211
network-manager
wpasupplicant
wireless-tools
iw
rfkill
iproute2
ca-certificates
cage
wayland-protocols
chromium
pipewire
pipewire-audio
wireplumber
zram-tools
curl
git
nodejs
npm
build-essential
cmake
python3
python3-pip
python3-venv
libasound2-dev
EOF

echo "[3/7] Enabling Real Hardware NetworkManager Wi-Fi Stack..."
mkdir -p config/hooks/live
cat << 'EOF' > config/hooks/live/0100-enable-wifi.hook.chroot
#!/usr/bin/env bash
set -e
systemctl enable NetworkManager.service || true
systemctl disable networking.service 2>/dev/null || true
EOF
chmod +x config/hooks/live/0100-enable-wifi.hook.chroot

mkdir -p config/includes.chroot/etc/polkit-1/rules.d
cat << 'EOF' > config/includes.chroot/etc/polkit-1/rules.d/50-jarvis-networkmanager.rules
polkit.addRule(function(action, subject) {
  if (action.id.indexOf("org.freedesktop.NetworkManager.") === 0 &&
      (subject.isInGroup("netdev") || subject.isInGroup("sudo"))) {
    return polkit.Result.YES;
  }
});
EOF

echo "[4/7] Configuring zRAM (Expands 4GB RAM to 6GB effective)..."
mkdir -p config/includes.chroot/etc/default
cat << 'EOF' > config/includes.chroot/etc/default/zramswap
ALGO=zstd
PERCENT=50
PRIORITY=100
EOF

echo "[5/7] Creating JARVIS Boot Daemon with Real Wi-Fi Radio Activation..."
mkdir -p config/includes.chroot/opt/jarvisos
cat << 'EOF' > config/includes.chroot/opt/jarvisos/start-jarvis.sh
#!/usr/bin/env bash
set -euo pipefail
echo "Starting JARVISOS Kiosk Shell on Lenovo E41-25..."

# Unblock Wi-Fi hardware radio & ensure NetworkManager is active for real SSID scanning
rfkill unblock wifi 2>/dev/null || true
systemctl start NetworkManager 2>/dev/null || true
nmcli radio wifi on 2>/dev/null || true

# Start JARVISOS full-stack server if installed in /opt/jarvisos/app
if [ -f /opt/jarvisos/app/package.json ]; then
  cd /opt/jarvisos/app
  nohup npm start >/var/log/jarvisos-server.log 2>&1 &
  sleep 2
  exec cage -- chromium --kiosk --noerrdialogs --disable-infobars http://127.0.0.1:3000
fi

exec cage -- /opt/jarvisos/jarvis-hud
EOF
chmod +x config/includes.chroot/opt/jarvisos/start-jarvis.sh

echo "[6/7] Building Hybrid UEFI/BIOS Bootable ISO..."
lb build

echo "[7/7] Finalizing ISO image..."
cp live-image-amd64.hybrid.iso "$OUTPUT_DIR/jarvisos-lenovo-e41-25.iso"

echo "================================================================="
echo "  BUILD SUCCESSFUL!"
echo "  ISO Output: $OUTPUT_DIR/jarvisos-lenovo-e41-25.iso"
echo "  To flash to USB: sudo dd if=$OUTPUT_DIR/jarvisos-lenovo-e41-25.iso of=/dev/sdX bs=4M status=progress oflag=sync"
echo "================================================================="
`;

  res.setHeader('Content-Type', 'text/x-shellscript');
  res.setHeader('Content-Disposition', 'attachment; filename="build-jarvisos-iso.sh"');
  res.send(scriptContent);
});

// ============================================================================
// REAL LINUX PTY TERMINAL ENGINE WITH KERNEL USER & PRIVILEGE SEPARATION
// - Dedicated non-root Linux user `jarvis` (non-zero UID in /etc/passwd)
// - Real /etc/group (`sudo`) authorization + /etc/shadow password verification
// - Persistent PTY bash shells (/dev/pts/N) via scripts/pty-shell-worker.py
// - `sudo -i` -> genuine UID 0 root login shell inside isolated cloud sandbox
// - `exit`    -> leaves root mode cleanly and returns to non-root `jarvis` shell
// ============================================================================

interface LinuxUserAccount {
  username: string;
  uid: number;
  gid: number;
  homeDir: string;
  shell: string;
}

interface PtyExecResult {
  exitCode: number;
  uid: number;
  user: string;
  cwd: string;
  tty: string;
  shellExited?: boolean;
}

interface PendingSudoRequest {
  action: Extract<
    ParsedPrivilegeAction,
    { kind: 'sudo-root-shell' | 'sudo-command' | 'sudo-validate' | 'sudo-list' }
  >;
  attempts: number;
}

const TERMINAL_SHELL_PATH = fs.existsSync('/usr/bin/bash')
  ? '/usr/bin/bash'
  : fs.existsSync('/bin/bash')
    ? '/bin/bash'
    : '/bin/sh';
const PTY_WORKER_SCRIPT = path.resolve(__dirname, 'scripts', 'pty-shell-worker.py');
const TERMINAL_EXEC_TIMEOUT_MS = 30_000;
const TERMINAL_MAX_OUTPUT_BYTES = 256 * 1024;
const SUDO_AUTH_CACHE_MS = 5 * 60 * 1000; // Standard 5-minute Linux sudo credential cache
const TERMINAL_HOSTNAME = 'jarvis-linux';

let cachedJarvisAccount: LinuxUserAccount | null = null;

function parsePasswdLine(line: string): LinuxUserAccount | null {
  const parts = line.trim().split(':');
  if (parts.length < 7) return null;
  const uid = parseInt(parts[2], 10);
  const gid = parseInt(parts[3], 10);
  if (!Number.isInteger(uid) || !Number.isInteger(gid)) return null;
  return {
    username: parts[0],
    uid,
    gid,
    homeDir: parts[5] || `/home/${parts[0]}`,
    shell: parts[6] || TERMINAL_SHELL_PATH,
  };
}

function lookupLinuxUser(username: string): LinuxUserAccount | null {
  try {
    const out = execFileSync('getent', ['passwd', username], { encoding: 'utf8' });
    return parsePasswdLine(out);
  } catch {
    return null;
  }
}

function ensureJarvisLinuxUser(): LinuxUserAccount {
  if (cachedJarvisAccount && cachedJarvisAccount.uid > 0 && fs.existsSync(cachedJarvisAccount.homeDir)) {
    return cachedJarvisAccount;
  }

  const configuredPassword = (process.env.JARVIS_SUDO_PASSWORD || 'jarvis').trim() || 'jarvis';

  // Ensure `sudo` group exists in /etc/group for real Linux authorization
  try {
    execFileSync('/usr/sbin/groupadd', ['-f', 'sudo'], { stdio: 'ignore' });
  } catch {
    // Group may already exist or tool in alternate path
  }

  let account = lookupLinuxUser('jarvis');
  if (!account) {
    execFileSync('/usr/sbin/useradd', ['-m', '-s', TERMINAL_SHELL_PATH, '-G', 'sudo', 'jarvis'], {
      stdio: 'pipe',
    });
    account = lookupLinuxUser('jarvis');
  } else {
    try {
      execFileSync('/usr/sbin/usermod', ['-aG', 'sudo', 'jarvis'], { stdio: 'ignore' });
    } catch {
      // ignore if already in sudo group
    }
  }

  if (!account || account.uid <= 0) {
    throw new Error('Failed to provision dedicated non-root Linux user `jarvis` with non-zero UID.');
  }

  // Ensure `jarvis` has a real hashed password in /etc/shadow via chpasswd
  try {
    const shadowCheck = execFileSync(
      'python3',
      ['-c', 'import spwd; p=spwd.getspnam("jarvis").sp_pwdp; print("SET" if p and not p.startswith(("!","*")) else "LOCKED")'],
      { encoding: 'utf8' }
    ).trim();
    if (shadowCheck !== 'SET' || process.env.JARVIS_SUDO_PASSWORD) {
      execFileSync('/usr/sbin/chpasswd', [], {
        input: `jarvis:${configuredPassword}\n`,
        encoding: 'utf8',
      });
    }
  } catch (err) {
    console.warn('Warning configuring shadow password for jarvis:', err);
  }

  // Initialize workspace files inside /home/jarvis owned strictly by jarvis:jarvis
  try {
    fs.mkdirSync(account.homeDir, { recursive: true });
    fs.mkdirSync(path.join(account.homeDir, 'projects'), { recursive: true });
    fs.mkdirSync(path.join(account.homeDir, 'scripts'), { recursive: true });

    const readmePath = path.join(account.homeDir, 'README.txt');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        [
          'Welcome to JARVISOS Cloud Linux Terminal (Debian GNU/Linux)',
          '',
          'You are running as a real non-root Linux user (`jarvis`).',
          'Verify your real kernel UID and permissions:',
          '  id            -> shows your non-zero UID & groups',
          '  id -u         -> returns non-zero UID in USER MODE',
          '  ls /root      -> Permission denied in USER MODE',
          '',
          'Root privilege escalation (isolated sandbox only):',
          '  sudo -i       -> authenticate and enter genuine ROOT MODE login shell (UID 0)',
          '  sudo <cmd>    -> run a single command with root privileges',
          '  exit          -> leave ROOT MODE and return to USER MODE',
          '  sudo -k       -> clear cached sudo authentication',
          '',
          'Default sandbox password for `jarvis`: jarvis',
          '',
        ].join('\n'),
        'utf8'
      );
    }

    const sampleScript = path.join(account.homeDir, 'scripts', 'sys-check.sh');
    if (!fs.existsSync(sampleScript)) {
      fs.writeFileSync(
        sampleScript,
        '#!/usr/bin/env bash\necho "User: $(id -un) (UID $(id -u)) | Host: $(hostname) | Kernel: $(uname -sr)"\necho "TTY: $(tty 2>/dev/null || echo none) | Date: $(date)"\n',
        { mode: 0o755 }
      );
    }

    execFileSync('chown', ['-R', `${account.uid}:${account.gid}`, account.homeDir], {
      stdio: 'ignore',
    });
  } catch (err) {
    console.warn('Warning initializing /home/jarvis workspace:', err);
  }

  cachedJarvisAccount = account;
  return account;
}

interface SudoAuthResult {
  authorized: boolean;
  authenticated: boolean;
  reason?: string;
}

function verifyLinuxSudoCredentials(username: string, password: string): SudoAuthResult {
  const pyCode = [
    'import crypt, grp, hmac, json, pwd, spwd, sys',
    'payload = json.loads(sys.stdin.read() or "{}")',
    'user = str(payload.get("username", ""))',
    'pw = str(payload.get("password", ""))',
    'try:',
    '    pw_entry = pwd.getpwnam(user)',
    'except KeyError:',
    '    print(json.dumps({"authorized": False, "authenticated": False, "reason": "unknown_user"}))',
    '    sys.exit(0)',
    'authorized = (pw_entry.pw_uid == 0)',
    'if not authorized:',
    '    for gname in ("sudo", "wheel", "admin"):',
    '        try:',
    '            g = grp.getgrnam(gname)',
    '            if user in g.gr_mem or pw_entry.pw_gid == g.gr_gid:',
    '                authorized = True',
    '                break',
    '        except KeyError:',
    '            pass',
    'if not authorized:',
    '    print(json.dumps({"authorized": False, "authenticated": False, "reason": "not_in_sudoers"}))',
    '    sys.exit(0)',
    'try:',
    '    sp = spwd.getspnam(user)',
    '    stored = sp.sp_pwdp or ""',
    '    if not stored or stored.startswith(("!", "*")):',
    '        ok = False',
    '    else:',
    '        computed = crypt.crypt(pw, stored)',
    '        ok = bool(computed) and hmac.compare_digest(computed, stored)',
    '    print(json.dumps({"authorized": True, "authenticated": ok, "reason": "ok" if ok else "bad_password"}))',
    'except Exception as exc:',
    '    print(json.dumps({"authorized": True, "authenticated": False, "reason": str(exc)}))',
  ].join('\n');

  try {
    const stdout = execFileSync('python3', ['-c', pyCode], {
      input: JSON.stringify({ username, password }),
      encoding: 'utf8',
      timeout: 4000,
    });
    const parsed = JSON.parse(stdout.trim());
    return {
      authorized: Boolean(parsed?.authorized),
      authenticated: Boolean(parsed?.authenticated),
      reason: typeof parsed?.reason === 'string' ? parsed.reason : undefined,
    };
  } catch (err: any) {
    console.warn('Linux sudo auth verification error:', err?.message || err);
    return { authorized: false, authenticated: false, reason: 'auth_error' };
  }
}

function isUserAuthorizedForSudo(username: string): boolean {
  const pyCode = [
    'import grp, pwd, sys',
    'u = sys.argv[1]',
    'try:',
    '    p = pwd.getpwnam(u)',
    '    if p.pw_uid == 0:',
    '        print("YES"); sys.exit(0)',
    '    for gname in ("sudo", "wheel", "admin"):',
    '        try:',
    '            g = grp.getgrnam(gname)',
    '            if u in g.gr_mem or p.pw_gid == g.gr_gid:',
    '                print("YES"); sys.exit(0)',
    '        except KeyError:',
    '            pass',
    'except KeyError:',
    '    pass',
    'print("NO")',
  ].join('\n');
  try {
    return execFileSync('python3', ['-c', pyCode, username], { encoding: 'utf8' }).trim() === 'YES';
  } catch {
    return false;
  }
}

function buildCleanLinuxEnv(account: LinuxUserAccount, extra?: Record<string, string>): Record<string, string> {
  const basePath =
    account.uid === 0
      ? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      : '/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games';
  return {
    HOME: account.homeDir,
    USER: account.username,
    LOGNAME: account.username,
    SHELL: account.shell || TERMINAL_SHELL_PATH,
    PATH: basePath,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    CLICOLOR: '1',
    CLICOLOR_FORCE: '1',
    LS_COLORS: 'di=1;34:ln=1;36:so=1;35:pi=33:ex=1;32:bd=1;33:cd=1;33:su=37;41:sg=30;43:tw=30;42:ow=34;42',
    PWD: account.homeDir,
    OLDPWD: account.homeDir,
    ...(extra || {}),
  };
}

class PersistentPtyShell {
  public readonly mode: 'user' | 'root';
  public readonly homeDir: string;
  public uid: number;
  public gid: number;
  public user: string;
  public cwd: string;
  public tty: string = '/dev/pts/0';
  public pid: number = 0;
  public alive: boolean = false;

  private worker: ChildProcess | null = null;
  private stdoutBuffer = '';
  private activeCmd: {
    id: string;
    onOutput: (chunk: string) => void;
    resolve: (res: PtyExecResult) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  constructor(
    mode: 'user' | 'root',
    account: LinuxUserAccount,
    startCwd: string,
    private readonly loginShell: boolean,
    private readonly extraEnv?: Record<string, string>
  ) {
    this.mode = mode;
    this.uid = account.uid;
    this.gid = account.gid;
    this.user = account.username;
    this.homeDir = account.homeDir;
    this.cwd = startCwd;
  }

  public async start(): Promise<void> {
    if (this.mode === 'user' && this.uid === 0) {
      throw new Error('Security invariant violation: USER MODE shell cannot start with UID 0.');
    }

    const args = [
      PTY_WORKER_SCRIPT,
      this.user,
      String(this.uid),
      String(this.gid),
      this.cwd,
      ...(this.loginShell ? ['login'] : []),
    ];

    const worker = spawn('python3', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        LANG: 'C.UTF-8',
      },
    });
    this.worker = worker;

    const childEnv = buildCleanLinuxEnv(
      {
        username: this.user,
        uid: this.uid,
        gid: this.gid,
        homeDir: this.homeDir,
        shell: TERMINAL_SHELL_PATH,
      },
      {
        PWD: this.cwd,
        ...(this.extraEnv || {}),
      }
    );
    worker.stdin?.write(`${JSON.stringify(childEnv)}\n`);

    await new Promise<void>((resolve, reject) => {
      const readyTimeout = setTimeout(() => {
        reject(new Error('Timed out starting persistent Linux PTY shell.'));
      }, 6000);

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          clearTimeout(readyTimeout);
          this.uid = typeof msg.uid === 'number' ? msg.uid : this.uid;
          this.user = typeof msg.user === 'string' && msg.user ? msg.user : this.user;
          this.cwd = typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : this.cwd;
          this.tty = typeof msg.tty === 'string' && msg.tty ? msg.tty : this.tty;
          this.pid = typeof msg.pid === 'number' ? msg.pid : 0;

          if (this.mode === 'user' && this.uid === 0) {
            this.close();
            reject(new Error('Privilege separation check failed: non-root shell reported UID 0.'));
            return;
          }
          if (this.mode === 'root' && this.uid !== 0) {
            this.close();
            reject(new Error('Root shell verification failed: root shell reported non-zero UID.'));
            return;
          }

          this.alive = true;
          resolve();
          return;
        }

        if (msg.type === 'fatal') {
          clearTimeout(readyTimeout);
          reject(new Error(String(msg.error || 'PTY worker failed to initialize.')));
          return;
        }

        if (msg.type === 'output' && this.activeCmd && msg.id === this.activeCmd.id) {
          this.activeCmd.onOutput(String(msg.data || ''));
          return;
        }

        if (msg.type === 'done' && this.activeCmd && msg.id === this.activeCmd.id) {
          const current = this.activeCmd;
          this.activeCmd = null;
          clearTimeout(current.timer);
          if (typeof msg.uid === 'number') this.uid = msg.uid;
          if (typeof msg.user === 'string' && msg.user) this.user = msg.user;
          if (typeof msg.cwd === 'string' && msg.cwd) this.cwd = msg.cwd;
          if (typeof msg.tty === 'string' && msg.tty) this.tty = msg.tty;
          if (msg.shellExited) this.alive = false;
          current.resolve({
            exitCode: typeof msg.exitCode === 'number' ? msg.exitCode : 0,
            uid: this.uid,
            user: this.user,
            cwd: this.cwd,
            tty: this.tty,
            shellExited: Boolean(msg.shellExited),
          });
          return;
        }

        if (msg.type === 'exited') {
          this.alive = false;
          if (this.activeCmd) {
            const current = this.activeCmd;
            this.activeCmd = null;
            clearTimeout(current.timer);
            current.resolve({
              exitCode: typeof msg.code === 'number' ? msg.code : 0,
              uid: this.uid,
              user: this.user,
              cwd: this.cwd,
              tty: this.tty,
              shellExited: true,
            });
          }
        }
      };

      worker.stdout?.on('data', (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString('utf8');
        const lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop() || '';
        for (const l of lines) handleLine(l);
      });

      worker.on('error', err => {
        clearTimeout(readyTimeout);
        this.alive = false;
        reject(err);
      });

      worker.on('close', () => {
        clearTimeout(readyTimeout);
        this.alive = false;
        if (this.activeCmd) {
          const current = this.activeCmd;
          this.activeCmd = null;
          clearTimeout(current.timer);
          current.resolve({
            exitCode: 0,
            uid: this.uid,
            user: this.user,
            cwd: this.cwd,
            tty: this.tty,
            shellExited: true,
          });
        }
      });
    });
  }

  public isBusy(): boolean {
    return this.activeCmd !== null;
  }

  public exec(command: string, onOutput: (chunk: string) => void): Promise<PtyExecResult> {
    if (!this.alive || !this.worker?.stdin) {
      return Promise.reject(new Error('Shell process is no longer active.'));
    }
    if (this.activeCmd) {
      return Promise.reject(new Error('Another command is still running in this tab. Press Ctrl+C to stop it.'));
    }

    const cmdId = crypto.randomBytes(8).toString('hex');

    return new Promise<PtyExecResult>(resolve => {
      const timer = setTimeout(() => {
        if (this.activeCmd && this.activeCmd.id === cmdId) {
          onOutput(`\n[Command timed out after ${TERMINAL_EXEC_TIMEOUT_MS / 1000}s]\n`);
          this.sigint();
        }
      }, TERMINAL_EXEC_TIMEOUT_MS);

      this.activeCmd = {
        id: cmdId,
        onOutput,
        resolve,
        timer,
      };

      this.worker?.stdin?.write(`${JSON.stringify({ type: 'exec', id: cmdId, command })}\n`);
    });
  }

  public sigint(): boolean {
    if (!this.alive || !this.worker?.stdin) return false;
    try {
      this.worker.stdin.write(`${JSON.stringify({ type: 'sigint' })}\n`);
      return true;
    } catch {
      return false;
    }
  }

  public close(): void {
    this.alive = false;
    if (this.activeCmd) {
      clearTimeout(this.activeCmd.timer);
      this.activeCmd = null;
    }
    if (this.worker) {
      try {
        this.worker.stdin?.write(`${JSON.stringify({ type: 'close' })}\n`);
        this.worker.stdin?.end();
      } catch {
        // ignore
      }
      const w = this.worker;
      this.worker = null;
      setTimeout(() => {
        if (!w.killed) {
          try {
            w.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }, 300);
    }
  }
}

interface LinuxTerminalSession {
  id: string;
  hostname: string;
  baseUser: LinuxUserAccount;
  shellStack: PersistentPtyShell[];
  sudoAuthExpiresAt: number;
  pendingSudo: PendingSudoRequest | null;
  activeOneShotRootChild: ChildProcess | null;
  createdAt: number;
  lastUsedAt: number;
}

const terminalSessions = new Map<string, LinuxTerminalSession>();

function getActiveShell(session: LinuxTerminalSession): PersistentPtyShell {
  return session.shellStack[session.shellStack.length - 1];
}

function getSessionStateSnapshot(session: LinuxTerminalSession) {
  const shell = getActiveShell(session);
  const privilegeMode: 'user' | 'root' = shell.uid === 0 ? 'root' : 'user';
  return {
    sessionId: session.id,
    user: shell.user,
    uid: shell.uid,
    gid: shell.gid,
    privilegeMode,
    hostname: session.hostname,
    homeDir: shell.homeDir,
    cwd: shell.cwd,
    shell: TERMINAL_SHELL_PATH,
    tty: shell.tty,
    shellDepth: session.shellStack.length,
    osInfo: `${os.type()} ${os.release()} ${os.arch()} (Debian GNU/Linux)`,
  };
}

async function createLinuxTerminalSession(requestedCwd?: string): Promise<LinuxTerminalSession> {
  const jarvisUser = ensureJarvisLinuxUser();
  // Always start every new terminal session as non-root Linux user `jarvis` (never root!)
  const userShell = new PersistentPtyShell('user', jarvisUser, jarvisUser.homeDir, false);
  await userShell.start();

  // Optional initial directory (used by Split Vertically / Duplicate Session):
  // Executed strictly inside the already privilege-dropped `jarvis` PTY so Linux kernel
  // enforces permissions natively (e.g. `/root` is denied and safely stays in `/home/jarvis`).
  if (
    requestedCwd &&
    typeof requestedCwd === 'string' &&
    requestedCwd.startsWith('/') &&
    requestedCwd.length < 1024 &&
    !requestedCwd.includes('\0') &&
    requestedCwd !== jarvisUser.homeDir
  ) {
    const safeQuoted = `'${requestedCwd.replace(/'/g, "'\\''")}'`;
    try {
      await userShell.exec(`cd -- ${safeQuoted} 2>/dev/null || true`, () => {});
    } catch {
      // Fall back silently to jarvis homeDir
    }
  }

  const id = crypto.randomBytes(12).toString('hex');
  const session: LinuxTerminalSession = {
    id,
    hostname: TERMINAL_HOSTNAME,
    baseUser: jarvisUser,
    shellStack: [userShell],
    sudoAuthExpiresAt: 0,
    pendingSudo: null,
    activeOneShotRootChild: null,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
  terminalSessions.set(id, session);

  // Clean up stale idle sessions (> 45 min)
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [sid, sess] of terminalSessions.entries()) {
    const top = getActiveShell(sess);
    if (sid !== id && !top.isBusy() && !sess.activeOneShotRootChild && sess.lastUsedAt < cutoff) {
      for (const sh of sess.shellStack) sh.close();
      terminalSessions.delete(sid);
    }
  }
  return session;
}

function killProcessGroup(child: ChildProcess | null, signal: NodeJS.Signals) {
  if (!child || child.killed) return;
  try {
    if (typeof child.pid === 'number' && child.pid > 0) {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fallback
  }
  try {
    child.kill(signal);
  } catch {
    // ignore
  }
}

function isDangerousCommand(command: string): string | null {
  const normalized = command.replace(/\s+/g, ' ').trim();
  if (/(^|[;&|]\s*)rm\s+[^#\n]*\s+-rf?\s+\/(\s|$|[;&|])/i.test(normalized)) {
    return 'Permission denied: refusing to recursively delete root filesystem (/).';
  }
  if (/(^|[;&|]\s*)rm\s+-[a-z]*r[a-z]*f[a-z]*\s+\/(\s|$|[;&|])/i.test(normalized)) {
    return 'Permission denied: refusing to recursively delete root filesystem (/).';
  }
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(normalized)) {
    return 'Blocked: fork bomb pattern rejected by kernel safety guard.';
  }
  if (/(^|[;&|]\s*)(shutdown|reboot|poweroff|halt|init\s+[06])(\s|$)/i.test(normalized)) {
    return 'Operation not permitted inside isolated cloud sandbox.';
  }
  if (/(^|[;&|]\s*)kill\s+(-9\s+)?-?1(\s|$)/i.test(normalized)) {
    return 'Operation not permitted: cannot signal PID 1.';
  }
  return null;
}

async function runOneShotSudoCommand(
  session: LinuxTerminalSession,
  command: string,
  sendEvent: (payload: Record<string, unknown>) => void,
  res: express.Response
): Promise<void> {
  const startedAt = Date.now();
  const userShell = getActiveShell(session);
  const safeCwd = fs.existsSync(userShell.cwd) ? userShell.cwd : session.baseUser.homeDir;
  const rootAccount: LinuxUserAccount = {
    username: 'root',
    uid: 0,
    gid: 0,
    homeDir: '/root',
    shell: TERMINAL_SHELL_PATH,
  };

  const child = spawn(TERMINAL_SHELL_PATH, ['-c', command], {
    cwd: safeCwd,
    detached: true,
    uid: 0,
    gid: 0,
    env: buildCleanLinuxEnv(rootAccount, {
      PWD: safeCwd,
      SUDO_USER: session.baseUser.username,
      SUDO_UID: String(session.baseUser.uid),
      SUDO_GID: String(session.baseUser.gid),
      SUDO_COMMAND: command,
      DEBIAN_FRONTEND: 'noninteractive',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  session.activeOneShotRootChild = child;

  let outputBytes = 0;
  let outputTruncated = false;
  let timedOut = false;

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    sendEvent({
      type: 'stderr',
      data: `\n[Command timed out after ${TERMINAL_EXEC_TIMEOUT_MS / 1000}s]\n`,
    });
    killProcessGroup(child, 'SIGKILL');
  }, TERMINAL_EXEC_TIMEOUT_MS);

  const forward = (streamType: 'stdout' | 'stderr', chunk: Buffer) => {
    if (outputTruncated) return;
    if (outputBytes + chunk.length > TERMINAL_MAX_OUTPUT_BYTES) {
      const rem = Math.max(0, TERMINAL_MAX_OUTPUT_BYTES - outputBytes);
      if (rem > 0) sendEvent({ type: streamType, data: chunk.subarray(0, rem).toString('utf8') });
      outputBytes = TERMINAL_MAX_OUTPUT_BYTES;
      outputTruncated = true;
      sendEvent({ type: 'stderr', data: '\n[Output truncated at 256 KB limit]\n' });
      return;
    }
    outputBytes += chunk.length;
    sendEvent({ type: streamType, data: chunk.toString('utf8') });
  };

  child.stdout?.on('data', (c: Buffer) => forward('stdout', c));
  child.stderr?.on('data', (c: Buffer) => forward('stderr', c));

  res.on('close', () => {
    if (!res.writableEnded) {
      killProcessGroup(child, 'SIGINT');
    }
  });

  await new Promise<void>(resolve => {
    child.on('error', err => {
      clearTimeout(timeoutHandle);
      if (session.activeOneShotRootChild === child) session.activeOneShotRootChild = null;
      sendEvent({ type: 'stderr', data: `sudo: ${err.message}\n` });
      sendEvent({
        type: 'done',
        exitCode: 127,
        durationMs: Date.now() - startedAt,
        ...getSessionStateSnapshot(session),
      });
      resolve();
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      if (session.activeOneShotRootChild === child) session.activeOneShotRootChild = null;
      if (signal === 'SIGINT') sendEvent({ type: 'stderr', data: '^C\n' });
      const exitCode =
        typeof code === 'number' ? code : signal === 'SIGINT' ? 130 : timedOut ? 124 : 1;
      // Session remains in USER MODE after single-command sudo completes
      sendEvent({
        type: 'done',
        exitCode,
        durationMs: Date.now() - startedAt,
        ...getSessionStateSnapshot(session),
      });
      resolve();
    });
  });
}

async function executeAuthorizedSudoAction(
  session: LinuxTerminalSession,
  action: PendingSudoRequest['action'],
  sendEvent: (payload: Record<string, unknown>) => void,
  res: express.Response
): Promise<void> {
  const startedAt = Date.now();

  if (action.kind === 'sudo-validate') {
    sendEvent({
      type: 'done',
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return;
  }

  if (action.kind === 'sudo-list') {
    sendEvent({
      type: 'stdout',
      data: [
        `Matching Defaults entries for ${session.baseUser.username} on ${session.hostname}:`,
        '    env_reset, timestamp_timeout=5, isolated_cloud_sandbox',
        '',
        `User ${session.baseUser.username} may run the following commands on ${session.hostname}:`,
        '    (ALL : ALL) ALL',
        '',
      ].join('\n'),
    });
    sendEvent({
      type: 'done',
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return;
  }

  if (action.kind === 'sudo-root-shell') {
    const currentTop = getActiveShell(session);
    const rootAccount: LinuxUserAccount = {
      username: 'root',
      uid: 0,
      gid: 0,
      homeDir: '/root',
      shell: TERMINAL_SHELL_PATH,
    };
    const rootStartCwd = action.loginShell
      ? '/root'
      : fs.existsSync(currentTop.cwd)
        ? currentTop.cwd
        : '/root';

    try {
      const rootShell = new PersistentPtyShell('root', rootAccount, rootStartCwd, action.loginShell, {
        SUDO_USER: session.baseUser.username,
        SUDO_UID: String(session.baseUser.uid),
        SUDO_GID: String(session.baseUser.gid),
        DEBIAN_FRONTEND: 'noninteractive',
      });
      await rootShell.start();
      session.shellStack.push(rootShell);

      sendEvent({
        type: 'done',
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        ...getSessionStateSnapshot(session),
      });
    } catch (err: any) {
      sendEvent({
        type: 'stderr',
        data: `sudo: failed to start root login shell: ${err?.message || 'unknown error'}\n`,
      });
      sendEvent({
        type: 'done',
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        ...getSessionStateSnapshot(session),
      });
    }
    return;
  }

  // Single elevated command (`sudo <command>`)
  const danger = isDangerousCommand(action.command);
  if (danger) {
    sendEvent({ type: 'stderr', data: `sudo: ${danger}\n` });
    sendEvent({
      type: 'done',
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return;
  }

  await runOneShotSudoCommand(session, action.command, sendEvent, res);
}

app.post('/api/terminal/session', async (req, res) => {
  try {
    const initialCwd = typeof req.body?.initialCwd === 'string' ? req.body.initialCwd.trim() : undefined;
    const session = await createLinuxTerminalSession(initialCwd);
    return res.json(getSessionStateSnapshot(session));
  } catch (err: any) {
    console.error('Failed to initialize Linux PTY session:', err);
    return res.status(500).json({
      error: err?.message || 'Failed to start non-root Linux terminal session.',
    });
  }
});

app.post('/api/terminal/kill', (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  const session = terminalSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Terminal session not found.' });
  }

  if (session.pendingSudo) {
    session.pendingSudo = null;
    return res.json({ killed: true });
  }

  if (session.activeOneShotRootChild && !session.activeOneShotRootChild.killed) {
    const target = session.activeOneShotRootChild;
    killProcessGroup(target, 'SIGINT');
    setTimeout(() => {
      if (session.activeOneShotRootChild === target && !target.killed) {
        killProcessGroup(target, 'SIGKILL');
      }
    }, 450);
    return res.json({ killed: true });
  }

  const topShell = getActiveShell(session);
  if (topShell.isBusy()) {
    const sent = topShell.sigint();
    return res.json({ killed: sent });
  }

  return res.json({ killed: false });
});

app.delete('/api/terminal/session/:id', (req, res) => {
  const session = terminalSessions.get(req.params.id);
  if (session) {
    killProcessGroup(session.activeOneShotRootChild, 'SIGKILL');
    for (const sh of session.shellStack) sh.close();
    terminalSessions.delete(req.params.id);
  }
  return res.json({ closed: true });
});

app.post('/api/terminal/complete', async (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  const line = typeof req.body?.line === 'string' ? req.body.line : '';
  const session = terminalSessions.get(sessionId);
  if (!session) {
    return res.json({ token: '', matches: [] });
  }
  session.lastUsedAt = Date.now();
  const activeShell = getActiveShell(session);

  const match = line.match(/(?:^|\s)([^\s]*)$/);
  const token = match ? match[1] : '';
  const isFirstToken = line.trimStart().indexOf(' ') === -1 && !line.endsWith(' ');
  const matches = new Set<string>();

  const completePaths = (rawToken: string) => {
    try {
      const expanded = rawToken.startsWith('~/')
        ? path.join(activeShell.homeDir, rawToken.slice(2))
        : rawToken === '~'
          ? activeShell.homeDir
          : rawToken;
      const hasSlash = rawToken.includes('/');
      const dirPart = hasSlash ? rawToken.slice(0, rawToken.lastIndexOf('/') + 1) : '';
      const basePrefix = hasSlash ? rawToken.slice(rawToken.lastIndexOf('/') + 1) : rawToken;
      const targetDir = hasSlash
        ? path.resolve(activeShell.cwd, expanded.slice(0, expanded.lastIndexOf('/') + 1) || '/')
        : activeShell.cwd;

      // Enforce real Linux permission boundaries on tab completion (e.g. USER MODE cannot enumerate /root)
      if (activeShell.uid !== 0) {
        const stat = fs.statSync(targetDir);
        const ownerOk = stat.uid === activeShell.uid && (stat.mode & 0o500) === 0o500;
        const groupOk = stat.gid === activeShell.gid && (stat.mode & 0o050) === 0o050;
        const otherOk = (stat.mode & 0o005) === 0o005;
        if (!ownerOk && !groupOk && !otherOk) {
          return;
        }
      }

      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!basePrefix && entry.name.startsWith('.')) continue;
        if (entry.name.startsWith(basePrefix)) {
          const suffix = entry.isDirectory() ? '/' : '';
          matches.add(`${dirPart}${entry.name}${suffix}`);
        }
        if (matches.size >= 40) break;
      }
    } catch {
      // Ignore unreadable directories
    }
  };

  if (isFirstToken && !token.includes('/') && !token.startsWith('.')) {
    const builtins = [
      'sudo', 'id', 'whoami', 'cd', 'pwd', 'ls', 'll', 'la', 'clear', 'echo',
      'export', 'unset', 'env', 'cat', 'mkdir', 'rm', 'cp', 'mv', 'touch',
      'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq', 'sed', 'awk',
      'chmod', 'ps', 'df', 'free', 'uname', 'date', 'uptime', 'history',
      'exit', 'logout', 'reset', 'help', 'apt', 'apt-get', 'dpkg', 'tty',
      'open', 'play', 'jarvis', 'apps', 'build-iso',
    ];
    for (const cmd of builtins) {
      if (cmd.startsWith(token)) matches.add(cmd);
    }

    const pathDirs =
      activeShell.uid === 0
        ? ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin']
        : ['/usr/local/bin', '/usr/bin', '/bin'];
    for (const dir of pathDirs) {
      if (matches.size >= 40) break;
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (f.startsWith(token)) {
            matches.add(f);
            if (matches.size >= 40) break;
          }
        }
      } catch {
        // Ignore missing PATH dirs
      }
    }
  } else {
    completePaths(token);
  }

  return res.json({
    token,
    matches: Array.from(matches).sort().slice(0, 40),
  });
});

app.post('/api/terminal/sudo-auth', async (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const cancel = Boolean(req.body?.cancel);

  const session = terminalSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Terminal session not found.' });
  }
  session.lastUsedAt = Date.now();

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (payload: Record<string, unknown>) => {
    if (!res.writableEnded) {
      res.write(`${JSON.stringify(payload)}\n`);
    }
  };

  if (cancel || !session.pendingSudo) {
    session.pendingSudo = null;
    if (cancel) sendEvent({ type: 'stderr', data: '^C\n' });
    sendEvent({
      type: 'done',
      exitCode: cancel ? 130 : 1,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  const pending = session.pendingSudo;
  const auth = verifyLinuxSudoCredentials(session.baseUser.username, password);

  if (!auth.authorized) {
    session.pendingSudo = null;
    sendEvent({
      type: 'stderr',
      data: `${session.baseUser.username} is not in the sudoers file.  This incident will be reported.\n`,
    });
    sendEvent({
      type: 'done',
      exitCode: 1,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  if (!auth.authenticated) {
    pending.attempts += 1;
    if (pending.attempts >= 3) {
      session.pendingSudo = null;
      sendEvent({
        type: 'stderr',
        data: 'Sorry, try again.\nsudo: 3 incorrect password attempts\n',
      });
      sendEvent({
        type: 'done',
        exitCode: 1,
        ...getSessionStateSnapshot(session),
      });
      return res.end();
    }

    sendEvent({ type: 'stderr', data: 'Sorry, try again.\n' });
    sendEvent({
      type: 'sudo_auth_required',
      prompt: `[sudo] password for ${session.baseUser.username}: `,
      username: session.baseUser.username,
      attempt: pending.attempts + 1,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  // Authentication and authorization succeeded! Cache sudo timestamp and execute pending action
  session.sudoAuthExpiresAt = Date.now() + SUDO_AUTH_CACHE_MS;
  session.pendingSudo = null;

  await executeAuthorizedSudoAction(session, pending.action, sendEvent, res);
  if (!res.writableEnded) res.end();
});

app.post('/api/terminal/exec', async (req, res) => {
  const rawSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  const command = typeof req.body?.command === 'string' ? req.body.command : '';

  let session = terminalSessions.get(rawSessionId);
  if (!session) {
    try {
      session = await createLinuxTerminalSession();
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to start terminal session.' });
    }
  }
  session.lastUsedAt = Date.now();

  const topShell = getActiveShell(session);
  if (topShell.isBusy() || (session.activeOneShotRootChild && !session.activeOneShotRootChild.killed)) {
    return res.status(409).json({
      error: 'Another command is still running in this tab. Press Ctrl+C to stop it.',
    });
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (payload: Record<string, unknown>) => {
    if (!res.writableEnded) {
      res.write(`${JSON.stringify(payload)}\n`);
    }
  };

  const startedAt = Date.now();
  const privAction = parsePrivilegeCommand(command);

  // 1. Handle `exit` / `logout`
  if (privAction.kind === 'exit-shell') {
    if (session.shellStack.length > 1) {
      // Leave genuine root login shell and return to the non-root `jarvis` shell
      const rootShell = session.shellStack.pop();
      rootShell?.close();
      const restored = getActiveShell(session);

      // Re-verify real kernel UID of the restored user shell
      if (restored.alive) {
        try {
          await restored.exec(':', () => {});
        } catch {
          // ignore
        }
      }

      sendEvent({ type: 'stdout', data: 'logout\n' });
      sendEvent({
        type: 'done',
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        ...getSessionStateSnapshot(session),
      });
      return res.end();
    }

    // Already at base non-root user shell -> signal frontend to close this shell tab
    sendEvent({ type: 'stdout', data: 'exit\n' });
    sendEvent({
      type: 'done',
      exitCode: 0,
      closeTab: true,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  // 2. Handle `sudo` commands
  if (privAction.kind === 'sudo-help') {
    sendEvent({
      type: 'stdout',
      data: [
        'usage: sudo -h | -k | -l | -v',
        'usage: sudo [-i | -s] [command]',
        '',
        'Options:',
        '  -i, --login        run a genuine root login shell (ROOT MODE, UID 0)',
        '  -s, --shell        run an interactive root shell in current directory',
        '  -k                 invalidate cached sudo authentication timestamp',
        '  -l                 list user privileges',
        '  -v                 validate/refresh sudo authentication',
        '  exit               leave ROOT MODE and return to non-root USER MODE',
        '',
      ].join('\n'),
    });
    sendEvent({
      type: 'done',
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  if (privAction.kind === 'sudo-usage-error') {
    sendEvent({ type: 'stderr', data: `${privAction.message}\n` });
    sendEvent({
      type: 'done',
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  if (privAction.kind === 'sudo-invalidate') {
    session.sudoAuthExpiresAt = 0;
    session.pendingSudo = null;
    sendEvent({
      type: 'done',
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  if (
    privAction.kind === 'sudo-root-shell' ||
    privAction.kind === 'sudo-command' ||
    privAction.kind === 'sudo-validate' ||
    privAction.kind === 'sudo-list'
  ) {
    // Already in ROOT MODE (verified kernel UID === 0): execute without re-prompting
    if (topShell.uid === 0) {
      await executeAuthorizedSudoAction(session, privAction, sendEvent, res);
      return res.end();
    }

    // Verify user belongs to `sudo` group in /etc/group first
    if (!isUserAuthorizedForSudo(session.baseUser.username)) {
      sendEvent({
        type: 'stderr',
        data: `${session.baseUser.username} is not in the sudoers file.  This incident will be reported.\n`,
      });
      sendEvent({
        type: 'done',
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        ...getSessionStateSnapshot(session),
      });
      return res.end();
    }

    const isCached = session.sudoAuthExpiresAt > Date.now();
    if (!isCached) {
      if ('nonInteractive' in privAction && privAction.nonInteractive) {
        sendEvent({ type: 'stderr', data: 'sudo: a password is required\n' });
        sendEvent({
          type: 'done',
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          ...getSessionStateSnapshot(session),
        });
        return res.end();
      }

      session.pendingSudo = {
        action: privAction,
        attempts: 0,
      };
      sendEvent({
        type: 'sudo_auth_required',
        prompt: `[sudo] password for ${session.baseUser.username}: `,
        username: session.baseUser.username,
        attempt: 1,
        ...getSessionStateSnapshot(session),
      });
      return res.end();
    }

    await executeAuthorizedSudoAction(session, privAction, sendEvent, res);
    return res.end();
  }

  // 3. Normal command execution inside the active persistent PTY bash shell
  const dangerReason = isDangerousCommand(command);
  if (dangerReason) {
    sendEvent({ type: 'stderr', data: `bash: ${dangerReason}\n` });
    sendEvent({
      type: 'done',
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
    return res.end();
  }

  // Ensure the active shell is alive (respawn non-root shell if needed)
  if (!topShell.alive) {
    if (session.shellStack.length > 1) {
      session.shellStack.pop();
    } else {
      const replacement = new PersistentPtyShell('user', session.baseUser, session.baseUser.homeDir, false);
      await replacement.start();
      session.shellStack[0] = replacement;
    }
  }

  const execShell = getActiveShell(session);

  res.on('close', () => {
    if (!res.writableEnded && execShell.isBusy()) {
      execShell.sigint();
    }
  });

  try {
    const result = await execShell.exec(command, chunk => {
      sendEvent({ type: 'stdout', data: chunk });
    });

    // If a root shell exited naturally (e.g. `exec false` or EOF), pop back to USER MODE
    if (result.shellExited && session.shellStack.length > 1) {
      session.shellStack.pop();
      sendEvent({ type: 'stdout', data: 'logout\n' });
    }

    sendEvent({
      type: 'done',
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
  } catch (err: any) {
    sendEvent({ type: 'stderr', data: `bash: ${err?.message || 'execution error'}\n` });
    sendEvent({
      type: 'done',
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      ...getSessionStateSnapshot(session),
    });
  }

  if (!res.writableEnded) res.end();
});

// Setup Vite middlewares in development or static serve in production
async function startServer() {
  try {
    const jarvisUser = ensureJarvisLinuxUser();
    console.log(
      `Linux sandbox user ready: ${jarvisUser.username} (uid=${jarvisUser.uid}, gid=${jarvisUser.gid}, home=${jarvisUser.homeDir})`
    );
  } catch (err) {
    console.warn('Linux user bootstrap deferred:', err);
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JARVISOS Core Server online at http://0.0.0.0:${PORT}`);
  });
}

startServer();
