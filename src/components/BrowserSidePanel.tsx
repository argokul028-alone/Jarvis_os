import React, { useState } from 'react';
import {
  Bookmark,
  Clock,
  FolderKanban,
  Layers,
  Plus,
  Puzzle,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  X,
  ExternalLink,
  ShieldCheck,
  EyeOff,
} from 'lucide-react';
import {
  BUILTIN_EXTENSIONS,
  TAB_GROUP_COLORS,
  type BrowserBookmark,
  type BrowserExtensionId,
  type BrowserHistoryEntry,
  type BrowserTab,
  type BrowserTabGroup,
  type TabGroupColor,
} from '../utils/browser-engine';
import { formatDisplayHost } from '../utils/app-launcher';

export type BrowserSidePanelTab =
  | 'bookmarks'
  | 'history'
  | 'extensions'
  | 'groups'
  | 'notes';

interface BrowserSidePanelProps {
  activePanel: BrowserSidePanelTab;
  onSelectPanel: (panel: BrowserSidePanelTab) => void;
  onClose: () => void;
  isLight: boolean;
  isPrivate: boolean;
  bookmarks: BrowserBookmark[];
  history: BrowserHistoryEntry[];
  enabledExtensions: BrowserExtensionId[];
  tabs: BrowserTab[];
  tabGroups: BrowserTabGroup[];
  activeTab: BrowserTab;
  pageNote: string;
  onChangePageNote: (value: string) => void;
  onOpenUrl: (url: string, inNewTab?: boolean) => void;
  onAddBookmark: (title: string, url: string, folder?: string) => void;
  onRemoveBookmark: (id: string) => void;
  onRemoveHistory: (id: string) => void;
  onClearHistory: () => void;
  onToggleExtension: (id: BrowserExtensionId) => void;
  onTriggerSummarize: () => void;
  onCreateTabGroup: (name: string, color: TabGroupColor, initialTabId?: string) => void;
  onAssignTabToGroup: (tabId: string, groupId: string | null) => void;
  onToggleGroupCollapsed: (groupId: string) => void;
  onDeleteTabGroup: (groupId: string) => void;
}

const GROUP_DOT_CLASSES: Record<TabGroupColor, string> = {
  cyan: 'bg-cyan-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  violet: 'bg-violet-400',
  rose: 'bg-rose-400',
  blue: 'bg-blue-400',
};

function formatTimeShort(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const BrowserSidePanel: React.FC<BrowserSidePanelProps> = ({
  activePanel,
  onSelectPanel,
  onClose,
  isLight,
  isPrivate,
  bookmarks,
  history,
  enabledExtensions,
  tabs,
  tabGroups,
  activeTab,
  pageNote,
  onChangePageNote,
  onOpenUrl,
  onAddBookmark,
  onRemoveBookmark,
  onRemoveHistory,
  onClearHistory,
  onToggleExtension,
  onTriggerSummarize,
  onCreateTabGroup,
  onAssignTabToGroup,
  onToggleGroupCollapsed,
  onDeleteTabGroup,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newBmTitle, setNewBmTitle] = useState('');
  const [newBmUrl, setNewBmUrl] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<TabGroupColor>('cyan');

  const panelBg = isLight
    ? 'bg-slate-50 border-slate-200 text-slate-900'
    : isPrivate
    ? 'bg-[#100c1e] border-violet-500/25 text-slate-100'
    : 'bg-slate-950/95 border-cyan-500/20 text-slate-100';

  const cardBg = isLight
    ? 'bg-white border-slate-200 hover:border-cyan-500/50'
    : isPrivate
    ? 'bg-violet-950/25 border-violet-500/20 hover:border-violet-400/40'
    : 'bg-slate-900/75 border-slate-800 hover:border-cyan-500/40';

  const inputClass = isLight
    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-cyan-600'
    : 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400';

  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const accentText = isLight ? 'text-cyan-700' : isPrivate ? 'text-violet-300' : 'text-cyan-300';

  const filteredBookmarks = bookmarks.filter(b => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q);
  });

  const filteredHistory = history.filter(h => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q);
  });

  const handleAddBookmarkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = newBmUrl.trim();
    if (!trimmedUrl) return;
    const normalized = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    onAddBookmark(newBmTitle.trim() || formatDisplayHost(normalized) || normalized, normalized);
    setNewBmTitle('');
    setNewBmUrl('');
  };

  const handleCreateGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    onCreateTabGroup(newGroupName.trim(), newGroupColor, activeTab.id);
    setNewGroupName('');
  };

  const navItems: Array<{ id: BrowserSidePanelTab; label: string; icon: React.ReactNode }> = [
    { id: 'bookmarks', label: 'Bookmarks', icon: <Bookmark className="w-3.5 h-3.5" /> },
    { id: 'history', label: 'History', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'extensions', label: 'Extensions', icon: <Puzzle className="w-3.5 h-3.5" /> },
    { id: 'groups', label: 'Groups', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'notes', label: 'Notes', icon: <StickyNote className="w-3.5 h-3.5" /> },
  ];

  return (
    <aside
      className={`w-[300px] shrink-0 border-l flex flex-col h-full overflow-hidden ${panelBg}`}
    >
      {/* Header & Tabs */}
      <div className={`px-2.5 pt-2 pb-1.5 border-b ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-mono font-semibold uppercase tracking-wider ${accentText}`}>
            {activePanel === 'bookmarks' && 'Bookmarks Manager'}
            {activePanel === 'history' && 'Browsing History'}
            {activePanel === 'extensions' && 'Browser Extensions'}
            {activePanel === 'groups' && 'Tab Groups'}
            {activePanel === 'notes' && 'Page Quick Notes'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close side panel"
            className={`p-1 rounded transition-colors ${
              isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {navItems.map(item => {
            const active = activePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectPanel(item.id);
                  setSearchTerm('');
                }}
                title={item.label}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? isLight
                      ? 'bg-cyan-600/15 text-cyan-800 border border-cyan-600/30'
                      : isPrivate
                      ? 'bg-violet-500/25 text-violet-200 border border-violet-400/40'
                      : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/35'
                    : isLight
                    ? 'text-slate-600 hover:bg-slate-200/70 border border-transparent'
                    : 'text-slate-400 hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                {item.icon}
                <span className="mt-0.5 truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {/* BOOKMARKS */}
        {activePanel === 'bookmarks' && (
          <>
            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 ${mutedText}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search bookmarks..."
                className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputClass}`}
              />
            </div>

            <form onSubmit={handleAddBookmarkSubmit} className={`p-2.5 rounded-lg border space-y-2 ${cardBg}`}>
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-75">
                Add Bookmark
              </div>
              <input
                type="text"
                value={newBmTitle}
                onChange={e => setNewBmTitle(e.target.value)}
                placeholder="Title (optional)"
                className={`w-full px-2 py-1.5 rounded border text-xs outline-none ${inputClass}`}
              />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newBmUrl}
                  onChange={e => setNewBmUrl(e.target.value)}
                  placeholder="https://example.com"
                  className={`flex-1 min-w-0 px-2 py-1.5 rounded border text-xs outline-none ${inputClass}`}
                />
                <button
                  type="submit"
                  className={`px-2.5 py-1.5 rounded font-medium text-xs shrink-0 whitespace-nowrap transition-colors ${
                    isLight
                      ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                      : 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/35'
                  }`}
                >
                  Save
                </button>
              </div>
            </form>

            <div className="space-y-1.5">
              {filteredBookmarks.length === 0 ? (
                <div className={`text-center py-6 ${mutedText}`}>No bookmarks match your filter.</div>
              ) : (
                filteredBookmarks.map(bm => (
                  <div
                    key={bm.id}
                    className={`group flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors ${cardBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenUrl(bm.url, false)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-medium truncate">{bm.title}</div>
                      <div className={`text-[10px] font-mono truncate ${mutedText}`}>
                        {formatDisplayHost(bm.url) || bm.url}
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenUrl(bm.url, true)}
                        title="Open in new tab"
                        className={`p-1 rounded ${
                          isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveBookmark(bm.id)}
                        title="Remove bookmark"
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* HISTORY */}
        {activePanel === 'history' && (
          <>
            {isPrivate ? (
              <div className={`p-4 rounded-xl border text-center space-y-2 ${cardBg}`}>
                <EyeOff className="w-6 h-6 mx-auto text-violet-400" />
                <div className="font-semibold text-violet-200">Private Window Active</div>
                <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                  Browsing history is disabled and never saved locally or synced to your Google account in Private windows.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 ${mutedText}`} />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Filter history..."
                      className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputClass}`}
                    />
                  </div>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearHistory}
                      className="px-2 py-1.5 rounded-lg border border-rose-500/35 text-rose-400 hover:bg-rose-500/15 text-[11px] font-medium whitespace-nowrap shrink-0"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {filteredHistory.length === 0 ? (
                    <div className={`text-center py-6 ${mutedText}`}>
                      {history.length === 0 ? 'No browsing history recorded yet.' : 'No matching history entries.'}
                    </div>
                  ) : (
                    filteredHistory.map(item => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors ${cardBg}`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenUrl(item.url, false)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="font-medium truncate">{item.title}</div>
                          <div className={`flex items-center gap-2 text-[10px] font-mono ${mutedText}`}>
                            <span className="truncate">{formatDisplayHost(item.url) || item.url}</span>
                            <span className="shrink-0 tabular-nums">{formatTimeShort(item.visitedAtMs)}</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveHistory(item.id)}
                          title="Delete entry"
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* EXTENSIONS */}
        {activePanel === 'extensions' && (
          <div className="space-y-2.5">
            <div className={`text-[11px] leading-relaxed ${mutedText}`}>
              Toggle built-in JARVIS Browser extensions. Active extensions immediately enhance pages inside this window.
            </div>
            {BUILTIN_EXTENSIONS.map(ext => {
              const enabled = enabledExtensions.includes(ext.id);
              return (
                <div key={ext.id} className={`p-2.5 rounded-lg border space-y-2 ${cardBg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-1.5">
                        {ext.id === 'ad_shield' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        {ext.id === 'jarvis_summarizer' && <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        {ext.id === 'quick_notes' && <StickyNote className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        {ext.id === 'focus_dimmer' && <Puzzle className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                        <span className="truncate">{ext.name}</span>
                      </div>
                      <div className={`text-[10px] font-mono ${mutedText}`}>v{ext.version}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      onClick={() => onToggleExtension(ext.id)}
                      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                        enabled
                          ? isLight
                            ? 'bg-cyan-600'
                            : 'bg-cyan-500'
                          : isLight
                          ? 'bg-slate-300'
                          : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform absolute top-0.5 ${
                          enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${mutedText}`}>{ext.description}</p>
                  {enabled && ext.id === 'jarvis_summarizer' && (
                    <button
                      type="button"
                      onClick={onTriggerSummarize}
                      className={`w-full py-1.5 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        isLight
                          ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                          : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/30'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      Summarize Active Page
                    </button>
                  )}
                  {enabled && ext.id === 'quick_notes' && (
                    <button
                      type="button"
                      onClick={() => onSelectPanel('notes')}
                      className={`w-full py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                        isLight
                          ? 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      Open Page Notes
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB GROUPS */}
        {activePanel === 'groups' && (
          <div className="space-y-3">
            <form onSubmit={handleCreateGroupSubmit} className={`p-2.5 rounded-lg border space-y-2 ${cardBg}`}>
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-75">
                New Tab Group
              </div>
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="e.g., Research, Work, Music"
                className={`w-full px-2 py-1.5 rounded border text-xs outline-none ${inputClass}`}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {TAB_GROUP_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewGroupColor(color)}
                      aria-label={`Color ${color}`}
                      className={`w-4 h-4 rounded-full ${GROUP_DOT_CLASSES[color]} ${
                        newGroupColor === color ? 'ring-2 ring-offset-1 ring-white/90 ring-offset-slate-900' : 'opacity-65'
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
                    isLight
                      ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                      : 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/35'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  Create
                </button>
              </div>
            </form>

            {/* Existing Groups */}
            <div className="space-y-2">
              {tabGroups.length === 0 ? (
                <div className={`text-center py-4 ${mutedText}`}>
                  No tab groups yet. Create one above to organize open tabs.
                </div>
              ) : (
                tabGroups.map(group => {
                  const members = tabs.filter(t => t.groupId === group.id);
                  return (
                    <div key={group.id} className={`p-2.5 rounded-lg border space-y-2 ${cardBg}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${GROUP_DOT_CLASSES[group.color]}`} />
                          <span className="font-semibold truncate">{group.name}</span>
                          <span className={`text-[10px] font-mono tabular-nums ${mutedText}`}>
                            ({members.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleGroupCollapsed(group.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {group.collapsed ? 'Expand' : 'Collapse'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTabGroup(group.id)}
                            title="Ungroup & delete"
                            className="p-1 rounded text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Assign Open Tabs */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/40">
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-75 flex items-center gap-1.5">
                <FolderKanban className="w-3 h-3" />
                Assign Open Tabs
              </div>
              {tabs.map(tab => (
                <div key={tab.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border ${cardBg}`}>
                  <span className="truncate flex-1 text-[11px]">{tab.title}</span>
                  <select
                    value={tab.groupId || ''}
                    onChange={e => onAssignTabToGroup(tab.id, e.target.value || null)}
                    className={`px-1.5 py-1 rounded border text-[11px] outline-none max-w-[110px] ${inputClass}`}
                  >
                    <option value="">Ungrouped</option>
                    {tabGroups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGE QUICK NOTES */}
        {activePanel === 'notes' && (
          <div className="space-y-2.5 h-full flex flex-col">
            <div className={`p-2 rounded-lg border text-[11px] ${cardBg}`}>
              <div className={`font-mono text-[10px] uppercase ${mutedText}`}>Active Page</div>
              <div className="font-medium truncate mt-0.5">{activeTab.title}</div>
              <div className={`font-mono text-[10px] truncate ${mutedText}`}>{activeTab.url}</div>
            </div>
            <textarea
              value={pageNote}
              onChange={e => onChangePageNote(e.target.value)}
              placeholder="Write notes for this page... Notes attach automatically to the current URL."
              className={`w-full flex-1 min-h-[220px] p-2.5 rounded-lg border text-xs leading-relaxed resize-none outline-none ${inputClass}`}
            />
            <div className={`text-[10px] font-mono ${mutedText}`}>
              {isPrivate ? 'Private window: note clears when window closes.' : 'Saved automatically for this URL.'}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
