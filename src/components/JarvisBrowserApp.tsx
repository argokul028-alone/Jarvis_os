import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  CloudOff,
  EyeOff,
  Globe,
  Home,
  Image as ImageIcon,
  Languages,
  Layers,
  ListMusic,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Moon,
  MoreVertical,
  Newspaper,
  Play,
  Plus,
  Printer,
  Puzzle,
  RefreshCw,
  Search,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Star,
  Sun,
  Video,
  X,
} from 'lucide-react';
import {
  BROWSER_NEWTAB_URL,
  TRANSLATE_LANGUAGES,
  assignTabToGroup,
  buildJarvisSearchUrl,
  canTabGoBack,
  canTabGoForward,
  countFindMatchesInStrings,
  createBrowserTab,
  createTabGroup,
  extractSearchQueryFromUrl,
  extractSearchTabFromUrl,
  goBackInTab,
  goForwardInTab,
  isYouTubeWebUrl,
  loadPageNotes,
  navigateTabTo,
  removeTabGroupAndUngroup,
  resolveOmniboxInput,
  savePageNotes,
  splitTextForFind,
  toggleTabGroupCollapsed,
  type BrowserRenderMode,
  type BrowserSearchImageResult,
  type BrowserSearchOverview,
  type BrowserSearchResult,
  type BrowserSearchTab,
  type BrowserSearchVideoResult,
  type BrowserTab,
  type BrowserTabGroup,
  type ReaderPageBlock,
  type ReaderPageDocument,
  type TabGroupColor,
} from '../utils/browser-engine';
import { useBrowserCloudSync } from '../hooks/useBrowserCloudSync';
import { BrowserSidePanel, type BrowserSidePanelTab } from './BrowserSidePanel';
import { extractYouTubeIdsFromUrl, formatDisplayHost } from '../utils/app-launcher';

interface JarvisBrowserAppProps {
  isPrivate?: boolean;
  initialUrl?: string;
  onOpenPrivateWindow: () => void;
  onUpdateWindowTitle?: (title: string) => void;
}

const GROUP_BADGE_CLASSES: Record<TabGroupColor, { dark: string; light: string; bar: string }> = {
  cyan: {
    dark: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50',
    light: 'bg-cyan-600 text-white border-cyan-700',
    bar: 'bg-cyan-400',
  },
  emerald: {
    dark: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50',
    light: 'bg-emerald-600 text-white border-emerald-700',
    bar: 'bg-emerald-400',
  },
  amber: {
    dark: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
    light: 'bg-amber-600 text-white border-amber-700',
    bar: 'bg-amber-400',
  },
  violet: {
    dark: 'bg-violet-500/20 text-violet-200 border-violet-400/50',
    light: 'bg-violet-600 text-white border-violet-700',
    bar: 'bg-violet-400',
  },
  rose: {
    dark: 'bg-rose-500/20 text-rose-200 border-rose-400/50',
    light: 'bg-rose-600 text-white border-rose-700',
    bar: 'bg-rose-400',
  },
  blue: {
    dark: 'bg-blue-500/20 text-blue-200 border-blue-400/50',
    light: 'bg-blue-600 text-white border-blue-700',
    bar: 'bg-blue-400',
  },
};

interface TranslatedOverlay {
  url: string;
  targetLanguage: string;
  title: string;
  blocks: ReaderPageBlock[];
}

interface BrowserYouTubeItem {
  id: string;
  type?: 'video' | 'playlist';
  title: string;
  channel: string;
  duration?: string;
  thumbnail?: string;
  embedUrl: string;
  watchUrl: string;
}

interface BrowserYouTubeTabState {
  viewMode: 'browse' | 'watch';
  mode: 'video' | 'playlist';
  query: string;
  items: BrowserYouTubeItem[];
  activeEmbed: {
    id?: string;
    title: string;
    embedUrl: string;
    channel?: string;
    duration?: string;
  } | null;
  loading: boolean;
  error?: string;
}

interface BrowserSearchTabState {
  query: string;
  tab: BrowserSearchTab;
  source: string;
  overview?: BrowserSearchOverview;
  results: BrowserSearchResult[];
  videos: BrowserSearchVideoResult[];
  images: BrowserSearchImageResult[];
  loading: boolean;
  error?: string;
}

export const JarvisBrowserApp: React.FC<JarvisBrowserAppProps> = ({
  isPrivate = false,
  initialUrl,
  onOpenPrivateWindow,
  onUpdateWindowTitle,
}) => {
  const cloud = useBrowserCloudSync(isPrivate);
  const isLight = cloud.settings.theme === 'light';
  const adShieldEnabled = cloud.settings.enabledExtensions.includes('ad_shield');
  const summarizerEnabled = cloud.settings.enabledExtensions.includes('jarvis_summarizer');
  const focusDimmerEnabled = cloud.settings.enabledExtensions.includes('focus_dimmer');
  const notesEnabled = cloud.settings.enabledExtensions.includes('quick_notes');

  // Tabs & Tab Groups
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [
    createBrowserTab(initialUrl || BROWSER_NEWTAB_URL, null, 'tab-initial'),
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-initial');
  const [tabGroups, setTabGroups] = useState<BrowserTabGroup[]>([]);

  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  );

  // Omnibox & New Tab input
  const [omniboxValue, setOmniboxValue] = useState<string>(() =>
    activeTab.url === BROWSER_NEWTAB_URL ? '' : activeTab.url
  );
  const [newTabInput, setNewTabInput] = useState('');

  // Chrome UI Overlays
  const [sidePanel, setSidePanel] = useState<BrowserSidePanelTab | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [tabContextMenu, setTabContextMenu] = useState<{ tabId: string } | null>(null);

  // Find on Page
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findCurrentIndex, setFindCurrentIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  // Translate
  const [translateBarOpen, setTranslateBarOpen] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>('Spanish');
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [translatedByTab, setTranslatedByTab] = useState<Record<string, TranslatedOverlay>>({});

  // Live Search Results & Reader View Caches (keyed by tabId)
  const [searchResultsByTab, setSearchResultsByTab] = useState<Record<string, BrowserSearchTabState>>({});
  const [searchPageInput, setSearchPageInput] = useState('');
  const [overviewCollapsed, setOverviewCollapsed] = useState(false);
  const [selectedSearchImage, setSelectedSearchImage] = useState<BrowserSearchImageResult | null>(null);
  const [brokenImageUrls, setBrokenImageUrls] = useState<Record<string, true>>({});
  const [readerDocsByTab, setReaderDocsByTab] = useState<
    Record<string, { url: string; doc: ReaderPageDocument | null; loading: boolean; error?: string }>
  >({});
  const [reloadNonce, setReloadNonce] = useState(0);

  // JARVIS Page Summarizer Extension state
  const [summaryByTab, setSummaryByTab] = useState<
    Record<string, { loading: boolean; text?: string; error?: string }>
  >({});

  // Quick Page Notes Extension state
  const [pageNotes, setPageNotes] = useState<Record<string, string>>(() =>
    isPrivate ? {} : loadPageNotes()
  );

  // In-Tab YouTube Hub state (keyed per tabId so multiple YouTube tabs stay independent)
  const [ytSearchInput, setYtSearchInput] = useState('');
  const [ytModeByTab, setYtModeByTab] = useState<Record<string, 'video' | 'playlist'>>({});
  const [ytStateByTab, setYtStateByTab] = useState<Record<string, BrowserYouTubeTabState>>({});

  const markImageBroken = useCallback((url: string) => {
    setBrokenImageUrls(prev => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  // Keep callback in a ref so parent re-renders NEVER trigger omnibox resets or infinite loops
  const onUpdateWindowTitleRef = useRef(onUpdateWindowTitle);
  onUpdateWindowTitleRef.current = onUpdateWindowTitle;

  const omniboxFocusedRef = useRef(false);

  // Sync omnibox text ONLY when switching tabs or navigating to a different URL
  useEffect(() => {
    if (omniboxFocusedRef.current) return;
    const query = extractSearchQueryFromUrl(activeTab.url);
    setOmniboxValue(
      activeTab.url === BROWSER_NEWTAB_URL ? '' : query ? query : activeTab.url
    );
  }, [activeTab.id, activeTab.url]);

  // Sync Helios window title separately without touching omnibox input
  useEffect(() => {
    const prefix = isPrivate ? 'JARVIS Private Browser' : 'JARVIS Browser';
    onUpdateWindowTitleRef.current?.(
      activeTab.title && activeTab.title !== 'New Tab'
        ? `${activeTab.title} — ${prefix}`
        : prefix
    );
  }, [activeTab.title, isPrivate]);

  // Keyboard shortcuts inside browser (Ctrl+F, Escape)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setFindOpen(true);
      setTimeout(() => findInputRef.current?.focus(), 30);
    } else if (e.key === 'Escape') {
      if (findOpen) setFindOpen(false);
      if (menuOpen) setMenuOpen(false);
      if (accountOpen) setAccountOpen(false);
      if (tabContextMenu) setTabContextMenu(null);
    }
  };

  // Navigate active tab
  const navigateActiveTab = useCallback(
    (input: string, forcedMode?: BrowserRenderMode, inNewTab: boolean = false) => {
      setMenuOpen(false);
      setAccountOpen(false);
      setTabContextMenu(null);

      if (inNewTab) {
        const nextTab = createBrowserTab(input, activeTab.groupId);
        if (forcedMode) nextTab.renderMode = forcedMode;
        setTabs(prev => [...prev, nextTab]);
        setActiveTabId(nextTab.id);
        return;
      }

      setTabs(prev =>
        prev.map(t => (t.id === activeTab.id ? navigateTabTo(t, input, forcedMode) : t))
      );
      // Clear translation & summary for navigated tab
      setTranslatedByTab(prev => {
        const copy = { ...prev };
        delete copy[activeTab.id];
        return copy;
      });
      setSummaryByTab(prev => {
        const copy = { ...prev };
        delete copy[activeTab.id];
        return copy;
      });
    },
    [activeTab.groupId, activeTab.id]
  );

  // Bridge link clicks, title updates, and Reader switch requests from /api/browser/proxy iframes
  const navigateActiveTabRef = useRef(navigateActiveTab);
  navigateActiveTabRef.current = navigateActiveTab;
  const activeTabIdRef = useRef(activeTab.id);
  activeTabIdRef.current = activeTab.id;

  useEffect(() => {
    const handleProxyMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'jarvis-browser-navigate' && typeof data.url === 'string') {
        omniboxFocusedRef.current = false;
        navigateActiveTabRef.current(data.url);
      } else if (data.type === 'jarvis-browser-switch-reader') {
        const currentId = activeTabIdRef.current;
        setTabs(prev =>
          prev.map(t => (t.id === currentId ? { ...t, renderMode: 'reader', isLoading: true } : t))
        );
      } else if (data.type === 'jarvis-browser-title' && typeof data.title === 'string') {
        const currentId = activeTabIdRef.current;
        const cleanTitle = data.title.trim().slice(0, 120);
        if (cleanTitle) {
          setTabs(prev =>
            prev.map(t => (t.id === currentId && t.title !== cleanTitle ? { ...t, title: cleanTitle } : t))
          );
        }
      }
    };

    window.addEventListener('message', handleProxyMessage);
    return () => window.removeEventListener('message', handleProxyMessage);
  }, []);

  // Fetch Search Results, YouTube Hub, or Reader View whenever active tab's URL / mode / reload changes
  const lastLoggedVisitRef = useRef<string>('');
  const recordHistoryVisitRef = useRef(cloud.recordHistoryVisit);
  recordHistoryVisitRef.current = cloud.recordHistoryVisit;
  const activeIsYouTube = useMemo(() => isYouTubeWebUrl(activeTab.url), [activeTab.url]);
  const activeTabYtMode = ytModeByTab[activeTab.id];

  const updateTabIfChanged = useCallback(
    (tabId: string, patch: Partial<Pick<BrowserTab, 'isLoading' | 'title' | 'renderMode'>>) => {
      setTabs(prev => {
        const target = prev.find(t => t.id === tabId);
        if (!target) return prev;
        const unchanged =
          (patch.isLoading === undefined || target.isLoading === patch.isLoading) &&
          (patch.title === undefined || target.title === patch.title) &&
          (patch.renderMode === undefined || target.renderMode === patch.renderMode);
        if (unchanged) return prev;
        return prev.map(t => (t.id === tabId ? { ...t, ...patch } : t));
      });
    },
    []
  );

  useEffect(() => {
    const tabId = activeTab.id;
    const url = activeTab.url;
    const resolved = resolveOmniboxInput(url);

    if (resolved.kind === 'newtab') {
      updateTabIfChanged(tabId, { isLoading: false, title: 'New Tab' });
      return;
    }

    let cancelled = false;

    const fetchJsonWithRetry = async (endpoint: string) => {
      try {
        const r = await fetch(endpoint);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
      } catch {
        await new Promise(res => setTimeout(res, 350));
        const r2 = await fetch(endpoint);
        const data2 = await r2.json();
        if (!r2.ok) throw new Error(data2?.error || `HTTP ${r2.status}`);
        return data2;
      }
    };

    if (resolved.kind === 'search' && resolved.searchQuery) {
      const q = resolved.searchQuery;
      const searchTab: BrowserSearchTab = resolved.searchTab || extractSearchTabFromUrl(url);
      setSearchPageInput(q);
      setSelectedSearchImage(null);
      setOverviewCollapsed(false);

      setSearchResultsByTab(prev => ({
        ...prev,
        [tabId]: {
          query: q,
          tab: searchTab,
          source: 'Google Search',
          overview: prev[tabId]?.query === q && prev[tabId]?.tab === searchTab ? prev[tabId].overview : undefined,
          results: prev[tabId]?.query === q && prev[tabId]?.tab === searchTab ? prev[tabId].results : [],
          videos: prev[tabId]?.query === q && prev[tabId]?.tab === searchTab ? prev[tabId].videos : [],
          images: prev[tabId]?.query === q && prev[tabId]?.tab === searchTab ? prev[tabId].images : [],
          loading: true,
        },
      }));

      fetchJsonWithRetry(`/api/browser/search?q=${encodeURIComponent(q)}&tab=${encodeURIComponent(searchTab)}`)
        .then(data => {
          if (cancelled) return;
          setSearchResultsByTab(prev => ({
            ...prev,
            [tabId]: {
              query: q,
              tab: searchTab,
              source: data.source || 'Google Search',
              overview: data.overview && typeof data.overview.text === 'string' ? data.overview : undefined,
              results: Array.isArray(data.results) ? data.results : [],
              videos: Array.isArray(data.videos) ? data.videos : [],
              images: Array.isArray(data.images) ? data.images : [],
              loading: false,
              error: data.error,
            },
          }));
          updateTabIfChanged(tabId, { isLoading: false, title: `${q} — Google Search` });
          const visitKey = `${tabId}:${url}`;
          if (lastLoggedVisitRef.current !== visitKey) {
            lastLoggedVisitRef.current = visitKey;
            void recordHistoryVisitRef.current(`${q} — Google Search`, url);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setSearchResultsByTab(prev => ({
            ...prev,
            [tabId]: {
              query: q,
              tab: searchTab,
              source: 'Search',
              results: [],
              videos: [],
              images: [],
              loading: false,
              error: 'Unable to reach live search right now. Check your connection and try again.',
            },
          }));
          updateTabIfChanged(tabId, { isLoading: false });
        });

      return () => {
        cancelled = true;
      };
    }

    // Special handling for YouTube URLs inside JARVIS Browser
    // Browse-First: homepage & search queries show a clickable video grid first (NO auto-play).
    // Direct /watch?v= or /playlist?list= URLs open straight into Watch View.
    if (isYouTubeWebUrl(url)) {
      const ytIds = extractYouTubeIdsFromUrl(url);
      let ytQuery = '';
      try {
        ytQuery = new URL(url).searchParams.get('search_query') || '';
      } catch {
        ytQuery = '';
      }
      const mode: 'video' | 'playlist' =
        ytIds?.playlistId && !ytIds?.videoId
          ? 'playlist'
          : activeTabYtMode || (/\bplaylist\b/i.test(ytQuery) ? 'playlist' : 'video');

      setYtSearchInput(ytQuery);

      const directEmbed = ytIds?.videoId
        ? {
            id: ytIds.videoId,
            title: 'YouTube Video',
            embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(ytIds.videoId)}?autoplay=1&rel=0`,
            channel: 'YouTube',
          }
        : ytIds?.playlistId
        ? {
            id: ytIds.playlistId,
            title: 'YouTube Playlist',
            embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(ytIds.playlistId)}&autoplay=1&rel=0`,
            channel: 'YouTube Playlist',
          }
        : null;

      const nextViewMode: 'browse' | 'watch' = directEmbed ? 'watch' : 'browse';

      setYtStateByTab(prev => ({
        ...prev,
        [tabId]: {
          viewMode: nextViewMode,
          mode,
          query: ytQuery,
          items: prev[tabId]?.query === ytQuery && prev[tabId]?.mode === mode ? prev[tabId].items : [],
          activeEmbed: directEmbed,
          loading: true,
        },
      }));

      const apiQuery = ytQuery || (mode === 'playlist' ? 'any playlist' : 'featured');
      fetchJsonWithRetry(`/api/media/youtube-resolve?q=${encodeURIComponent(apiQuery)}&mode=${mode}`)
        .then(data => {
          if (cancelled) return;
          const items: BrowserYouTubeItem[] = Array.isArray(data.items) ? data.items : [];
          const matchedDirect = directEmbed?.id
            ? items.find(it => it.id === directEmbed.id)
            : undefined;
          const resolvedDirect = matchedDirect
            ? {
                id: matchedDirect.id,
                title: matchedDirect.title,
                embedUrl: matchedDirect.embedUrl,
                channel: matchedDirect.channel,
                duration: matchedDirect.duration,
              }
            : directEmbed;

          setYtStateByTab(prev => ({
            ...prev,
            [tabId]: {
              viewMode: resolvedDirect ? 'watch' : 'browse',
              mode,
              query: ytQuery,
              items,
              // Strictly keep activeEmbed null in browse mode so videos NEVER auto-play before clicking
              activeEmbed: resolvedDirect,
              loading: false,
            },
          }));
          updateTabIfChanged(tabId, {
            isLoading: false,
            title: resolvedDirect?.title
              ? `${resolvedDirect.title} — YouTube`
              : ytQuery
              ? `${ytQuery} — YouTube`
              : 'YouTube',
          });
        })
        .catch(() => {
          if (cancelled) return;
          setYtStateByTab(prev => ({
            ...prev,
            [tabId]: {
              viewMode: directEmbed ? 'watch' : 'browse',
              mode,
              query: ytQuery,
              items: prev[tabId]?.items || [],
              activeEmbed: directEmbed,
              loading: false,
              error: 'Could not load YouTube results right now. Try searching above or reloading.',
            },
          }));
          updateTabIfChanged(tabId, { isLoading: false, title: 'YouTube' });
        });

      const visitKey = `${tabId}:${url}`;
      if (lastLoggedVisitRef.current !== visitKey) {
        lastLoggedVisitRef.current = visitKey;
        void recordHistoryVisitRef.current(ytQuery ? `${ytQuery} — YouTube` : 'YouTube', url);
      }

      return () => {
        cancelled = true;
      };
    }

    // External Web URL
    if (activeTab.renderMode === 'reader') {
      setReaderDocsByTab(prev => ({
        ...prev,
        [tabId]: { url, doc: prev[tabId]?.url === url ? prev[tabId].doc : null, loading: true },
      }));

      fetchJsonWithRetry(
        `/api/browser/fetch-page?url=${encodeURIComponent(url)}&adShield=${adShieldEnabled ? '1' : '0'}`
      )
        .then(docData => {
          if (cancelled) return;
          setReaderDocsByTab(prev => ({
            ...prev,
            [tabId]: { url, doc: docData as ReaderPageDocument, loading: false },
          }));
          const pageTitle = docData.title || formatDisplayHost(url) || url;
          setTabs(prev =>
            prev.map(t => (t.id === tabId ? { ...t, isLoading: false, title: pageTitle } : t))
          );
          const visitKey = `${tabId}:${url}`;
          if (lastLoggedVisitRef.current !== visitKey) {
            lastLoggedVisitRef.current = visitKey;
            void recordHistoryVisitRef.current(pageTitle, url);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setReaderDocsByTab(prev => ({
            ...prev,
            [tabId]: {
              url,
              doc: null,
              loading: false,
              error: `Could not reach ${formatDisplayHost(url) || url} in Reader View. Try switching to Live View or searching via JARVIS Web.`,
            },
          }));
          setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, isLoading: false } : t)));
        });
    } else {
      // Live Proxy View mode
      updateTabIfChanged(tabId, { isLoading: false });
      const visitKey = `${tabId}:${url}`;
      if (lastLoggedVisitRef.current !== visitKey) {
        lastLoggedVisitRef.current = visitKey;
        void recordHistoryVisitRef.current(activeTab.title || formatDisplayHost(url) || url, url);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [activeTab.id, activeTab.url, activeTab.renderMode, reloadNonce, adShieldEnabled, activeTabYtMode, updateTabIfChanged]);

  // Tab Controls
  const handleNewTab = (url: string = BROWSER_NEWTAB_URL, groupId: string | null = null) => {
    const next = createBrowserTab(url, groupId);
    setTabs(prev => [...prev, next]);
    setActiveTabId(next.id);
    setMenuOpen(false);
  };

  const handleCloseTab = (tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) {
        const fresh = createBrowserTab(BROWSER_NEWTAB_URL);
        setActiveTabId(fresh.id);
        return [fresh];
      }
      const idx = prev.findIndex(t => t.id === tabId);
      const filtered = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        const nextActive = filtered[Math.max(0, idx - 1)] || filtered[0];
        setActiveTabId(nextActive.id);
      }
      return filtered;
    });
  };

  const handleDuplicateTab = (tabId: string) => {
    const src = tabs.find(t => t.id === tabId);
    if (!src) return;
    const dup = createBrowserTab(src.url, src.groupId);
    dup.title = src.title;
    dup.renderMode = src.renderMode;
    setTabs(prev => [...prev, dup]);
    setActiveTabId(dup.id);
    setTabContextMenu(null);
  };

  const handleCreateTabGroup = (name: string, color: TabGroupColor, initialTabId?: string) => {
    const grp = createTabGroup(name, color);
    setTabGroups(prev => [...prev, grp]);
    if (initialTabId) {
      setTabs(prev => assignTabToGroup(prev, initialTabId, grp.id));
    }
  };

  const handleDeleteTabGroup = (groupId: string) => {
    const next = removeTabGroupAndUngroup(tabGroups, tabs, groupId);
    setTabGroups(next.groups);
    setTabs(next.tabs);
  };

  const handleBack = () => {
    setTabs(prev => prev.map(t => (t.id === activeTab.id ? goBackInTab(t) : t)));
  };

  const handleForward = () => {
    setTabs(prev => prev.map(t => (t.id === activeTab.id ? goForwardInTab(t) : t)));
  };

  const handleReload = () => {
    setReloadNonce(n => n + 1);
  };

  const handleToggleRenderMode = () => {
    const nextMode: BrowserRenderMode = activeTab.renderMode === 'reader' ? 'embed' : 'reader';
    setTabs(prev =>
      prev.map(t => (t.id === activeTab.id ? { ...t, renderMode: nextMode, isLoading: true } : t))
    );
  };

  // Bookmark check for current URL
  const existingBookmark = useMemo(
    () => cloud.bookmarks.find(b => b.url === activeTab.url) || null,
    [cloud.bookmarks, activeTab.url]
  );

  const handleToggleBookmarkCurrent = () => {
    if (activeTab.url === BROWSER_NEWTAB_URL) return;
    if (existingBookmark) {
      void cloud.removeBookmark(existingBookmark.id);
    } else {
      void cloud.addBookmark(activeTab.title || activeTab.url, activeTab.url, 'Bookmarks Bar');
    }
  };

  // Active Page Data (Search or Reader)
  const resolvedActive = useMemo(() => resolveOmniboxInput(activeTab.url), [activeTab.url]);
  const activeSearchState = searchResultsByTab[activeTab.id];
  const activeReaderState = readerDocsByTab[activeTab.id];
  const activeYouTubeState = ytStateByTab[activeTab.id];
  const activeTranslation = translatedByTab[activeTab.id];
  const activeSummary = summaryByTab[activeTab.id];

  const handleSelectYouTubeItem = (item: BrowserYouTubeItem) => {
    setYtStateByTab(prev => {
      const curr = prev[activeTab.id];
      return {
        ...prev,
        [activeTab.id]: {
          viewMode: 'watch',
          mode: curr?.mode || 'video',
          query: curr?.query || '',
          items: curr?.items || [item],
          activeEmbed: {
            id: item.id,
            title: item.title,
            embedUrl: item.embedUrl,
            channel: item.channel,
            duration: item.duration,
          },
          loading: false,
        },
      };
    });
    updateTabIfChanged(activeTab.id, { title: `${item.title} — YouTube` });
  };

  const handleBackToYouTubeResults = () => {
    setYtStateByTab(prev => {
      const curr = prev[activeTab.id];
      if (!curr) return prev;
      return {
        ...prev,
        [activeTab.id]: {
          ...curr,
          viewMode: 'browse',
          activeEmbed: null,
        },
      };
    });
    const q = activeYouTubeState?.query;
    updateTabIfChanged(activeTab.id, { title: q ? `${q} — YouTube` : 'YouTube' });
  };

  const handleNextYouTubeItem = () => {
    const items = activeYouTubeState?.items || [];
    if (items.length <= 1) return;
    const currIdx = items.findIndex(it => it.embedUrl === activeYouTubeState?.activeEmbed?.embedUrl);
    const nextItem = items[(currIdx + 1) % items.length];
    if (nextItem) handleSelectYouTubeItem(nextItem);
  };

  // Translate Action
  const handleRunTranslate = async () => {
    setTranslateError(null);
    let titleToTranslate = activeTab.title;
    let blocksToTranslate: ReaderPageBlock[] = [];

    if (resolvedActive.kind === 'search' && activeSearchState?.results?.length) {
      titleToTranslate = `Search Results: ${activeSearchState.query}`;
      blocksToTranslate = activeSearchState.results.map(r => ({
        type: 'paragraph',
        text: `${r.title} — ${r.snippet}`,
      }));
    } else if (resolvedActive.kind === 'web' && activeReaderState?.doc?.blocks?.length) {
      titleToTranslate = activeReaderState.doc.title;
      blocksToTranslate = activeReaderState.doc.blocks.slice(0, 24);
    } else if (resolvedActive.kind === 'web' && activeTab.renderMode === 'embed') {
      // Switch to Reader View automatically so page text can be translated in-tab
      handleToggleRenderMode();
      setTranslateError('Switched to Reader View to extract text—click Translate again once loaded.');
      return;
    } else {
      setTranslateError('Open a web page or search results first to translate.');
      return;
    }

    setTranslating(true);
    try {
      const res = await fetch('/api/browser/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleToTranslate,
          blocks: blocksToTranslate,
          targetLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Translation failed');

      setTranslatedByTab(prev => ({
        ...prev,
        [activeTab.id]: {
          url: activeTab.url,
          targetLanguage,
          title: data.title || titleToTranslate,
          blocks: data.blocks || blocksToTranslate,
        },
      }));
    } catch (err: any) {
      setTranslateError(err?.message || 'Unable to translate page.');
    } finally {
      setTranslating(false);
    }
  };

  const handleRevertTranslation = () => {
    setTranslatedByTab(prev => {
      const copy = { ...prev };
      delete copy[activeTab.id];
      return copy;
    });
    setTranslateError(null);
  };

  // JARVIS Page Summarizer Extension Action
  const handleTriggerSummarize = async () => {
    let textContent = '';
    if (resolvedActive.kind === 'search' && activeSearchState?.results?.length) {
      textContent = activeSearchState.results.map(r => `${r.title}: ${r.snippet}`).join('\n');
    } else if (activeReaderState?.doc) {
      textContent = activeReaderState.doc.blocks.map(b => b.text).join('\n');
    } else if (resolvedActive.kind === 'web' && activeTab.renderMode === 'embed') {
      handleToggleRenderMode();
      setSummaryByTab(prev => ({
        ...prev,
        [activeTab.id]: {
          loading: false,
          error: 'Switched to Reader View—click Summarize again once text loads.',
        },
      }));
      return;
    } else {
      setSummaryByTab(prev => ({
        ...prev,
        [activeTab.id]: {
          loading: false,
          error: 'Open a web page or search results to summarize.',
        },
      }));
      return;
    }

    setSummaryByTab(prev => ({ ...prev, [activeTab.id]: { loading: true } }));
    try {
      const res = await fetch('/api/browser/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeTab.title,
          url: activeTab.url,
          content: textContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summarization failed');
      setSummaryByTab(prev => ({
        ...prev,
        [activeTab.id]: { loading: false, text: data.summary },
      }));
    } catch (err: any) {
      setSummaryByTab(prev => ({
        ...prev,
        [activeTab.id]: { loading: false, error: err?.message || 'Could not summarize page.' },
      }));
    }
  };

  // Find on Page Match Counting
  const searchableStrings = useMemo(() => {
    if (resolvedActive.kind === 'search' && activeSearchState) {
      if (activeTranslation) {
        return [activeTranslation.title, ...activeTranslation.blocks.map(b => b.text)];
      }
      const strings: string[] = [];
      if (activeSearchState.overview?.text) strings.push(activeSearchState.overview.text);
      for (const r of activeSearchState.results || []) {
        strings.push(r.title, r.displayUrl, r.snippet);
      }
      for (const v of activeSearchState.videos || []) {
        strings.push(v.title, v.channel);
      }
      for (const img of activeSearchState.images || []) {
        strings.push(img.title, img.displayDomain);
      }
      return strings;
    }
    if (resolvedActive.kind === 'web' && activeTab.renderMode === 'reader' && activeReaderState?.doc) {
      const doc = activeReaderState.doc;
      if (activeTranslation) {
        return [activeTranslation.title, ...activeTranslation.blocks.map(b => b.text)];
      }
      return [doc.title, doc.excerpt || '', ...doc.blocks.map(b => b.text)];
    }
    if (resolvedActive.kind === 'newtab') {
      return ['JARVIS Browser', ...cloud.bookmarks.map(b => b.title)];
    }
    return [];
  }, [resolvedActive.kind, activeSearchState, activeReaderState, activeTab.renderMode, activeTranslation, cloud.bookmarks]);

  const totalFindMatches = useMemo(
    () => (findOpen && findQuery ? countFindMatchesInStrings(searchableStrings, findQuery, findCaseSensitive) : 0),
    [findOpen, findQuery, findCaseSensitive, searchableStrings]
  );

  useEffect(() => {
    if (findCurrentIndex > 0 && findCurrentIndex >= totalFindMatches) {
      setFindCurrentIndex(0);
    }
  }, [totalFindMatches, findCurrentIndex]);

  useEffect(() => {
    if (!findOpen || totalFindMatches === 0) return;
    const el = containerRef.current?.querySelector(`[data-find-match="${findCurrentIndex}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [findCurrentIndex, findOpen, totalFindMatches]);

  // Helper to render text with Find-on-Page highlights
  const matchCursorRef = useRef(0);
  matchCursorRef.current = 0;

  const renderHighlightedText = (text: string) => {
    if (!findOpen || !findQuery) return text;
    const { segments, matchCount } = splitTextForFind(
      text,
      findQuery,
      findCaseSensitive,
      matchCursorRef.current
    );
    matchCursorRef.current += matchCount;
    if (matchCount === 0) return text;

    return segments.map((seg, i) =>
      seg.isMatch ? (
        <mark
          key={i}
          data-find-match={seg.matchIndex}
          className={
            seg.matchIndex === findCurrentIndex
              ? 'bg-amber-400 text-slate-950 rounded-xs px-0.5 font-semibold'
              : 'bg-cyan-400/35 text-inherit rounded-xs px-0.5'
          }
        >
          {seg.text}
        </mark>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      )
    );
  };

  // Clean Isolated Print Handler
  const handlePrintActiveTab = () => {
    setMenuOpen(false);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    let bodyHtml = '';
    const title = activeTranslation?.title || activeReaderState?.doc?.title || activeTab.title || 'JARVIS Browser Page';

    if (resolvedActive.kind === 'search' && activeSearchState?.results) {
      bodyHtml = activeSearchState.results
        .map(
          r =>
            `<div style="margin-bottom:14px;">
              <div style="font-weight:700;font-size:15px;">${escapeHtml(r.title)}</div>
              <div style="font-size:11px;color:#0e7490;">${escapeHtml(r.url)}</div>
              <p style="margin:4px 0 0;font-size:13px;color:#334155;">${escapeHtml(r.snippet)}</p>
            </div>`
        )
        .join('');
    } else if (activeTranslation?.blocks?.length) {
      bodyHtml = activeTranslation.blocks
        .map(b =>
          b.type === 'heading'
            ? `<h2 style="margin:18px 0 8px;font-size:17px;">${escapeHtml(b.text)}</h2>`
            : `<p style="margin:0 0 10px;line-height:1.6;">${escapeHtml(b.text)}</p>`
        )
        .join('');
    } else if (activeReaderState?.doc?.blocks?.length) {
      bodyHtml = activeReaderState.doc.blocks
        .map(b =>
          b.type === 'heading'
            ? `<h2 style="margin:18px 0 8px;font-size:17px;">${escapeHtml(b.text)}</h2>`
            : b.type === 'quote'
            ? `<blockquote style="border-left:3px solid #0891b2;padding-left:12px;color:#475569;">${escapeHtml(b.text)}</blockquote>`
            : `<p style="margin:0 0 10px;line-height:1.6;">${escapeHtml(b.text)}</p>`
        )
        .join('');
    } else {
      bodyHtml = `<p style="line-height:1.6;">Active Tab URL: ${escapeHtml(activeTab.url)}</p><p>Switch to Reader View to extract full printable article text for external websites.</p>`;
    }

    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 28px 36px; max-width: 780px; margin: 0 auto; }
          header { border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 20px; }
          h1 { margin: 0 0 4px; font-size: 22px; }
          .meta { font-size: 12px; color: #64748b; }
        </style>
      </head><body>
        <header>
          <h1>${escapeHtml(title)}</h1>
          <div class="meta">${escapeHtml(activeTab.url)} · Printed from JARVISOS Browser</div>
        </header>
        <main>${bodyHtml}</main>
      </body></html>`);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) document.body.removeChild(iframe);
          }, 1200);
        }
      }, 150);
    }
  };

  // Page Notes update
  const handleChangePageNote = (val: string) => {
    setPageNotes(prev => {
      const next = { ...prev, [activeTab.url]: val };
      if (!isPrivate) savePageNotes(next);
      return next;
    });
  };

  // Scoped Theme Tokens (STRICTLY inside this browser window only!)
  const rootTheme = isLight
    ? 'bg-slate-50 text-slate-900'
    : isPrivate
    ? 'bg-[#0b0816] text-slate-100'
    : 'bg-slate-950 text-slate-100';

  const tabStripBg = isLight
    ? 'bg-slate-200/90 border-slate-300'
    : isPrivate
    ? 'bg-[#130e24] border-violet-500/25'
    : 'bg-slate-900/95 border-cyan-500/20';

  const toolbarBg = isLight
    ? 'bg-white border-slate-200'
    : isPrivate
    ? 'bg-[#17112b] border-violet-500/25'
    : 'bg-slate-900/80 border-cyan-500/20';

  const omniboxBg = isLight
    ? 'bg-slate-100 border-slate-300 text-slate-900 focus-within:bg-white focus-within:border-cyan-600'
    : isPrivate
    ? 'bg-[#0c0818] border-violet-500/30 text-slate-100 focus-within:border-violet-400'
    : 'bg-slate-950 border-slate-700/80 text-slate-100 focus-within:border-cyan-400';

  const iconBtnClass = isLight
    ? 'p-1.5 rounded-md text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 disabled:opacity-35 transition-colors shrink-0'
    : 'p-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-cyan-200 disabled:opacity-35 transition-colors shrink-0';

  const menuPanelBg = isLight
    ? 'bg-white border-slate-200 text-slate-800 shadow-xl'
    : 'bg-slate-900 border-cyan-500/30 text-slate-100 shadow-2xl';

  // Organize Tab Strip Render List (groups with member tabs + ungrouped tabs)
  const renderedTabStrip = useMemo(() => {
    const items: Array<
      | { kind: 'group_header'; group: BrowserTabGroup; count: number }
      | { kind: 'tab'; tab: BrowserTab; group: BrowserTabGroup | null }
    > = [];

    const visitedGroupIds = new Set<string>();
    for (const tab of tabs) {
      if (tab.groupId) {
        const grp = tabGroups.find(g => g.id === tab.groupId);
        if (grp) {
          if (!visitedGroupIds.has(grp.id)) {
            visitedGroupIds.add(grp.id);
            const members = tabs.filter(t => t.groupId === grp.id);
            items.push({ kind: 'group_header', group: grp, count: members.length });
            if (!grp.collapsed) {
              for (const m of members) {
                items.push({ kind: 'tab', tab: m, group: grp });
              }
            }
          }
          continue;
        }
      }
      items.push({ kind: 'tab', tab, group: null });
    }
    return items;
  }, [tabs, tabGroups]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={`h-full w-full flex flex-col overflow-hidden outline-none select-text ${rootTheme}`}
    >
      {/* 1. CHROME TAB STRIP WITH TAB GROUPS */}
      <div className={`flex items-center gap-1 px-2 pt-1.5 pb-0 border-b overflow-x-auto shrink-0 ${tabStripBg}`}>
        {isPrivate && (
          <div className="flex items-center gap-1.5 px-2 py-1 mb-1 rounded-md bg-violet-600/25 border border-violet-400/40 text-violet-200 text-[10px] font-mono font-semibold whitespace-nowrap shrink-0">
            <EyeOff className="w-3 h-3" />
            PRIVATE
          </div>
        )}

        {renderedTabStrip.map(entry => {
          if (entry.kind === 'group_header') {
            const palette = GROUP_BADGE_CLASSES[entry.group.color];
            return (
              <button
                key={`grp-${entry.group.id}`}
                type="button"
                onClick={() => setTabGroups(prev => toggleTabGroupCollapsed(prev, entry.group.id))}
                title={`${entry.group.name} (${entry.count} tabs) — Click to ${entry.group.collapsed ? 'expand' : 'collapse'}`}
                className={`flex items-center gap-1 px-2 py-1 mb-1 rounded-md border text-[10px] font-semibold whitespace-nowrap shrink-0 transition-opacity ${
                  isLight ? palette.light : palette.dark
                }`}
              >
                <span>{entry.group.name}</span>
                <span className="opacity-75 font-mono tabular-nums">{entry.count}</span>
              </button>
            );
          }

          const { tab, group } = entry;
          const isActive = tab.id === activeTab.id;
          const groupBar = group ? GROUP_BADGE_CLASSES[group.color].bar : null;

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              onContextMenu={e => {
                e.preventDefault();
                setTabContextMenu({ tabId: tab.id });
              }}
              className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-lg text-xs cursor-pointer max-w-[190px] min-w-[104px] shrink-0 transition-colors border-t border-x ${
                isActive
                  ? isLight
                    ? 'bg-white border-slate-300 text-slate-900 font-medium'
                    : isPrivate
                    ? 'bg-[#17112b] border-violet-500/35 text-violet-100 font-medium'
                    : 'bg-slate-900 border-cyan-500/35 text-cyan-100 font-medium'
                  : isLight
                  ? 'bg-slate-200/60 border-transparent text-slate-600 hover:bg-slate-100'
                  : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              {groupBar && (
                <span className={`absolute top-0 left-1.5 right-1.5 h-[2px] rounded-full ${groupBar}`} />
              )}
              {tab.isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
              ) : (
                <Globe className="w-3 h-3 opacity-70 shrink-0" />
              )}
              <span className="truncate flex-1">{tab.title || 'New Tab'}</span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                aria-label={`Close ${tab.title}`}
                className={`p-0.5 rounded opacity-70 hover:opacity-100 ${
                  isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-700'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => handleNewTab()}
          title="New Tab"
          aria-label="New Tab"
          className={`p-1.5 mb-1 rounded-md shrink-0 transition-colors ${
            isLight
              ? 'text-slate-600 hover:bg-slate-300/70'
              : 'text-slate-400 hover:bg-slate-800 hover:text-cyan-300'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="ml-auto flex items-center gap-1 pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setSidePanel(p => (p === 'groups' ? null : 'groups'))}
            title="Manage Tab Groups"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap ${
              sidePanel === 'groups'
                ? isLight
                  ? 'bg-cyan-600/15 text-cyan-800'
                  : 'bg-cyan-500/20 text-cyan-300'
                : isLight
                ? 'text-slate-600 hover:bg-slate-300/60'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3 h-3" />
            Groups
          </button>
        </div>
      </div>

      {/* Quick Tab Context Popover (Right-click on any tab) */}
      {tabContextMenu && (
        <div
          className={`px-3 py-1.5 border-b flex items-center gap-2 text-xs flex-wrap shrink-0 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-cyan-500/20'
          }`}
        >
          <span className="font-mono text-[10px] uppercase opacity-70">Tab Actions:</span>
          <button
            type="button"
            onClick={() => handleDuplicateTab(tabContextMenu.tabId)}
            className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              handleCreateTabGroup('Group ' + (tabGroups.length + 1), 'cyan', tabContextMenu.tabId);
              setTabContextMenu(null);
            }}
            className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
          >
            Add to New Group
          </button>
          {tabGroups.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setTabs(prev => assignTabToGroup(prev, tabContextMenu.tabId, g.id));
                setTabContextMenu(null);
              }}
              className="px-2 py-0.5 rounded border border-slate-600/50 hover:border-cyan-400"
            >
              Move to {g.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setTabs(prev => assignTabToGroup(prev, tabContextMenu.tabId, null));
              setTabContextMenu(null);
            }}
            className="px-2 py-0.5 rounded text-slate-400 hover:text-slate-200"
          >
            Ungroup
          </button>
          <button
            type="button"
            onClick={() => setTabContextMenu(null)}
            className="ml-auto p-0.5 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. NAVIGATION & OMNIBOX TOOLBAR */}
      <div className={`relative flex items-center gap-1.5 px-2.5 py-1.5 border-b shrink-0 ${toolbarBg}`}>
        {/* Back / Forward / Reload / Home */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            disabled={!canTabGoBack(activeTab)}
            title="Back"
            aria-label="Back"
            className={iconBtnClass}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleForward}
            disabled={!canTabGoForward(activeTab)}
            title="Forward"
            aria-label="Forward"
            className={iconBtnClass}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleReload}
            title="Reload"
            aria-label="Reload"
            className={iconBtnClass}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeTab.isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => navigateActiveTab(BROWSER_NEWTAB_URL)}
            title="Home (New Tab)"
            aria-label="Home"
            className={iconBtnClass}
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Unified Omnibox */}
        <form
          onSubmit={e => {
            e.preventDefault();
            omniboxFocusedRef.current = false;
            navigateActiveTab(omniboxValue);
          }}
          className={`flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${omniboxBg}`}
        >
          {resolvedActive.kind === 'web' ? (
            <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Search className="w-3.5 h-3.5 opacity-60 shrink-0" />
          )}

          <input
            type="text"
            value={omniboxValue}
            onFocus={e => {
              omniboxFocusedRef.current = true;
              e.currentTarget.select();
            }}
            onBlur={() => {
              omniboxFocusedRef.current = false;
            }}
            onChange={e => setOmniboxValue(e.target.value)}
            placeholder="Search JARVIS web or enter URL (e.g. wikipedia.org)..."
            className="flex-1 min-w-0 bg-transparent text-xs outline-none font-mono"
          />

          <button
            type="submit"
            title="Go to address or search"
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold whitespace-nowrap shrink-0 transition-colors ${
              isLight
                ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                : 'bg-cyan-500/25 text-cyan-200 hover:bg-cyan-500/40'
            }`}
          >
            Go
          </button>

          {/* Reader / Live View Switch when on an external website */}
          {resolvedActive.kind === 'web' && !activeIsYouTube && (
            <button
              type="button"
              onClick={handleToggleRenderMode}
              title={
                activeTab.renderMode === 'reader'
                  ? 'Currently in Reader View — Switch to Live Web View'
                  : 'Currently in Live Web View — Switch to Reader View'
              }
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono whitespace-nowrap shrink-0 transition-colors ${
                activeTab.renderMode === 'reader'
                  ? isLight
                    ? 'bg-cyan-600/15 text-cyan-800 border border-cyan-600/30'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35'
                  : isLight
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              {activeTab.renderMode === 'reader' ? 'Reader' : 'Live'}
            </button>
          )}

          {/* Bookmark Star */}
          {activeTab.url !== BROWSER_NEWTAB_URL && (
            <button
              type="button"
              onClick={handleToggleBookmarkCurrent}
              title={existingBookmark ? 'Remove bookmark' : 'Bookmark this page'}
              aria-label="Bookmark this page"
              className="p-0.5 rounded hover:bg-slate-500/20 shrink-0"
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  existingBookmark ? 'fill-amber-400 text-amber-400' : 'opacity-60'
                }`}
              />
            </button>
          )}
        </form>

        {/* Browser Action Icons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setFindOpen(v => !v);
              setTimeout(() => findInputRef.current?.focus(), 30);
            }}
            title="Find on page (Ctrl+F)"
            aria-label="Find on page"
            className={`${iconBtnClass} ${findOpen ? (isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300') : ''}`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setTranslateBarOpen(v => !v)}
            title="Translate page"
            aria-label="Translate page"
            className={`${iconBtnClass} ${translateBarOpen || activeTranslation ? (isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300') : ''}`}
          >
            <Languages className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handlePrintActiveTab}
            title="Print page"
            aria-label="Print page"
            className={iconBtnClass}
          >
            <Printer className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setSidePanel(p => (p === 'extensions' ? null : 'extensions'))}
            title={`Extensions (${cloud.settings.enabledExtensions.length} active)`}
            aria-label="Extensions"
            className={`${iconBtnClass} ${sidePanel === 'extensions' ? (isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300') : ''}`}
          >
            <Puzzle className="w-3.5 h-3.5" />
          </button>

          {/* Browser-Only Light / Dark Mode Switch */}
          <button
            type="button"
            onClick={() => void cloud.setTheme(isLight ? 'dark' : 'light')}
            title={isLight ? 'Switch Browser to JARVIS Dark Mode' : 'Switch Browser to Light Mode'}
            aria-label="Toggle browser light or dark mode"
            className={iconBtnClass}
          >
            {isLight ? <Moon className="w-3.5 h-3.5 text-slate-700" /> : <Sun className="w-3.5 h-3.5 text-amber-300" />}
          </button>

          {/* Google Sign-In / Profile Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAccountOpen(v => !v);
                setMenuOpen(false);
              }}
              title={cloud.user ? `Signed in as ${cloud.user.displayName || cloud.user.email}` : 'Sign in with Google'}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                cloud.user
                  ? isLight
                    ? 'bg-cyan-50 border-cyan-300 text-cyan-900'
                    : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-100'
                  : isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-cyan-500/40'
              }`}
            >
              {cloud.user?.photoURL ? (
                <img
                  src={cloud.user.photoURL}
                  alt={cloud.user.displayName || 'Profile'}
                  referrerPolicy="no-referrer"
                  className="w-4 h-4 rounded-full object-cover"
                />
              ) : (
                <LogIn className="w-3.5 h-3.5" />
              )}
              <span className="max-w-[78px] truncate">
                {cloud.user ? cloud.user.displayName?.split(' ')[0] || 'Synced' : 'Sign in'}
              </span>
            </button>

            {accountOpen && (
              <div className={`absolute right-0 mt-1.5 w-64 rounded-xl border p-3 z-50 space-y-2.5 text-xs ${menuPanelBg}`}>
                {cloud.user ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      {cloud.user.photoURL ? (
                        <img
                          src={cloud.user.photoURL}
                          alt="Google profile"
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full border border-cyan-400/40"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-cyan-500/20 flex items-center justify-center font-bold text-cyan-300">
                          {(cloud.user.displayName || cloud.user.email || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{cloud.user.displayName || 'Google User'}</div>
                        <div className="text-[11px] opacity-70 truncate">{cloud.user.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                      {isPrivate ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-violet-400" />
                          <span className="text-violet-300">Private window · Sync paused</span>
                        </>
                      ) : (
                        <>
                          <Cloud className="w-3.5 h-3.5" />
                          <span>Bookmarks & History synced</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void cloud.signOut()}
                      className="w-full py-1.5 px-3 rounded-lg border border-slate-500/30 hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/35 flex items-center justify-center gap-1.5 font-medium transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-sm">Sync JARVIS Browser</div>
                    <p className="text-[11px] opacity-75 leading-relaxed">
                      Sign in with Google to sync your bookmarks, browsing history, theme, and extensions across sessions.
                    </p>
                    <button
                      type="button"
                      onClick={() => void cloud.signIn()}
                      className={`w-full py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                        isLight
                          ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                          : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                      }`}
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Sign in with Google
                    </button>
                    <div className="flex items-center gap-1.5 text-[10px] opacity-65 font-mono">
                      <CloudOff className="w-3 h-3" />
                      Guest mode · Saved locally
                    </div>
                  </>
                )}
                {cloud.authError && (
                  <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded p-2">
                    {cloud.authError}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3-Dot Chrome Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(v => !v);
                setAccountOpen(false);
              }}
              title="Customize and control JARVIS Browser"
              aria-label="Browser menu"
              className={iconBtnClass}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className={`absolute right-0 mt-1.5 w-56 rounded-xl border py-1.5 z-50 text-xs ${menuPanelBg}`}>
                <button
                  type="button"
                  onClick={() => handleNewTab()}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-cyan-500/15"
                >
                  <Plus className="w-3.5 h-3.5 opacity-75" />
                  New Tab
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenPrivateWindow();
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-violet-500/15"
                >
                  <EyeOff className="w-3.5 h-3.5 text-violet-400" />
                  New Private Window
                </button>
                <div className="my-1 border-t border-slate-500/20" />
                <button
                  type="button"
                  onClick={() => {
                    setSidePanel('bookmarks');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-cyan-500/15"
                >
                  <Bookmark className="w-3.5 h-3.5 opacity-75" />
                  Bookmarks Manager
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void cloud.setShowBookmarksBar(!cloud.settings.showBookmarksBar);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-cyan-500/15"
                >
                  <span className="flex items-center gap-2.5">
                    <Star className="w-3.5 h-3.5 opacity-75" />
                    Bookmarks Bar
                  </span>
                  <span className="text-[10px] font-mono opacity-70">
                    {cloud.settings.showBookmarksBar ? 'ON' : 'OFF'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSidePanel('history');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-cyan-500/15"
                >
                  <Clock className="w-3.5 h-3.5 opacity-75" />
                  History
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSidePanel('extensions');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-cyan-500/15"
                >
                  <Puzzle className="w-3.5 h-3.5 opacity-75" />
                  Extensions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSidePanel('groups');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-cyan-500/15"
                >
                  <Layers className="w-3.5 h-3.5 opacity-75" />
                  Tab Groups
                </button>
                <div className="my-1 border-t border-slate-500/20" />
                <button
                  type="button"
                  onClick={() => {
                    setFindOpen(true);
                    setMenuOpen(false);
                    setTimeout(() => findInputRef.current?.focus(), 30);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-cyan-500/15"
                >
                  <span className="flex items-center gap-2.5">
                    <Search className="w-3.5 h-3.5 opacity-75" />
                    Find on Page
                  </span>
                  <span className="text-[10px] font-mono opacity-60">Ctrl+F</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTranslateBarOpen(true);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-cyan-500/15"
                >
                  <Languages className="w-3.5 h-3.5 opacity-75" />
                  Translate Page
                </button>
                <button
                  type="button"
                  onClick={handlePrintActiveTab}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2.5 hover:bg-cyan-500/15"
                >
                  <Printer className="w-3.5 h-3.5 opacity-75" />
                  Print...
                </button>
                <div className="my-1 border-t border-slate-500/20" />
                <button
                  type="button"
                  onClick={() => {
                    void cloud.setTheme(isLight ? 'dark' : 'light');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-cyan-500/15"
                >
                  <span className="flex items-center gap-2.5">
                    {isLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
                    Browser Theme
                  </span>
                  <span className="text-[10px] font-mono opacity-75">
                    {isLight ? 'Light' : 'Dark'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. BOOKMARKS BAR */}
      {cloud.settings.showBookmarksBar && (
        <div
          className={`flex items-center gap-1 px-2.5 py-1 border-b overflow-x-auto shrink-0 text-[11px] ${
            isLight
              ? 'bg-slate-100/90 border-slate-200 text-slate-700'
              : isPrivate
              ? 'bg-[#120d22] border-violet-500/20 text-slate-300'
              : 'bg-slate-950/90 border-slate-800/80 text-slate-300'
          }`}
        >
          {cloud.bookmarks.slice(0, 12).map(bm => (
            <button
              key={bm.id}
              type="button"
              onClick={() => navigateActiveTab(bm.url)}
              title={bm.url}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800 hover:text-cyan-200'
              }`}
            >
              <Globe className="w-3 h-3 opacity-65 shrink-0" />
              <span className="max-w-[120px] truncate">{bm.title}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSidePanel('bookmarks')}
            className="ml-auto px-2 py-0.5 rounded text-[10px] font-mono opacity-70 hover:opacity-100 whitespace-nowrap shrink-0"
          >
            All Bookmarks
          </button>
        </div>
      )}

      {/* 4. TRANSLATE BANNER */}
      {translateBarOpen && (
        <div
          className={`flex items-center flex-wrap gap-2 px-3 py-1.5 border-b text-xs shrink-0 ${
            isLight
              ? 'bg-cyan-50 border-cyan-200 text-slate-800'
              : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-100'
          }`}
        >
          <Languages className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-medium">Translate page to</span>
          <select
            value={targetLanguage}
            onChange={e => setTargetLanguage(e.target.value)}
            className={`px-2 py-1 rounded border text-xs outline-none ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-slate-900 border-cyan-500/35 text-slate-100'
            }`}
          >
            {TRANSLATE_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={translating}
            onClick={() => void handleRunTranslate()}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-medium text-xs transition-colors ${
              isLight
                ? 'bg-cyan-700 text-white hover:bg-cyan-800 disabled:opacity-50'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50'
            }`}
          >
            {translating && <Loader2 className="w-3 h-3 animate-spin" />}
            {translating ? 'Translating...' : 'Translate'}
          </button>

          {activeTranslation && (
            <button
              type="button"
              onClick={handleRevertTranslation}
              className="px-2 py-1 rounded border border-cyan-500/40 text-xs hover:bg-cyan-500/15"
            >
              Show Original
            </button>
          )}

          {translateError && <span className="text-[11px] text-amber-400">{translateError}</span>}

          <button
            type="button"
            onClick={() => setTranslateBarOpen(false)}
            className="ml-auto p-1 opacity-70 hover:opacity-100"
            aria-label="Close translate bar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. MAIN VIEWPORT + OPTIONAL SIDE PANEL */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <div className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
          {/* FIND ON PAGE FLOATING BAR */}
          {findOpen && (
            <div
              className={`absolute top-2.5 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-xl text-xs ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-900 border-cyan-500/40 text-slate-100'
              }`}
            >
              <input
                ref={findInputRef}
                type="text"
                value={findQuery}
                onChange={e => {
                  setFindQuery(e.target.value);
                  setFindCurrentIndex(0);
                }}
                placeholder="Find on page..."
                className="w-40 bg-transparent text-xs outline-none"
              />
              <span className="text-[11px] font-mono tabular-nums opacity-70 min-w-[42px] text-center">
                {findQuery
                  ? totalFindMatches > 0
                    ? `${findCurrentIndex + 1}/${totalFindMatches}`
                    : '0/0'
                  : ''}
              </span>
              <button
                type="button"
                onClick={() => setFindCaseSensitive(v => !v)}
                title="Match case"
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${
                  findCaseSensitive
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                Aa
              </button>
              <button
                type="button"
                disabled={totalFindMatches === 0}
                onClick={() =>
                  setFindCurrentIndex(i => (i - 1 + totalFindMatches) % totalFindMatches)
                }
                aria-label="Previous match"
                className="p-1 rounded hover:bg-slate-500/20 disabled:opacity-35"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={totalFindMatches === 0}
                onClick={() => setFindCurrentIndex(i => (i + 1) % totalFindMatches)}
                aria-label="Next match"
                className="p-1 rounded hover:bg-slate-500/20 disabled:opacity-35"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setFindOpen(false);
                  setFindQuery('');
                }}
                aria-label="Close find bar"
                className="p-1 rounded hover:bg-slate-500/20"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* VIEW A: JARVIS-THEMED NEW TAB PAGE */}
          {resolvedActive.kind === 'newtab' && (
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
              <div className="w-full max-w-xl space-y-6">
                <div className="text-center space-y-2">
                  <div
                    className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] ${
                      isLight ? 'text-cyan-700' : isPrivate ? 'text-violet-300' : 'text-cyan-400'
                    }`}
                  >
                    {isPrivate ? <EyeOff className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                    {isPrivate ? 'JARVIS Private Session' : 'JARVISOS Web Navigator'}
                  </div>
                  <h1 className="text-2xl font-display font-bold tracking-tight">
                    {renderHighlightedText(isPrivate ? 'Private Browser' : 'JARVIS Browser')}
                  </h1>
                  {isPrivate && (
                    <p className={`text-xs max-w-md mx-auto ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                      History is not recorded and your session stays isolated inside this Private Helios sub-window.
                    </p>
                  )}
                </div>

                {/* New Tab Search Bar */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (!newTabInput.trim()) return;
                    navigateActiveTab(newTabInput);
                    setNewTabInput('');
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all ${
                    isLight
                      ? 'bg-white border-slate-300 shadow-sm focus-within:border-cyan-600'
                      : isPrivate
                      ? 'bg-[#15102a] border-violet-500/35 focus-within:border-violet-400'
                      : 'bg-slate-900/90 border-cyan-500/30 focus-within:border-cyan-400'
                  }`}
                >
                  <Search className="w-4 h-4 opacity-60 shrink-0" />
                  <input
                    type="text"
                    value={newTabInput}
                    onChange={e => setNewTabInput(e.target.value)}
                    placeholder="Search the web in JARVIS style or enter a website address..."
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <button
                    type="submit"
                    className={`px-3.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                      isLight
                        ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                        : isPrivate
                        ? 'bg-violet-500 text-white hover:bg-violet-400'
                        : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                    }`}
                  >
                    Search
                  </button>
                </form>

                {/* Speed Dial Shortcuts */}
                <div className="space-y-2">
                  <div className={`text-[11px] font-mono uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Pinned Shortcuts
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {cloud.bookmarks.slice(0, 6).map(bm => (
                      <button
                        key={bm.id}
                        type="button"
                        onClick={() => navigateActiveTab(bm.url)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                          isLight
                            ? 'bg-white border-slate-200 hover:border-cyan-500 text-slate-800'
                            : isPrivate
                            ? 'bg-violet-950/25 border-violet-500/20 hover:border-violet-400/50 text-slate-200'
                            : 'bg-slate-900/70 border-slate-800 hover:border-cyan-500/50 text-slate-200'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                            isLight
                              ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                              : isPrivate
                              ? 'bg-violet-500/20 text-violet-200 border border-violet-400/30'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {bm.title.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[11px] truncate w-full">
                          {renderHighlightedText(bm.title)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Utility Actions */}
                <div className="flex items-center justify-center flex-wrap gap-2 pt-1">
                  {!isPrivate && (
                    <button
                      type="button"
                      onClick={onOpenPrivateWindow}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-900 border-violet-500/30 text-violet-300 hover:bg-violet-500/15'
                      }`}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Open Private Window
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSidePanel('extensions')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-cyan-500/40'
                    }`}
                  >
                    <Puzzle className="w-3.5 h-3.5" />
                    Extensions ({cloud.settings.enabledExtensions.length})
                  </button>
                  {!isPrivate && (
                    <button
                      type="button"
                      onClick={() => setSidePanel('history')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-cyan-500/40'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      History ({cloud.history.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW B: FULL-WEB GOOGLE SEARCH RESULTS (ALL / VIDEOS / NEWS / IMAGES + QUICK OVERVIEW) */}
          {resolvedActive.kind === 'search' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Persistent In-Page Google Search Header + Category Tabs */}
              <div
                className={`px-4 pt-3 pb-0 border-b shrink-0 ${
                  isLight
                    ? 'bg-white border-slate-200'
                    : isPrivate
                    ? 'bg-[#120d22] border-violet-500/20'
                    : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                <div className="max-w-4xl mx-auto space-y-2.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        const q = searchPageInput.trim();
                        if (!q) return;
                        navigateActiveTab(
                          buildJarvisSearchUrl(q, resolvedActive.searchTab || 'all')
                        );
                      }}
                      className={`flex-1 min-w-[220px] flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${
                        isLight
                          ? 'bg-slate-100 border-slate-300 focus-within:bg-white focus-within:border-cyan-600'
                          : isPrivate
                          ? 'bg-[#0b0816] border-violet-500/30 focus-within:border-violet-400'
                          : 'bg-slate-950 border-slate-700 focus-within:border-cyan-400'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      <input
                        type="text"
                        value={searchPageInput}
                        onChange={e => setSearchPageInput(e.target.value)}
                        placeholder="Search Google across the web..."
                        className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                      />
                      <button
                        type="submit"
                        className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                          isLight
                            ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                            : isPrivate
                            ? 'bg-violet-500 text-white hover:bg-violet-400'
                            : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                        }`}
                      >
                        Search
                      </button>
                    </form>

                    {summarizerEnabled && (resolvedActive.searchTab || 'all') === 'all' && (
                      <button
                        type="button"
                        onClick={() => void handleTriggerSummarize()}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                          isLight
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                            : 'bg-slate-800/80 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/20'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Summarize
                      </button>
                    )}
                  </div>

                  {/* Category Tabs: All | Videos | News | Images */}
                  <div className="flex items-center justify-between gap-4 overflow-x-auto">
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'all', label: 'All', Icon: Search },
                          { id: 'videos', label: 'Videos', Icon: Video },
                          { id: 'news', label: 'News', Icon: Newspaper },
                          { id: 'images', label: 'Images', Icon: ImageIcon },
                        ] as const
                      ).map(({ id, label, Icon }) => {
                        const activeCategory = resolvedActive.searchTab || 'all';
                        const isSelected = activeCategory === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              if (!resolvedActive.searchQuery) return;
                              navigateActiveTab(buildJarvisSearchUrl(resolvedActive.searchQuery, id));
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                              isSelected
                                ? isLight
                                  ? 'border-cyan-700 text-cyan-800'
                                  : isPrivate
                                  ? 'border-violet-400 text-violet-200'
                                  : 'border-cyan-400 text-cyan-300'
                                : isLight
                                ? 'border-transparent text-slate-600 hover:text-slate-900'
                                : 'border-transparent text-slate-400 hover:text-slate-100'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono tabular-nums opacity-60 pb-1.5 whitespace-nowrap shrink-0">
                      <span>{activeSearchState?.source || 'Google Search'}</span>
                      {!activeSearchState?.loading && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {(resolvedActive.searchTab || 'all') === 'videos'
                              ? `${activeSearchState?.videos?.length || 0} videos`
                              : (resolvedActive.searchTab || 'all') === 'images'
                              ? `${activeSearchState?.images?.length || 0} images`
                              : `${activeSearchState?.results?.length || 0} results`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Search Results Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                <div className="max-w-4xl mx-auto space-y-5">
                  {/* Summarizer Extension Card */}
                  {activeSummary && (
                    <div
                      className={`p-4 rounded-xl border space-y-1.5 text-xs ${
                        isLight
                          ? 'bg-cyan-50 border-cyan-200 text-slate-800'
                          : 'bg-cyan-950/35 border-cyan-500/35 text-cyan-100'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-medium text-cyan-500">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          JARVIS Page Summarizer
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSummaryByTab(prev => {
                              const c = { ...prev };
                              delete c[activeTab.id];
                              return c;
                            })
                          }
                          aria-label="Close summary"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {activeSummary.loading ? (
                        <div className="flex items-center gap-2 py-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Generating briefing...
                        </div>
                      ) : activeSummary.error ? (
                        <div className="text-amber-500">{activeSummary.error}</div>
                      ) : (
                        <div className="whitespace-pre-line leading-relaxed">{activeSummary.text}</div>
                      )}
                    </div>
                  )}

                  {/* Loading Skeleton State */}
                  {activeSearchState?.loading && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs opacity-75">
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>
                          Searching Google for &ldquo;{resolvedActive.searchQuery}&rdquo;...
                        </span>
                      </div>
                      {(resolvedActive.searchTab || 'all') === 'videos' ||
                      (resolvedActive.searchTab || 'all') === 'images' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {[0, 1, 2, 3, 4, 5].map(n => (
                            <div
                              key={n}
                              className={`rounded-xl border overflow-hidden animate-pulse ${
                                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
                              }`}
                            >
                              <div className={`aspect-video ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                              <div className="p-3 space-y-2">
                                <div className={`h-3 rounded w-4/5 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                                <div className={`h-2.5 rounded w-1/2 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {[0, 1, 2, 3].map(n => (
                            <div
                              key={n}
                              className={`p-4 rounded-xl border space-y-2.5 animate-pulse ${
                                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
                              }`}
                            >
                              <div className={`h-2.5 rounded w-40 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                              <div className={`h-4 rounded w-2/3 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                              <div className={`h-3 rounded w-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Recovery Banner */}
                  {activeSearchState?.error && !activeSearchState.loading && (
                    <div
                      className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                        isLight
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                      }`}
                    >
                      <span>{activeSearchState.error}</span>
                      <button
                        type="button"
                        onClick={handleReload}
                        className="px-3 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-medium whitespace-nowrap shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Quick Overview (Grounded Google Search Answer on All & News tabs) */}
                  {!activeSearchState?.loading &&
                    activeSearchState?.overview?.text &&
                    ((resolvedActive.searchTab || 'all') === 'all' ||
                      (resolvedActive.searchTab || 'all') === 'news') && (
                      <div
                        className={`p-4 rounded-xl border space-y-2 ${
                          isLight
                            ? 'bg-white border-slate-200 text-slate-800'
                            : isPrivate
                            ? 'bg-violet-950/20 border-violet-500/25 text-slate-100'
                            : 'bg-slate-900/80 border-cyan-500/25 text-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <Sparkles
                              className={`w-3.5 h-3.5 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}
                            />
                            <span>
                              {(resolvedActive.searchTab || 'all') === 'news'
                                ? 'News Briefing'
                                : 'Quick Overview'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOverviewCollapsed(v => !v)}
                            className="text-[11px] opacity-70 hover:opacity-100 transition-opacity"
                          >
                            {overviewCollapsed ? 'Expand' : 'Hide'}
                          </button>
                        </div>

                        {!overviewCollapsed && (
                          <>
                            <p
                              className={`text-xs sm:text-[13px] leading-relaxed whitespace-pre-line ${
                                isLight ? 'text-slate-700' : 'text-slate-200'
                              }`}
                            >
                              {renderHighlightedText(activeSearchState.overview.text)}
                            </p>
                            {activeSearchState.overview.citedDomains &&
                              activeSearchState.overview.citedDomains.length > 0 && (
                                <div className="text-[11px] font-mono opacity-65 pt-1 truncate">
                                  Sources · {activeSearchState.overview.citedDomains.join(' · ')}
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    )}

                  {/* TAB CONTENT: ALL & NEWS WEB RESULTS */}
                  {!activeSearchState?.loading &&
                    ((resolvedActive.searchTab || 'all') === 'all' ||
                      (resolvedActive.searchTab || 'all') === 'news') && (
                      <>
                        {activeSearchState?.results && activeSearchState.results.length > 0 ? (
                          <div className="space-y-3">
                            {activeSearchState.results.map((res, idx) => {
                              const translatedLine = activeTranslation?.blocks?.[idx]?.text;
                              const domainLabel = res.siteName || formatDisplayHost(res.url) || res.displayUrl;
                              return (
                                <div
                                  key={`${res.url}-${idx}`}
                                  className={`p-4 rounded-xl border transition-colors ${
                                    isLight
                                      ? 'bg-white border-slate-200 hover:border-cyan-500/60'
                                      : isPrivate
                                      ? 'bg-violet-950/15 border-violet-500/20 hover:border-violet-400/50'
                                      : 'bg-slate-900/65 border-slate-800 hover:border-cyan-500/45'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 text-[11px] font-mono opacity-70 truncate">
                                    <span
                                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                        isLight
                                          ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                          : 'bg-slate-800 text-cyan-300 border border-slate-700'
                                      }`}
                                    >
                                      {domainLabel.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span className="font-semibold opacity-95 truncate">{domainLabel}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">{renderHighlightedText(res.displayUrl)}</span>
                                    {res.publishedAt && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="shrink-0 tabular-nums">{res.publishedAt}</span>
                                      </>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => navigateActiveTab(res.url)}
                                    className={`mt-1.5 text-left text-sm sm:text-[15px] font-semibold hover:underline block ${
                                      isLight ? 'text-cyan-800' : 'text-cyan-300'
                                    }`}
                                  >
                                    {renderHighlightedText(res.title)}
                                  </button>

                                  <p
                                    className={`mt-1.5 text-xs leading-relaxed ${
                                      isLight ? 'text-slate-600' : 'text-slate-300'
                                    }`}
                                  >
                                    {renderHighlightedText(translatedLine || res.snippet)}
                                  </p>

                                  <div className="mt-2.5 flex items-center gap-3 text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() => navigateActiveTab(res.url, 'embed')}
                                      className={`font-medium hover:underline ${
                                        isLight ? 'text-cyan-700' : 'text-cyan-400'
                                      }`}
                                    >
                                      Open Live
                                    </button>
                                    <span aria-hidden="true" className="opacity-35">
                                      ·
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => navigateActiveTab(res.url, 'reader')}
                                      className="opacity-75 hover:opacity-100 hover:underline"
                                    >
                                      Reader View
                                    </button>
                                    <span aria-hidden="true" className="opacity-35">
                                      ·
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => navigateActiveTab(res.url, undefined, true)}
                                      className="opacity-75 hover:opacity-100 hover:underline"
                                    >
                                      New Tab
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          !activeSearchState?.error && (
                            <div
                              className={`p-6 rounded-xl border text-center text-xs opacity-75 ${
                                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                              }`}
                            >
                              No web articles matched &ldquo;{resolvedActive.searchQuery}&rdquo;. Try a broader search phrase.
                            </div>
                          )
                        )}

                        {/* Inline Related Videos Strip on ALL tab */}
                        {(resolvedActive.searchTab || 'all') === 'all' &&
                          activeSearchState?.videos &&
                          activeSearchState.videos.length > 0 && (
                            <div className="pt-2 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-semibold">Videos</h3>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!resolvedActive.searchQuery) return;
                                    navigateActiveTab(
                                      buildJarvisSearchUrl(resolvedActive.searchQuery, 'videos')
                                    );
                                  }}
                                  className={`text-xs font-medium hover:underline ${
                                    isLight ? 'text-cyan-700' : 'text-cyan-400'
                                  }`}
                                >
                                  See all videos
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {activeSearchState.videos.map(vid => {
                                  const thumbUrl =
                                    vid.thumbnail ||
                                    `https://i.ytimg.com/vi/${encodeURIComponent(vid.id)}/mqdefault.jpg`;
                                  const isBroken = Boolean(brokenImageUrls[thumbUrl]);
                                  return (
                                    <button
                                      key={vid.id}
                                      type="button"
                                      onClick={() => navigateActiveTab(vid.watchUrl)}
                                      className={`group text-left rounded-xl border overflow-hidden transition-colors flex flex-col ${
                                        isLight
                                          ? 'bg-white border-slate-200 hover:border-cyan-500'
                                          : 'bg-slate-900/70 border-slate-800 hover:border-cyan-500/50'
                                      }`}
                                    >
                                      <div className="relative w-full aspect-video bg-slate-900 overflow-hidden flex items-center justify-center">
                                        {!isBroken ? (
                                          <img
                                            src={thumbUrl}
                                            alt={vid.title}
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                            onError={() => markImageBroken(thumbUrl)}
                                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                                          />
                                        ) : (
                                          <Play className="w-6 h-6 text-red-400 opacity-75" />
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <span className="w-8 h-8 rounded-full bg-black/75 text-white flex items-center justify-center">
                                            <Play className="w-4 h-4 fill-current ml-0.5" />
                                          </span>
                                        </div>
                                        {vid.duration && (
                                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono tabular-nums text-white">
                                            {vid.duration}
                                          </span>
                                        )}
                                      </div>
                                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                                        <div className="text-xs font-semibold line-clamp-2 leading-snug">
                                          {renderHighlightedText(vid.title)}
                                        </div>
                                        <div className="text-[11px] font-mono opacity-65 truncate mt-1.5">
                                          {vid.channel} · YouTube
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                      </>
                    )}

                  {/* TAB CONTENT: VIDEOS */}
                  {!activeSearchState?.loading && (resolvedActive.searchTab || 'all') === 'videos' && (
                    <div className="space-y-3">
                      {activeSearchState?.videos && activeSearchState.videos.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {activeSearchState.videos.map(vid => {
                            const thumbUrl =
                              vid.thumbnail ||
                              `https://i.ytimg.com/vi/${encodeURIComponent(vid.id)}/mqdefault.jpg`;
                            const isBroken = Boolean(brokenImageUrls[thumbUrl]);
                            return (
                              <button
                                key={vid.id}
                                type="button"
                                onClick={() => navigateActiveTab(vid.watchUrl)}
                                className={`group text-left rounded-xl border overflow-hidden transition-colors flex flex-col ${
                                  isLight
                                    ? 'bg-white border-slate-200 hover:border-cyan-500'
                                    : 'bg-slate-900/70 border-slate-800 hover:border-cyan-500/50'
                                }`}
                              >
                                <div className="relative w-full aspect-video bg-slate-900 overflow-hidden flex items-center justify-center">
                                  {!isBroken ? (
                                    <img
                                      src={thumbUrl}
                                      alt={vid.title}
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={() => markImageBroken(thumbUrl)}
                                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                                    />
                                  ) : (
                                    <Play className="w-7 h-7 text-red-400 opacity-75" />
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="w-10 h-10 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-lg">
                                      <Play className="w-4 h-4 fill-current ml-0.5" />
                                    </span>
                                  </div>
                                  {vid.duration && (
                                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono tabular-nums text-white">
                                      {vid.duration}
                                    </span>
                                  )}
                                </div>
                                <div className="p-3 flex-1 flex flex-col justify-between">
                                  <div className="text-xs sm:text-[13px] font-semibold line-clamp-2 leading-snug">
                                    {renderHighlightedText(vid.title)}
                                  </div>
                                  <div className="text-[11px] font-mono opacity-65 truncate mt-1.5">
                                    {vid.channel} · YouTube
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className={`p-6 rounded-xl border text-center text-xs opacity-75 ${
                            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                          }`}
                        >
                          No videos found for &ldquo;{resolvedActive.searchQuery}&rdquo;.
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB CONTENT: IMAGES */}
                  {!activeSearchState?.loading && (resolvedActive.searchTab || 'all') === 'images' && (
                    <div className="space-y-4">
                      {selectedSearchImage && (
                        <div
                          className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-4 items-center ${
                            isLight
                              ? 'bg-white border-slate-300'
                              : 'bg-slate-900/90 border-cyan-500/35'
                          }`}
                        >
                          <div className="w-full sm:w-64 aspect-video rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center shrink-0">
                            {!brokenImageUrls[selectedSearchImage.imageUrl] ? (
                              <img
                                src={selectedSearchImage.imageUrl}
                                alt={selectedSearchImage.title}
                                referrerPolicy="no-referrer"
                                onError={() => markImageBroken(selectedSearchImage.imageUrl)}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <ImageIcon className="w-8 h-8 opacity-50" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-2 w-full">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold line-clamp-2">
                                {selectedSearchImage.title}
                              </h3>
                              <button
                                type="button"
                                onClick={() => setSelectedSearchImage(null)}
                                aria-label="Close image preview"
                                className="p-1 rounded hover:bg-slate-500/20 shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums opacity-65">
                              {selectedSearchImage.displayDomain}
                              {selectedSearchImage.width && selectedSearchImage.height
                                ? ` · ${selectedSearchImage.width} × ${selectedSearchImage.height}`
                                : ''}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => navigateActiveTab(selectedSearchImage.sourceUrl)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isLight
                                    ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                                }`}
                              >
                                Visit Source Page
                              </button>
                              <button
                                type="button"
                                onClick={() => navigateActiveTab(selectedSearchImage.sourceUrl, undefined, true)}
                                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                                  isLight
                                    ? 'border-slate-300 hover:bg-slate-100'
                                    : 'border-slate-700 hover:bg-slate-800'
                                }`}
                              >
                                Open in New Tab
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeSearchState?.images && activeSearchState.images.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {activeSearchState.images.map((img, i) => {
                            const isBroken = Boolean(brokenImageUrls[img.thumbnailUrl]);
                            const isSelected = selectedSearchImage?.thumbnailUrl === img.thumbnailUrl;
                            return (
                              <button
                                key={`${img.thumbnailUrl}-${i}`}
                                type="button"
                                onClick={() => setSelectedSearchImage(img)}
                                className={`group text-left rounded-xl border overflow-hidden transition-colors flex flex-col ${
                                  isSelected
                                    ? 'border-cyan-400 ring-1 ring-cyan-400/50'
                                    : isLight
                                    ? 'bg-white border-slate-200 hover:border-cyan-500'
                                    : 'bg-slate-900/70 border-slate-800 hover:border-cyan-500/50'
                                }`}
                              >
                                <div className="w-full aspect-[4/3] bg-slate-900 overflow-hidden flex items-center justify-center">
                                  {!isBroken ? (
                                    <img
                                      src={img.thumbnailUrl}
                                      alt={img.title}
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={() => markImageBroken(img.thumbnailUrl)}
                                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center gap-1 p-3 text-center opacity-60">
                                      <ImageIcon className="w-5 h-5" />
                                      <span className="text-[10px] line-clamp-2">{img.title}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="p-2">
                                  <div className="text-[11px] font-medium truncate">
                                    {renderHighlightedText(img.title)}
                                  </div>
                                  <div className="text-[10px] font-mono opacity-60 truncate mt-0.5">
                                    {img.displayDomain}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className={`p-6 rounded-xl border text-center text-xs opacity-75 ${
                            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                          }`}
                        >
                          No images found for &ldquo;{resolvedActive.searchQuery}&rdquo;.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW B2: IN-TAB YOUTUBE — BROWSE VIDEO GRID FIRST, WATCH VIEW ON CLICK */}
          {resolvedActive.kind === 'web' && activeIsYouTube && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Top YouTube Search & Mode Header */}
              <div
                className={`flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b shrink-0 ${
                  isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-slate-900/90 border-slate-800 text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 shrink-0">
                  {activeYouTubeState?.viewMode === 'watch' && (
                    <button
                      type="button"
                      onClick={handleBackToYouTubeResults}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200'
                          : 'bg-slate-950 border-slate-700 text-slate-200 hover:border-cyan-400'
                      }`}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to Results
                    </button>
                  )}
                  <span className="text-xs font-bold tracking-tight text-red-500 whitespace-nowrap shrink-0">
                    YouTube
                  </span>
                  <div
                    className={`flex items-center p-0.5 rounded-md border text-[11px] ${
                      isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setYtModeByTab(prev => ({ ...prev, [activeTab.id]: 'video' }))}
                      className={`px-2 py-0.5 rounded font-medium whitespace-nowrap shrink-0 transition-colors ${
                        (activeYouTubeState?.mode || ytModeByTab[activeTab.id] || 'video') === 'video'
                          ? 'bg-red-500/20 text-red-400'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      Videos
                    </button>
                    <button
                      type="button"
                      onClick={() => setYtModeByTab(prev => ({ ...prev, [activeTab.id]: 'playlist' }))}
                      className={`px-2 py-0.5 rounded font-medium whitespace-nowrap shrink-0 transition-colors ${
                        (activeYouTubeState?.mode || ytModeByTab[activeTab.id] || 'video') === 'playlist'
                          ? 'bg-red-500/20 text-red-400'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      Playlists
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const q = ytSearchInput.trim();
                    if (!q) {
                      navigateActiveTab('https://www.youtube.com');
                      return;
                    }
                    navigateActiveTab(
                      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
                    );
                  }}
                  className="flex-1 min-w-[180px] max-w-md flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={ytSearchInput}
                    onChange={e => setYtSearchInput(e.target.value)}
                    placeholder="Search YouTube videos or playlists..."
                    className={`flex-1 min-w-0 px-2.5 py-1 rounded-lg border text-xs outline-none ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-red-500'
                        : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-red-400'
                    }`}
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                  >
                    Search
                  </button>
                </form>
              </div>

              {/* STAGE 1: BROWSE / SEARCH VIDEO GRID (DEFAULT — NO AUTO-PLAY) */}
              {activeYouTubeState?.viewMode !== 'watch' ? (
                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  <div className="max-w-5xl mx-auto space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h2 className="text-sm font-semibold">
                          {activeYouTubeState?.query
                            ? `Search results for "${activeYouTubeState.query}"`
                            : (activeYouTubeState?.mode || 'video') === 'playlist'
                            ? 'Featured Playlists'
                            : 'Explore Videos'}
                        </h2>
                        <p className="text-[11px] font-mono opacity-65 mt-0.5 tabular-nums">
                          {activeYouTubeState?.loading
                            ? 'Loading videos...'
                            : `${activeYouTubeState?.items?.length || 0} ${
                                (activeYouTubeState?.mode || 'video') === 'playlist' ? 'playlists' : 'videos'
                              } · Click any video to play`}
                        </p>
                      </div>
                    </div>

                    {activeYouTubeState?.error && !activeYouTubeState.loading && (
                      <div
                        className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                          isLight
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                        }`}
                      >
                        <span>{activeYouTubeState.error}</span>
                        <button
                          type="button"
                          onClick={handleReload}
                          className="px-3 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-medium"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {activeYouTubeState?.loading && (!activeYouTubeState.items || activeYouTubeState.items.length === 0) ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[0, 1, 2, 3, 4, 5].map(n => (
                          <div
                            key={n}
                            className={`rounded-xl border overflow-hidden animate-pulse ${
                              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
                            }`}
                          >
                            <div className={`aspect-video ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                            <div className="p-3 space-y-2">
                              <div className={`h-3.5 rounded w-5/6 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                              <div className={`h-2.5 rounded w-1/2 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(activeYouTubeState?.items || []).map(item => {
                          const thumbUrl =
                            item.thumbnail ||
                            (item.type !== 'playlist' && item.id
                              ? `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/mqdefault.jpg`
                              : undefined);
                          const isBroken = thumbUrl ? Boolean(brokenImageUrls[thumbUrl]) : true;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectYouTubeItem(item)}
                              className={`group text-left rounded-xl border overflow-hidden transition-colors flex flex-col ${
                                isLight
                                  ? 'bg-white border-slate-200 hover:border-red-500/60'
                                  : 'bg-slate-900/70 border-slate-800 hover:border-red-500/50'
                              }`}
                            >
                              <div className="relative w-full aspect-video bg-slate-900 overflow-hidden flex items-center justify-center">
                                {thumbUrl && !isBroken ? (
                                  <img
                                    src={thumbUrl}
                                    alt={item.title}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={() => markImageBroken(thumbUrl)}
                                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center gap-1.5 text-red-400 opacity-80">
                                    {item.type === 'playlist' ? (
                                      <ListMusic className="w-7 h-7" />
                                    ) : (
                                      <Play className="w-7 h-7" />
                                    )}
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <span className="w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg">
                                    <Play className="w-5 h-5 fill-current ml-0.5" />
                                  </span>
                                </div>
                                {item.duration && (
                                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono tabular-nums text-white">
                                    {item.duration}
                                  </span>
                                )}
                              </div>
                              <div className="p-3 flex-1 flex flex-col justify-between">
                                <div className="text-xs sm:text-[13px] font-semibold leading-snug line-clamp-2">
                                  {item.title}
                                </div>
                                <div className="text-[11px] font-mono opacity-65 truncate mt-1.5">
                                  {item.channel}
                                  {item.type === 'playlist' ? ' · Playlist' : ''}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* STAGE 2: WATCH VIEW (ONLY AFTER CLICKING A VIDEO OR OPENING DIRECT VIDEO LINK) */
                <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
                  {/* PRIMARY VIDEO PLAYER STAGE */}
                  <div className="flex-1 flex flex-col min-w-0 min-h-[250px] bg-black overflow-hidden">
                    <div className="flex-1 relative min-h-[210px] w-full bg-black">
                      {activeYouTubeState?.activeEmbed ? (
                        <iframe
                          key={activeYouTubeState.activeEmbed.embedUrl}
                          src={activeYouTubeState.activeEmbed.embedUrl}
                          title={activeYouTubeState.activeEmbed.title}
                          className="absolute inset-0 w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-slate-300 bg-slate-950">
                          <Loader2 className="w-6 h-6 animate-spin text-red-400" />
                          <span className="text-xs font-mono">Loading YouTube video player...</span>
                        </div>
                      )}
                    </div>

                    {/* Now Playing Info Strip */}
                    <div
                      className={`flex items-center justify-between gap-3 px-3.5 py-2 border-t shrink-0 ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-900'
                          : 'bg-slate-900/95 border-slate-800 text-slate-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {activeYouTubeState?.activeEmbed?.title || 'YouTube Video'}
                        </div>
                        <div className="text-[11px] font-mono opacity-65 truncate">
                          {activeYouTubeState?.activeEmbed?.channel || 'YouTube'}
                          {activeYouTubeState?.activeEmbed?.duration
                            ? ` · ${activeYouTubeState.activeEmbed.duration}`
                            : ''}
                        </div>
                      </div>
                      {(activeYouTubeState?.items?.length || 0) > 1 && (
                        <button
                          type="button"
                          onClick={handleNextYouTubeItem}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                            isLight
                              ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          Next
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* UP NEXT / RELATED VIDEOS RAIL */}
                  <div
                    className={`w-full lg:w-72 h-44 lg:h-auto shrink-0 flex flex-col min-h-0 overflow-hidden border-t lg:border-t-0 lg:border-l ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-900'
                        : 'bg-slate-950/95 border-slate-800 text-slate-100'
                    }`}
                  >
                    <div
                      className={`px-3 py-1.5 border-b text-[11px] font-mono tabular-nums flex items-center justify-between shrink-0 ${
                        isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      <span>Up Next</span>
                      <span>{activeYouTubeState?.items?.length || 0}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                      {(activeYouTubeState?.items || []).map(item => {
                        const isPlaying = activeYouTubeState?.activeEmbed?.embedUrl === item.embedUrl;
                        const thumbUrl =
                          item.thumbnail ||
                          (item.type !== 'playlist' && item.id
                            ? `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/mqdefault.jpg`
                            : undefined);
                        const isBroken = thumbUrl ? Boolean(brokenImageUrls[thumbUrl]) : true;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectYouTubeItem(item)}
                            className={`w-full text-left p-1.5 rounded-lg border transition-colors flex items-start gap-2 ${
                              isPlaying
                                ? isLight
                                  ? 'border-red-500 bg-red-50'
                                  : 'border-red-500/60 bg-red-500/15'
                                : isLight
                                ? 'bg-white border-slate-200 hover:border-cyan-500'
                                : 'bg-slate-900/70 border-slate-800 hover:border-cyan-500/40'
                            }`}
                          >
                            <div className="relative w-24 aspect-video rounded overflow-hidden bg-slate-900 shrink-0 flex items-center justify-center">
                              {thumbUrl && !isBroken ? (
                                <img
                                  src={thumbUrl}
                                  alt={item.title}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={() => markImageBroken(thumbUrl)}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ListMusic className="w-4 h-4 text-red-400" />
                              )}
                              {item.duration && (
                                <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[9px] font-mono tabular-nums text-white">
                                  {item.duration}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-semibold leading-snug line-clamp-2">
                                {item.title}
                              </div>
                              <div className="text-[10px] font-mono opacity-65 truncate mt-0.5">
                                {item.channel}
                              </div>
                              {isPlaying && (
                                <div className="text-[10px] font-mono text-red-400 font-semibold mt-0.5">
                                  Now Playing
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW C: EXTERNAL WEB PAGE — READER VIEW */}
          {resolvedActive.kind === 'web' && !activeIsYouTube && activeTab.renderMode === 'reader' && (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="max-w-3xl mx-auto space-y-4">
                {activeReaderState?.loading && (
                  <div className="flex items-center gap-2.5 py-12 justify-center text-sm opacity-75">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    Loading {formatDisplayHost(activeTab.url)} inside JARVIS Reader View...
                  </div>
                )}

                {activeReaderState?.error && !activeReaderState.loading && (
                  <div
                    className={`p-5 rounded-xl border space-y-3 ${
                      isLight
                        ? 'bg-white border-amber-300 text-slate-800'
                        : 'bg-slate-900 border-amber-500/35 text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-amber-400">
                      Reader View could not extract this page directly
                    </div>
                    <p className="text-xs opacity-80">{activeReaderState.error}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleRenderMode}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-medium"
                      >
                        Switch to Live Embed
                      </button>
                      <button
                        type="button"
                        onClick={handleReload}
                        className="px-3 py-1.5 rounded-lg border border-slate-600/50 text-xs"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {!activeReaderState?.loading && activeReaderState?.doc && (
                  <>
                    {/* Reader Header & Active Extensions Bar */}
                    <div className="border-b pb-3 border-slate-500/20 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-[11px] font-mono opacity-75">
                          <span>{activeReaderState.doc.siteName}</span>
                          {activeReaderState.doc.byline && (
                            <>
                              <span>·</span>
                              <span>{activeReaderState.doc.byline}</span>
                            </>
                          )}
                          {adShieldEnabled && (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {activeReaderState.doc.blockedTrackersCount} blocked
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {summarizerEnabled && (
                            <button
                              type="button"
                              onClick={() => void handleTriggerSummarize()}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ${
                                isLight
                                  ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                                  : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/30'
                              }`}
                            >
                              <Sparkles className="w-3 h-3" />
                              Summarize
                            </button>
                          )}
                          {notesEnabled && (
                            <button
                              type="button"
                              onClick={() => setSidePanel('notes')}
                              className={`px-2 py-1 rounded-md border text-[11px] ${
                                isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'
                              }`}
                            >
                              Page Notes
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleToggleRenderMode}
                            className={`px-2 py-1 rounded-md border text-[11px] font-mono ${
                              isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            Live Embed
                          </button>
                        </div>
                      </div>

                      <h1 className="text-xl font-bold leading-snug">
                        {renderHighlightedText(activeTranslation?.title || activeReaderState.doc.title)}
                      </h1>
                      {activeTranslation && (
                        <div className="text-[11px] font-mono text-cyan-400">
                          Translated to {activeTranslation.targetLanguage}
                        </div>
                      )}
                    </div>

                    {/* Summarizer Extension Card */}
                    {activeSummary && (
                      <div
                        className={`p-3.5 rounded-xl border space-y-1.5 text-xs ${
                          isLight
                            ? 'bg-cyan-50 border-cyan-200 text-slate-800'
                            : 'bg-cyan-950/35 border-cyan-500/35 text-cyan-100'
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono text-[10px] uppercase text-cyan-400">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            JARVIS Page Summarizer
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSummaryByTab(prev => {
                                const c = { ...prev };
                                delete c[activeTab.id];
                                return c;
                              })
                            }
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {activeSummary.loading ? (
                          <div className="flex items-center gap-2 py-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Analyzing page content...
                          </div>
                        ) : activeSummary.error ? (
                          <div className="text-amber-400">{activeSummary.error}</div>
                        ) : (
                          <div className="whitespace-pre-line leading-relaxed">{activeSummary.text}</div>
                        )}
                      </div>
                    )}

                    {/* Article Blocks */}
                    <article className="space-y-3.5 text-sm leading-relaxed">
                      {(activeTranslation?.blocks || activeReaderState.doc.blocks).map((block, idx) => {
                        if (block.type === 'heading') {
                          return (
                            <h2 key={idx} className="text-base font-bold pt-2">
                              {renderHighlightedText(block.text)}
                            </h2>
                          );
                        }
                        if (block.type === 'quote') {
                          return (
                            <blockquote
                              key={idx}
                              className={`border-l-2 pl-3 italic opacity-85 ${
                                isLight ? 'border-cyan-600' : 'border-cyan-400'
                              }`}
                            >
                              {renderHighlightedText(block.text)}
                            </blockquote>
                          );
                        }
                        if (block.type === 'list_item') {
                          return (
                            <div key={idx} className="flex items-start gap-2 pl-2">
                              <span className="text-cyan-400 mt-0.5">•</span>
                              <span>{renderHighlightedText(block.text)}</span>
                            </div>
                          );
                        }
                        return <p key={idx}>{renderHighlightedText(block.text)}</p>;
                      })}
                    </article>

                    {/* Clickable Links Inside This Page (Stays inside JARVIS Browser!) */}
                    {activeReaderState.doc.links.length > 0 && (
                      <div className="pt-4 border-t border-slate-500/20 space-y-2">
                        <div className="text-[11px] font-mono uppercase tracking-wider opacity-65">
                          Links on this page (opens inside JARVIS Browser)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {activeReaderState.doc.links.slice(0, 14).map((lnk, i) => (
                            <button
                              key={`${lnk.url}-${i}`}
                              type="button"
                              onClick={() => navigateActiveTab(lnk.url)}
                              className={`text-left px-2.5 py-1.5 rounded-lg border text-xs truncate transition-colors ${
                                isLight
                                  ? 'bg-white border-slate-200 text-cyan-800 hover:border-cyan-500'
                                  : 'bg-slate-900/70 border-slate-800 text-cyan-300 hover:border-cyan-500/45'
                              }`}
                            >
                              {lnk.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* VIEW D: EXTERNAL WEB PAGE — LIVE PROXY WEB VIEW */}
          {resolvedActive.kind === 'web' && !activeIsYouTube && activeTab.renderMode === 'embed' && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div
                className={`px-3 py-1 border-b text-[11px] flex items-center justify-between gap-2 shrink-0 ${
                  isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                    : 'bg-slate-900/90 border-slate-800 text-slate-400'
                }`}
              >
                <span className="truncate">
                  Live Web View: {activeTab.url} — Click links to browse inside JARVIS, or switch to Reader View for Find & Translate.
                </span>
                <button
                  type="button"
                  onClick={handleToggleRenderMode}
                  className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 font-mono whitespace-nowrap shrink-0"
                >
                  Open Reader View
                </button>
              </div>
              <div className="flex-1 relative bg-white">
                <iframe
                  key={`${activeTab.id}-${activeTab.url}-${reloadNonce}-${adShieldEnabled ? '1' : '0'}`}
                  src={`/api/browser/proxy?url=${encodeURIComponent(activeTab.url)}&adShield=${adShieldEnabled ? '1' : '0'}`}
                  title={activeTab.title}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
                {focusDimmerEnabled && (
                  <div className="absolute inset-0 bg-slate-950/25 pointer-events-none transition-opacity" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* COLLAPSIBLE SIDE PANEL */}
        {sidePanel && (
          <BrowserSidePanel
            activePanel={sidePanel}
            onSelectPanel={setSidePanel}
            onClose={() => setSidePanel(null)}
            isLight={isLight}
            isPrivate={isPrivate}
            bookmarks={cloud.bookmarks}
            history={cloud.history}
            enabledExtensions={cloud.settings.enabledExtensions}
            tabs={tabs}
            tabGroups={tabGroups}
            activeTab={activeTab}
            pageNote={pageNotes[activeTab.url] || ''}
            onChangePageNote={handleChangePageNote}
            onOpenUrl={(url, inNewTab) => navigateActiveTab(url, undefined, Boolean(inNewTab))}
            onAddBookmark={(title, url, folder) => void cloud.addBookmark(title, url, folder)}
            onRemoveBookmark={id => void cloud.removeBookmark(id)}
            onRemoveHistory={id => void cloud.removeHistoryEntry(id)}
            onClearHistory={() => void cloud.clearHistory()}
            onToggleExtension={id => void cloud.toggleExtension(id)}
            onTriggerSummarize={() => void handleTriggerSummarize()}
            onCreateTabGroup={handleCreateTabGroup}
            onAssignTabToGroup={(tabId, grpId) => setTabs(prev => assignTabToGroup(prev, tabId, grpId))}
            onToggleGroupCollapsed={grpId => setTabGroups(prev => toggleTabGroupCollapsed(prev, grpId))}
            onDeleteTabGroup={handleDeleteTabGroup}
          />
        )}
      </div>
    </div>
  );
};
