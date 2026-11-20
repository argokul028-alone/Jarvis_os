import type {
  NotificationBarSettings,
  NotificationCategory,
  NotificationLayoutStyle,
  NotificationPosition,
  NotificationThemeId,
  OsNotification,
  QuickControlsState,
} from '../types/os.ts';

export const NOTIFICATION_SETTINGS_STORAGE_KEY = 'jarvisos_notification_settings_v1';
export const QUICK_CONTROLS_STORAGE_KEY = 'jarvisos_quick_controls_v1';
export const MAX_NOTIFICATIONS = 60;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationBarSettings = {
  position: 'right',
  sizePx: 390,
  opacity: 94,
  layoutStyle: 'list',
  theme: 'jarvis',
  doNotDisturb: false,
};

export function createInitialQuickControlsState(webBluetoothSupported = false): QuickControlsState {
  return {
    location: {
      enabled: false,
      highAccuracy: true,
      permissionState: 'prompt',
      error: null,
    },
    bluetooth: {
      enabled: false,
      discoverable: false,
      webBluetoothSupported,
      devices: [],
      statusMessage: null,
    },
    hotspot: {
      enabled: false,
      ssid: 'JARVISOS-AP',
      band: '5 GHz',
      passphrase: 'jarvis-secure-link',
    },
    flightMode: {
      enabled: false,
      previousBluetooth: false,
      previousHotspot: false,
      previousWifi: false,
    },
    nearbySharing: {
      enabled: false,
      visibility: 'contacts',
      deviceName: 'JARVISOS-E41-25',
    },
    screenshot: {
      defaultMode: 'workspace',
      format: 'png',
    },
    vpnProxy: {
      enabled: false,
      mode: 'vpn',
      profileName: 'Aegis WireGuard Tunnel',
      serverAddress: 'vpn.local.internal',
      port: '51820',
      protocol: 'WireGuard',
    },
  };
}

export function clampNotificationSettings(
  partial: Partial<NotificationBarSettings>
): NotificationBarSettings {
  const validPositions: NotificationPosition[] = ['right', 'left', 'top', 'bottom', 'separate'];
  const validStyles: NotificationLayoutStyle[] = ['list', 'grid', 'dynamic'];
  const validThemes: NotificationThemeId[] = ['jarvis', 'obsidian', 'frost', 'emerald', 'amber'];

  const position = validPositions.includes(partial.position as NotificationPosition)
    ? (partial.position as NotificationPosition)
    : DEFAULT_NOTIFICATION_SETTINGS.position;

  const layoutStyle = validStyles.includes(partial.layoutStyle as NotificationLayoutStyle)
    ? (partial.layoutStyle as NotificationLayoutStyle)
    : DEFAULT_NOTIFICATION_SETTINGS.layoutStyle;

  const theme = validThemes.includes(partial.theme as NotificationThemeId)
    ? (partial.theme as NotificationThemeId)
    : DEFAULT_NOTIFICATION_SETTINGS.theme;

  const rawSize = typeof partial.sizePx === 'number' && Number.isFinite(partial.sizePx)
    ? partial.sizePx
    : DEFAULT_NOTIFICATION_SETTINGS.sizePx;
  const sizePx = Math.max(320, Math.min(540, Math.round(rawSize)));

  const rawOpacity = typeof partial.opacity === 'number' && Number.isFinite(partial.opacity)
    ? partial.opacity
    : DEFAULT_NOTIFICATION_SETTINGS.opacity;
  const opacity = Math.max(45, Math.min(100, Math.round(rawOpacity)));

  return {
    position,
    sizePx,
    opacity,
    layoutStyle,
    theme,
    doNotDisturb: Boolean(partial.doNotDisturb),
  };
}

export function loadNotificationSettings(): NotificationBarSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    const parsed = JSON.parse(raw);
    return clampNotificationSettings(parsed && typeof parsed === 'object' ? parsed : {});
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationBarSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadQuickControlsState(webBluetoothSupported = false): QuickControlsState {
  const base = createInitialQuickControlsState(webBluetoothSupported);
  if (typeof window === 'undefined' || !window.localStorage) return base;
  try {
    const raw = window.localStorage.getItem(QUICK_CONTROLS_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    return {
      location: { ...base.location, ...(parsed.location || {}), error: null },
      bluetooth: {
        ...base.bluetooth,
        ...(parsed.bluetooth || {}),
        webBluetoothSupported,
        devices: Array.isArray(parsed.bluetooth?.devices) ? parsed.bluetooth.devices : [],
      },
      hotspot: { ...base.hotspot, ...(parsed.hotspot || {}) },
      flightMode: { ...base.flightMode, ...(parsed.flightMode || {}) },
      nearbySharing: { ...base.nearbySharing, ...(parsed.nearbySharing || {}) },
      screenshot: {
        ...base.screenshot,
        ...(parsed.screenshot || {}),
        lastCaptureUrl: undefined,
      },
      vpnProxy: { ...base.vpnProxy, ...(parsed.vpnProxy || {}) },
    };
  } catch {
    return base;
  }
}

export function saveQuickControlsState(state: QuickControlsState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    // Avoid storing large base64 screenshot data URLs in localStorage
    const toPersist: QuickControlsState = {
      ...state,
      screenshot: {
        ...state.screenshot,
        lastCaptureUrl: undefined,
      },
    };
    window.localStorage.setItem(QUICK_CONTROLS_STORAGE_KEY, JSON.stringify(toPersist));
  } catch {
    // Ignore storage quota errors
  }
}

export function createInitialNotifications(): OsNotification[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'notif-system-ready',
      title: 'JARVISOS Core Ready',
      message: 'Aegis microkernel, Linux PTY terminal (user jarvis), and hardware network monitor are active.',
      source: 'System',
      category: 'system',
      timestamp: now,
      read: false,
      priority: 'normal',
      actionLabel: 'Open Settings',
      actionAppId: 'system_settings',
      actionSettingsSection: 'notifications',
    },
    {
      id: 'notif-network-probe',
      title: 'Hardware Network Monitor Active',
      message: 'Real system network interfaces are bound directly to Linux host diagnostics with zero simulated Wi-Fi entries.',
      source: 'Network',
      category: 'network',
      timestamp: now,
      read: false,
      priority: 'normal',
      actionLabel: 'Inspect Network',
      actionAppId: 'network_settings',
    },
  ];
}

export function pushNotification(
  list: OsNotification[],
  item: Omit<OsNotification, 'id' | 'timestamp' | 'read'> & { id?: string; timestamp?: string }
): OsNotification[] {
  const next: OsNotification = {
    ...item,
    id: item.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: item.timestamp || new Date().toISOString(),
    read: false,
  };
  return [next, ...list].slice(0, MAX_NOTIFICATIONS);
}

export function markNotificationRead(list: OsNotification[], id: string): OsNotification[] {
  return list.map(n => (n.id === id ? { ...n, read: true } : n));
}

export function markAllNotificationsRead(list: OsNotification[]): OsNotification[] {
  return list.map(n => (n.read ? n : { ...n, read: true }));
}

export function dismissNotification(list: OsNotification[], id: string): OsNotification[] {
  return list.filter(n => n.id !== id);
}

export function countUnreadNotifications(list: OsNotification[]): number {
  return list.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
}

export function filterNotifications(
  list: OsNotification[],
  filter: 'all' | 'unread' | NotificationCategory
): OsNotification[] {
  if (filter === 'all') return list;
  if (filter === 'unread') return list.filter(n => !n.read);
  return list.filter(n => n.category === filter);
}

/**
 * Coordinates Flight Mode state transitions across Bluetooth, Hotspot, and Wi-Fi memory.
 * Turning Flight Mode ON disables Bluetooth and Hotspot while remembering prior states;
 * turning it OFF restores those prior states cleanly.
 */
export function applyFlightModeToggle(
  state: QuickControlsState,
  enableFlightMode: boolean,
  currentWifiEnabled: boolean
): { nextState: QuickControlsState; restoreWifi: boolean; disableWifi: boolean } {
  if (enableFlightMode) {
    return {
      nextState: {
        ...state,
        flightMode: {
          enabled: true,
          previousBluetooth: state.bluetooth.enabled,
          previousHotspot: state.hotspot.enabled,
          previousWifi: currentWifiEnabled,
        },
        bluetooth: {
          ...state.bluetooth,
          enabled: false,
          discoverable: false,
        },
        hotspot: {
          ...state.hotspot,
          enabled: false,
        },
      },
      restoreWifi: false,
      disableWifi: currentWifiEnabled,
    };
  }

  const restoreWifi = Boolean(state.flightMode.previousWifi);
  return {
    nextState: {
      ...state,
      flightMode: {
        ...state.flightMode,
        enabled: false,
      },
      bluetooth: {
        ...state.bluetooth,
        enabled: state.flightMode.previousBluetooth,
      },
      hotspot: {
        ...state.hotspot,
        enabled: state.flightMode.previousHotspot,
      },
    },
    restoreWifi,
    disableWifi: false,
  };
}

export function formatNotificationRelativeTime(isoTimestamp: string, nowMs: number = Date.now()): string {
  const ts = Date.parse(isoTimestamp);
  if (!Number.isFinite(ts)) return 'now';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
