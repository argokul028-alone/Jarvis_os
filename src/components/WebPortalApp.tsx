import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ExternalLink,
  Search,
  RotateCw,
  Play,
  ListMusic,
  Globe,
  RefreshCw,
  SkipForward,
  AlertCircle,
} from 'lucide-react';
import { WebPortalPayload } from '../types/os';
import { sound } from '../utils/audio-fx';
import {
  formatDisplayHost,
  isHostEmbedRestricted,
  validateAndNormalizeUrl,
} from '../utils/app-launcher';

interface WebPortalAppProps {
  portal: WebPortalPayload;
  onUpdateTitle?: (title: string) => void;
}

interface ResolvedMediaItem {
  id: string;
  type: 'video' | 'playlist';
  title: string;
  channel: string;
  duration?: string;
  embedUrl: string;
  watchUrl: string;
}

const QUICK_MEDIA_PICKS: Array<{ label: string; query: string; mode: 'video' | 'playlist' }> = [
  { label: 'Believer', query: 'Imagine Dragons Believer', mode: 'video' },
  { label: 'Lofi Beats', query: 'lofi hip hop radio', mode: 'video' },
  { label: 'Synthwave', query: 'synthwave radio', mode: 'video' },
  { label: 'Top Playlist', query: 'any playlist', mode: 'playlist' },
];

export const WebPortalApp: React.FC<WebPortalAppProps> = ({ portal, onUpdateTitle }) => {
  // YouTube Media Sub-Window State
  const [mediaMode, setMediaMode] = useState<'video' | 'playlist'>(portal.mediaType || 'video');
  const [mediaSearchInput, setMediaSearchInput] = useState(
    portal.mediaQuery && !/^any(\s+playlist)?$/i.test(portal.mediaQuery) ? portal.mediaQuery : ''
  );
  const [mediaItems, setMediaItems] = useState<ResolvedMediaItem[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [directEmbedItem, setDirectEmbedItem] = useState<ResolvedMediaItem | null>(null);

  // Generic Web App Sub-Window State
  const [currentUrl, setCurrentUrl] = useState(portal.url);
  const [addressInput, setAddressInput] = useState(portal.url);
  const [iframeKey, setIframeKey] = useState(0);
  const [webViewMode, setWebViewMode] = useState<'embed' | 'portal'>(
    portal.embedRestricted ? 'portal' : 'embed'
  );
  const [portalSearchInput, setPortalSearchInput] = useState(portal.searchQuery || '');
  const onUpdateTitleRef = useRef(onUpdateTitle);
  onUpdateTitleRef.current = onUpdateTitle;

  const fetchYouTubeMedia = useCallback(
    async (query: string, mode: 'video' | 'playlist') => {
      setMediaLoading(true);
      setMediaError(null);
      setDirectEmbedItem(null);

      try {
        const params = new URLSearchParams({
          q: query || (mode === 'playlist' ? 'any playlist' : 'featured'),
          mode,
        });
        const res = await fetch(`/api/media/youtube-resolve?${params.toString()}`);
        if (!res.ok) throw new Error('Media resolver unavailable');
        const data = await res.json();
        const items: ResolvedMediaItem[] = Array.isArray(data.items) ? data.items : [];
        setMediaItems(items);
        setActiveMediaIndex(0);
        if (items[0] && onUpdateTitleRef.current) {
          onUpdateTitleRef.current(`YouTube — ${items[0].title}`);
        }
      } catch {
        setMediaError('Unable to reach media resolver right now.');
      } finally {
        setMediaLoading(false);
      }
    },
    []
  );

  // Sync whenever JARVIS dispatches a new command to this sub-window
  useEffect(() => {
    if (portal.mode === 'youtube') {
      const targetMode = portal.mediaType || 'video';
      setMediaMode(targetMode);
      const displayQuery =
        portal.mediaQuery && !/^any(\s+(song|songs|playlist))?$/i.test(portal.mediaQuery)
          ? portal.mediaQuery
          : '';
      setMediaSearchInput(displayQuery);

      if (portal.videoId) {
        const direct: ResolvedMediaItem = {
          id: portal.videoId,
          type: 'video',
          title: portal.title || 'YouTube Video',
          channel: 'YouTube',
          embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(portal.videoId)}?autoplay=1&rel=0`,
          watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(portal.videoId)}`,
        };
        setDirectEmbedItem(direct);
        setMediaItems([direct]);
        setActiveMediaIndex(0);
      } else if (portal.playlistId) {
        const directPl: ResolvedMediaItem = {
          id: portal.playlistId,
          type: 'playlist',
          title: portal.title || 'YouTube Playlist',
          channel: 'YouTube',
          duration: 'Playlist',
          embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(portal.playlistId)}&autoplay=1&rel=0`,
          watchUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(portal.playlistId)}`,
        };
        setDirectEmbedItem(directPl);
        setMediaItems([directPl]);
        setActiveMediaIndex(0);
      } else {
        fetchYouTubeMedia(portal.mediaQuery || portal.searchQuery || '', targetMode);
      }
    } else {
      setCurrentUrl(portal.url);
      setAddressInput(portal.url);
      setPortalSearchInput(portal.searchQuery || '');
      setWebViewMode(portal.embedRestricted ? 'portal' : 'embed');
      setIframeKey(prev => prev + 1);
    }
  }, [portal.requestId]);

  const activeMedia = directEmbedItem || mediaItems[activeMediaIndex] || null;

  const handleMediaSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playBlip();
    fetchYouTubeMedia(mediaSearchInput.trim(), mediaMode);
  };

  const handleNextTrack = () => {
    if (mediaItems.length <= 1) return;
    sound.playBlip();
    const nextIdx = (activeMediaIndex + 1) % mediaItems.length;
    setActiveMediaIndex(nextIdx);
    if (mediaItems[nextIdx] && onUpdateTitle) {
      onUpdateTitle(`YouTube — ${mediaItems[nextIdx].title}`);
    }
  };

  const handleNavigateAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addressInput.trim();
    if (!raw) return;
    sound.playBlip();

    const check = validateAndNormalizeUrl(raw);
    if (check.valid && check.normalizedUrl && !check.isDesktopProtocol) {
      const restricted = isHostEmbedRestricted(check.normalizedUrl);
      setCurrentUrl(check.normalizedUrl);
      setAddressInput(check.normalizedUrl);
      setWebViewMode(restricted ? 'portal' : 'embed');
      setIframeKey(prev => prev + 1);
      onUpdateTitle?.(formatDisplayHost(check.normalizedUrl));
    } else {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
      setCurrentUrl(searchUrl);
      setAddressInput(searchUrl);
      setWebViewMode('portal');
    }
  };

  const handlePortalQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = portalSearchInput.trim();
    if (!q || !portal.searchUrlTemplate) return;
    sound.playConfirm();
    const encoded = encodeURIComponent(q);
    const target = portal.searchUrlTemplate.includes('{query}')
      ? portal.searchUrlTemplate.replace(/\{query\}/g, encoded)
      : `${portal.searchUrlTemplate}${encoded}`;
    setCurrentUrl(target);
    setAddressInput(target);
  };

  if (portal.mode === 'youtube') {
    return (
      <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
        {/* Top Media Search & Mode Bar */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-900/90 border-b border-cyan-500/20 shrink-0">
          <form onSubmit={handleMediaSearchSubmit} className="flex-1 min-w-[180px] flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={mediaSearchInput}
                onChange={e => setMediaSearchInput(e.target.value)}
                placeholder="Play a song, artist, or playlist (e.g., Believer)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3 h-3" />
              Play
            </button>
          </form>

          <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md shrink-0">
            <button
              type="button"
              onClick={() => {
                setMediaMode('video');
                fetchYouTubeMedia(mediaSearchInput.trim(), 'video');
              }}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                mediaMode === 'video' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Songs
            </button>
            <button
              type="button"
              onClick={() => {
                setMediaMode('playlist');
                fetchYouTubeMedia(mediaSearchInput.trim(), 'playlist');
              }}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                mediaMode === 'playlist' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Playlists
            </button>
          </div>

          <a
            href={activeMedia?.watchUrl || portal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            YouTube
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Main Split: Embedded Player + Queue Rail */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Player Stage */}
          <div className="flex-1 flex flex-col min-w-0 bg-black">
            <div className="flex-1 relative min-h-[210px]">
              {mediaLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 text-cyan-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-xs font-mono">Loading YouTube stream...</span>
                </div>
              ) : activeMedia ? (
                <iframe
                  key={activeMedia.embedUrl}
                  src={activeMedia.embedUrl}
                  title={activeMedia.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center bg-slate-950 text-slate-400">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <p className="text-xs">{mediaError || 'Search for any song or playlist above to begin playback.'}</p>
                </div>
              )}
            </div>

            {/* Now Playing Bar */}
            {activeMedia && (
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-900/95 border-t border-slate-800 shrink-0">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {activeMedia.title}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 truncate mt-0.5">
                    <span>{activeMedia.channel}</span>
                    {activeMedia.duration && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{activeMedia.duration}</span>
                      </>
                    )}
                    <span aria-hidden="true"> · </span>
                    <span className="text-cyan-400">
                      {activeMedia.type === 'playlist' ? 'Playlist' : 'YouTube Embed'}
                    </span>
                  </div>
                </div>

                {mediaItems.length > 1 && (
                  <button
                    type="button"
                    onClick={handleNextTrack}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    Next
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right/Bottom Queue & Quick Picks Rail */}
          <div className="w-full md:w-60 max-h-44 md:max-h-none flex flex-col bg-slate-950/95 border-t md:border-t-0 md:border-l border-slate-800 shrink-0 overflow-hidden">
            {/* Quick Picks */}
            <div className="p-2.5 border-b border-slate-800 shrink-0">
              <div className="text-[11px] font-medium text-slate-400 mb-1.5">Quick Play</div>
              <div className="flex flex-wrap gap-1">
                {QUICK_MEDIA_PICKS.map(pick => (
                  <button
                    key={pick.label}
                    type="button"
                    onClick={() => {
                      sound.playBlip();
                      setMediaMode(pick.mode);
                      setMediaSearchInput(pick.mode === 'playlist' ? '' : pick.label);
                      fetchYouTubeMedia(pick.query, pick.mode);
                    }}
                    className="px-2 py-1 text-[11px] font-medium bg-slate-900 hover:bg-cyan-500/15 text-slate-300 hover:text-cyan-300 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    {pick.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Matching Tracks / Playlists */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
              {mediaItems.map((item, idx) => {
                const isPlaying = activeMedia?.id === item.id;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => {
                      sound.playBlip();
                      setDirectEmbedItem(null);
                      setActiveMediaIndex(idx);
                      onUpdateTitle?.(`YouTube — ${item.title}`);
                    }}
                    className={`w-full text-left px-3 py-2 transition-colors flex items-start gap-2 ${
                      isPlaying ? 'bg-cyan-500/10 text-cyan-200' : 'hover:bg-slate-900/70 text-slate-300'
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 text-cyan-400">
                      {item.type === 'playlist' ? (
                        <ListMusic className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium leading-snug line-clamp-2">
                        {item.title}
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-500 truncate mt-0.5">
                        {item.channel}
                        {item.duration ? ` · ${item.duration}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Generic Online Web App Sub-Window
  const displayHost = formatDisplayHost(currentUrl);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Browser Address & View Mode Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/90 border-b border-cyan-500/20 shrink-0">
        <button
          type="button"
          onClick={() => {
            sound.playBlip();
            setIframeKey(prev => prev + 1);
          }}
          aria-label="Reload page"
          className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-md hover:bg-slate-800 transition-colors shrink-0"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        <form onSubmit={handleNavigateAddress} className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={addressInput}
              onChange={e => setAddressInput(e.target.value)}
              aria-label="Sub-window URL address bar"
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md shrink-0">
          <button
            type="button"
            onClick={() => setWebViewMode('embed')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              webViewMode === 'embed' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Embed
          </button>
          <button
            type="button"
            onClick={() => setWebViewMode('portal')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              webViewMode === 'portal' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Portal
          </button>
        </div>

        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          New Tab
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Main Content Viewport */}
      {webViewMode === 'embed' ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          <iframe
            key={`${currentUrl}-${iframeKey}`}
            src={currentUrl}
            title={portal.title}
            className="w-full flex-1 border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            referrerPolicy="no-referrer"
          />
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 shrink-0">
            <span className="truncate">
              Embedded view for {displayHost}. If this site refuses framing, switch to Portal or New Tab.
            </span>
            <button
              type="button"
              onClick={() => setWebViewMode('portal')}
              className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap shrink-0"
            >
              Switch to Portal
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center hud-grid">
          <div className="w-full max-w-md bg-slate-900/95 border border-cyan-500/25 rounded-xl p-6 space-y-4">
            <div>
              <div className="text-base font-semibold text-slate-100">{portal.title}</div>
              <div className="text-xs font-mono text-cyan-400 truncate mt-1">
                {displayHost} · Sub-Window Portal
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              {displayHost} sends browser frame-protection headers (X-Frame-Options) that prevent websites from rendering inside an iframe. You can search directly below, launch the full site in a dedicated tab, or try embedded view.
            </p>

            {portal.searchUrlTemplate && (
              <form onSubmit={handlePortalQuickSearch} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={portalSearchInput}
                  onChange={e => setPortalSearchInput(e.target.value)}
                  placeholder={`Search inside ${portal.title}...`}
                  className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  Build URL
                </button>
              </form>
            )}

            <div className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 truncate">
              {currentUrl}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => sound.playConfirm()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Full Tab
              </a>

              <button
                type="button"
                onClick={() => {
                  sound.playBlip();
                  setWebViewMode('embed');
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Try Embedded View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
