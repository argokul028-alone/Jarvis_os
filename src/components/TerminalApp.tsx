import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  Square,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Search,
  Minus,
  Shield,
  ShieldAlert,
  Lock,
  Pencil,
  Columns2,
  CopyPlus,
} from 'lucide-react';
import { sound } from '../utils/audio-fx';
import { AppId, AppShortcut, SystemTelemetry, WebPortalPayload } from '../types/os';
import {
  BUILTIN_DESKTOP_APPS,
  BUILTIN_SYSTEM_APPS,
  BUILTIN_WEB_APPS,
  buildPortalPayloadFromAction,
  createCustomAppShortcut,
  dispatchExternalLaunch,
  formatDisplayHost,
  resolveLaunchIntent,
} from '../utils/app-launcher';
import {
  formatPromptPath,
  longestCommonPrefix,
  parseAnsiText,
  stripAnsiCodes,
} from '../utils/terminal-ansi';
import {
  MAX_VERTICAL_SPLIT_PANES,
  clampContextMenuPosition,
  deriveDuplicatedTabTitle,
  formatTerminalTabLabel,
  insertTabAfter,
  normalizeCustomTabTitle,
} from '../utils/terminal-tabs';

interface TerminalAppProps {
  telemetry: SystemTelemetry;
  customApps: AppShortcut[];
  onAddCustomApp: (shortcut: AppShortcut) => void;
  onRemoveCustomApp: (idOrName: string) => boolean;
  onOpenApp?: (appId: AppId) => void;
  onOpenWebPortal?: (payload: WebPortalPayload) => void;
}

type TerminalThemeId = 'gnome' | 'ubuntu' | 'phosphor' | 'jarvis';
type PrivilegeMode = 'user' | 'root';

interface TerminalTheme {
  id: TerminalThemeId;
  label: string;
  canvasBg: string;
  barBg: string;
  tabActiveBg: string;
  tabIdleBg: string;
  border: string;
  text: string;
  muted: string;
  promptUser: string;
  promptRoot: string;
  promptPath: string;
  promptSymbol: string;
  caret: string;
  stderr: string;
  menuBg: string;
  menuHover: string;
  paneHeaderBg: string;
  paneActiveAccent: string;
}

const TERMINAL_THEMES: Record<TerminalThemeId, TerminalTheme> = {
  gnome: {
    id: 'gnome',
    label: 'Linux Dark',
    canvasBg: 'bg-[#111318]',
    barBg: 'bg-[#181b22]',
    tabActiveBg: 'bg-[#111318] text-slate-100',
    tabIdleBg: 'bg-[#1d212a] text-slate-400 hover:text-slate-200',
    border: 'border-slate-800',
    text: 'text-slate-100',
    muted: 'text-slate-400',
    promptUser: 'text-emerald-400',
    promptRoot: 'text-red-400',
    promptPath: 'text-sky-400',
    promptSymbol: 'text-slate-300',
    caret: 'caret-emerald-400',
    stderr: 'text-red-400',
    menuBg: 'bg-[#1b1f28]',
    menuHover: 'hover:bg-white/10',
    paneHeaderBg: 'bg-[#151820]',
    paneActiveAccent: 'text-emerald-400',
  },
  ubuntu: {
    id: 'ubuntu',
    label: 'Ubuntu',
    canvasBg: 'bg-[#2c001e]',
    barBg: 'bg-[#220017]',
    tabActiveBg: 'bg-[#2c001e] text-white',
    tabIdleBg: 'bg-[#380b2a] text-fuchsia-200/70 hover:text-white',
    border: 'border-fuchsia-950',
    text: 'text-stone-100',
    muted: 'text-fuchsia-200/60',
    promptUser: 'text-lime-400',
    promptRoot: 'text-rose-400',
    promptPath: 'text-sky-300',
    promptSymbol: 'text-stone-200',
    caret: 'caret-orange-400',
    stderr: 'text-rose-300',
    menuBg: 'bg-[#2f0722]',
    menuHover: 'hover:bg-white/10',
    paneHeaderBg: 'bg-[#250019]',
    paneActiveAccent: 'text-orange-400',
  },
  phosphor: {
    id: 'phosphor',
    label: 'Phosphor',
    canvasBg: 'bg-[#080d0a]',
    barBg: 'bg-[#0e1611]',
    tabActiveBg: 'bg-[#080d0a] text-emerald-300',
    tabIdleBg: 'bg-[#121d16] text-emerald-600 hover:text-emerald-300',
    border: 'border-emerald-950',
    text: 'text-emerald-200',
    muted: 'text-emerald-600',
    promptUser: 'text-emerald-400',
    promptRoot: 'text-amber-400',
    promptPath: 'text-lime-300',
    promptSymbol: 'text-emerald-400',
    caret: 'caret-emerald-400',
    stderr: 'text-amber-400',
    menuBg: 'bg-[#0e1812]',
    menuHover: 'hover:bg-emerald-500/15',
    paneHeaderBg: 'bg-[#0b130e]',
    paneActiveAccent: 'text-emerald-300',
  },
  jarvis: {
    id: 'jarvis',
    label: 'JARVIS',
    canvasBg: 'bg-slate-950',
    barBg: 'bg-slate-900',
    tabActiveBg: 'bg-slate-950 text-cyan-200',
    tabIdleBg: 'bg-slate-900/70 text-slate-400 hover:text-cyan-200',
    border: 'border-cyan-500/25',
    text: 'text-slate-100',
    muted: 'text-slate-400',
    promptUser: 'text-cyan-400',
    promptRoot: 'text-red-400',
    promptPath: 'text-sky-300',
    promptSymbol: 'text-cyan-300',
    caret: 'caret-cyan-400',
    stderr: 'text-red-400',
    menuBg: 'bg-slate-900',
    menuHover: 'hover:bg-cyan-500/15',
    paneHeaderBg: 'bg-slate-900/80',
    paneActiveAccent: 'text-cyan-300',
  },
};

interface OutputChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}

interface TerminalEntry {
  id: string;
  kind: 'banner' | 'command' | 'system';
  command?: string;
  promptUser?: string;
  promptPath?: string;
  promptMode?: PrivilegeMode;
  chunks: OutputChunk[];
  richNode?: React.ReactNode;
  exitCode?: number;
  running?: boolean;
  durationMs?: number;
}

interface SudoPromptState {
  entryId: string;
  prompt: string;
  username: string;
  attempt: number;
}

interface TerminalPaneState {
  id: string;
  sessionId: string | null;
  initialCwd?: string;
  initReason?: 'default' | 'split' | 'duplicate';
  user: string;
  uid: number;
  privilegeMode: PrivilegeMode;
  hostname: string;
  homeDir: string;
  cwd: string;
  tty: string;
  shellDepth: number;
  osInfo: string;
  shell: string;
  entries: TerminalEntry[];
  input: string;
  historyIndex: number;
  running: boolean;
  lastExitCode: number;
  completionHints: string[];
  connecting: boolean;
  sudoPrompt: SudoPromptState | null;
  sudoPasswordInput: string;
  sudoSubmitting: boolean;
}

interface TerminalTabState {
  id: string;
  customTitle?: string;
  panes: TerminalPaneState[];
  activePaneId: string;
}

interface TabContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

const HISTORY_STORAGE_KEY = 'jarvis_linux_terminal_history_v1';
const MAX_SAVED_HISTORY = 250;

function loadSavedHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(-MAX_SAVED_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: string[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list.slice(-MAX_SAVED_HISTORY)));
  } catch {
    // Ignore storage quota errors
  }
}

function parseShellArgs(raw: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyPane(options?: {
  initialCwd?: string;
  initReason?: 'default' | 'split' | 'duplicate';
}): TerminalPaneState {
  return {
    id: makeId('pane'),
    sessionId: null,
    initialCwd: options?.initialCwd,
    initReason: options?.initReason || 'default',
    user: 'jarvis',
    uid: 1001,
    privilegeMode: 'user',
    hostname: 'jarvis-linux',
    homeDir: '/home/jarvis',
    cwd: options?.initialCwd || '/home/jarvis',
    tty: '/dev/pts/0',
    shellDepth: 1,
    osInfo: 'Linux x86_64 (Debian GNU/Linux)',
    shell: '/usr/bin/bash',
    entries: [],
    input: '',
    historyIndex: -1,
    running: false,
    lastExitCode: 0,
    completionHints: [],
    connecting: true,
    sudoPrompt: null,
    sudoPasswordInput: '',
    sudoSubmitting: false,
  };
}

function createEmptyTab(options?: {
  customTitle?: string;
  initialCwd?: string;
  initReason?: 'default' | 'split' | 'duplicate';
}): TerminalTabState {
  const pane = createEmptyPane({
    initialCwd: options?.initialCwd,
    initReason: options?.initReason,
  });
  return {
    id: makeId('tab'),
    customTitle: options?.customTitle,
    panes: [pane],
    activePaneId: pane.id,
  };
}

function getTabActivePane(tab: TerminalTabState | undefined): TerminalPaneState | undefined {
  if (!tab) return undefined;
  return tab.panes.find(p => p.id === tab.activePaneId) || tab.panes[0];
}

const AnsiLineView: React.FC<{ chunks: OutputChunk[]; stderrClass: string }> = React.memo(
  ({ chunks, stderrClass }) => {
    if (chunks.length === 0) return null;
    return (
      <div className="whitespace-pre-wrap break-words leading-relaxed select-text">
        {chunks.map((chunk, chunkIdx) => {
          const segments = parseAnsiText(chunk.text);
          return (
            <React.Fragment key={chunkIdx}>
              {segments.map((seg, segIdx) => {
                const style: React.CSSProperties = {};
                if (seg.inverse) {
                  style.backgroundColor = seg.fg || '#e2e8f0';
                  style.color = seg.bg || '#0f172a';
                } else {
                  if (seg.fg) style.color = seg.fg;
                  if (seg.bg) style.backgroundColor = seg.bg;
                }
                const classes = [
                  !seg.fg && chunk.stream === 'stderr' ? stderrClass : '',
                  seg.bold ? 'font-bold' : '',
                  seg.dim ? 'opacity-70' : '',
                  seg.italic ? 'italic' : '',
                  seg.underline ? 'underline' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <span key={segIdx} style={style} className={classes || undefined}>
                    {seg.text}
                  </span>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    );
  }
);

export const TerminalApp: React.FC<TerminalAppProps> = ({
  customApps,
  onAddCustomApp,
  onRemoveCustomApp,
  onOpenApp,
  onOpenWebPortal,
}) => {
  const [tabs, setTabs] = useState<TerminalTabState[]>(() => [createEmptyTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => '');
  const [commandHistory, setCommandHistory] = useState<string[]>(() => loadSavedHistory());
  const [themeId, setThemeId] = useState<TerminalThemeId>('gnome');
  const [fontSize, setFontSize] = useState<number>(13);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [reverseSearchOpen, setReverseSearchOpen] = useState(false);
  const [reverseSearchQuery, setReverseSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');

  const rootContainerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const reverseInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const sudoPasswordRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const scrollContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const initializedPanesRef = useRef<Set<string>>(new Set());
  const tabsRef = useRef<TerminalTabState[]>(tabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const resolvedActiveTabId = activeTabId || tabs[0]?.id || '';
  const activeTab = tabs.find(t => t.id === resolvedActiveTabId) || tabs[0];
  const activePane = getTabActivePane(activeTab);
  const theme = TERMINAL_THEMES[themeId];

  useEffect(() => {
    if (!activeTabId && tabs[0]?.id) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  const updateTab = useCallback((tabId: string, updater: (tab: TerminalTabState) => TerminalTabState) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? updater(t) : t)));
  }, []);

  const updatePane = useCallback(
    (tabId: string, paneId: string, updater: (pane: TerminalPaneState) => TerminalPaneState) => {
      setTabs(prev =>
        prev.map(t =>
          t.id === tabId
            ? {
                ...t,
                panes: t.panes.map(p => (p.id === paneId ? updater(p) : p)),
              }
            : t
        )
      );
    },
    []
  );

  // Dismiss tab context menu on outside click or Escape key
  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [contextMenu]);

  // Focus & select inline rename input when renaming a tab
  useEffect(() => {
    if (renamingTabId) {
      const input = renameInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [renamingTabId]);

  // Initialize real non-root Linux PTY session (`jarvis`) on server for each pane
  const initSessionForPane = useCallback(
    async (tabId: string, paneId: string, initialCwd?: string, initReason?: 'default' | 'split' | 'duplicate') => {
      if (initializedPanesRef.current.has(paneId)) return;
      initializedPanesRef.current.add(paneId);
      try {
        const res = await fetch('/api/terminal/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(initialCwd ? { initialCwd } : {}),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const verifiedUid = typeof data.uid === 'number' ? data.uid : 1001;
        const verifiedMode: PrivilegeMode = verifiedUid === 0 ? 'root' : 'user';
        const sessionLabel =
          initReason === 'duplicate'
            ? 'Duplicated non-root session'
            : initReason === 'split'
              ? 'Split vertical pane started'
              : 'Session started';

        updatePane(tabId, paneId, pane => ({
          ...pane,
          sessionId: data.sessionId,
          user: data.user || 'jarvis',
          uid: verifiedUid,
          privilegeMode: verifiedMode,
          hostname: data.hostname || 'jarvis-linux',
          homeDir: data.homeDir || '/home/jarvis',
          cwd: data.cwd || '/home/jarvis',
          tty: data.tty || '/dev/pts/0',
          shellDepth: typeof data.shellDepth === 'number' ? data.shellDepth : 1,
          osInfo: data.osInfo || 'Linux x86_64 (Debian GNU/Linux)',
          shell: data.shell || '/usr/bin/bash',
          connecting: false,
          sudoPrompt: null,
          sudoPasswordInput: '',
          sudoSubmitting: false,
          entries: [
            {
              id: makeId('banner'),
              kind: 'banner',
              chunks: [
                {
                  stream: 'stdout',
                  text: `${data.osInfo || 'Debian GNU/Linux'} — ${data.shell || '/usr/bin/bash'} on ${data.tty || '/dev/pts/0'}\n${sessionLabel} as non-root user '${data.user || 'jarvis'}' (uid=${verifiedUid}, USER MODE). Run 'sudo -i' for root shell, 'exit' to leave root, or 'help'.\n`,
                },
              ],
            },
          ],
        }));
      } catch (err: any) {
        updatePane(tabId, paneId, pane => ({
          ...pane,
          connecting: false,
          entries: [
            {
              id: makeId('err'),
              kind: 'system',
              chunks: [
                {
                  stream: 'stderr',
                  text: `Failed to connect to Linux PTY backend (${err?.message || 'network error'}). Retry by running a command or opening a new tab.\n`,
                },
              ],
            },
          ],
        }));
      }
    },
    [updatePane]
  );

  useEffect(() => {
    for (const tab of tabs) {
      for (const pane of tab.panes) {
        if (!initializedPanesRef.current.has(pane.id)) {
          void initSessionForPane(tab.id, pane.id, pane.initialCwd, pane.initReason);
        }
      }
    }
  }, [tabs, initSessionForPane]);

  // Cleanup all server PTY sessions across all tabs and panes on unmount
  useEffect(() => {
    return () => {
      for (const tab of tabsRef.current) {
        for (const pane of tab.panes) {
          if (pane.sessionId) {
            fetch(`/api/terminal/session/${encodeURIComponent(pane.sessionId)}`, {
              method: 'DELETE',
            }).catch(() => {});
          }
        }
      }
    };
  }, []);

  // Auto-scroll active tab's panes to bottom when output updates
  useEffect(() => {
    if (!activeTab) return;
    for (const pane of activeTab.panes) {
      const el = scrollContainerRefs.current.get(pane.id);
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [activeTab, resolvedActiveTabId]);

  // Focus appropriate input for the active pane (unless renaming a tab or reverse-searching)
  useEffect(() => {
    if (renamingTabId || contextMenu) return;
    if (reverseSearchOpen) {
      reverseInputRef.current?.focus();
      return;
    }
    if (!activePane) return;
    if (activePane.sudoPrompt) {
      sudoPasswordRefs.current.get(activePane.id)?.focus();
    } else {
      inputRefs.current.get(activePane.id)?.focus();
    }
  }, [activePane?.id, activePane?.sudoPrompt, reverseSearchOpen, resolvedActiveTabId, renamingTabId, contextMenu]);

  const handleAddTab = () => {
    sound.playBlip();
    const next = createEmptyTab();
    setTabs(prev => [...prev, next]);
    setActiveTabId(next.id);
    setContextMenu(null);
  };

  const handleCloseTab = useCallback((tabId: string) => {
    sound.playBlip();
    const currentTabs = tabsRef.current;
    const target = currentTabs.find(t => t.id === tabId);
    if (target) {
      for (const pane of target.panes) {
        if (pane.sessionId) {
          fetch(`/api/terminal/session/${encodeURIComponent(pane.sessionId)}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
        initializedPanesRef.current.delete(pane.id);
        inputRefs.current.delete(pane.id);
        sudoPasswordRefs.current.delete(pane.id);
        scrollContainerRefs.current.delete(pane.id);
      }
    }

    setContextMenu(prev => (prev?.tabId === tabId ? null : prev));
    setRenamingTabId(prev => (prev === tabId ? null : prev));

    if (currentTabs.length <= 1) {
      const fresh = createEmptyTab();
      setTabs([fresh]);
      setActiveTabId(fresh.id);
      return;
    }

    const remaining = currentTabs.filter(t => t.id !== tabId);
    setTabs(remaining);
    setActiveTabId(prev => (prev === tabId ? remaining[remaining.length - 1].id : prev));
  }, []);

  const handleClosePane = useCallback(
    (tabId: string, paneId: string) => {
      const targetTab = tabsRef.current.find(t => t.id === tabId);
      if (!targetTab) return;

      if (targetTab.panes.length <= 1) {
        handleCloseTab(tabId);
        return;
      }

      sound.playBlip();
      const targetPane = targetTab.panes.find(p => p.id === paneId);
      if (targetPane?.sessionId) {
        fetch(`/api/terminal/session/${encodeURIComponent(targetPane.sessionId)}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
      initializedPanesRef.current.delete(paneId);
      inputRefs.current.delete(paneId);
      sudoPasswordRefs.current.delete(paneId);
      scrollContainerRefs.current.delete(paneId);

      updateTab(tabId, t => {
        const remainingPanes = t.panes.filter(p => p.id !== paneId);
        if (remainingPanes.length === 0) return t;
        const nextActivePaneId =
          t.activePaneId === paneId ? remainingPanes[remainingPanes.length - 1].id : t.activePaneId;
        return {
          ...t,
          panes: remainingPanes,
          activePaneId: nextActivePaneId,
        };
      });
    },
    [handleCloseTab, updateTab]
  );

  // Context menu action 1: Rename Tab
  const startRenameTab = useCallback((tabId: string) => {
    const idx = tabsRef.current.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    const tab = tabsRef.current[idx];
    const pane = getTabActivePane(tab);
    const tabPath = pane ? formatPromptPath(pane.cwd, pane.homeDir) : '~';
    const shortPath = tabPath.length > 16 ? `.../${tabPath.split('/').pop()}` : tabPath;
    const fallbackName = formatTerminalTabLabel({
      customTitle: tab.customTitle,
      tabIndex: idx,
      isRoot: pane?.uid === 0,
      isRunning: Boolean(pane?.running),
      shortPath,
    });
    sound.playBlip();
    setContextMenu(null);
    setActiveTabId(tabId);
    setRenameDraft(tab.customTitle || fallbackName);
    setRenamingTabId(tabId);
  }, []);

  const commitRenameTab = useCallback(
    (tabId: string) => {
      const normalized = normalizeCustomTabTitle(renameDraft);
      updateTab(tabId, t => ({
        ...t,
        customTitle: normalized,
      }));
      setRenamingTabId(null);
      setRenameDraft('');
    },
    [renameDraft, updateTab]
  );

  const cancelRenameTab = useCallback(() => {
    setRenamingTabId(null);
    setRenameDraft('');
  }, []);

  // Context menu action 2: Split Vertically
  const handleSplitVertically = useCallback(
    (tabId: string) => {
      const targetTab = tabsRef.current.find(t => t.id === tabId);
      if (!targetTab) return;
      if (targetTab.panes.length >= MAX_VERTICAL_SPLIT_PANES) {
        setContextMenu(null);
        return;
      }

      sound.playConfirm();
      const sourcePane = getTabActivePane(targetTab);
      const newPane = createEmptyPane({
        initialCwd: sourcePane?.cwd,
        initReason: 'split',
      });

      setContextMenu(null);
      setActiveTabId(tabId);
      updateTab(tabId, t => ({
        ...t,
        panes: [...t.panes, newPane],
        activePaneId: newPane.id,
      }));
    },
    [updateTab]
  );

  // Context menu action 3: Duplicate Session
  const handleDuplicateSession = useCallback((tabId: string) => {
    const sourceTab = tabsRef.current.find(t => t.id === tabId);
    if (!sourceTab) return;

    sound.playConfirm();
    const sourcePane = getTabActivePane(sourceTab);
    const duplicatedTab = createEmptyTab({
      customTitle: deriveDuplicatedTabTitle(sourceTab.customTitle),
      initialCwd: sourcePane?.cwd,
      initReason: 'duplicate',
    });

    setContextMenu(null);
    setTabs(prev => insertTabAfter(prev, tabId, duplicatedTab));
    setActiveTabId(duplicatedTab.id);
  }, []);

  const handleTabContextMenu = (e: React.MouseEvent<HTMLDivElement>, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = rootContainerRef.current?.getBoundingClientRect();
    const localX = rect ? e.clientX - rect.left : e.clientX;
    const localY = rect ? e.clientY - rect.top : e.clientY;
    const containerWidth = rect?.width || 680;
    const containerHeight = rect?.height || 440;
    const pos = clampContextMenuPosition(localX, localY, containerWidth, containerHeight);
    setContextMenu({ tabId, x: pos.x, y: pos.y });
  };

  // Shared NDJSON stream consumer for `/api/terminal/exec` and `/api/terminal/sudo-auth`
  const consumeTerminalNdjsonStream = useCallback(
    async (tabId: string, paneId: string, entryId: string, response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response not supported in this browser.');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let shouldClosePane = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          if (event.type === 'stdout' || event.type === 'stderr') {
            const chunk: OutputChunk = {
              stream: event.type,
              text: String(event.data || ''),
            };
            updatePane(tabId, paneId, p => ({
              ...p,
              entries: p.entries.map(e =>
                e.id === entryId ? { ...e, chunks: [...e.chunks, chunk] } : e
              ),
            }));
          } else if (event.type === 'sudo_auth_required') {
            const nextUid = typeof event.uid === 'number' ? event.uid : undefined;
            updatePane(tabId, paneId, p => ({
              ...p,
              sessionId: typeof event.sessionId === 'string' ? event.sessionId : p.sessionId,
              uid: nextUid !== undefined ? nextUid : p.uid,
              privilegeMode: nextUid !== undefined ? (nextUid === 0 ? 'root' : 'user') : p.privilegeMode,
              running: false,
              sudoSubmitting: false,
              sudoPasswordInput: '',
              sudoPrompt: {
                entryId,
                prompt: typeof event.prompt === 'string' ? event.prompt : `[sudo] password for ${p.user}: `,
                username: typeof event.username === 'string' ? event.username : p.user,
                attempt: typeof event.attempt === 'number' ? event.attempt : 1,
              },
            }));
          } else if (event.type === 'done') {
            const exitCode = typeof event.exitCode === 'number' ? event.exitCode : 0;
            if (event.closeTab) {
              shouldClosePane = true;
            }
            updatePane(tabId, paneId, p => {
              const nextUid = typeof event.uid === 'number' ? event.uid : p.uid;
              const nextMode: PrivilegeMode = nextUid === 0 ? 'root' : 'user';
              return {
                ...p,
                sessionId: typeof event.sessionId === 'string' ? event.sessionId : p.sessionId,
                uid: nextUid,
                privilegeMode: nextMode,
                user: typeof event.user === 'string' && event.user ? event.user : p.user,
                homeDir: typeof event.homeDir === 'string' && event.homeDir ? event.homeDir : p.homeDir,
                cwd: typeof event.cwd === 'string' && event.cwd ? event.cwd : p.cwd,
                tty: typeof event.tty === 'string' && event.tty ? event.tty : p.tty,
                shellDepth: typeof event.shellDepth === 'number' ? event.shellDepth : p.shellDepth,
                running: false,
                sudoPrompt: null,
                sudoPasswordInput: '',
                sudoSubmitting: false,
                lastExitCode: exitCode,
                entries: p.entries.map(e =>
                  e.id === entryId
                    ? {
                        ...e,
                        running: false,
                        exitCode,
                        durationMs: typeof event.durationMs === 'number' ? event.durationMs : undefined,
                      }
                    : e
                ),
              };
            });
          }
        } catch {
          // Ignore malformed NDJSON fragment
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          processLine(line);
        }
      }
      if (buffer.trim()) {
        processLine(buffer);
      }

      updatePane(tabId, paneId, p => ({
        ...p,
        running: false,
        sudoSubmitting: false,
        entries: p.entries.map(e => (e.id === entryId && e.running && !p.sudoPrompt ? { ...e, running: false } : e)),
      }));

      if (shouldClosePane) {
        handleClosePane(tabId, paneId);
      }
    },
    [handleClosePane, updatePane]
  );

  const handleSudoPasswordSubmit = useCallback(
    async (tabId: string, pane: TerminalPaneState, cancel = false) => {
      if (!pane.sudoPrompt || !pane.sessionId || pane.sudoSubmitting) return;
      const { entryId, prompt } = pane.sudoPrompt;
      const passwordToSend = cancel ? '' : pane.sudoPasswordInput;

      // Append the prompt line (never echo the typed password!) into the entry log
      updatePane(tabId, pane.id, p => ({
        ...p,
        sudoSubmitting: true,
        sudoPasswordInput: '',
        running: !cancel,
        entries: p.entries.map(e =>
          e.id === entryId
            ? {
                ...e,
                chunks: [...e.chunks, { stream: 'stdout', text: `${prompt}\n` }],
              }
            : e
        ),
      }));

      try {
        const response = await fetch('/api/terminal/sudo-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: pane.sessionId,
            password: passwordToSend,
            cancel,
          }),
        });
        if (!response.ok) {
          const errJson = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          updatePane(tabId, pane.id, p => ({
            ...p,
            running: false,
            sudoPrompt: null,
            sudoSubmitting: false,
            lastExitCode: 1,
            entries: p.entries.map(e =>
              e.id === entryId
                ? {
                    ...e,
                    running: false,
                    exitCode: 1,
                    chunks: [...e.chunks, { stream: 'stderr', text: `sudo: ${errJson.error || 'auth failed'}\n` }],
                  }
                : e
            ),
          }));
          return;
        }
        await consumeTerminalNdjsonStream(tabId, pane.id, entryId, response);
      } catch (err: any) {
        updatePane(tabId, pane.id, p => ({
          ...p,
          running: false,
          sudoPrompt: null,
          sudoSubmitting: false,
          lastExitCode: 1,
          entries: p.entries.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  running: false,
                  exitCode: 1,
                  chunks: [...e.chunks, { stream: 'stderr', text: `sudo: ${err?.message || 'connection error'}\n` }],
                }
              : e
          ),
        }));
      }
    },
    [consumeTerminalNdjsonStream, updatePane]
  );

  const handleInterruptRunning = useCallback(
    async (tabId: string, pane: TerminalPaneState) => {
      if (pane.sudoPrompt) {
        await handleSudoPasswordSubmit(tabId, pane, true);
        return;
      }

      if (!pane.running) {
        const promptPath = formatPromptPath(pane.cwd, pane.homeDir);
        updatePane(tabId, pane.id, p => ({
          ...p,
          input: '',
          historyIndex: -1,
          completionHints: [],
          entries: [
            ...p.entries,
            {
              id: makeId('ctrlc'),
              kind: 'command',
              command: `${p.input}^C`,
              promptUser: p.user,
              promptPath,
              promptMode: p.privilegeMode,
              chunks: [],
              exitCode: 130,
            },
          ],
          lastExitCode: 130,
        }));
        return;
      }

      if (pane.sessionId) {
        try {
          await fetch('/api/terminal/kill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: pane.sessionId }),
          });
        } catch {
          // ignore
        }
      }
    },
    [handleSudoPasswordSubmit, updatePane]
  );

  const handleClearPane = useCallback(
    (tabId: string, paneId: string) => {
      updatePane(tabId, paneId, p => ({
        ...p,
        entries: [],
        completionHints: [],
      }));
    },
    [updatePane]
  );

  const handleCopyOutput = async () => {
    if (!activePane) return;
    const text = activePane.entries
      .map(entry => {
        const sym = entry.promptMode === 'root' ? '#' : '$';
        const header =
          entry.kind === 'command'
            ? `${entry.promptUser || activePane.user}@${activePane.hostname}:${entry.promptPath || '~'}${sym} ${entry.command || ''}\n`
            : '';
        const body = entry.chunks.map(c => stripAnsiCodes(c.text)).join('');
        return `${header}${body}`;
      })
      .join('\n')
      .trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 1600);
    } catch {
      // Clipboard may be blocked in restricted iframes
    }
  };

  const pushToHistory = useCallback((cmd: string) => {
    if (!cmd.trim()) return;
    setCommandHistory(prev => {
      if (prev[prev.length - 1] === cmd) return prev;
      const next = [...prev, cmd].slice(-MAX_SAVED_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const executeLinuxCommand = async (tabId: string, pane: TerminalPaneState, rawCommand: string) => {
    const trimmed = rawCommand.trim();
    const promptPath = formatPromptPath(pane.cwd, pane.homeDir);
    const promptUser = pane.user;
    const promptMode = pane.privilegeMode;

    if (!trimmed) {
      updatePane(tabId, pane.id, p => ({
        ...p,
        input: '',
        completionHints: [],
        entries: [
          ...p.entries,
          {
            id: makeId('empty'),
            kind: 'command',
            command: '',
            promptUser,
            promptPath,
            promptMode,
            chunks: [],
          },
        ],
      }));
      return;
    }

    sound.playBlip();
    pushToHistory(rawCommand);
    updatePane(tabId, pane.id, p => ({
      ...p,
      input: '',
      historyIndex: -1,
      completionHints: [],
    }));

    const parts = trimmed.split(/\s+/);
    const base = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Local UI-only builtins: clear, reset, history, help
    // Note: `exit` and `logout` ALWAYS go to the backend so exiting ROOT MODE returns to USER MODE!
    if (base === 'clear' && args.length === 0) {
      handleClearPane(tabId, pane.id);
      return;
    }

    if (base === 'reset' && args.length === 0) {
      if (pane.sessionId) {
        fetch(`/api/terminal/session/${encodeURIComponent(pane.sessionId)}`, { method: 'DELETE' }).catch(() => {});
      }
      initializedPanesRef.current.delete(pane.id);
      updatePane(tabId, pane.id, p => ({
        ...p,
        sessionId: null,
        initialCwd: undefined,
        initReason: 'default',
        user: 'jarvis',
        uid: 1001,
        privilegeMode: 'user',
        shellDepth: 1,
        entries: [],
        lastExitCode: 0,
        sudoPrompt: null,
        sudoPasswordInput: '',
        connecting: true,
      }));
      void initSessionForPane(tabId, pane.id);
      return;
    }

    if (base === 'history' && args.length === 0) {
      const lines = [...commandHistory, rawCommand]
        .map((c, idx) => `${String(idx + 1).padStart(4, ' ')}  ${c}`)
        .join('\n');
      updatePane(tabId, pane.id, p => ({
        ...p,
        lastExitCode: 0,
        entries: [
          ...p.entries,
          {
            id: makeId('hist'),
            kind: 'command',
            command: rawCommand,
            promptUser,
            promptPath,
            promptMode,
            chunks: [{ stream: 'stdout', text: `${lines}\n` }],
            exitCode: 0,
          },
        ],
      }));
      return;
    }

    if (base === 'help' && args.length === 0) {
      const helpNode = (
        <div className="space-y-2 leading-relaxed">
          <div className="font-bold text-emerald-400">
            Debian GNU/Linux Persistent PTY Terminal (Real User &amp; Root Privilege Separation)
          </div>
          <div className="opacity-85">
            Every new session starts as non-root user <span className="font-semibold">jarvis</span> (USER MODE, non-zero UID).
            Right-click any tab to rename, split vertically, or duplicate the session.
          </div>
          <div className="pt-1 font-bold text-amber-400">Privilege Escalation &amp; Verification</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <div><span className="text-sky-400">id / id -u / whoami</span> — inspect real kernel UID</div>
            <div><span className="text-sky-400">sudo -i</span> — authenticate &amp; enter ROOT MODE (UID 0)</div>
            <div><span className="text-sky-400">sudo &lt;command&gt;</span> — run one command as root</div>
            <div><span className="text-sky-400">exit</span> — leave ROOT MODE and return to USER MODE</div>
            <div><span className="text-sky-400">sudo -k / sudo -l</span> — clear auth cache / list rights</div>
            <div><span className="text-sky-400">tty</span> — show active Linux PTY (/dev/pts/N)</div>
          </div>
          <div className="opacity-75 text-[11px]">
            Default sandbox password for <span className="font-semibold">jarvis</span>: <span className="font-semibold text-slate-100">jarvis</span>
          </div>
          <div className="pt-1 font-bold text-emerald-400">Standard Linux Commands</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <div><span className="text-sky-400">ls, ll, cd, pwd, mkdir</span> — navigate &amp; manage files</div>
            <div><span className="text-sky-400">cat, touch, rm, grep, find</span> — inspect &amp; search</div>
            <div><span className="text-sky-400">python3, node, npm, git</span> — real developer runtimes</div>
            <div><span className="text-sky-400">apt, uname -a, df -h, ps</span> — packages &amp; system info</div>
          </div>
          <div className="pt-1 font-bold text-cyan-400">JARVISOS Desktop Bridge</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <div><span className="text-cyan-300">open &lt;app|url&gt;</span> — open JARVIS Browser, YouTube, or OS app</div>
            <div><span className="text-cyan-300">play &lt;song|playlist&gt;</span> — play music in JARVIS sub-window</div>
            <div><span className="text-cyan-300">jarvis &lt;question&gt;</span> — ask JARVIS directly in terminal</div>
            <div><span className="text-cyan-300">apps [add|remove]</span> — manage saved JARVIS shortcuts</div>
          </div>
        </div>
      );
      updatePane(tabId, pane.id, p => ({
        ...p,
        lastExitCode: 0,
        entries: [
          ...p.entries,
          {
            id: makeId('help'),
            kind: 'command',
            command: rawCommand,
            promptUser,
            promptPath,
            promptMode,
            chunks: [],
            richNode: helpNode,
            exitCode: 0,
          },
        ],
      }));
      return;
    }

    // JARVISOS desktop bridge commands (only when no shell operators like |, >, &&, ; are used)
    const hasShellOperators = /[|&;<>`$()]/.test(trimmed) || trimmed.startsWith('#');

    if (!hasShellOperators && base === 'build-iso') {
      onOpenApp?.('iso_builder');
      updatePane(tabId, pane.id, p => ({
        ...p,
        lastExitCode: 0,
        entries: [
          ...p.entries,
          {
            id: makeId('iso'),
            kind: 'command',
            command: rawCommand,
            promptUser,
            promptPath,
            promptMode,
            chunks: [{ stream: 'stdout', text: 'Opening Lenovo E41-25 Standalone Bootable ISO Builder Studio...\n' }],
            exitCode: 0,
          },
        ],
      }));
      return;
    }

    if (!hasShellOperators && base === 'apps') {
      const subTokens = parseShellArgs(trimmed.slice(base.length).trim());
      const sub = (subTokens[0] || 'list').toLowerCase();
      let richNode: React.ReactNode;
      let exitCode = 0;

      if (sub === 'add') {
        const [, name, url, searchTpl] = subTokens;
        if (!name || !url) {
          richNode = <div className="text-amber-400">Usage: apps add &lt;name&gt; &lt;url&gt; [search-url-with-{'{query}'}]</div>;
          exitCode = 2;
        } else {
          const created = createCustomAppShortcut(name, url, searchTpl);
          if (created.error || !created.shortcut) {
            richNode = <div className="text-red-400">Error: {created.error}</div>;
            exitCode = 1;
          } else {
            onAddCustomApp(created.shortcut);
            sound.playConfirm();
            richNode = (
              <div className="text-emerald-400">
                Saved custom app <span className="font-bold text-white">{created.shortcut.name}</span> → {created.shortcut.url}
              </div>
            );
          }
        }
      } else if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
        const targetName = subTokens.slice(1).join(' ');
        if (!targetName) {
          richNode = <div className="text-amber-400">Usage: apps remove &lt;name&gt;</div>;
          exitCode = 2;
        } else {
          const removed = onRemoveCustomApp(targetName);
          exitCode = removed ? 0 : 1;
          richNode = removed ? (
            <div className="text-emerald-400">Removed custom app "{targetName}".</div>
          ) : (
            <div className="text-red-400">No saved custom app named "{targetName}" was found.</div>
          );
        }
      } else {
        richNode = (
          <div className="space-y-1.5">
            <div>
              <span className="text-cyan-400 font-bold">Custom Apps ({customApps.length}):</span>{' '}
              {customApps.length === 0
                ? 'None saved (use: apps add <name> <url>)'
                : customApps.map(a => `${a.name} (${a.url})`).join(' · ')}
            </div>
            <div>
              <span className="text-cyan-400 font-bold">System Modules:</span>{' '}
              {BUILTIN_SYSTEM_APPS.map(a => a.aliases[0]).join(' · ')}
            </div>
            <div>
              <span className="text-cyan-400 font-bold">Desktop Protocols:</span>{' '}
              {BUILTIN_DESKTOP_APPS.map(a => `${a.name} (${formatDisplayHost(a.url)})`).join(' · ')}
            </div>
            <div>
              <span className="text-cyan-400 font-bold">Web Shortcuts:</span>{' '}
              {BUILTIN_WEB_APPS.slice(0, 14).map(a => a.name).join(' · ')}
            </div>
          </div>
        );
      }

      updatePane(tabId, pane.id, p => ({
        ...p,
        lastExitCode: exitCode,
        entries: [
          ...p.entries,
          {
            id: makeId('apps'),
            kind: 'command',
            command: rawCommand,
            promptUser,
            promptPath,
            promptMode,
            chunks: [],
            richNode,
            exitCode,
          },
        ],
      }));
      return;
    }

    if (!hasShellOperators && (base === 'open' || base === 'play' || base === 'launch') && args.length > 0) {
      const firstArg = args[0];
      const looksLikeLocalPath =
        base === 'open' && (firstArg.startsWith('/') || firstArg.startsWith('./') || firstArg.startsWith('../') || firstArg.startsWith('~'));
      if (!looksLikeLocalPath) {
        const intent = resolveLaunchIntent(trimmed, customApps);
        if (intent && (intent.shouldAutoLaunch || intent.action.kind === 'system' || intent.action.opensInSubWindow)) {
          let richNode: React.ReactNode;
          if (intent.action.kind === 'system' && intent.action.systemAppId) {
            onOpenApp?.(intent.action.systemAppId);
            sound.playConfirm();
            richNode = <div className="text-emerald-400">Focused window: <span className="font-bold">{intent.action.label}</span></div>;
          } else if (intent.action.opensInSubWindow && onOpenWebPortal) {
            onOpenWebPortal(buildPortalPayloadFromAction(intent.action));
            sound.playConfirm();
            richNode = (
              <div className="text-emerald-400">
                Opened in JARVIS sub-window: <span className="font-bold">{intent.action.label}</span>
                {intent.action.mediaQuery ? ` (${intent.action.mediaType}: "${intent.action.mediaQuery}")` : ''}
              </div>
            );
          } else if (intent.action.url) {
            dispatchExternalLaunch(intent.action.url);
            sound.playConfirm();
            richNode = (
              <div className="space-y-1">
                <div className="text-emerald-400">Launched {intent.action.label}</div>
                <a
                  href={intent.action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-cyan-400 underline"
                >
                  {intent.action.url}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            );
          }

          updatePane(tabId, pane.id, p => ({
            ...p,
            lastExitCode: 0,
            entries: [
              ...p.entries,
              {
                id: makeId('launch'),
                kind: 'command',
                command: rawCommand,
                promptUser,
                promptPath,
                promptMode,
                chunks: [],
                richNode,
                exitCode: 0,
              },
            ],
          }));
          return;
        }
      }
    }

    if (!hasShellOperators && base === 'jarvis') {
      const query = args.join(' ');
      if (!query) {
        updatePane(tabId, pane.id, p => ({
          ...p,
          lastExitCode: 2,
          entries: [
            ...p.entries,
            {
              id: makeId('jarvis-usage'),
              kind: 'command',
              command: rawCommand,
              promptUser,
              promptPath,
              promptMode,
              chunks: [{ stream: 'stderr', text: 'Usage: jarvis <question or command>\n' }],
              exitCode: 2,
            },
          ],
        }));
        return;
      }

      const entryId = makeId('jarvis');
      updatePane(tabId, pane.id, p => ({
        ...p,
        running: true,
        entries: [
          ...p.entries,
          {
            id: entryId,
            kind: 'command',
            command: rawCommand,
            promptUser,
            promptPath,
            promptMode,
            chunks: [],
            running: true,
          },
        ],
      }));

      try {
        const res = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: query }),
        });
        const data = await res.json();
        updatePane(tabId, pane.id, p => ({
          ...p,
          running: false,
          lastExitCode: 0,
          entries: p.entries.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  running: false,
                  exitCode: 0,
                  chunks: [{ stream: 'stdout', text: `J.A.R.V.I.S.: ${data.response || 'Done.'}\n` }],
                }
              : e
          ),
        }));
      } catch {
        updatePane(tabId, pane.id, p => ({
          ...p,
          running: false,
          lastExitCode: 1,
          entries: p.entries.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  running: false,
                  exitCode: 1,
                  chunks: [{ stream: 'stderr', text: 'jarvis: failed to reach neural endpoint\n' }],
                }
              : e
          ),
        }));
      }
      return;
    }

    // REAL PERSISTENT LINUX PTY BASH EXECUTION (including `sudo -i`, `sudo <cmd>`, and `exit`)
    const entryId = makeId('cmd');
    updatePane(tabId, pane.id, p => ({
      ...p,
      running: true,
      entries: [
        ...p.entries,
        {
          id: entryId,
          kind: 'command',
          command: rawCommand,
          promptUser,
          promptPath,
          promptMode,
          chunks: [],
          running: true,
        },
      ],
    }));

    try {
      const response = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: pane.sessionId || '',
          command: rawCommand,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        updatePane(tabId, pane.id, p => ({
          ...p,
          running: false,
          lastExitCode: 1,
          entries: p.entries.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  running: false,
                  exitCode: 1,
                  chunks: [{ stream: 'stderr', text: `${errJson.error || 'Execution failed'}\n` }],
                }
              : e
          ),
        }));
        return;
      }

      await consumeTerminalNdjsonStream(tabId, pane.id, entryId, response);
    } catch (err: any) {
      updatePane(tabId, pane.id, p => ({
        ...p,
        running: false,
        lastExitCode: 1,
        entries: p.entries.map(e =>
          e.id === entryId
            ? {
                ...e,
                running: false,
                exitCode: 1,
                chunks: [
                  ...e.chunks,
                  { stream: 'stderr', text: `bash: connection error: ${err?.message || 'failed to execute'}\n` },
                ],
              }
            : e
        ),
      }));
    }
  };

  const handleTabComplete = async (tabId: string, pane: TerminalPaneState) => {
    if (pane.running || pane.sudoPrompt) return;
    try {
      const res = await fetch('/api/terminal/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: pane.sessionId || '',
          line: pane.input,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const matches: string[] = Array.isArray(data.matches) ? data.matches : [];
      const token: string = typeof data.token === 'string' ? data.token : '';

      if (matches.length === 0) {
        updatePane(tabId, pane.id, p => ({ ...p, completionHints: [] }));
        return;
      }

      const prefixWithoutToken = pane.input.slice(0, pane.input.length - token.length);
      if (matches.length === 1) {
        const single = matches[0];
        const trailingSpace = single.endsWith('/') ? '' : ' ';
        updatePane(tabId, pane.id, p => ({
          ...p,
          input: `${prefixWithoutToken}${single}${trailingSpace}`,
          completionHints: [],
        }));
        return;
      }

      const common = longestCommonPrefix(matches);
      if (common.length > token.length) {
        updatePane(tabId, pane.id, p => ({
          ...p,
          input: `${prefixWithoutToken}${common}`,
          completionHints: matches.slice(0, 24),
        }));
      } else {
        updatePane(tabId, pane.id, p => ({
          ...p,
          completionHints: matches.slice(0, 24),
        }));
      }
    } catch {
      // Ignore completion errors
    }
  };

  const reverseSearchMatch = reverseSearchQuery
    ? [...commandHistory]
        .reverse()
        .find(cmd => cmd.toLowerCase().includes(reverseSearchQuery.toLowerCase())) || ''
    : commandHistory[commandHistory.length - 1] || '';

  const handlePaneKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    tabId: string,
    pane: TerminalPaneState
  ) => {
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      void handleInterruptRunning(tabId, pane);
      return;
    }

    // Ctrl+D on empty input acts like real Linux EOF -> `exit` (exits ROOT MODE back to USER MODE!)
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'd' && pane.input === '' && !pane.running) {
      e.preventDefault();
      void executeLinuxCommand(tabId, pane, 'exit');
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      handleClearPane(tabId, pane.id);
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      setReverseSearchOpen(true);
      setReverseSearchQuery('');
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      updatePane(tabId, pane.id, p => ({ ...p, input: '', completionHints: [] }));
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      inputRefs.current.get(pane.id)?.setSelectionRange(0, 0);
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      const len = pane.input.length;
      inputRefs.current.get(pane.id)?.setSelectionRange(len, len);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      void handleTabComplete(tabId, pane);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (pane.running) return;
      void executeLinuxCommand(tabId, pane, pane.input);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex =
        pane.historyIndex + 1 < commandHistory.length
          ? pane.historyIndex + 1
          : pane.historyIndex;
      const nextCmd = commandHistory[commandHistory.length - 1 - nextIndex] || '';
      updatePane(tabId, pane.id, p => ({
        ...p,
        historyIndex: nextIndex,
        input: nextCmd,
        completionHints: [],
      }));
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (pane.historyIndex > 0) {
        const nextIndex = pane.historyIndex - 1;
        const nextCmd = commandHistory[commandHistory.length - 1 - nextIndex] || '';
        updatePane(tabId, pane.id, p => ({
          ...p,
          historyIndex: nextIndex,
          input: nextCmd,
          completionHints: [],
        }));
      } else if (pane.historyIndex === 0) {
        updatePane(tabId, pane.id, p => ({
          ...p,
          historyIndex: -1,
          input: '',
          completionHints: [],
        }));
      }
    }
  };

  const handlePaneClick = (tabId: string, pane: TerminalPaneState) => {
    setContextMenu(null);
    updateTab(tabId, t => (t.activePaneId === pane.id ? t : { ...t, activePaneId: pane.id }));

    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    if (pane.sudoPrompt) {
      sudoPasswordRefs.current.get(pane.id)?.focus();
    } else if (reverseSearchOpen) {
      reverseInputRef.current?.focus();
    } else {
      inputRefs.current.get(pane.id)?.focus();
    }
  };

  const isRootMode = activePane ? activePane.uid === 0 : false;
  const contextTargetTab = contextMenu ? tabs.find(t => t.id === contextMenu.tabId) : undefined;
  const canSplitContextTab = contextTargetTab ? contextTargetTab.panes.length < MAX_VERTICAL_SPLIT_PANES : false;

  return (
    <div
      ref={rootContainerRef}
      className={`relative flex flex-col h-full ${theme.canvasBg} ${theme.text} font-mono overflow-hidden`}
      onClick={() => {
        if (contextMenu) setContextMenu(null);
        if (activeTab && activePane) {
          handlePaneClick(activeTab.id, activePane);
        }
      }}
    >
      {/* Linux Terminal Tab & Controls Bar */}
      <div
        className={`flex items-center justify-between gap-2 px-2 py-1.5 ${theme.barBg} border-b ${theme.border} shrink-0 select-none`}
        onClick={e => {
          e.stopPropagation();
          if (contextMenu) setContextMenu(null);
        }}
      >
        {/* Shell Tabs */}
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label="Terminal tabs">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === resolvedActiveTabId;
            const tabFocusedPane = getTabActivePane(tab);
            const tabIsRoot = tab.panes.some(p => p.uid === 0);
            const tabIsRunning = tab.panes.some(p => p.running);
            const tabPath = tabFocusedPane ? formatPromptPath(tabFocusedPane.cwd, tabFocusedPane.homeDir) : '~';
            const shortPath = tabPath.length > 16 ? `.../${tabPath.split('/').pop()}` : tabPath;
            const displayLabel = formatTerminalTabLabel({
              customTitle: tab.customTitle,
              tabIndex: idx,
              isRoot: tabIsRoot,
              isRunning: tabIsRunning,
              shortPath,
            });
            const isRenaming = renamingTabId === tab.id;
            const isSplit = tab.panes.length > 1;

            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setContextMenu(null);
                }}
                onContextMenu={e => handleTabContextMenu(e, tab.id)}
                title={`${displayLabel}${isSplit ? ` (${tab.panes.length} vertical panes)` : ''} — Right-click for tab options`}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] cursor-pointer transition-colors whitespace-nowrap shrink-0 border ${
                  isActive
                    ? `${theme.tabActiveBg} ${tabIsRoot ? 'border-red-500/50' : theme.border}`
                    : `${theme.tabIdleBg} border-transparent`
                }`}
              >
                <TerminalIcon className={`w-3 h-3 shrink-0 ${tabIsRoot ? 'text-red-400' : 'opacity-75'}`} />

                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameDraft}
                    maxLength={40}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setRenameDraft(e.target.value)}
                    onBlur={() => commitRenameTab(tab.id)}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRenameTab(tab.id);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRenameTab();
                      }
                    }}
                    aria-label="Rename terminal tab"
                    className="w-28 bg-black/40 border border-sky-400/60 rounded px-1 py-0 text-[11px] text-white focus:outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={e => {
                      e.stopPropagation();
                      startRenameTab(tab.id);
                    }}
                    className="truncate max-w-[140px]"
                  >
                    {displayLabel}
                  </span>
                )}

                {isSplit && !isRenaming && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${theme.muted}`}
                    title={`${tab.panes.length} vertical panes`}
                  >
                    <Columns2 className="w-2.5 h-2.5" />
                    {tab.panes.length}
                  </span>
                )}

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  title="Close shell tab"
                  className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-white/10 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddTab}
            title="New non-root bash tab"
            className={`p-1 rounded ${theme.muted} hover:text-white hover:bg-white/10 transition-colors shrink-0`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Verified Privilege Mode Status + Functional Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activePane && !activePane.connecting && (
            <div
              className={`flex items-center gap-1.5 pr-2 mr-0.5 border-r ${theme.border} text-[11px] font-semibold whitespace-nowrap shrink-0 tabular-nums ${
                isRootMode ? 'text-red-400' : 'text-emerald-400'
              }`}
              title={`Kernel verified process UID: ${activePane.uid} (${activePane.user}) on ${activePane.tty}`}
            >
              {isRootMode ? (
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Shield className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isRootMode ? 'ROOT MODE' : 'USER MODE'}</span>
              <span className={`${theme.muted} font-normal hidden sm:inline`}>· uid {activePane.uid}</span>
            </div>
          )}

          {activeTab && activePane?.running && (
            <button
              type="button"
              onClick={() => void handleInterruptRunning(activeTab.id, activePane)}
              title="Stop running command (Ctrl+C)"
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setReverseSearchOpen(v => !v);
              setReverseSearchQuery('');
            }}
            title="Search command history (Ctrl+R)"
            className={`p-1 rounded ${theme.muted} hover:text-white hover:bg-white/10 transition-colors`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => void handleCopyOutput()}
            title="Copy active pane output"
            className={`p-1 rounded ${theme.muted} hover:text-white hover:bg-white/10 transition-colors`}
          >
            {copiedNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => activeTab && activePane && handleClearPane(activeTab.id, activePane.id)}
            title="Clear active pane (Ctrl+L)"
            className={`p-1 rounded ${theme.muted} hover:text-white hover:bg-white/10 transition-colors`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className={`flex items-center border ${theme.border} rounded overflow-hidden ml-0.5`}>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.max(11, s - 1))}
              title="Decrease font size"
              className={`px-1.5 py-0.5 ${theme.muted} hover:text-white hover:bg-white/10 transition-colors`}
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className={`px-1 text-[10px] tabular-nums ${theme.muted}`}>{fontSize}</span>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.min(18, s + 1))}
              title="Increase font size"
              className={`px-1.5 py-0.5 ${theme.muted} hover:text-white hover:bg-white/10 transition-colors`}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <select
            aria-label="Terminal color theme"
            value={themeId}
            onChange={e => setThemeId(e.target.value as TerminalThemeId)}
            className={`ml-0.5 px-1.5 py-0.5 rounded text-[11px] bg-black/30 border ${theme.border} ${theme.text} focus:outline-none cursor-pointer`}
          >
            {Object.values(TERMINAL_THEMES).map(t => (
              <option key={t.id} value={t.id} className="bg-slate-900 text-slate-100">
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Subtle Elevated Root Mode Warning Bar (Only visible when active pane kernel UID === 0) */}
      {isRootMode && activeTab && activePane && !activePane.connecting && (
        <div className="flex items-center justify-between gap-3 px-3 py-1 bg-red-950/60 border-b border-red-500/30 text-[11px] text-red-200 shrink-0 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="truncate">
              ROOT MODE active (uid=0, isolated cloud sandbox). Type <span className="font-semibold text-white">exit</span> to return to USER MODE.
            </span>
          </div>
          <button
            type="button"
            disabled={activePane.running}
            onClick={e => {
              e.stopPropagation();
              void executeLinuxCommand(activeTab.id, activePane, 'exit');
            }}
            className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 text-red-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            Exit Root
          </button>
        </div>
      )}

      {/* Reverse-i-search Bar (Ctrl+R) */}
      {reverseSearchOpen && activeTab && activePane && (
        <div
          className={`flex items-center gap-2 px-3 py-1.5 ${theme.barBg} border-b ${theme.border} text-xs shrink-0`}
          onClick={e => e.stopPropagation()}
        >
          <span className={theme.muted}>(reverse-i-search)`</span>
          <input
            ref={reverseInputRef}
            type="text"
            value={reverseSearchQuery}
            onChange={e => setReverseSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setReverseSearchOpen(false);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                setReverseSearchOpen(false);
                if (reverseSearchMatch) {
                  updatePane(activeTab.id, activePane.id, p => ({ ...p, input: reverseSearchMatch }));
                }
              }
            }}
            className="w-40 bg-black/30 px-1.5 py-0.5 rounded text-slate-100 focus:outline-none"
            placeholder="type to search..."
          />
          <span className={theme.muted}>`:</span>
          <span className="truncate flex-1 text-emerald-300">{reverseSearchMatch || '(no match)'}</span>
          <button
            type="button"
            onClick={() => setReverseSearchOpen(false)}
            className={`p-0.5 rounded ${theme.muted} hover:text-white`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split-Capable Terminal Viewport */}
      <div className={`flex-1 flex flex-row min-h-0 overflow-hidden divide-x ${theme.border}`}>
        {activeTab?.panes.map((pane, paneIndex) => {
          const paneIsFocused = pane.id === activePane?.id;
          const panePromptPath = formatPromptPath(pane.cwd, pane.homeDir);
          const paneIsRoot = pane.uid === 0;
          const panePromptSymbol = paneIsRoot ? '#' : '$';
          const showPaneHeader = activeTab.panes.length > 1;

          return (
            <div
              key={pane.id}
              onClick={e => {
                e.stopPropagation();
                handlePaneClick(activeTab.id, pane);
              }}
              className={`flex-1 min-w-0 flex flex-col overflow-hidden transition-opacity ${
                showPaneHeader && !paneIsFocused ? 'opacity-85 hover:opacity-100' : 'opacity-100'
              }`}
            >
              {/* Compact Split Pane Header (only shown when tab is vertically split) */}
              {showPaneHeader && (
                <div
                  className={`flex items-center justify-between gap-2 px-2.5 py-1 ${theme.paneHeaderBg} border-b ${theme.border} text-[10px] shrink-0 select-none`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 tabular-nums">
                    <span
                      className={`font-semibold whitespace-nowrap ${
                        paneIsRoot
                          ? 'text-red-400'
                          : paneIsFocused
                            ? theme.paneActiveAccent
                            : theme.muted
                      }`}
                    >
                      Pane {paneIndex + 1} · {paneIsRoot ? 'ROOT' : 'USER'} (uid {pane.uid})
                    </span>
                    <span className={theme.muted}>·</span>
                    <span className={`truncate ${theme.muted}`}>{panePromptPath}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {paneIsFocused && (
                      <span className={`text-[10px] ${theme.paneActiveAccent} whitespace-nowrap`}>Active</span>
                    )}
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleClosePane(activeTab.id, pane.id);
                      }}
                      title="Close split pane"
                      className={`p-0.5 rounded ${theme.muted} hover:text-white hover:bg-white/10 transition-colors`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Scrollable Terminal Buffer + Inline Interactive Prompt */}
              <div
                ref={el => {
                  if (el) {
                    scrollContainerRefs.current.set(pane.id, el);
                  } else {
                    scrollContainerRefs.current.delete(pane.id);
                  }
                }}
                style={{ fontSize: `${fontSize}px` }}
                className="flex-1 overflow-y-auto px-3.5 py-3 space-y-1.5"
              >
                {pane.connecting && (
                  <div className={theme.muted}>Starting non-root /usr/bin/bash PTY session (jarvis)...</div>
                )}

                {pane.entries.map(entry => {
                  const entryIsRoot = entry.promptMode === 'root';
                  return (
                    <div key={entry.id} className="space-y-0.5">
                      {entry.kind === 'command' && (
                        <div className="flex items-baseline gap-1.5 flex-wrap break-all">
                          <span
                            className={`${entryIsRoot ? theme.promptRoot : theme.promptUser} font-semibold select-none`}
                          >
                            {entry.promptUser || pane.user}@{pane.hostname}
                          </span>
                          <span className={`${theme.muted} select-none`}>:</span>
                          <span className={`${theme.promptPath} font-semibold select-none`}>
                            {entry.promptPath || '~'}
                          </span>
                          <span className={`${theme.promptSymbol} select-none`}>
                            {entryIsRoot ? '#' : '$'}
                          </span>
                          <span className="whitespace-pre-wrap break-all">{entry.command}</span>
                          {entry.running && (
                            <span className={`ml-2 text-[11px] ${theme.muted} select-none`}>running...</span>
                          )}
                        </div>
                      )}

                      {entry.chunks.length > 0 && (
                        <AnsiLineView chunks={entry.chunks} stderrClass={theme.stderr} />
                      )}

                      {entry.richNode && (
                        <div className="py-0.5 select-text">{entry.richNode}</div>
                      )}
                    </div>
                  );
                })}

                {/* Tab-Completion Candidate Columns */}
                {pane.completionHints.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 py-1 text-sky-300/90">
                    {pane.completionHints.map(hint => (
                      <button
                        key={hint}
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          const match = pane.input.match(/(?:^|\s)([^\s]*)$/);
                          const token = match ? match[1] : '';
                          const prefix = pane.input.slice(0, pane.input.length - token.length);
                          const spacer = hint.endsWith('/') ? '' : ' ';
                          updatePane(activeTab.id, pane.id, p => ({
                            ...p,
                            input: `${prefix}${hint}${spacer}`,
                            completionHints: [],
                          }));
                          inputRefs.current.get(pane.id)?.focus();
                        }}
                        className="text-left truncate hover:underline"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline Masked Linux Sudo Password Prompt */}
                {!pane.connecting && pane.sudoPrompt && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-amber-300 shrink-0 select-none">
                      {pane.sudoPrompt.prompt}
                    </span>
                    <input
                      ref={el => {
                        if (el) {
                          sudoPasswordRefs.current.set(pane.id, el);
                        } else {
                          sudoPasswordRefs.current.delete(pane.id);
                        }
                      }}
                      type="password"
                      value={pane.sudoPasswordInput}
                      disabled={pane.sudoSubmitting}
                      onFocus={() =>
                        updateTab(activeTab.id, t =>
                          t.activePaneId === pane.id ? t : { ...t, activePaneId: pane.id }
                        )
                      }
                      onChange={e => {
                        const val = e.target.value;
                        updatePane(activeTab.id, pane.id, p => ({ ...p, sudoPasswordInput: val }));
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSudoPasswordSubmit(activeTab.id, pane, false);
                        } else if ((e.ctrlKey && e.key.toLowerCase() === 'c') || e.key === 'Escape') {
                          e.preventDefault();
                          void handleSudoPasswordSubmit(activeTab.id, pane, true);
                        }
                      }}
                      autoFocus={paneIsFocused}
                      autoComplete="off"
                      aria-label="Sudo password input"
                      className={`flex-1 min-w-[100px] bg-transparent ${theme.text} focus:outline-none caret-amber-400`}
                      placeholder={pane.sudoSubmitting ? 'Verifying...' : 'Enter password (Esc/Ctrl+C to cancel)'}
                    />
                  </div>
                )}

                {/* Live Interactive Bash Prompt (USER MODE: jarvis@...$ | ROOT MODE: root@...#) */}
                {!pane.connecting && !pane.sudoPrompt && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {pane.lastExitCode !== 0 && !pane.running && (
                      <span className="text-red-400 font-semibold tabular-nums select-none">
                        [{pane.lastExitCode}]
                      </span>
                    )}
                    <span
                      className={`${paneIsRoot ? theme.promptRoot : theme.promptUser} font-semibold shrink-0 select-none`}
                    >
                      {pane.user}@{pane.hostname}
                    </span>
                    <span className={`${theme.muted} shrink-0 select-none`}>:</span>
                    <span className={`${theme.promptPath} font-semibold shrink-0 select-none`}>
                      {panePromptPath}
                    </span>
                    <span className={`${theme.promptSymbol} shrink-0 select-none`}>{panePromptSymbol}</span>
                    <input
                      ref={el => {
                        if (el) {
                          inputRefs.current.set(pane.id, el);
                        } else {
                          inputRefs.current.delete(pane.id);
                        }
                      }}
                      type="text"
                      value={pane.input}
                      onFocus={() =>
                        updateTab(activeTab.id, t =>
                          t.activePaneId === pane.id ? t : { ...t, activePaneId: pane.id }
                        )
                      }
                      onChange={e => {
                        const val = e.target.value;
                        updatePane(activeTab.id, pane.id, p => ({
                          ...p,
                          input: val,
                          completionHints: [],
                        }));
                      }}
                      onKeyDown={e => handlePaneKeyDown(e, activeTab.id, pane)}
                      disabled={pane.running}
                      autoFocus={paneIsFocused}
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="off"
                      aria-label="Linux terminal command input"
                      className={`flex-1 min-w-[80px] bg-transparent ${theme.text} focus:outline-none ${theme.caret} disabled:opacity-50`}
                      placeholder={pane.running ? 'Process running (press Ctrl+C to stop)...' : ''}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right-Click Context Menu for Terminal Tabs */}
      {contextMenu && contextTargetTab && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Terminal tab actions"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
          className={`absolute z-50 w-48 py-1 rounded-md border ${theme.border} ${theme.menuBg} ${theme.text} shadow-xl text-xs font-sans select-none`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => startRenameTab(contextTargetTab.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors whitespace-nowrap ${theme.menuHover}`}
          >
            <Pencil className="w-3.5 h-3.5 opacity-80 shrink-0" />
            <span>Rename Tab</span>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={!canSplitContextTab}
            onClick={() => handleSplitVertically(contextTargetTab.id)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors whitespace-nowrap ${
              canSplitContextTab ? theme.menuHover : 'opacity-45 cursor-not-allowed'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Columns2 className="w-3.5 h-3.5 opacity-80 shrink-0" />
              <span>Split Vertically</span>
            </span>
            {!canSplitContextTab && (
              <span className={`text-[10px] ${theme.muted}`}>Max {MAX_VERTICAL_SPLIT_PANES}</span>
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleDuplicateSession(contextTargetTab.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors whitespace-nowrap ${theme.menuHover}`}
          >
            <CopyPlus className="w-3.5 h-3.5 opacity-80 shrink-0" />
            <span>Duplicate Session</span>
          </button>
        </div>
      )}
    </div>
  );
};
