import type {
  AppId,
  AppShortcut,
  LaunchActionMetadata,
  WebPortalPayload,
} from '../types/os.ts';

export const CUSTOM_APPS_STORAGE_KEY = 'jarvisos_custom_apps_v1';

const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:']);

const ALLOWED_SHORT_SCHEMES = new Set([
  'spotify:',
  'mailto:',
  'tel:',
  'vscode:',
  'discord:',
  'slack:',
  'obsidian:',
  'steam:',
  'zoommtg:',
  'notion:',
  'whatsapp:',
  'tg:',
  'figma:',
  'linear:',
  'cursor:',
  'postman:',
]);

// Known domains that block direct homepage iframe embedding via X-Frame-Options / CSP frame-ancestors
const KNOWN_EMBED_RESTRICTED_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'google.com',
  'mail.google.com',
  'drive.google.com',
  'calendar.google.com',
  'docs.google.com',
  'maps.google.com',
  'github.com',
  'instagram.com',
  'reddit.com',
  'open.spotify.com',
  'netflix.com',
  'web.whatsapp.com',
  'linkedin.com',
  'amazon.com',
  'twitch.tv',
  'discord.com',
  'app.slack.com',
  'notion.so',
  'figma.com',
  'stackoverflow.com',
  'chatgpt.com',
  'claude.ai',
  'perplexity.ai',
  'facebook.com',
  'tiktok.com',
  'pinterest.com',
  'web.telegram.org',
  'soundcloud.com',
  'vercel.com',
  'linear.app',
]);

export const BUILTIN_SYSTEM_APPS: AppShortcut[] = [
  {
    id: 'sys-voice',
    name: 'JARVIS Arc Core',
    aliases: ['arc core', 'jarvis', 'voice', 'voice reactor', 'assistant', 'chat'],
    category: 'system',
    systemAppId: 'voice_reactor',
  },
  {
    id: 'sys-terminal',
    name: 'Aegis Terminal',
    aliases: ['terminal', 'aegis-sh', 'aegis shell', 'aegis terminal', 'shell', 'console', 'cli', 'cmd', 'command prompt'],
    category: 'system',
    systemAppId: 'terminal',
  },
  {
    id: 'sys-novafs',
    name: 'NovaFS Storage',
    aliases: ['novafs', 'nova fs', 'files', 'file manager', 'storage', 'explorer', 'finder'],
    category: 'system',
    systemAppId: 'novafs',
  },
  {
    id: 'sys-kernel',
    name: 'Kernel Monitor',
    aliases: ['kernel monitor', 'kernel', 'cpu', 'eas', 'scheduler', 'system monitor', 'task manager', 'telemetry', 'activity monitor', 'monitor'],
    category: 'system',
    systemAppId: 'kernel_monitor',
  },
  {
    id: 'sys-synapse',
    name: 'Synapse Neural',
    aliases: ['synapse', 'synapse neural', 'neural', 'npu', 'ai models', 'slm'],
    category: 'system',
    systemAppId: 'synapse_neural',
  },
  {
    id: 'sys-vision',
    name: 'Vision HUD',
    aliases: ['vision hud', 'vision', 'camera', 'spatial hud', 'vision grounding'],
    category: 'system',
    systemAppId: 'vision_hud',
  },
  {
    id: 'sys-vault',
    name: 'VaultOS Enclave',
    aliases: ['vault', 'vaultos', 'vault security', 'security', 'enclave', 'keys'],
    category: 'system',
    systemAppId: 'vault_security',
  },
  {
    id: 'sys-iso',
    name: 'ISO Builder',
    aliases: ['iso builder', 'iso', 'bootable iso', 'linux image', 'lenovo iso', 'lenovo'],
    category: 'system',
    systemAppId: 'iso_builder',
  },
  {
    id: 'sys-specs',
    name: 'Engineering Specs',
    aliases: ['specs', 'specifications', 'engineering specs', 'blueprint', 'architecture', 'jarvis docs'],
    category: 'system',
    systemAppId: 'specs_reader',
  },
  {
    id: 'sys-network',
    name: 'Network Settings',
    aliases: ['wifi', 'wi-fi', 'network', 'network settings', 'wifi settings', 'internet'],
    category: 'system',
    systemAppId: 'network_settings',
  },
  {
    id: 'sys-browser',
    name: 'JARVIS Browser',
    aliases: ['browser', 'chrome', 'google chrome', 'web browser', 'jarvis browser', 'internet browser'],
    category: 'system',
    systemAppId: 'browser',
  },
  {
    id: 'sys-browser-private',
    name: 'Private Browser',
    aliases: ['private window', 'private browser', 'incognito', 'incognito window', 'incognito browser', 'new private window'],
    category: 'system',
    systemAppId: 'browser_private',
  },
  {
    id: 'sys-settings',
    name: 'System Settings',
    aliases: ['settings', 'system settings', 'preferences', 'control panel'],
    category: 'system',
    systemAppId: 'system_settings',
  },
  {
    id: 'sys-notifications',
    name: 'Notification Manager',
    aliases: ['notifications', 'notification manager', 'notification center', 'alerts'],
    category: 'system',
    systemAppId: 'notification_center',
  },
];

export const BUILTIN_DESKTOP_APPS: AppShortcut[] = [
  {
    id: 'desk-vscode',
    name: 'VS Code',
    aliases: ['vscode', 'vs code', 'visual studio code', 'code'],
    category: 'desktop',
    url: 'vscode://',
    webFallbackUrl: 'https://vscode.dev',
  },
  {
    id: 'desk-spotify',
    name: 'Spotify Desktop',
    aliases: ['spotify desktop', 'spotify app'],
    category: 'desktop',
    url: 'spotify:',
    searchUrlTemplate: 'spotify:search:{query}',
    webFallbackUrl: 'https://open.spotify.com',
  },
  {
    id: 'desk-discord',
    name: 'Discord Desktop',
    aliases: ['discord desktop', 'discord app'],
    category: 'desktop',
    url: 'discord://',
    webFallbackUrl: 'https://discord.com/app',
  },
  {
    id: 'desk-slack',
    name: 'Slack Desktop',
    aliases: ['slack desktop', 'slack app'],
    category: 'desktop',
    url: 'slack://open',
    webFallbackUrl: 'https://app.slack.com',
  },
  {
    id: 'desk-obsidian',
    name: 'Obsidian',
    aliases: ['obsidian', 'obsidian app', 'obsidian desktop'],
    category: 'desktop',
    url: 'obsidian://open',
  },
  {
    id: 'desk-notion',
    name: 'Notion Desktop',
    aliases: ['notion desktop', 'notion app'],
    category: 'desktop',
    url: 'notion://',
    webFallbackUrl: 'https://www.notion.so',
  },
  {
    id: 'desk-steam',
    name: 'Steam',
    aliases: ['steam', 'steam app', 'steam desktop'],
    category: 'desktop',
    url: 'steam://open/main',
    webFallbackUrl: 'https://store.steampowered.com',
  },
  {
    id: 'desk-zoom',
    name: 'Zoom',
    aliases: ['zoom', 'zoom app', 'zoom desktop'],
    category: 'desktop',
    url: 'zoommtg://zoom.us',
    webFallbackUrl: 'https://zoom.us',
  },
  {
    id: 'desk-telegram',
    name: 'Telegram Desktop',
    aliases: ['telegram desktop', 'telegram app'],
    category: 'desktop',
    url: 'tg://',
    webFallbackUrl: 'https://web.telegram.org',
  },
  {
    id: 'desk-whatsapp',
    name: 'WhatsApp Desktop',
    aliases: ['whatsapp desktop', 'whatsapp app'],
    category: 'desktop',
    url: 'whatsapp://',
    webFallbackUrl: 'https://web.whatsapp.com',
  },
  {
    id: 'desk-mail',
    name: 'Mail App',
    aliases: ['mail', 'mail app', 'default mail'],
    category: 'desktop',
    url: 'mailto:',
  },
];

export const BUILTIN_WEB_APPS: AppShortcut[] = [
  {
    id: 'web-youtube',
    name: 'YouTube',
    aliases: ['youtube', 'yt', 'you tube', 'youtube music'],
    category: 'web',
    url: 'https://www.youtube.com',
    searchUrlTemplate: 'https://www.youtube.com/results?search_query={query}',
    embedRestricted: false,
  },
  {
    id: 'web-twitter',
    name: 'X (Twitter)',
    aliases: ['twitter', 'twiter', 'x', 'x.com', 'tweet'],
    category: 'web',
    url: 'https://x.com',
    searchUrlTemplate: 'https://x.com/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-google',
    name: 'Google',
    aliases: ['google', 'google search'],
    category: 'web',
    url: 'https://www.google.com',
    searchUrlTemplate: 'https://www.google.com/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-gmail',
    name: 'Gmail',
    aliases: ['gmail', 'google mail', 'email'],
    category: 'web',
    url: 'https://mail.google.com',
    searchUrlTemplate: 'https://mail.google.com/mail/u/0/#search/{query}',
    embedRestricted: true,
  },
  {
    id: 'web-github',
    name: 'GitHub',
    aliases: ['github', 'gh'],
    category: 'web',
    url: 'https://github.com',
    searchUrlTemplate: 'https://github.com/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-instagram',
    name: 'Instagram',
    aliases: ['instagram', 'insta', 'ig'],
    category: 'web',
    url: 'https://www.instagram.com',
    embedRestricted: true,
  },
  {
    id: 'web-reddit',
    name: 'Reddit',
    aliases: ['reddit'],
    category: 'web',
    url: 'https://www.reddit.com',
    searchUrlTemplate: 'https://www.reddit.com/search/?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-spotify',
    name: 'Spotify',
    aliases: ['spotify', 'spotify web'],
    category: 'web',
    url: 'https://open.spotify.com',
    searchUrlTemplate: 'https://open.spotify.com/search/{query}',
    embedRestricted: true,
  },
  {
    id: 'web-netflix',
    name: 'Netflix',
    aliases: ['netflix'],
    category: 'web',
    url: 'https://www.netflix.com',
    searchUrlTemplate: 'https://www.netflix.com/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-whatsapp',
    name: 'WhatsApp Web',
    aliases: ['whatsapp', 'whatsapp web', 'whats app'],
    category: 'web',
    url: 'https://web.whatsapp.com',
    embedRestricted: true,
  },
  {
    id: 'web-linkedin',
    name: 'LinkedIn',
    aliases: ['linkedin', 'linked in'],
    category: 'web',
    url: 'https://www.linkedin.com',
    searchUrlTemplate: 'https://www.linkedin.com/search/results/all/?keywords={query}',
    embedRestricted: true,
  },
  {
    id: 'web-wikipedia',
    name: 'Wikipedia',
    aliases: ['wikipedia', 'wiki'],
    category: 'web',
    url: 'https://en.wikipedia.org',
    searchUrlTemplate: 'https://en.wikipedia.org/wiki/Special:Search?search={query}',
    embedRestricted: false,
  },
  {
    id: 'web-amazon',
    name: 'Amazon',
    aliases: ['amazon'],
    category: 'web',
    url: 'https://www.amazon.com',
    searchUrlTemplate: 'https://www.amazon.com/s?k={query}',
    embedRestricted: true,
  },
  {
    id: 'web-maps',
    name: 'Google Maps',
    aliases: ['google maps', 'maps'],
    category: 'web',
    url: 'https://maps.google.com',
    searchUrlTemplate: 'https://www.google.com/maps/search/{query}',
    embedRestricted: true,
  },
  {
    id: 'web-drive',
    name: 'Google Drive',
    aliases: ['google drive', 'drive'],
    category: 'web',
    url: 'https://drive.google.com',
    searchUrlTemplate: 'https://drive.google.com/drive/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-calendar',
    name: 'Google Calendar',
    aliases: ['google calendar', 'calendar'],
    category: 'web',
    url: 'https://calendar.google.com',
    embedRestricted: true,
  },
  {
    id: 'web-docs',
    name: 'Google Docs',
    aliases: ['google docs', 'docs'],
    category: 'web',
    url: 'https://docs.google.com',
    embedRestricted: true,
  },
  {
    id: 'web-twitch',
    name: 'Twitch',
    aliases: ['twitch'],
    category: 'web',
    url: 'https://www.twitch.tv',
    searchUrlTemplate: 'https://www.twitch.tv/search?term={query}',
    embedRestricted: true,
  },
  {
    id: 'web-discord',
    name: 'Discord',
    aliases: ['discord', 'discord web'],
    category: 'web',
    url: 'https://discord.com/app',
    embedRestricted: true,
  },
  {
    id: 'web-slack',
    name: 'Slack',
    aliases: ['slack', 'slack web'],
    category: 'web',
    url: 'https://app.slack.com',
    embedRestricted: true,
  },
  {
    id: 'web-notion',
    name: 'Notion',
    aliases: ['notion', 'notion web'],
    category: 'web',
    url: 'https://www.notion.so',
    embedRestricted: true,
  },
  {
    id: 'web-figma',
    name: 'Figma',
    aliases: ['figma'],
    category: 'web',
    url: 'https://www.figma.com',
    embedRestricted: true,
  },
  {
    id: 'web-stackoverflow',
    name: 'Stack Overflow',
    aliases: ['stackoverflow', 'stack overflow'],
    category: 'web',
    url: 'https://stackoverflow.com',
    searchUrlTemplate: 'https://stackoverflow.com/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-chatgpt',
    name: 'ChatGPT',
    aliases: ['chatgpt', 'chat gpt'],
    category: 'web',
    url: 'https://chatgpt.com',
    embedRestricted: true,
  },
  {
    id: 'web-claude',
    name: 'Claude',
    aliases: ['claude'],
    category: 'web',
    url: 'https://claude.ai',
    embedRestricted: true,
  },
  {
    id: 'web-perplexity',
    name: 'Perplexity',
    aliases: ['perplexity'],
    category: 'web',
    url: 'https://www.perplexity.ai',
    searchUrlTemplate: 'https://www.perplexity.ai/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-facebook',
    name: 'Facebook',
    aliases: ['facebook', 'fb'],
    category: 'web',
    url: 'https://www.facebook.com',
    searchUrlTemplate: 'https://www.facebook.com/search/top/?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-tiktok',
    name: 'TikTok',
    aliases: ['tiktok', 'tik tok'],
    category: 'web',
    url: 'https://www.tiktok.com',
    searchUrlTemplate: 'https://www.tiktok.com/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-pinterest',
    name: 'Pinterest',
    aliases: ['pinterest'],
    category: 'web',
    url: 'https://www.pinterest.com',
    searchUrlTemplate: 'https://www.pinterest.com/search/pins/?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-telegram',
    name: 'Telegram Web',
    aliases: ['telegram', 'telegram web'],
    category: 'web',
    url: 'https://web.telegram.org',
    embedRestricted: true,
  },
  {
    id: 'web-soundcloud',
    name: 'SoundCloud',
    aliases: ['soundcloud', 'sound cloud'],
    category: 'web',
    url: 'https://soundcloud.com',
    searchUrlTemplate: 'https://soundcloud.com/search?q={query}',
    embedRestricted: true,
  },
  {
    id: 'web-hn',
    name: 'Hacker News',
    aliases: ['hacker news', 'hn'],
    category: 'web',
    url: 'https://news.ycombinator.com',
    embedRestricted: false,
  },
  {
    id: 'web-vercel',
    name: 'Vercel',
    aliases: ['vercel'],
    category: 'web',
    url: 'https://vercel.com',
    embedRestricted: true,
  },
  {
    id: 'web-linear',
    name: 'Linear',
    aliases: ['linear'],
    category: 'web',
    url: 'https://linear.app',
    embedRestricted: true,
  },
  {
    id: 'web-codepen',
    name: 'CodePen',
    aliases: ['codepen', 'code pen'],
    category: 'web',
    url: 'https://codepen.io',
    embedRestricted: false,
  },
];

export function getAllShortcuts(customApps: AppShortcut[] = []): AppShortcut[] {
  return [...customApps, ...BUILTIN_SYSTEM_APPS, ...BUILTIN_DESKTOP_APPS, ...BUILTIN_WEB_APPS];
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  isDesktopProtocol?: boolean;
  error?: string;
}

export function validateAndNormalizeUrl(rawInput: string): UrlValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter a URL or desktop protocol (e.g., https://youtube.com or vscode://).' };
  }

  if (/\s/.test(trimmed)) {
    return { valid: false, error: 'URLs cannot contain spaces.' };
  }

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = `${schemeMatch[1].toLowerCase()}:`;
    if (BLOCKED_SCHEMES.has(scheme)) {
      return { valid: false, error: `Protocol "${scheme}" is blocked for security.` };
    }

    if (scheme === 'http:' || scheme === 'https:') {
      try {
        const parsed = new URL(trimmed);
        if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
          return { valid: false, error: 'Enter a valid domain name (e.g., example.com).' };
        }
        return { valid: true, normalizedUrl: parsed.toString(), isDesktopProtocol: false };
      } catch {
        return { valid: false, error: 'Invalid web URL format.' };
      }
    }

    if (ALLOWED_SHORT_SCHEMES.has(scheme) || /^[a-z][a-z0-9+.-]{1,20}:\/\//i.test(trimmed)) {
      return { valid: true, normalizedUrl: trimmed, isDesktopProtocol: true };
    }

    return { valid: false, error: `Unsupported protocol "${scheme}". Use https:// or a desktop scheme like vscode://.` };
  }

  const isLocalhost = /^localhost(:\d+)?(\/.*)?$/i.test(trimmed);
  const looksLikeDomain = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:\d+)?(\/.*)?$/.test(trimmed);

  if (isLocalhost || looksLikeDomain) {
    const candidate = `${isLocalhost ? 'http' : 'https'}://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      return { valid: true, normalizedUrl: parsed.toString(), isDesktopProtocol: false };
    } catch {
      return { valid: false, error: 'Invalid domain format.' };
    }
  }

  return { valid: false, error: 'Enter a valid domain (e.g., github.com) or protocol (e.g., vscode://).' };
}

export function formatDisplayHost(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname.replace(/^www\./, '');
    }
    return url;
  } catch {
    return url;
  }
}

export function isHostEmbedRestricted(url?: string): boolean {
  if (!url) return false;
  const host = formatDisplayHost(url).toLowerCase();
  return KNOWN_EMBED_RESTRICTED_HOSTS.has(host);
}

export function extractYouTubeIdsFromUrl(url: string): { videoId?: string; playlistId?: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      const playlistId = parsed.searchParams.get('list') || undefined;
      if (videoId || playlistId) return { videoId: videoId || undefined, playlistId };
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const videoId = parsed.searchParams.get('v') || undefined;
      const playlistId = parsed.searchParams.get('list') || undefined;
      if (videoId || playlistId) return { videoId, playlistId };
      const embedMatch = parsed.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{6,})/);
      if (embedMatch) return { videoId: embedMatch[1], playlistId };
    }
  } catch {
    return null;
  }
  return null;
}

export function buildTargetUrl(shortcut: AppShortcut, searchQuery?: string): string | undefined {
  if (!shortcut.url) return undefined;
  const trimmedQuery = searchQuery?.trim();
  if (trimmedQuery && shortcut.searchUrlTemplate) {
    const encoded = encodeURIComponent(trimmedQuery);
    if (shortcut.searchUrlTemplate.includes('{query}')) {
      return shortcut.searchUrlTemplate.replace(/\{query\}/g, encoded);
    }
    return `${shortcut.searchUrlTemplate}${encoded}`;
  }
  return shortcut.url;
}

export interface ResolvedLaunchIntent {
  action: LaunchActionMetadata;
  spokenResponse: string;
  shouldAutoLaunch: boolean;
}

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"`.,!?]+$/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeSongQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\bbeliver\b/gi, 'believer')
    .replace(/\bplaylst\b/gi, 'playlist')
    .replace(/\bsongz\b/gi, 'songs')
    .replace(/\s+on\s+youtube$/i, '')
    .replace(/\s+in\s+youtube$/i, '')
    .trim();
}

function stripPolitePrefix(input: string): string {
  let cleaned = input.trim();
  // Fix common joined command typos like "openyoutube", "opentwitter", "opengithub", "playbeliever"
  cleaned = cleaned.replace(
    /^open(youtube|twitter|twiter|instagram|github|gmail|google|spotify|reddit|netflix|wikipedia|whatsapp|discord|slack|vscode|terminal|novafs|vault)\b/i,
    'open $1'
  );
  cleaned = cleaned.replace(/^play(beliver|believer|music|songs?|playlist)\b/i, 'play $1');

  const prefixPattern =
    /^(?:(?:hey|hi|ok|okay)\s+)?jarvis[,:\s]+|^(?:please|kindly)\s+|^(?:can|could|would|will)\s+you\s+|^(?:i\s+want\s+(?:you\s+)?to)\s+/i;

  for (let i = 0; i < 4; i++) {
    const next = cleaned.replace(prefixPattern, '').trim();
    if (next === cleaned) break;
    cleaned = next;
  }

  // Re-run missing-space normalization in case "hey jarvis openyoutube..." was spoken/typed
  cleaned = cleaned.replace(
    /^open(youtube|twitter|twiter|instagram|github|gmail|google|spotify|reddit|netflix|wikipedia|whatsapp|discord|slack|vscode|terminal|novafs|vault)\b/i,
    'open $1'
  );
  return cleaned;
}

function findMatchingShortcut(targetRaw: string, customApps: AppShortcut[]): AppShortcut | null {
  const target = normalizeLookup(targetRaw);
  if (!target) return null;

  const lists: AppShortcut[][] = [
    customApps,
    BUILTIN_DESKTOP_APPS,
    BUILTIN_SYSTEM_APPS,
    BUILTIN_WEB_APPS,
  ];

  for (const list of lists) {
    for (const item of list) {
      const nameNorm = normalizeLookup(item.name);
      if (nameNorm === target) return item;
      if (item.aliases.some(alias => normalizeLookup(alias) === target)) {
        return item;
      }
    }
  }

  return null;
}

function createMediaIntent(options: {
  query?: string;
  mediaType: 'video' | 'playlist';
  videoId?: string;
  playlistId?: string;
  label?: string;
}): ResolvedLaunchIntent {
  const normalizedQuery = options.query ? normalizeSongQuery(options.query) : undefined;
  const isPlaylist = options.mediaType === 'playlist';
  const isGenericAny =
    !normalizedQuery ||
    /^(any|any\s+songs?|any\s+playlist|a\s+song|a\s+playlist|some\s+music|songs?|music|playlist)$/i.test(
      normalizedQuery
    );

  const watchUrl = options.videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(options.videoId)}`
    : options.playlistId
    ? `https://www.youtube.com/playlist?list=${encodeURIComponent(options.playlistId)}`
    : normalizedQuery && !isGenericAny
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(normalizedQuery)}`
    : 'https://www.youtube.com';

  const label =
    options.label ||
    (normalizedQuery && !isGenericAny
      ? `YouTube · ${normalizedQuery}`
      : isPlaylist
      ? 'YouTube · Music Playlists'
      : 'YouTube');

  let spokenResponse = '';
  if (options.videoId) {
    spokenResponse = 'Opening YouTube video inside a JARVIS sub-window, sir.';
  } else if (options.playlistId) {
    spokenResponse = 'Opening your YouTube playlist inside a JARVIS sub-window, sir.';
  } else if (normalizedQuery && !isGenericAny) {
    spokenResponse = isPlaylist
      ? `Opening the "${normalizedQuery}" playlist in the JARVIS YouTube sub-window, sir.`
      : `Opening YouTube inside JARVIS and playing "${normalizedQuery}", sir.`;
  } else if (isPlaylist) {
    spokenResponse = 'Opening a curated music playlist inside the JARVIS YouTube sub-window, sir.';
  } else if (options.query) {
    spokenResponse = 'Opening YouTube inside JARVIS and playing a featured track for you, sir.';
  } else {
    spokenResponse = 'Opening YouTube inside a JARVIS sub-window, sir.';
  }

  return {
    action: {
      kind: 'media',
      label,
      url: watchUrl,
      searchQuery: normalizedQuery && !isGenericAny ? normalizedQuery : undefined,
      mediaQuery: normalizedQuery || (isPlaylist ? 'any playlist' : undefined),
      mediaType: options.mediaType,
      videoId: options.videoId,
      playlistId: options.playlistId,
      displayHost: 'youtube.com',
      opensInSubWindow: true,
      embedRestricted: false,
    },
    spokenResponse,
    shouldAutoLaunch: true,
  };
}

function createIntentFromShortcut(
  shortcut: AppShortcut,
  searchQuery?: string
): ResolvedLaunchIntent {
  const trimmedQuery = searchQuery?.trim();

  if (shortcut.category === 'system' && shortcut.systemAppId) {
    return {
      action: {
        kind: 'system',
        label: shortcut.name,
        systemAppId: shortcut.systemAppId,
        searchQuery: trimmedQuery,
        displayHost: 'Helios Window',
        opensInSubWindow: false,
      },
      spokenResponse: `Opening ${shortcut.name} inside JARVISOS, sir.`,
      shouldAutoLaunch: true,
    };
  }

  // Route YouTube directly into the live JARVIS YouTube Media Sub-Window
  if (shortcut.id === 'web-youtube') {
    const isPlaylistSearch = Boolean(trimmedQuery && /\bplaylist\b/i.test(trimmedQuery));
    return createMediaIntent({
      query: trimmedQuery,
      mediaType: isPlaylistSearch ? 'playlist' : 'video',
      label: trimmedQuery ? `YouTube · ${trimmedQuery}` : 'YouTube',
    });
  }

  const finalUrl = buildTargetUrl(shortcut, trimmedQuery) || shortcut.url || '';
  const isDesktop =
    shortcut.category === 'desktop' || Boolean(finalUrl && !/^https?:\/\//i.test(finalUrl));
  const kind: LaunchActionMetadata['kind'] =
    shortcut.category === 'custom'
      ? isDesktop
        ? 'desktop'
        : 'custom'
      : isDesktop
      ? 'desktop'
      : 'web';

  const displayHost = formatDisplayHost(finalUrl);
  const embedRestricted = !isDesktop && (shortcut.embedRestricted ?? isHostEmbedRestricted(finalUrl));

  let spokenResponse = '';
  if (isDesktop) {
    spokenResponse = `Invoking the desktop protocol for ${shortcut.name}, sir. If it is not installed locally, you can use the web link below.`;
  } else if (trimmedQuery && shortcut.searchUrlTemplate) {
    spokenResponse = `Opening ${shortcut.name} inside a JARVIS sub-window for "${trimmedQuery}", sir.`;
  } else if (trimmedQuery && !shortcut.searchUrlTemplate) {
    spokenResponse = `Opening ${shortcut.name} inside a JARVIS sub-window, sir.`;
  } else {
    spokenResponse = `Opening ${shortcut.name} inside a JARVIS sub-window, sir.`;
  }

  return {
    action: {
      kind,
      label: shortcut.name,
      url: finalUrl,
      searchQuery: trimmedQuery,
      webFallbackUrl: shortcut.webFallbackUrl,
      searchUrlTemplate: shortcut.searchUrlTemplate,
      displayHost,
      opensInSubWindow: !isDesktop,
      embedRestricted,
    },
    spokenResponse,
    shouldAutoLaunch: true,
  };
}

/**
 * Parses natural-language commands from Arc Core or Aegis Terminal.
 * Supports sub-window web apps, YouTube song/playlist playback, desktop protocols,
 * built-in JARVISOS modules, and user custom apps.
 */
export function resolveLaunchIntent(
  rawInput: string,
  customApps: AppShortcut[] = []
): ResolvedLaunchIntent | null {
  const cleaned = stripPolitePrefix(rawInput);
  if (!cleaned) return null;

  // Pattern A: "open youtube and play <song/playlist>" or "open youtube play <song/playlist>"
  const ytPlayMatch = cleaned.match(
    /^(?:open|launch|start)\s+(?:youtube|yt|you\s+tube)\s+(?:and\s+)?(?:play|open\s+playlist|listen\s+to|stream)\s+(.+)$/i
  );
  if (ytPlayMatch) {
    const rawTarget = ytPlayMatch[1].trim().replace(/[.!?]+$/, '');
    const isPlaylist = /\bplaylist\b/i.test(cleaned);
    return createMediaIntent({
      query: rawTarget,
      mediaType: isPlaylist ? 'playlist' : 'video',
    });
  }

  // Pattern B: Standalone "play <song / any song / playlist>"
  const standalonePlayMatch = cleaned.match(/^(?:play|stream|listen\s+to)\s+(.+)$/i);
  if (standalonePlayMatch) {
    const rawTarget = standalonePlayMatch[1].trim().replace(/[.!?]+$/, '');
    if (rawTarget) {
      const isPlaylist = /\bplaylist\b/i.test(rawTarget);
      return createMediaIntent({
        query: rawTarget,
        mediaType: isPlaylist ? 'playlist' : 'video',
      });
    }
  }

  // Pattern C: "open [any/a/my] [topic] playlist [name]"
  const playlistOpenMatch = cleaned.match(
    /^(?:open|launch|start)\s+(?:(?:any|a|some|my|the)\s+)?(?:([a-z0-9 ._-]+?)\s+)?playlist(?:\s+(.+))?$/i
  );
  if (playlistOpenMatch) {
    const beforeWord = playlistOpenMatch[1]?.trim();
    const afterWord = playlistOpenMatch[2]?.trim().replace(/[.!?]+$/, '');
    const combinedQuery = [beforeWord, afterWord].filter(Boolean).join(' ').trim();
    return createMediaIntent({
      query: combinedQuery || 'any playlist',
      mediaType: 'playlist',
    });
  }

  let targetPart = '';
  let searchQuery: string | undefined;

  // Pattern 1: "open/launch/go to/start/visit/run <target> [and search/search/for <query>]"
  const openMatch = cleaned.match(
    /^(?:open|launch|go\s+to|goto|start|visit|browse(?:\s+to)?|load|run)\s+(.+)$/i
  );

  // Pattern 2: "search [on/in] <app> for <query>"
  const searchOnMatch = !openMatch
    ? cleaned.match(/^search\s+(?:on\s+|in\s+)?([a-z0-9 ._-]+?)\s+for\s+(.+)$/i)
    : null;

  // Pattern 3: "<app> search <query>"
  const appSearchMatch =
    !openMatch && !searchOnMatch
      ? cleaned.match(/^([a-z0-9 ._-]{2,24}?)\s+search\s+(?:for\s+)?(.+)$/i)
      : null;

  if (openMatch) {
    const rest = openMatch[1].trim().replace(/[.!?]+$/, '');

    // Guard against general prose questions like "open source software architecture"
    if (/^source\b/i.test(rest)) return null;

    const splitSearch = rest.match(
      /^(.+?)\s+(?:and\s+)?(?:search(?:\s+for)?|find|look\s+up)\s+(.+)$/i
    );

    if (splitSearch) {
      targetPart = splitSearch[1].trim();
      searchQuery = splitSearch[2].trim().replace(/^["']|["']$/g, '');
    } else {
      targetPart = rest;
    }
  } else if (searchOnMatch) {
    targetPart = searchOnMatch[1].trim();
    searchQuery = searchOnMatch[2].trim().replace(/^["']|["']$/g, '');
  } else if (appSearchMatch) {
    const candidateTarget = appSearchMatch[1].trim();
    const matched = findMatchingShortcut(candidateTarget, customApps);
    if (!matched) return null;
    targetPart = candidateTarget;
    searchQuery = appSearchMatch[2].trim().replace(/^["']|["']$/g, '');
  } else {
    return null;
  }

  if (!targetPart) return null;

  const strippedArticleTarget = targetPart.replace(/^(?:the|my)\s+/i, '').trim();

  // 1. Check registered apps (custom -> desktop -> system -> web), exact phrase first then article-stripped
  const matchedShortcut =
    findMatchingShortcut(targetPart, customApps) ||
    (strippedArticleTarget && strippedArticleTarget !== targetPart
      ? findMatchingShortcut(strippedArticleTarget, customApps)
      : null);
  if (matchedShortcut) {
    return createIntentFromShortcut(matchedShortcut, searchQuery);
  }

  const effectiveTarget = strippedArticleTarget || targetPart;

  // 2. Check if target is a direct URL, domain, or safe desktop URI protocol
  const urlCheck = validateAndNormalizeUrl(effectiveTarget);
  if (urlCheck.valid && urlCheck.normalizedUrl) {
    // Check if it's a direct YouTube video or playlist URL
    const ytIds = extractYouTubeIdsFromUrl(urlCheck.normalizedUrl);
    if (ytIds) {
      return createMediaIntent({
        videoId: ytIds.videoId,
        playlistId: ytIds.playlistId,
        mediaType: ytIds.playlistId && !ytIds.videoId ? 'playlist' : 'video',
      });
    }

    const displayHost = formatDisplayHost(urlCheck.normalizedUrl);
    const kind = urlCheck.isDesktopProtocol ? 'desktop' : 'web';
    const embedRestricted = !urlCheck.isDesktopProtocol && isHostEmbedRestricted(urlCheck.normalizedUrl);

    return {
      action: {
        kind,
        label: displayHost || effectiveTarget,
        url: urlCheck.normalizedUrl,
        searchQuery,
        displayHost,
        opensInSubWindow: !urlCheck.isDesktopProtocol,
        embedRestricted,
      },
      spokenResponse: urlCheck.isDesktopProtocol
        ? `Invoking protocol ${urlCheck.normalizedUrl}, sir.`
        : `Opening ${displayHost} inside a JARVIS sub-window, sir.`,
      shouldAutoLaunch: true,
    };
  }

  // 3. Explicit "open <unknown>" command — return helpful unrecognized intent with web search option
  if (openMatch) {
    const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(effectiveTarget)}`;
    return {
      action: {
        kind: 'unrecognized',
        label: effectiveTarget,
        url: fallbackUrl,
        searchQuery: effectiveTarget,
        displayHost: 'google.com',
        opensInSubWindow: false,
      },
      spokenResponse: `I do not have a saved shortcut for "${effectiveTarget}", sir. You can open a web search for it below or register it in the Apps panel (or via "apps add ${effectiveTarget.toLowerCase().replace(/\s+/g, '-')} <url>").`,
      shouldAutoLaunch: false,
    };
  }

  return null;
}

export function buildPortalPayloadFromAction(action: LaunchActionMetadata): WebPortalPayload {
  const isYouTube = action.kind === 'media';
  const slug = (action.displayHost || action.label || 'web')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    portalKey: isYouTube ? 'portal-youtube' : `portal-${slug || 'web'}`,
    mode: isYouTube ? 'youtube' : 'web',
    title: isYouTube ? action.label || 'YouTube Media Player' : action.label || 'Web Portal',
    url: action.url || 'https://www.youtube.com',
    searchQuery: action.searchQuery,
    mediaQuery: action.mediaQuery,
    mediaType: action.mediaType,
    videoId: action.videoId,
    playlistId: action.playlistId,
    searchUrlTemplate: action.searchUrlTemplate,
    embedRestricted: action.embedRestricted,
    requestId: Date.now(),
  };
}

/**
 * Synchronously triggers a new browser tab or protocol handler via a transient anchor click.
 */
export function dispatchExternalLaunch(url: string): boolean {
  if (typeof document === 'undefined' || !url) return false;
  try {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    return false;
  }
}

export function createCustomAppShortcut(
  name: string,
  rawUrl: string,
  rawSearchTemplate?: string
): { shortcut?: AppShortcut; error?: string } {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: 'App name is required.' };
  }
  if (trimmedName.length > 40) {
    return { error: 'App name must be 40 characters or fewer.' };
  }

  const urlResult = validateAndNormalizeUrl(rawUrl);
  if (!urlResult.valid || !urlResult.normalizedUrl) {
    return { error: urlResult.error || 'Invalid URL.' };
  }

  let normalizedSearch: string | undefined;
  const trimmedSearch = rawSearchTemplate?.trim();
  if (trimmedSearch) {
    const testTemplate = trimmedSearch.replace(/\{query\}/g, 'test');
    const searchCheck = validateAndNormalizeUrl(testTemplate);
    if (!searchCheck.valid) {
      return { error: `Search template error: ${searchCheck.error}` };
    }
    normalizedSearch =
      trimmedSearch.includes('://') || /^[a-z][a-z0-9+.-]*:/i.test(trimmedSearch)
        ? trimmedSearch
        : `https://${trimmedSearch}`;
  }

  const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const aliases = Array.from(new Set([trimmedName.toLowerCase(), slug].filter(Boolean)));

  const shortcut: AppShortcut = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmedName,
    aliases,
    category: 'custom',
    url: urlResult.normalizedUrl,
    searchUrlTemplate: normalizedSearch,
    embedRestricted: !urlResult.isDesktopProtocol && isHostEmbedRestricted(urlResult.normalizedUrl),
  };

  return { shortcut };
}

export function loadCustomApps(): AppShortcut[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_APPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AppShortcut =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.url === 'string' &&
        Array.isArray(item.aliases)
    );
  } catch {
    return [];
  }
}

export function saveCustomApps(apps: AppShortcut[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CUSTOM_APPS_STORAGE_KEY, JSON.stringify(apps));
  } catch {
    // Ignore quota or storage restriction errors
  }
}

export function getSystemAppIdLabel(appId: AppId): string {
  const found = BUILTIN_SYSTEM_APPS.find(app => app.systemAppId === appId);
  return found ? found.name : appId;
}
