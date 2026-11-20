export const MAX_VERTICAL_SPLIT_PANES = 3;

export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Clamp a right-click context menu coordinate inside its container bounds
 * so it never clips off the edge of a Helios terminal sub-window.
 */
export function clampContextMenuPosition(
  localX: number,
  localY: number,
  containerWidth: number,
  containerHeight: number,
  menuWidth: number = 196,
  menuHeight: number = 132,
  padding: number = 8
): ContextMenuPosition {
  const maxX = Math.max(padding, containerWidth - menuWidth - padding);
  const maxY = Math.max(padding, containerHeight - menuHeight - padding);
  return {
    x: Math.max(padding, Math.min(localX, maxX)),
    y: Math.max(padding, Math.min(localY, maxY)),
  };
}

/**
 * Normalize a user-supplied custom tab title.
 * Trims whitespace, collapses internal newlines, caps length, and returns undefined
 * when blank so the tab reverts to its dynamic default label (`bash N: ~/path`).
 */
export function normalizeCustomTabTitle(raw: string): string | undefined {
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Derive the custom title for a duplicated terminal tab.
 * Preserves automatic default naming if the source tab had no custom title.
 */
export function deriveDuplicatedTabTitle(sourceCustomTitle?: string): string | undefined {
  const base = sourceCustomTitle ? normalizeCustomTabTitle(sourceCustomTitle) : undefined;
  if (!base) return undefined;
  const suffix = ' (copy)';
  if (base.endsWith(suffix)) {
    return base;
  }
  const maxBaseLen = Math.max(1, 40 - suffix.length);
  return `${base.slice(0, maxBaseLen).trimEnd()}${suffix}`;
}

/**
 * Resolve the visible display label for a terminal tab.
 */
export function formatTerminalTabLabel(options: {
  customTitle?: string;
  tabIndex: number;
  isRoot: boolean;
  isRunning: boolean;
  shortPath: string;
}): string {
  if (options.customTitle) {
    return options.customTitle;
  }
  const prefix = options.isRunning ? 'running' : options.isRoot ? 'root' : `bash ${options.tabIndex + 1}`;
  return `${prefix}: ${options.shortPath}`;
}

/**
 * Insert a duplicated tab immediately after the source tab index.
 */
export function insertTabAfter<T extends { id: string }>(
  tabs: T[],
  sourceTabId: string,
  newTab: T
): T[] {
  const idx = tabs.findIndex(t => t.id === sourceTabId);
  if (idx === -1) {
    return [...tabs, newTab];
  }
  return [...tabs.slice(0, idx + 1), newTab, ...tabs.slice(idx + 1)];
}
