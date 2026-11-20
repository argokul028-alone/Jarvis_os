import { formatDisplayHost, isHostEmbedRestricted } from './app-launcher.ts';

export type BrowserTheme = 'dark' | 'light';
export type BrowserRenderMode = 'embed' | 'reader';
export type TabGroupColor = 'cyan' | 'emerald' | 'amber' | 'violet' | 'rose' | 'blue';
export type BrowserExtensionId =
  | 'ad_shield'
  | 'jarvis_summarizer'
  | 'focus_dimmer'
  | 'quick_notes';

export interface BrowserExtensionDef {
  id: BrowserExtensionId;
  name: string;
  shortLabel: string;
  description: string;
  version: string;
  defaultEnabled: boolean;
}

export interface BrowserTabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  groupId: string | null;
  historyStack: string[];
  historyIndex: number;
  renderMode: BrowserRenderMode;
  isLoading: boolean;
}

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
  folder: string;
  createdAtMs: number;
}

export interface BrowserHistoryEntry {
  id: string;
  title: string;
  url: string;
  visitedAtMs: number;
}

export interface BrowserSettingsState {
  theme: BrowserTheme;
  showBookmarksBar: boolean;
  enabledExtensions: BrowserExtensionId[];
}

export type BrowserSearchTab = 'all' | 'videos' | 'news' | 'images';

export interface BrowserSearchResult {
  title: string;
  url: string;
  displayUrl: string;
  siteName?: string;
  snippet: string;
  publishedAt?: string;
  thumbnail?: string;
  source?: string;
}

export interface BrowserSearchVideoResult {
  id: string;
  type?: 'video' | 'playlist';
  title: string;
  channel: string;
  duration?: string;
  thumbnail?: string;
  embedUrl: string;
  watchUrl: string;
}

export interface BrowserSearchImageResult {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  displayDomain: string;
  width?: number;
  height?: number;
}

export interface BrowserSearchOverview {
  text: string;
  citedDomains?: string[];
}

export interface ReaderPageBlock {
  type: 'heading' | 'paragraph' | 'quote' | 'list_item';
  text: string;
}

export interface ReaderPageLink {
  text: string;
  url: string;
}

export interface ReaderPageDocument {
  url: string;
  finalUrl: string;
  title: string;
  siteName: string;
  byline?: string;
  excerpt?: string;
  blocks: ReaderPageBlock[];
  links: ReaderPageLink[];
  blockedTrackersCount: number;
  fetchedAt: string;
}

export const BROWSER_NEWTAB_URL = 'jarvis://newtab';
export const BROWSER_SEARCH_PREFIX = 'jarvis://search?q=';

export const BROWSER_LOCAL_BOOKMARKS_KEY = 'jarvisos_browser_bookmarks_v1';
export const BROWSER_LOCAL_HISTORY_KEY = 'jarvisos_browser_history_v1';
export const BROWSER_LOCAL_SETTINGS_KEY = 'jarvisos_browser_settings_v1';
export const BROWSER_LOCAL_NOTES_KEY = 'jarvisos_browser_page_notes_v1';

export const ALLOWED_EXTENSION_IDS: readonly BrowserExtensionId[] = [
  'ad_shield',
  'jarvis_summarizer',
  'focus_dimmer',
  'quick_notes',
] as const;

export const BUILTIN_EXTENSIONS: BrowserExtensionDef[] = [
  {
    id: 'ad_shield',
    name: 'Aegis Ad & Tracker Shield',
    shortLabel: 'Ad Shield',
    description: 'Strips ad banners, telemetry scripts, and trackers when loading pages in Reader View.',
    version: '2.4.1',
    defaultEnabled: true,
  },
  {
    id: 'jarvis_summarizer',
    name: 'JARVIS Page Summarizer',
    shortLabel: 'Summarize',
    description: 'Generates concise AI briefings of any open Reader View page or search results.',
    version: '1.8.0',
    defaultEnabled: true,
  },
  {
    id: 'focus_dimmer',
    name: 'Reading Focus Dimmer',
    shortLabel: 'Focus Veil',
    description: 'Applies a soft anti-glare reading tint over bright embedded web pages.',
    version: '1.2.0',
    defaultEnabled: false,
  },
  {
    id: 'quick_notes',
    name: 'Page Quick Notes',
    shortLabel: 'Notes',
    description: 'Attaches persistent per-URL scratchpad notes in the browser side panel.',
    version: '1.5.2',
    defaultEnabled: true,
  },
];

export const DEFAULT_BOOKMARKS: BrowserBookmark[] = [
  {
    id: 'bm-wikipedia',
    title: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Main_Page',
    folder: 'Bookmarks Bar',
    createdAtMs: 1730000000001,
  },
  {
    id: 'bm-youtube',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    folder: 'Bookmarks Bar',
    createdAtMs: 1730000000002,
  },
  {
    id: 'bm-github',
    title: 'GitHub',
    url: 'https://github.com',
    folder: 'Bookmarks Bar',
    createdAtMs: 1730000000003,
  },
  {
    id: 'bm-hn',
    title: 'Hacker News',
    url: 'https://news.ycombinator.com',
    folder: 'Bookmarks Bar',
    createdAtMs: 1730000000004,
  },
  {
    id: 'bm-mdn',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    folder: 'Bookmarks Bar',
    createdAtMs: 1730000000005,
  },
  {
    id: 'bm-x',
    title: 'X (Twitter)',
    url: 'https://x.com',
    folder: 'Bookmarks Bar',
    createdAtMs: 1730000000006,
  },
];

export const DEFAULT_BROWSER_SETTINGS: BrowserSettingsState = {
  theme: 'dark',
  showBookmarksBar: true,
  enabledExtensions: ['ad_shield', 'jarvis_summarizer', 'quick_notes'],
};

export const TAB_GROUP_COLORS: TabGroupColor[] = [
  'cyan',
  'emerald',
  'amber',
  'violet',
  'rose',
  'blue',
];

export const TRANSLATE_LANGUAGES = [
  { code: 'English', label: 'English' },
  { code: 'Spanish', label: 'Español (Spanish)' },
  { code: 'French', label: 'Français (French)' },
  { code: 'German', label: 'Deutsch (German)' },
  { code: 'Hindi', label: 'हिन्दी (Hindi)' },
  { code: 'Tamil', label: 'தமிழ் (Tamil)' },
  { code: 'Japanese', label: '日本語 (Japanese)' },
  { code: 'Chinese (Simplified)', label: '中文 (Chinese)' },
  { code: 'Korean', label: '한국어 (Korean)' },
  { code: 'Arabic', label: 'العربية (Arabic)' },
  { code: 'Portuguese', label: 'Português (Portuguese)' },
  { code: 'Italian', label: 'Italiano (Italian)' },
] as const;

export interface ResolvedOmniboxTarget {
  kind: 'newtab' | 'search' | 'web';
  url: string;
  title: string;
  searchQuery?: string;
  searchTab?: BrowserSearchTab;
  defaultRenderMode: BrowserRenderMode;
}

export function extractSearchQueryFromUrl(url: string): string | null {
  if (!url.startsWith(BROWSER_SEARCH_PREFIX)) return null;
  const rawTail = url.slice(BROWSER_SEARCH_PREFIX.length);
  const ampIdx = rawTail.indexOf('&');
  const encodedQuery = ampIdx === -1 ? rawTail : rawTail.slice(0, ampIdx);
  try {
    return decodeURIComponent(encodedQuery).trim();
  } catch {
    return encodedQuery.trim();
  }
}

export function extractSearchTabFromUrl(url: string): BrowserSearchTab {
  if (!url.startsWith(BROWSER_SEARCH_PREFIX)) return 'all';
  const match = url.match(/[?&]tab=(all|videos|news|images)(?:&|$)/i);
  if (!match) return 'all';
  const normalized = match[1].toLowerCase();
  if (normalized === 'videos' || normalized === 'news' || normalized === 'images') {
    return normalized;
  }
  return 'all';
}

export function buildJarvisSearchUrl(query: string, tab: BrowserSearchTab = 'all'): string {
  const base = `${BROWSER_SEARCH_PREFIX}${encodeURIComponent(query.trim())}`;
  return tab === 'all' ? base : `${base}&tab=${tab}`;
}

export function isYouTubeWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'music.youtube.com';
  } catch {
    return false;
  }
}

export function resolveOmniboxInput(rawInput: string): ResolvedOmniboxTarget {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.toLowerCase() === BROWSER_NEWTAB_URL || trimmed.toLowerCase() === 'about:blank') {
    return {
      kind: 'newtab',
      url: BROWSER_NEWTAB_URL,
      title: 'New Tab',
      defaultRenderMode: 'reader',
    };
  }

  if (trimmed.startsWith(BROWSER_SEARCH_PREFIX)) {
    const query = extractSearchQueryFromUrl(trimmed) || '';
    const tab = extractSearchTabFromUrl(trimmed);
    if (!query) {
      return {
        kind: 'newtab',
        url: BROWSER_NEWTAB_URL,
        title: 'New Tab',
        defaultRenderMode: 'reader',
      };
    }
    return {
      kind: 'search',
      url: buildJarvisSearchUrl(query, tab),
      title: `${query} — Google Search`,
      searchQuery: query,
      searchTab: tab,
      defaultRenderMode: 'reader',
    };
  }

  // Reject unsafe schemes
  if (/^(?:javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return {
      kind: 'search',
      url: buildJarvisSearchUrl(trimmed),
      title: `${trimmed} — JARVIS Search`,
      searchQuery: trimmed,
      defaultRenderMode: 'reader',
    };
  }

  // Explicit http(s) URL
  if (/^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = formatDisplayHost(parsed.toString()) || parsed.hostname;
      // Live Proxy View works across sites; use reader automatically only for heavy bot-blocked SPAs
      const preferReader = isHostEmbedRestricted(parsed.toString()) && !isYouTubeWebUrl(parsed.toString());
      return {
        kind: 'web',
        url: parsed.toString(),
        title: host,
        defaultRenderMode: preferReader ? 'reader' : 'embed',
      };
    } catch {
      // Fall through to search
    }
  }

  // Bare domain like github.com or en.wikipedia.org/wiki/Iron_Man
  const looksLikeDomain =
    !/\s/.test(trimmed) &&
    /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:\d+)?(\/.*)?$/.test(trimmed);

  if (looksLikeDomain) {
    const candidate = `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      const host = formatDisplayHost(parsed.toString()) || parsed.hostname;
      const preferReader = isHostEmbedRestricted(parsed.toString()) && !isYouTubeWebUrl(parsed.toString());
      return {
        kind: 'web',
        url: parsed.toString(),
        title: host,
        defaultRenderMode: preferReader ? 'reader' : 'embed',
      };
    } catch {
      // Fall through to search
    }
  }

  // Default: Full-web Google Search inside JARVIS Browser
  return {
    kind: 'search',
    url: buildJarvisSearchUrl(trimmed, 'all'),
    title: `${trimmed} — Google Search`,
    searchQuery: trimmed,
    searchTab: 'all',
    defaultRenderMode: 'reader',
  };
}

export function createBrowserTab(
  initialInput: string = BROWSER_NEWTAB_URL,
  groupId: string | null = null,
  customId?: string
): BrowserTab {
  const resolved = resolveOmniboxInput(initialInput);
  return {
    id: customId || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    url: resolved.url,
    title: resolved.title,
    groupId,
    historyStack: [resolved.url],
    historyIndex: 0,
    renderMode: resolved.defaultRenderMode,
    isLoading: resolved.kind !== 'newtab',
  };
}

export function navigateTabTo(tab: BrowserTab, input: string, forcedMode?: BrowserRenderMode): BrowserTab {
  const resolved = resolveOmniboxInput(input);
  const currentUrl = tab.historyStack[tab.historyIndex];
  if (currentUrl === resolved.url) {
    return {
      ...tab,
      renderMode: forcedMode ?? tab.renderMode,
      isLoading: resolved.kind !== 'newtab',
    };
  }
  const truncated = tab.historyStack.slice(0, tab.historyIndex + 1);
  const nextStack = [...truncated, resolved.url];
  return {
    ...tab,
    url: resolved.url,
    title: resolved.title,
    historyStack: nextStack,
    historyIndex: nextStack.length - 1,
    renderMode: forcedMode ?? resolved.defaultRenderMode,
    isLoading: resolved.kind !== 'newtab',
  };
}

export function canTabGoBack(tab: BrowserTab): boolean {
  return tab.historyIndex > 0;
}

export function canTabGoForward(tab: BrowserTab): boolean {
  return tab.historyIndex < tab.historyStack.length - 1;
}

export function goBackInTab(tab: BrowserTab): BrowserTab {
  if (!canTabGoBack(tab)) return tab;
  const nextIndex = tab.historyIndex - 1;
  const nextUrl = tab.historyStack[nextIndex];
  const resolved = resolveOmniboxInput(nextUrl);
  return {
    ...tab,
    url: nextUrl,
    title: resolved.title,
    historyIndex: nextIndex,
    renderMode: resolved.defaultRenderMode,
    isLoading: resolved.kind !== 'newtab',
  };
}

export function goForwardInTab(tab: BrowserTab): BrowserTab {
  if (!canTabGoForward(tab)) return tab;
  const nextIndex = tab.historyIndex + 1;
  const nextUrl = tab.historyStack[nextIndex];
  const resolved = resolveOmniboxInput(nextUrl);
  return {
    ...tab,
    url: nextUrl,
    title: resolved.title,
    historyIndex: nextIndex,
    renderMode: resolved.defaultRenderMode,
    isLoading: resolved.kind !== 'newtab',
  };
}

export function createTabGroup(
  name: string,
  color: TabGroupColor = 'cyan',
  customId?: string
): BrowserTabGroup {
  const cleanName = name.trim().slice(0, 28) || 'Group';
  return {
    id: customId || `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    color,
    collapsed: false,
  };
}

export function assignTabToGroup(
  tabs: BrowserTab[],
  tabId: string,
  groupId: string | null
): BrowserTab[] {
  return tabs.map(t => (t.id === tabId ? { ...t, groupId } : t));
}

export function toggleTabGroupCollapsed(
  groups: BrowserTabGroup[],
  groupId: string
): BrowserTabGroup[] {
  return groups.map(g => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g));
}

export function removeTabGroupAndUngroup(
  groups: BrowserTabGroup[],
  tabs: BrowserTab[],
  groupId: string
): { groups: BrowserTabGroup[]; tabs: BrowserTab[] } {
  return {
    groups: groups.filter(g => g.id !== groupId),
    tabs: tabs.map(t => (t.groupId === groupId ? { ...t, groupId: null } : t)),
  };
}

export interface FindSegment {
  text: string;
  isMatch: boolean;
  matchIndex: number;
}

export function splitTextForFind(
  text: string,
  query: string,
  caseSensitive: boolean,
  startOffset: number = 0
): { segments: FindSegment[]; matchCount: number } {
  if (!query) {
    return { segments: [{ text, isMatch: false, matchIndex: -1 }], matchCount: 0 };
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  const haystack = caseSensitive ? text : text.toLowerCase();

  const segments: FindSegment[] = [];
  let cursor = 0;
  let count = 0;

  while (cursor < text.length) {
    const idx = haystack.indexOf(needle, cursor);
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), isMatch: false, matchIndex: -1 });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: text.slice(cursor, idx), isMatch: false, matchIndex: -1 });
    }
    segments.push({
      text: text.slice(idx, idx + query.length),
      isMatch: true,
      matchIndex: startOffset + count,
    });
    count += 1;
    cursor = idx + query.length;
  }

  return { segments, matchCount: count };
}

export function countFindMatchesInStrings(
  texts: string[],
  query: string,
  caseSensitive: boolean
): number {
  if (!query) return 0;
  let total = 0;
  for (const t of texts) {
    total += splitTextForFind(t, query, caseSensitive, total).matchCount;
  }
  return total;
}

export function toSafeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
  return cleaned || `id_${Date.now()}`;
}

export function isValidBookmarkInput(title: string, url: string): boolean {
  const t = title.trim();
  const u = url.trim();
  if (t.length < 1 || t.length > 200) return false;
  if (u.length < 4 || u.length > 2048) return false;
  return /^(https?:\/\/|jarvis:\/\/)/i.test(u);
}

export function sanitizeEnabledExtensions(list: unknown): BrowserExtensionId[] {
  if (!Array.isArray(list)) return [...DEFAULT_BROWSER_SETTINGS.enabledExtensions];
  const validSet = new Set<string>(ALLOWED_EXTENSION_IDS);
  return Array.from(
    new Set(list.filter((item): item is BrowserExtensionId => typeof item === 'string' && validSet.has(item)))
  );
}

export function loadLocalBookmarks(): BrowserBookmark[] {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_BOOKMARKS;
  try {
    const raw = window.localStorage.getItem(BROWSER_LOCAL_BOOKMARKS_KEY);
    if (!raw) return DEFAULT_BOOKMARKS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_BOOKMARKS;
    const valid = parsed.filter(
      (b): b is BrowserBookmark =>
        b && typeof b.id === 'string' && typeof b.title === 'string' && typeof b.url === 'string'
    );
    return valid.length > 0 ? valid : DEFAULT_BOOKMARKS;
  } catch {
    return DEFAULT_BOOKMARKS;
  }
}

export function saveLocalBookmarks(bookmarks: BrowserBookmark[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(BROWSER_LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch {
    // Ignore quota errors
  }
}

export function loadLocalHistory(): BrowserHistoryEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(BROWSER_LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is BrowserHistoryEntry =>
        h && typeof h.id === 'string' && typeof h.title === 'string' && typeof h.url === 'string'
    );
  } catch {
    return [];
  }
}

export function saveLocalHistory(entries: BrowserHistoryEntry[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(BROWSER_LOCAL_HISTORY_KEY, JSON.stringify(entries.slice(0, 150)));
  } catch {
    // Ignore quota errors
  }
}

export function loadLocalBrowserSettings(): BrowserSettingsState {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_BROWSER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(BROWSER_LOCAL_SETTINGS_KEY);
    if (!raw) return DEFAULT_BROWSER_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      theme: parsed?.theme === 'light' ? 'light' : 'dark',
      showBookmarksBar: typeof parsed?.showBookmarksBar === 'boolean' ? parsed.showBookmarksBar : true,
      enabledExtensions: sanitizeEnabledExtensions(parsed?.enabledExtensions),
    };
  } catch {
    return DEFAULT_BROWSER_SETTINGS;
  }
}

export function saveLocalBrowserSettings(settings: BrowserSettingsState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(BROWSER_LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors
  }
}

export function loadPageNotes(): Record<string, string> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(BROWSER_LOCAL_NOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePageNotes(notes: Record<string, string>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(BROWSER_LOCAL_NOTES_KEY, JSON.stringify(notes));
  } catch {
    // Ignore quota errors
  }
}
