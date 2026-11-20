import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Send,
  RefreshCw,
  Cpu,
  ShieldCheck,
  ExternalLink,
  Plus,
  Trash2,
  Search,
  AppWindow,
} from 'lucide-react';
import { sound, speakJarvisResponse, stopSpeaking } from '../utils/audio-fx';
import {
  AppShortcut,
  AppShortcutCategory,
  ChatMessage,
  SystemTelemetry,
  WebPortalPayload,
} from '../types/os';
import {
  buildPortalPayloadFromAction,
  createCustomAppShortcut,
  dispatchExternalLaunch,
  formatDisplayHost,
  getAllShortcuts,
  isHostEmbedRestricted,
  resolveLaunchIntent,
} from '../utils/app-launcher';

interface JarvisVoiceReactorProps {
  telemetry: SystemTelemetry;
  customApps: AppShortcut[];
  onAddCustomApp: (shortcut: AppShortcut) => void;
  onRemoveCustomApp: (idOrName: string) => boolean;
  onOpenWebPortal?: (payload: WebPortalPayload) => void;
  onExecuteCommand?: (cmd: string) => void;
}

type ArcView = 'chat' | 'apps';
type AppFilter = 'all' | AppShortcutCategory;

export const JarvisVoiceReactor: React.FC<JarvisVoiceReactorProps> = ({
  telemetry,
  customApps,
  onAddCustomApp,
  onRemoveCustomApp,
  onOpenWebPortal,
  onExecuteCommand,
}) => {
  const [activeView, setActiveView] = useState<ArcView>('chat');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'jarvis',
      text: 'Good morning, sir. Try saying or typing "open youtube", "openyoutube and play beliver", "play any song", "open any playlist", or "open twitter" to launch inside a JARVIS sub-window.',
      timestamp: '06:00:00',
    },
  ]);

  // Apps Manager panel state
  const [appFilter, setAppFilter] = useState<AppFilter>('all');
  const [appSearch, setAppSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppUrl, setNewAppUrl] = useState('');
  const [newAppSearchTemplate, setNewAppSearchTemplate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const customAppsRef = useRef<AppShortcut[]>(customApps);
  const handleSendRef = useRef<(text?: string) => void>(() => {});

  useEffect(() => {
    customAppsRef.current = customApps;
  }, [customApps]);

  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeView]);

  const allShortcuts = useMemo(() => getAllShortcuts(customApps), [customApps]);

  const filteredShortcuts = useMemo(() => {
    const query = appSearch.trim().toLowerCase();
    return allShortcuts.filter(item => {
      if (appFilter !== 'all' && item.category !== appFilter) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.aliases.some(a => a.includes(query)) ||
        (item.url && item.url.toLowerCase().includes(query))
      );
    });
  }, [allShortcuts, appFilter, appSearch]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text) return;

    sound.playBlip();
    const nowTime = new Date().toLocaleTimeString();
    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      sender: 'user',
      text,
      timestamp: nowTime,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    // 1. Synchronous client-side launch resolution
    const intent = resolveLaunchIntent(text, customAppsRef.current);
    if (intent) {
      if (intent.action.kind === 'system' && intent.action.systemAppId && onExecuteCommand) {
        onExecuteCommand(`open:${intent.action.systemAppId}`);
      } else if (intent.action.opensInSubWindow && onOpenWebPortal) {
        onOpenWebPortal(buildPortalPayloadFromAction(intent.action));
      } else if (intent.shouldAutoLaunch && intent.action.url) {
        dispatchExternalLaunch(intent.action.url);
      }

      const jarvisMsg: ChatMessage = {
        id: `${Date.now() + 1}-j`,
        sender: 'jarvis',
        text: intent.spokenResponse,
        timestamp: new Date().toLocaleTimeString(),
        launchAction: intent.action,
      };

      setMessages(prev => [...prev, jarvisMsg]);
      setIsSpeaking(true);
      sound.playConfirm();
      speakJarvisResponse(intent.spokenResponse, () => setIsSpeaking(false));
      return;
    }

    // 2. General conversation routed to server-side Gemini core
    setIsLoading(true);
    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });

      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      const reply = data.response || 'Understood, sir. Subsystem task queued.';

      const jarvisMsg: ChatMessage = {
        id: `${Date.now() + 1}-j`,
        sender: 'jarvis',
        text: reply,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages(prev => [...prev, jarvisMsg]);
      setIsSpeaking(true);
      sound.playConfirm();
      speakJarvisResponse(reply, () => setIsSpeaking(false));
    } catch {
      const fallbackReply = `Acknowledged, sir. All primary Aegis telemetry channels indicate standard operation. Physical memory remains within the 4 GB limit at ${telemetry.ramUsedMb} MB utilized.`;
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now() + 1}-j`,
          sender: 'jarvis',
          text: fallbackReply,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      speakJarvisResponse(fallbackReply, () => setIsSpeaking(false));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleSendRef.current = handleSendMessage;
  });

  // Initialize Speech Recognition if supported in the browser
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = false;
          rec.interimResults = false;
          rec.lang = 'en-US';

          rec.onstart = () => {
            setIsListening(true);
            sound.playBlip();
          };

          rec.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            if (transcript) {
              setActiveView('chat');
              handleSendRef.current(transcript);
            }
          };

          rec.onerror = (e: any) => {
            console.warn('Speech recognition notice:', e?.error);
            setIsListening(false);
          };

          rec.onend = () => {
            setIsListening(false);
          };

          recognitionRef.current = rec;
        } catch (e) {
          console.warn('SpeechRecognition initialization note:', e);
        }
      }
    }

    return () => {
      stopSpeaking();
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      sound.playReactorHum();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          setIsListening(true);
        }
      } else {
        setIsListening(true);
        setTimeout(() => {
          handleSendRef.current('Jarvis, report system health and memory budget on Lenovo E41-25');
          setIsListening(false);
        }, 1200);
      }
    }
  };

  const handleSaveCustomApp = (e: React.FormEvent) => {
    e.preventDefault();
    const result = createCustomAppShortcut(newAppName, newAppUrl, newAppSearchTemplate);
    if (result.error || !result.shortcut) {
      setFormError(result.error || 'Unable to save app.');
      return;
    }

    onAddCustomApp(result.shortcut);
    sound.playConfirm();
    setFormError(null);
    setNewAppName('');
    setNewAppUrl('');
    setNewAppSearchTemplate('');
    setShowAddForm(false);
    setStatusNotice(`Saved "${result.shortcut.name}". Say or type "open ${result.shortcut.name.toLowerCase()}".`);
    setTimeout(() => setStatusNotice(null), 4000);
  };

  const handleLaunchFromList = (item: AppShortcut) => {
    sound.playConfirm();
    if (item.category === 'system' && item.systemAppId && onExecuteCommand) {
      onExecuteCommand(`open:${item.systemAppId}`);
      return;
    }

    const isHttp = Boolean(item.url && /^https?:\/\//i.test(item.url));
    if (isHttp && onOpenWebPortal && item.url) {
      const isYouTube = item.id === 'web-youtube';
      onOpenWebPortal({
        portalKey: isYouTube ? 'portal-youtube' : `portal-${item.id}`,
        mode: isYouTube ? 'youtube' : 'web',
        title: item.name,
        url: item.url,
        searchUrlTemplate: item.searchUrlTemplate,
        embedRestricted: item.embedRestricted ?? isHostEmbedRestricted(item.url),
        requestId: Date.now(),
      });
    } else if (item.url) {
      dispatchExternalLaunch(item.url);
    }
  };

  const categoryLabel = (kind: string) => {
    switch (kind) {
      case 'system':
        return 'System';
      case 'media':
        return 'YouTube Sub-Window';
      case 'desktop':
        return 'Desktop Protocol';
      case 'custom':
        return 'Custom Sub-Window';
      case 'unrecognized':
        return 'Web Search';
      default:
        return 'Sub-Window';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/90 text-slate-100 overflow-hidden font-sans">
      {/* Compact Mode Switcher Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-cyan-500/20 bg-slate-900/80 shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => {
              sound.playBlip();
              setActiveView('chat');
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'chat'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playBlip();
              setActiveView('apps');
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'apps'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Apps
          </button>
        </div>

        <div className="text-[11px] font-mono tabular-nums text-slate-400 truncate">
          <span>{allShortcuts.length} shortcuts</span>
          <span aria-hidden="true"> · </span>
          <span className="text-cyan-400">{customApps.length} custom</span>
        </div>
      </div>

      {activeView === 'chat' ? (
        <>
          {/* Upper Holographic Reactor Visualizer */}
          <div className="relative flex flex-col items-center justify-center py-4 px-4 border-b border-cyan-500/20 hud-grid overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/20 to-transparent pointer-events-none" />

            <div className="relative flex items-center justify-center w-28 h-28">
              <div
                className={`absolute inset-0 rounded-full border border-dashed border-cyan-500/40 transition-transform duration-1000 ${
                  isSpeaking || isListening ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: isListening ? '4s' : '18s' }}
              />
              <div
                className="absolute inset-2 rounded-full border border-cyan-400/30"
                style={{ borderLeftColor: '#00e5ff', borderRightColor: '#00e5ff' }}
              />

              <button
                type="button"
                onClick={toggleListening}
                aria-label={isListening ? 'Stop listening' : 'Start voice recognition with Jarvis'}
                className={`relative z-10 w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isListening
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_32px_rgba(0,229,255,0.7)] scale-105'
                    : isSpeaking
                    ? 'bg-cyan-950/90 border-2 border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(0,229,255,0.45)]'
                    : 'bg-slate-900/90 border border-cyan-500/50 text-cyan-400 hover:border-cyan-300 hover:shadow-[0_0_16px_rgba(0,229,255,0.3)]'
                }`}
              >
                {isListening ? (
                  <>
                    <Mic className="w-6 h-6 animate-pulse text-slate-950" />
                    <span className="text-[9px] font-mono font-bold mt-1 tracking-wider">LISTENING</span>
                  </>
                ) : isSpeaking ? (
                  <>
                    <Volume2 className="w-6 h-6 text-cyan-300" />
                    <span className="text-[9px] font-mono font-bold mt-1 tracking-wider">SPEAKING</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6 text-cyan-400" />
                    <span className="text-[9px] font-mono font-bold mt-1 tracking-wider">ARC CORE</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3 mt-3 text-[11px] font-mono tabular-nums text-cyan-400/80">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-400" />
                NPU {telemetry.npuTopsActive} TOPS
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3 h-3" />
                Vault Verified
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">{telemetry.ramUsedMb} / 4096 MB</span>
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[11px] font-mono tabular-nums text-slate-500 mb-1 px-1">
                  {msg.sender === 'user' ? 'Commander' : 'J.A.R.V.I.S.'} · {msg.timestamp}
                </div>
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-cyan-950/60 border border-cyan-500/30 text-cyan-100'
                      : 'bg-slate-900/90 border border-slate-800 text-slate-200'
                  }`}
                >
                  <p>{msg.text}</p>

                  {/* Hairline-separated Launch Action Strip (single-elevation, no nested cards) */}
                  {msg.launchAction && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {msg.launchAction.label}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                          <span>{categoryLabel(msg.launchAction.kind)}</span>
                          {msg.launchAction.displayHost && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{msg.launchAction.displayHost}</span>
                            </>
                          )}
                          {msg.launchAction.searchQuery && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-cyan-300">"{msg.launchAction.searchQuery}"</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {msg.launchAction.kind === 'system' && msg.launchAction.systemAppId ? (
                          <button
                            type="button"
                            onClick={() => onExecuteCommand?.(`open:${msg.launchAction?.systemAppId}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <AppWindow className="w-3.5 h-3.5" />
                            Focus
                          </button>
                        ) : msg.launchAction.opensInSubWindow && onOpenWebPortal ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (msg.launchAction) {
                                  onOpenWebPortal(buildPortalPayloadFromAction(msg.launchAction));
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0"
                            >
                              <AppWindow className="w-3.5 h-3.5" />
                              Focus Window
                            </button>
                            {msg.launchAction.url && (
                              <a
                                href={msg.launchAction.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0"
                              >
                                Tab
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </>
                        ) : (
                          <>
                            {msg.launchAction.url && (
                              <a
                                href={msg.launchAction.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open
                              </a>
                            )}
                            {msg.launchAction.webFallbackUrl && (
                              <a
                                href={msg.launchAction.webFallbackUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0"
                              >
                                Web
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 p-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Evaluating prompt...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Field & Trigger Bar */}
          <div className="p-3 border-t border-cyan-500/20 bg-slate-900/80 shrink-0">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleListening}
                aria-label={isListening ? 'Stop mic' : 'Enable microphone input'}
                className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                  isListening
                    ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Try 'open youtube', 'play believer', 'open any playlist', 'open twitter'..."
                className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                aria-label="Send query to Jarvis"
                className="p-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 font-medium rounded-lg transition-colors flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </>
      ) : (
        /* Inline Apps Manager View */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar: Search + Add App */}
          <div className="p-3 border-b border-slate-800 space-y-2.5 bg-slate-900/50 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={appSearch}
                  onChange={e => setAppSearch(e.target.value)}
                  placeholder="Filter apps or domains..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playBlip();
                  setFormError(null);
                  setShowAddForm(prev => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddForm ? 'Close' : 'Add App'}
              </button>
            </div>

            {/* Category Segmented Filter */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'custom', label: 'Custom' },
                  { id: 'web', label: 'Web' },
                  { id: 'desktop', label: 'Desktop' },
                  { id: 'system', label: 'System' },
                ] as const
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAppFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    appFilter === tab.id
                      ? 'bg-slate-800 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inline Add Custom App Form */}
          {showAddForm && (
            <form
              onSubmit={handleSaveCustomApp}
              className="p-3.5 border-b border-cyan-500/20 bg-slate-900/90 space-y-2.5 shrink-0"
            >
              <div className="text-xs font-semibold text-slate-200">Save Custom App Shortcut</div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  value={newAppName}
                  onChange={e => setNewAppName(e.target.value)}
                  placeholder="App name (e.g., My Blog, TradingView, Cursor)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="text"
                  value={newAppUrl}
                  onChange={e => setNewAppUrl(e.target.value)}
                  placeholder="URL or protocol (e.g., https://example.com or cursor://)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="text"
                  value={newAppSearchTemplate}
                  onChange={e => setNewAppSearchTemplate(e.target.value)}
                  placeholder="Optional search URL (use {query}, e.g., https://site.com/search?q={query})"
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {formError && (
                <div role="alert" className="text-xs text-red-400">
                  Error: {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormError(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  Save App
                </button>
              </div>
            </form>
          )}

          {statusNotice && (
            <div className="px-3.5 py-2 border-b border-emerald-500/20 bg-emerald-950/30 text-xs text-emerald-300 shrink-0">
              Saved: {statusNotice}
            </div>
          )}

          {/* Shortcut List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
            {filteredShortcuts.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-slate-400">
                  {appFilter === 'custom'
                    ? 'No custom apps saved yet. Add your favorite websites or desktop protocol links to launch them by voice or text.'
                    : 'No shortcuts matched your filter.'}
                </p>
                {appFilter === 'custom' && !showAddForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Custom App
                  </button>
                )}
              </div>
            ) : (
              filteredShortcuts.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-900/60 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">{item.name}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                      <span>{categoryLabel(item.category)}</span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {item.category === 'system'
                          ? 'Helios Window'
                          : formatDisplayHost(item.url)}
                      </span>
                      {item.searchUrlTemplate && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="text-cyan-400/80">Search ready</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.category === 'desktop' ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => sound.playConfirm()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-cyan-500/20 text-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0"
                      >
                        Open
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleLaunchFromList(item)}
                          className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-cyan-500/20 text-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          Open
                        </button>
                        {item.url && /^https?:\/\//i.test(item.url) && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${item.name} in new browser tab`}
                            className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-md transition-colors shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </>
                    )}

                    {item.category === 'custom' && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playBlip();
                          onRemoveCustomApp(item.id);
                        }}
                        aria-label={`Remove ${item.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded-md transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
