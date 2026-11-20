import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Bluetooth,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Lock,
  MapPin,
  Network,
  Plane,
  Radio,
  RefreshCw,
  Settings,
  Share2,
  Shield,
  SlidersHorizontal,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AppId,
  NotificationBarSettings,
  NotificationCategory,
  NotificationLayoutStyle,
  NotificationPosition,
  NotificationThemeId,
  OsNotification,
  PowerControlState,
  PowerMode,
  QuickControlId,
  QuickControlsState,
  SystemSettingsSection,
  WifiState,
} from '../types/os';
import {
  countUnreadNotifications,
  filterNotifications,
  formatNotificationRelativeTime,
} from '../utils/notification-manager';
import { calculatePowerMetrics } from '../utils/power-network';
import { sound } from '../utils/audio-fx';

export interface NotificationManagerSharedProps {
  notifications: OsNotification[];
  settings: NotificationBarSettings;
  quickControls: QuickControlsState;
  wifiState: WifiState;
  powerState: PowerControlState;
  screenshotCountdown: number | null;
  onUpdateSettings: (partial: Partial<NotificationBarSettings>) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismissNotification: (id: string) => void;
  onClearAllNotifications: () => void;
  onOpenSettingsSection: (section: SystemSettingsSection) => void;
  onOpenApp: (id: AppId) => void;
  onToggleLocation: (enabled: boolean) => void;
  onToggleLocationHighAccuracy: (highAccuracy: boolean) => void;
  onRefreshLocation: () => void;
  onSelectPowerMode: (mode: PowerMode) => void;
  onToggleChargeLimit80: () => void;
  onToggleBluetooth: (enabled: boolean) => void;
  onToggleBluetoothDiscoverable: (discoverable: boolean) => void;
  onScanBluetooth: () => void;
  onToggleBluetoothDevice: (deviceId: string) => void;
  onUpdateHotspot: (partial: Partial<QuickControlsState['hotspot']>) => void;
  onToggleFlightMode: (enabled: boolean) => void;
  onUpdateNearbySharing: (partial: Partial<QuickControlsState['nearbySharing']>) => void;
  onToggleWifi: () => void | Promise<void>;
  onScanWifi: () => void | Promise<void>;
  onConnectWifi: (ssidOrId: string, passphrase?: string) => Promise<string | null>;
  onCaptureScreenshot: (mode: 'fullscreen' | 'workspace' | 'delay3s') => void;
  onUpdateScreenshotPrefs: (partial: Partial<QuickControlsState['screenshot']>) => void;
  onUpdateVpnProxy: (partial: Partial<QuickControlsState['vpnProxy']>) => void;
}

interface ThemePalette {
  label: string;
  swatch: string;
  rgbBg: string;
  isLight: boolean;
  border: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  switchOn: string;
  switchOff: string;
  switchThumb: string;
}

export const NOTIFICATION_THEMES: Record<NotificationThemeId, ThemePalette> = {
  jarvis: {
    label: 'Jarvis Cyan',
    swatch: 'bg-cyan-400',
    rgbBg: '2, 6, 23',
    isLight: false,
    border: 'border-cyan-500/30',
    surface: 'bg-slate-900/80',
    surfaceMuted: 'bg-slate-950/75',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-400',
    accentText: 'text-cyan-400',
    accentBg: 'bg-cyan-500/20',
    accentBorder: 'border-cyan-400/50',
    switchOn: 'bg-cyan-500',
    switchOff: 'bg-slate-700',
    switchThumb: 'bg-slate-950',
  },
  obsidian: {
    label: 'Obsidian',
    swatch: 'bg-zinc-400',
    rgbBg: '9, 9, 11',
    isLight: false,
    border: 'border-zinc-700/70',
    surface: 'bg-zinc-900/90',
    surfaceMuted: 'bg-zinc-950/85',
    textPrimary: 'text-zinc-100',
    textSecondary: 'text-zinc-400',
    accentText: 'text-indigo-400',
    accentBg: 'bg-indigo-500/20',
    accentBorder: 'border-indigo-400/50',
    switchOn: 'bg-indigo-500',
    switchOff: 'bg-zinc-700',
    switchThumb: 'bg-white',
  },
  frost: {
    label: 'Frost Glass',
    swatch: 'bg-sky-200',
    rgbBg: '241, 245, 249',
    isLight: true,
    border: 'border-slate-300/90',
    surface: 'bg-white/85',
    surfaceMuted: 'bg-slate-200/70',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-600',
    accentText: 'text-sky-600',
    accentBg: 'bg-sky-500/15',
    accentBorder: 'border-sky-500/45',
    switchOn: 'bg-sky-600',
    switchOff: 'bg-slate-300',
    switchThumb: 'bg-white',
  },
  emerald: {
    label: 'Emerald',
    swatch: 'bg-emerald-400',
    rgbBg: '2, 22, 18',
    isLight: false,
    border: 'border-emerald-500/35',
    surface: 'bg-emerald-950/75',
    surfaceMuted: 'bg-slate-950/75',
    textPrimary: 'text-emerald-50',
    textSecondary: 'text-emerald-200/70',
    accentText: 'text-emerald-400',
    accentBg: 'bg-emerald-500/20',
    accentBorder: 'border-emerald-400/50',
    switchOn: 'bg-emerald-500',
    switchOff: 'bg-slate-700',
    switchThumb: 'bg-slate-950',
  },
  amber: {
    label: 'Amber HUD',
    swatch: 'bg-amber-400',
    rgbBg: '23, 15, 6',
    isLight: false,
    border: 'border-amber-500/35',
    surface: 'bg-stone-900/85',
    surfaceMuted: 'bg-stone-950/80',
    textPrimary: 'text-amber-50',
    textSecondary: 'text-amber-200/70',
    accentText: 'text-amber-400',
    accentBg: 'bg-amber-500/20',
    accentBorder: 'border-amber-400/50',
    switchOn: 'bg-amber-500',
    switchOff: 'bg-stone-700',
    switchThumb: 'bg-stone-950',
  },
};

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  palette: ThemePalette;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  palette,
  disabled = false,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => {
      sound.playBlip();
      onChange();
    }}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0 disabled:opacity-40 ${
      checked ? palette.switchOn : palette.switchOff
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${palette.switchThumb} ${
        checked ? 'translate-x-4.5' : 'translate-x-1'
      }`}
    />
  </button>
);

interface NotificationManagerContentProps extends NotificationManagerSharedProps {
  mode: 'drawer' | 'window';
  onClose?: () => void;
}

export const NotificationManagerContent: React.FC<NotificationManagerContentProps> = ({
  mode,
  onClose,
  notifications,
  settings,
  quickControls,
  wifiState,
  powerState,
  screenshotCountdown,
  onUpdateSettings,
  onMarkRead,
  onMarkAllRead,
  onDismissNotification,
  onClearAllNotifications,
  onOpenSettingsSection,
  onOpenApp,
  onToggleLocation,
  onToggleLocationHighAccuracy,
  onRefreshLocation,
  onSelectPowerMode,
  onToggleChargeLimit80,
  onToggleBluetooth,
  onToggleBluetoothDiscoverable,
  onScanBluetooth,
  onToggleBluetoothDevice,
  onUpdateHotspot,
  onToggleFlightMode,
  onUpdateNearbySharing,
  onToggleWifi,
  onScanWifi,
  onConnectWifi,
  onCaptureScreenshot,
  onUpdateScreenshotPrefs,
  onUpdateVpnProxy,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | NotificationCategory>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeFlyout, setActiveFlyout] = useState<QuickControlId | null>(null);
  const [showHotspotPass, setShowHotspotPass] = useState(false);

  const palette = NOTIFICATION_THEMES[settings.theme] || NOTIFICATION_THEMES.jarvis;
  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);
  const filteredNotifications = useMemo(
    () => filterNotifications(notifications, filter),
    [notifications, filter]
  );
  const powerMetrics = useMemo(() => calculatePowerMetrics(powerState), [powerState]);
  const activeNetwork = wifiState.networks.find(n => n.id === wifiState.activeNetworkId) || null;
  const isHorizontalStrip = mode === 'drawer' && (settings.position === 'top' || settings.position === 'bottom');

  const panelBgStyle: React.CSSProperties = {
    backgroundColor: `rgba(${palette.rgbBg}, ${(settings.opacity / 100).toFixed(2)})`,
  };

  const quickControlItems: {
    id: QuickControlId;
    label: string;
    active: boolean;
    status: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'location',
      label: 'Location',
      active: quickControls.location.enabled,
      status: quickControls.location.enabled ? 'On' : 'Off',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      id: 'battery',
      label: 'Battery',
      active: powerMetrics.isActivelyCharging || powerState.mode === 'power_saver',
      status: `${powerMetrics.displayedPercent}%`,
      icon: powerMetrics.isActivelyCharging ? (
        <BatteryCharging className="w-4 h-4" />
      ) : powerMetrics.displayedPercent >= 75 ? (
        <BatteryFull className="w-4 h-4" />
      ) : powerMetrics.displayedPercent >= 30 ? (
        <BatteryMedium className="w-4 h-4" />
      ) : (
        <BatteryLow className="w-4 h-4" />
      ),
    },
    {
      id: 'bluetooth',
      label: 'Bluetooth',
      active: quickControls.bluetooth.enabled && !quickControls.flightMode.enabled,
      status: quickControls.bluetooth.enabled ? 'On' : 'Off',
      icon: <Bluetooth className="w-4 h-4" />,
    },
    {
      id: 'hotspot',
      label: 'Hotspot',
      active: quickControls.hotspot.enabled && !quickControls.flightMode.enabled,
      status: quickControls.hotspot.enabled ? 'Active' : 'Off',
      icon: <Radio className="w-4 h-4" />,
    },
    {
      id: 'flight_mode',
      label: 'Flight Mode',
      active: quickControls.flightMode.enabled,
      status: quickControls.flightMode.enabled ? 'On' : 'Off',
      icon: <Plane className="w-4 h-4" />,
    },
    {
      id: 'nearby_sharing',
      label: 'Nearby',
      active: quickControls.nearbySharing.enabled,
      status: quickControls.nearbySharing.enabled ? quickControls.nearbySharing.visibility : 'Off',
      icon: <Share2 className="w-4 h-4" />,
    },
    {
      id: 'network',
      label: 'Network',
      active: wifiState.hasWifiHardware ? wifiState.enabled : wifiState.browserOnline,
      status: wifiState.hasWifiHardware
        ? activeNetwork
          ? activeNetwork.ssid
          : wifiState.enabled
          ? 'Wi-Fi On'
          : 'Off'
        : wifiState.browserOnline
        ? wifiState.defaultInterface || 'Online'
        : 'Offline',
      icon: wifiState.hasWifiHardware ? (
        wifiState.enabled ? (
          <Wifi className="w-4 h-4" />
        ) : (
          <WifiOff className="w-4 h-4" />
        )
      ) : (
        <Network className="w-4 h-4" />
      ),
    },
    {
      id: 'screenshot',
      label: 'Screenshot',
      active: screenshotCountdown !== null,
      status: screenshotCountdown !== null ? `${screenshotCountdown}s` : 'Capture',
      icon: <Camera className="w-4 h-4" />,
    },
    {
      id: 'vpn_proxy',
      label: 'VPN / Proxy',
      active: quickControls.vpnProxy.enabled,
      status: quickControls.vpnProxy.enabled ? quickControls.vpnProxy.protocol : 'Off',
      icon: <Lock className="w-4 h-4" />,
    },
  ];

  const handleNotificationAction = (notif: OsNotification) => {
    onMarkRead(notif.id);
    if (notif.actionSettingsSection) {
      onOpenSettingsSection(notif.actionSettingsSection);
      return;
    }
    if (notif.actionAppId) {
      onOpenApp(notif.actionAppId);
      if (mode === 'drawer') onClose?.();
    }
  };

  const renderFlyout = () => {
    if (!activeFlyout) return null;

    const sectionMap: Record<QuickControlId, SystemSettingsSection> = {
      location: 'location',
      battery: 'battery',
      bluetooth: 'bluetooth',
      hotspot: 'hotspot',
      flight_mode: 'flight_mode',
      nearby_sharing: 'nearby_sharing',
      network: 'network',
      screenshot: 'screenshot',
      vpn_proxy: 'vpn_proxy',
    };

    const titles: Record<QuickControlId, string> = {
      location: 'Location Services',
      battery: 'Battery & Power',
      bluetooth: 'Bluetooth Radio',
      hotspot: 'Personal Hotspot',
      flight_mode: 'Flight Mode',
      nearby_sharing: 'Nearby Sharing',
      network: 'Network & Wi-Fi',
      screenshot: 'Screen Capture',
      vpn_proxy: 'VPN & Proxy Tunnel',
    };

    return (
      <div
        role="region"
        aria-label={`${titles[activeFlyout]} quick controls`}
        className={`mx-3 mb-2 rounded-xl border ${palette.border} ${palette.surface} p-3 shadow-xl transition-all`}
      >
        <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-current/10">
          <div className={`text-xs font-semibold ${palette.textPrimary} flex items-center gap-1.5`}>
            <span className={palette.accentText}>
              {quickControlItems.find(item => item.id === activeFlyout)?.icon}
            </span>
            <span>{titles[activeFlyout]}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveFlyout(null)}
            aria-label="Close flyout"
            className={`p-1 rounded-md hover:bg-current/10 ${palette.textSecondary}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 1. LOCATION FLYOUT */}
        {activeFlyout === 'location' && (
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`font-medium ${palette.textPrimary}`}>Location Access</div>
                <div className={`text-[11px] ${palette.textSecondary}`}>
                  {quickControls.location.enabled
                    ? quickControls.location.lastCoords
                      ? `${quickControls.location.lastCoords.lat.toFixed(4)}, ${quickControls.location.lastCoords.lng.toFixed(4)} (±${quickControls.location.lastCoords.accuracyM}m)`
                      : 'Requesting device geolocation…'
                    : 'Location services are off'}
                </div>
              </div>
              <ToggleSwitch
                checked={quickControls.location.enabled}
                onChange={() => onToggleLocation(!quickControls.location.enabled)}
                label="Toggle Location Services"
                palette={palette}
              />
            </div>

            {quickControls.location.error && (
              <div className="text-[11px] text-amber-400 leading-snug">
                {quickControls.location.error}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <label className={`text-[11px] ${palette.textSecondary}`}>High Accuracy GPS</label>
              <ToggleSwitch
                checked={quickControls.location.highAccuracy}
                onChange={() => onToggleLocationHighAccuracy(!quickControls.location.highAccuracy)}
                label="Toggle High Accuracy GPS"
                palette={palette}
              />
            </div>

            {quickControls.location.enabled && (
              <button
                type="button"
                onClick={onRefreshLocation}
                className={`w-full py-1.5 px-2.5 rounded-lg border ${palette.border} ${palette.surfaceMuted} text-[11px] font-medium ${palette.accentText} flex items-center justify-center gap-1.5 hover:opacity-90`}
              >
                <RefreshCw className="w-3 h-3" />
                Refresh GPS Coordinates
              </button>
            )}
          </div>
        )}

        {/* 2. BATTERY FLYOUT */}
        {activeFlyout === 'battery' && (
          <div className="space-y-2.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className={`text-lg font-mono font-bold tabular-nums ${palette.textPrimary}`}>
                  {powerMetrics.displayedPercent}%
                </span>
                <span className={`text-[11px] font-medium ${palette.accentText}`}>
                  {powerMetrics.statusLabel}
                </span>
              </div>
              <span className={`text-[11px] font-mono tabular-nums ${palette.textSecondary}`}>
                {powerMetrics.powerDrawWatts}W · Health {powerState.healthPercent}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'power_saver', label: 'Saver' },
                  { id: 'balanced', label: 'Balanced' },
                  { id: 'performance', label: 'Turbo' },
                ] as const
              ).map(opt => {
                const active = powerState.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      sound.playBlip();
                      onSelectPowerMode(opt.id);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surfaceMuted} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${palette.textSecondary}`}>80% Charge Limit</span>
              <ToggleSwitch
                checked={powerState.chargeLimit80}
                onChange={onToggleChargeLimit80}
                label="Toggle 80% Charge Limit"
                palette={palette}
              />
            </div>
          </div>
        )}

        {/* 3. BLUETOOTH FLYOUT */}
        {activeFlyout === 'bluetooth' && (
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`font-medium ${palette.textPrimary}`}>Bluetooth Radio</div>
                <div className={`text-[11px] ${palette.textSecondary}`}>
                  {quickControls.flightMode.enabled
                    ? 'Suspended while Flight Mode is active'
                    : quickControls.bluetooth.enabled
                    ? `${quickControls.bluetooth.devices.filter(d => d.connected).length} connected`
                    : 'Bluetooth is off'}
                </div>
              </div>
              <ToggleSwitch
                checked={quickControls.bluetooth.enabled}
                onChange={() => onToggleBluetooth(!quickControls.bluetooth.enabled)}
                label="Toggle Bluetooth"
                palette={palette}
                disabled={quickControls.flightMode.enabled}
              />
            </div>

            {quickControls.bluetooth.enabled && !quickControls.flightMode.enabled && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] ${palette.textSecondary}`}>Discoverable</span>
                  <ToggleSwitch
                    checked={quickControls.bluetooth.discoverable}
                    onChange={() =>
                      onToggleBluetoothDiscoverable(!quickControls.bluetooth.discoverable)
                    }
                    label="Toggle Bluetooth Discoverable"
                    palette={palette}
                  />
                </div>

                {quickControls.bluetooth.devices.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {quickControls.bluetooth.devices.map(dev => (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => onToggleBluetoothDevice(dev.id)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border ${palette.border} ${palette.surfaceMuted} text-[11px]`}
                      >
                        <span className={`truncate ${palette.textPrimary}`}>{dev.name}</span>
                        <span className={dev.connected ? 'text-emerald-400' : palette.textSecondary}>
                          {dev.connected ? 'Connected' : 'Pair'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {quickControls.bluetooth.statusMessage && (
                  <div className={`text-[11px] ${palette.textSecondary} leading-snug`}>
                    {quickControls.bluetooth.statusMessage}
                  </div>
                )}

                <button
                  type="button"
                  onClick={onScanBluetooth}
                  className={`w-full py-1.5 px-2.5 rounded-lg border ${palette.border} ${palette.surfaceMuted} text-[11px] font-medium ${palette.accentText} flex items-center justify-center gap-1.5 hover:opacity-90`}
                >
                  <Bluetooth className="w-3 h-3" />
                  Scan Nearby Devices
                </button>
              </>
            )}
          </div>
        )}

        {/* 4. HOTSPOT FLYOUT */}
        {activeFlyout === 'hotspot' && (
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`font-medium ${palette.textPrimary}`}>Wi-Fi Hotspot</div>
                <div className={`text-[11px] ${palette.textSecondary}`}>
                  {quickControls.flightMode.enabled
                    ? 'Disabled while Flight Mode is on'
                    : quickControls.hotspot.enabled
                    ? `Broadcasting ${quickControls.hotspot.ssid} (${quickControls.hotspot.band})`
                    : 'Share connection over local AP'}
                </div>
              </div>
              <ToggleSwitch
                checked={quickControls.hotspot.enabled}
                onChange={() => onUpdateHotspot({ enabled: !quickControls.hotspot.enabled })}
                label="Toggle Personal Hotspot"
                palette={palette}
                disabled={quickControls.flightMode.enabled}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${palette.textSecondary}`}>Band</span>
              <div className="flex items-center gap-1">
                {(['2.4 GHz', '5 GHz'] as const).map(band => (
                  <button
                    key={band}
                    type="button"
                    onClick={() => onUpdateHotspot({ band })}
                    className={`px-2 py-1 rounded-md text-[11px] border whitespace-nowrap shrink-0 ${
                      quickControls.hotspot.band === band
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surfaceMuted} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className={palette.textSecondary}>Key:</span>
              <div className="flex items-center gap-1.5">
                <span className={palette.textPrimary}>
                  {showHotspotPass ? quickControls.hotspot.passphrase : '••••••••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowHotspotPass(prev => !prev)}
                  aria-label={showHotspotPass ? 'Hide hotspot key' : 'Show hotspot key'}
                  className={palette.textSecondary}
                >
                  {showHotspotPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. FLIGHT MODE FLYOUT */}
        {activeFlyout === 'flight_mode' && (
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`font-medium ${palette.textPrimary}`}>Flight Mode</div>
                <div className={`text-[11px] ${palette.textSecondary}`}>
                  {quickControls.flightMode.enabled
                    ? 'Wireless radios suspended (Wi-Fi, Bluetooth, Hotspot)'
                    : 'All wireless radios permitted'}
                </div>
              </div>
              <ToggleSwitch
                checked={quickControls.flightMode.enabled}
                onChange={() => onToggleFlightMode(!quickControls.flightMode.enabled)}
                label="Toggle Flight Mode"
                palette={palette}
              />
            </div>
            <div className={`text-[11px] ${palette.textSecondary} leading-snug`}>
              Turning Flight Mode off restores your previous Bluetooth, Hotspot, and Wi-Fi radio states automatically.
            </div>
          </div>
        )}

        {/* 6. NEARBY SHARING FLYOUT */}
        {activeFlyout === 'nearby_sharing' && (
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`font-medium ${palette.textPrimary}`}>Nearby Sharing</div>
                <div className={`text-[11px] ${palette.textSecondary}`}>
                  Device: {quickControls.nearbySharing.deviceName}
                </div>
              </div>
              <ToggleSwitch
                checked={quickControls.nearbySharing.enabled}
                onChange={() =>
                  onUpdateNearbySharing({
                    enabled: !quickControls.nearbySharing.enabled,
                    visibility: !quickControls.nearbySharing.enabled
                      ? quickControls.nearbySharing.visibility === 'off'
                        ? 'contacts'
                        : quickControls.nearbySharing.visibility
                      : 'off',
                  })
                }
                label="Toggle Nearby Sharing"
                palette={palette}
              />
            </div>

            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'off', label: 'Off' },
                  { id: 'contacts', label: 'Contacts' },
                  { id: 'everyone', label: 'Everyone' },
                ] as const
              ).map(opt => {
                const active =
                  (opt.id === 'off' && !quickControls.nearbySharing.enabled) ||
                  (quickControls.nearbySharing.enabled &&
                    quickControls.nearbySharing.visibility === opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateNearbySharing({
                        enabled: opt.id !== 'off',
                        visibility: opt.id,
                      })
                    }
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border whitespace-nowrap shrink-0 ${
                      active
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surfaceMuted} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 7. NETWORK FLYOUT (REAL HARDWARE ONLY — ZERO FAKE WIFI) */}
        {activeFlyout === 'network' && (
          <div className="space-y-2.5 text-xs">
            {wifiState.hasWifiHardware ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className={`font-medium ${palette.textPrimary}`}>
                      Wi-Fi ({wifiState.wifiInterface || 'wlan0'})
                    </div>
                    <div className={`text-[11px] ${palette.textSecondary}`}>
                      {activeNetwork
                        ? `Connected: ${activeNetwork.ssid} (${activeNetwork.signalPercent}%)`
                        : wifiState.enabled
                        ? `${wifiState.networks.length} hardware networks detected`
                        : 'Wi-Fi radio is off'}
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={wifiState.enabled}
                    onChange={() => void onToggleWifi()}
                    label="Toggle Wi-Fi Radio"
                    palette={palette}
                  />
                </div>
                {wifiState.enabled && wifiState.networks.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {wifiState.networks.slice(0, 4).map(net => {
                      const isConnected = net.id === wifiState.activeNetworkId;
                      return (
                        <button
                          key={net.id}
                          type="button"
                          onClick={() => {
                            if (!isConnected) void onConnectWifi(net.ssid);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border ${palette.border} ${palette.surfaceMuted} text-[11px]`}
                        >
                          <span className={`truncate ${palette.textPrimary}`}>{net.ssid}</span>
                          <span className="font-mono tabular-nums text-[10px] text-cyan-400 shrink-0 ml-2">
                            {isConnected ? 'Connected' : `${net.signalPercent}%`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className={`font-medium ${palette.textPrimary}`}>
                      System Network ({wifiState.defaultInterface || 'host'})
                    </div>
                    <div className={`text-[11px] ${palette.textSecondary}`}>
                      {wifiState.browserOnline ? 'Online' : 'Offline'} ·{' '}
                      {wifiState.interfaces.filter(i => i.state === 'up').length} active Linux
                      interface(s)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onScanWifi()}
                    className={`p-1.5 rounded-lg border ${palette.border} ${palette.surfaceMuted} ${palette.accentText}`}
                    title="Refresh hardware network status"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${wifiState.loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className={`text-[11px] ${palette.textSecondary} leading-snug`}>
                  No physical Wi-Fi adapter is attached to this container. Real Wi-Fi networks appear automatically when booted on hardware.
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8. SCREENSHOT FLYOUT */}
        {activeFlyout === 'screenshot' && (
          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'workspace', label: 'Workspace' },
                  { id: 'fullscreen', label: 'Screen' },
                  { id: 'delay3s', label: '3s Delay' },
                ] as const
              ).map(opt => {
                const active = quickControls.screenshot.defaultMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateScreenshotPrefs({ defaultMode: opt.id })}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border whitespace-nowrap shrink-0 ${
                      active
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surfaceMuted} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={screenshotCountdown !== null}
              onClick={() => onCaptureScreenshot(quickControls.screenshot.defaultMode)}
              className="w-full py-2 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
            >
              <Camera className="w-3.5 h-3.5" />
              {screenshotCountdown !== null
                ? `Capturing in ${screenshotCountdown}s…`
                : 'Capture Screenshot Now'}
            </button>

            {quickControls.screenshot.lastCaptureUrl && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className={`text-[11px] ${palette.textSecondary} truncate`}>
                  Last capture ready
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadDataUrl(
                      quickControls.screenshot.lastCaptureUrl!,
                      `jarvisos-capture.${quickControls.screenshot.format}`
                    )
                  }
                  className={`text-[11px] font-medium ${palette.accentText} flex items-center gap-1 shrink-0 hover:underline`}
                >
                  <Download className="w-3 h-3" />
                  Save
                </button>
              </div>
            )}
          </div>
        )}

        {/* 9. VPN / PROXY FLYOUT */}
        {activeFlyout === 'vpn_proxy' && (
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`font-medium ${palette.textPrimary}`}>
                  {quickControls.vpnProxy.mode === 'vpn' ? 'VPN Tunnel' : 'System Proxy'}
                </div>
                <div className={`text-[11px] font-mono ${palette.textSecondary} truncate`}>
                  {quickControls.vpnProxy.enabled
                    ? `${quickControls.vpnProxy.protocol} · ${quickControls.vpnProxy.serverAddress}:${quickControls.vpnProxy.port}`
                    : 'Disconnected'}
                </div>
              </div>
              <ToggleSwitch
                checked={quickControls.vpnProxy.enabled}
                onChange={() =>
                  onUpdateVpnProxy({ enabled: !quickControls.vpnProxy.enabled })
                }
                label="Toggle VPN or Proxy"
                palette={palette}
              />
            </div>

            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  { id: 'vpn', label: 'VPN Tunnel', defaultProto: 'WireGuard' as const },
                  { id: 'proxy', label: 'HTTP / SOCKS Proxy', defaultProto: 'SOCKS5' as const },
                ] as const
              ).map(opt => {
                const active = quickControls.vpnProxy.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateVpnProxy({
                        mode: opt.id,
                        protocol: opt.defaultProto,
                      })
                    }
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border whitespace-nowrap shrink-0 ${
                      active
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surfaceMuted} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Universal "More Settings" Deep-Link Footer */}
        <div className="mt-3 pt-2 border-t border-current/10 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              sound.playBlip();
              onOpenSettingsSection(sectionMap[activeFlyout]);
              setActiveFlyout(null);
            }}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${palette.accentText} hover:underline whitespace-nowrap shrink-0`}
          >
            <Settings className="w-3 h-3" />
            <span>More Settings</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  const renderNotificationCard = (notif: OsNotification, variant: 'list' | 'grid' | 'spotlight') => {
    const isSpotlight = variant === 'spotlight';
    const isGrid = variant === 'grid';

    return (
      <div
        key={notif.id}
        onClick={() => {
          if (!notif.read) onMarkRead(notif.id);
        }}
        className={`group relative rounded-xl border transition-colors cursor-pointer ${
          notif.read
            ? `${palette.surfaceMuted} ${palette.border} opacity-80 hover:opacity-100`
            : `${palette.surface} ${palette.accentBorder}`
        } ${isSpotlight ? 'p-3.5' : isGrid ? 'p-2.5 flex flex-col justify-between' : 'p-3'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
              {!notif.read && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
              )}
              <span className={palette.accentText}>{notif.source}</span>
              <span className={palette.textSecondary}>·</span>
              <span className={`${palette.textSecondary} tabular-nums`}>
                {formatNotificationRelativeTime(notif.timestamp)}
              </span>
            </div>
            <div
              className={`font-semibold ${palette.textPrimary} mt-1 leading-snug ${
                isSpotlight ? 'text-sm' : 'text-xs'
              } ${isGrid ? 'line-clamp-1' : ''}`}
            >
              {notif.title}
            </div>
          </div>

          <button
            type="button"
            aria-label={`Dismiss ${notif.title}`}
            onClick={e => {
              e.stopPropagation();
              sound.playBlip();
              onDismissNotification(notif.id);
            }}
            className={`p-1 rounded-md opacity-60 group-hover:opacity-100 hover:bg-current/10 ${palette.textSecondary} shrink-0`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        <p
          className={`mt-1 leading-relaxed ${palette.textSecondary} ${
            isGrid ? 'text-[11px] line-clamp-2' : 'text-xs'
          }`}
        >
          {notif.message}
        </p>

        {notif.imageDataUrl && (
          <div className="mt-2 rounded-lg overflow-hidden border border-current/10">
            <img
              src={notif.imageDataUrl}
              alt="Captured screenshot preview"
              className={`w-full object-cover ${isGrid ? 'h-16' : 'h-24'}`}
            />
          </div>
        )}

        {(notif.actionLabel || notif.imageDataUrl) && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {notif.actionLabel && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  sound.playBlip();
                  handleNotificationAction(notif);
                }}
                className={`text-[11px] font-semibold ${palette.accentText} hover:underline inline-flex items-center gap-1`}
              >
                <span>{notif.actionLabel}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
            {notif.imageDataUrl && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  downloadDataUrl(notif.imageDataUrl!, `jarvisos-${notif.id}.png`);
                }}
                className={`text-[11px] font-medium ${palette.textSecondary} hover:underline inline-flex items-center gap-1`}
              >
                <Download className="w-3 h-3" />
                <span>Download PNG</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={panelBgStyle}
      className={`h-full w-full flex flex-col backdrop-blur-2xl ${palette.textPrimary} overflow-hidden`}
    >
      {/* Header */}
      <div className={`px-4 py-3 border-b ${palette.border} flex items-center justify-between gap-2 shrink-0`}>
        <div className="flex items-center gap-2 min-w-0">
          <Bell className={`w-4 h-4 ${palette.accentText} shrink-0`} />
          <h2 className="text-sm font-semibold tracking-tight truncate">Notification Manager</h2>
          <span className={`text-[11px] font-mono tabular-nums ${palette.textSecondary} shrink-0`}>
            ({unreadCount})
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title={settings.doNotDisturb ? 'Disable Do Not Disturb' : 'Enable Do Not Disturb'}
            aria-label="Toggle Do Not Disturb"
            onClick={() => {
              sound.playBlip();
              onUpdateSettings({ doNotDisturb: !settings.doNotDisturb });
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              settings.doNotDisturb
                ? `${palette.accentBg} ${palette.accentText}`
                : `${palette.textSecondary} hover:bg-current/10`
            }`}
          >
            {settings.doNotDisturb ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            title="Mark all as read"
            aria-label="Mark all notifications read"
            onClick={() => {
              sound.playBlip();
              onMarkAllRead();
            }}
            className={`p-1.5 rounded-lg ${palette.textSecondary} hover:bg-current/10 transition-colors`}
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Clear all notifications"
            aria-label="Clear all notifications"
            onClick={() => {
              sound.playBlip();
              onClearAllNotifications();
            }}
            className={`p-1.5 rounded-lg ${palette.textSecondary} hover:text-red-400 hover:bg-current/10 transition-colors`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Notification Bar Settings"
            aria-label="Notification Bar Settings"
            onClick={() => {
              sound.playBlip();
              setSettingsOpen(prev => !prev);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              settingsOpen
                ? `${palette.accentBg} ${palette.accentText}`
                : `${palette.textSecondary} hover:bg-current/10`
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {mode === 'drawer' && onClose && (
            <button
              type="button"
              title="Close Notification Manager"
              aria-label="Close Notification Manager"
              onClick={onClose}
              className={`p-1.5 rounded-lg ${palette.textSecondary} hover:bg-current/10 transition-colors`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Notification Bar Settings Panel */}
      {settingsOpen && (
        <div className={`px-4 py-3 border-b ${palette.border} ${palette.surfaceMuted} space-y-3 shrink-0`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Notification Bar Settings</span>
            <button
              type="button"
              onClick={() => {
                sound.playBlip();
                setSettingsOpen(false);
                onOpenSettingsSection('notifications');
              }}
              className={`text-[11px] font-semibold ${palette.accentText} hover:underline inline-flex items-center gap-1`}
            >
              <span>Full Settings</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <div className={`text-[11px] font-medium ${palette.textSecondary}`}>Position</div>
            <div className="grid grid-cols-5 gap-1">
              {(
                [
                  { id: 'right', label: 'Right' },
                  { id: 'left', label: 'Left' },
                  { id: 'top', label: 'Top' },
                  { id: 'bottom', label: 'Bottom' },
                  { id: 'separate', label: 'Panel' },
                ] as { id: NotificationPosition; label: string }[]
              ).map(pos => {
                const active = settings.position === pos.id;
                return (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => {
                      sound.playBlip();
                      onUpdateSettings({ position: pos.id });
                    }}
                    className={`py-1 px-1.5 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surface} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    {pos.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size & Opacity Sliders */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <div className="flex items-center justify-between text-[11px]">
                <span className={palette.textSecondary}>Size</span>
                <span className="font-mono tabular-nums">{settings.sizePx}px</span>
              </div>
              <input
                type="range"
                min={320}
                max={540}
                step={10}
                value={settings.sizePx}
                onChange={e => onUpdateSettings({ sizePx: Number(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </label>

            <label className="space-y-1 block">
              <div className="flex items-center justify-between text-[11px]">
                <span className={palette.textSecondary}>Opacity</span>
                <span className="font-mono tabular-nums">{settings.opacity}%</span>
              </div>
              <input
                type="range"
                min={45}
                max={100}
                step={1}
                value={settings.opacity}
                onChange={e => onUpdateSettings({ opacity: Number(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </label>
          </div>

          {/* Style */}
          <div className="space-y-1.5">
            <div className={`text-[11px] font-medium ${palette.textSecondary}`}>Notification Style</div>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'list', label: 'Stream List' },
                  { id: 'grid', label: 'Grid Cards' },
                  { id: 'dynamic', label: 'Dynamic Focus' },
                ] as { id: NotificationLayoutStyle; label: string }[]
              ).map(st => {
                const active = settings.layoutStyle === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      sound.playBlip();
                      onUpdateSettings({ layoutStyle: st.id });
                    }}
                    className={`py-1 px-2 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surface} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <div className={`text-[11px] font-medium ${palette.textSecondary}`}>Theme</div>
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(NOTIFICATION_THEMES) as NotificationThemeId[]).map(themeId => {
                const t = NOTIFICATION_THEMES[themeId];
                const active = settings.theme === themeId;
                return (
                  <button
                    key={themeId}
                    type="button"
                    onClick={() => {
                      sound.playBlip();
                      onUpdateSettings({ theme: themeId });
                    }}
                    title={t.label}
                    className={`py-1 px-1.5 rounded-md border flex items-center justify-center gap-1 text-[10px] font-medium whitespace-nowrap shrink-0 ${
                      active
                        ? `${palette.accentBg} ${palette.accentBorder} ${palette.accentText}`
                        : `${palette.surface} ${palette.border} ${palette.textSecondary}`
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${t.swatch} shrink-0`} />
                    <span className="truncate">{t.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area: adapts to vertical panel or top/bottom horizontal strip */}
      <div className={`flex-1 min-h-0 flex ${isHorizontalStrip ? 'flex-row' : 'flex-col'}`}>
        {/* Notifications Stream */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {/* Category Filter Row */}
          <div className={`px-3 py-2 border-b ${palette.border} flex items-center gap-1.5 overflow-x-auto shrink-0`}>
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'unread', label: `Unread (${unreadCount})` },
                { id: 'system', label: 'System' },
                { id: 'network', label: 'Network' },
                { id: 'capture', label: 'Capture' },
              ] as const
            ).map(tab => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? `${palette.accentBg} ${palette.accentText}`
                      : `${palette.textSecondary} hover:bg-current/10`
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Notification Cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredNotifications.length === 0 ? (
              <div className={`h-full min-h-[120px] flex flex-col items-center justify-center text-center px-4 ${palette.textSecondary}`}>
                <Bell className="w-6 h-6 opacity-40 mb-2" />
                <div className="text-xs font-medium">No notifications here</div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  {settings.doNotDisturb
                    ? 'Do Not Disturb is active'
                    : 'System alerts, network updates, and captures appear here.'}
                </div>
              </div>
            ) : settings.layoutStyle === 'grid' ? (
              <div className="grid grid-cols-2 gap-2">
                {filteredNotifications.map(n => renderNotificationCard(n, 'grid'))}
              </div>
            ) : settings.layoutStyle === 'dynamic' ? (
              <div className="space-y-2.5">
                {(() => {
                  const spotlight =
                    filteredNotifications.find(n => !n.read) || filteredNotifications[0];
                  const rest = filteredNotifications.filter(n => n.id !== spotlight.id);
                  return (
                    <>
                      {renderNotificationCard(spotlight, 'spotlight')}
                      {rest.length > 0 && (
                        <div className="space-y-1.5">
                          <div className={`text-[10px] font-mono uppercase tracking-wider px-1 ${palette.textSecondary}`}>
                            Earlier Activity ({rest.length})
                          </div>
                          {rest.map(n => renderNotificationCard(n, 'list'))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredNotifications.map(n => renderNotificationCard(n, 'list'))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Quick Controls + Flyout Area */}
        <div
          className={`shrink-0 flex flex-col justify-end ${
            isHorizontalStrip
              ? `w-[360px] border-l ${palette.border}`
              : `border-t ${palette.border}`
          }`}
        >
          {/* Interactive Flyout directly above the 9 icons */}
          {renderFlyout()}

          {/* 9 Quick Action Icons Grid */}
          <div className="p-3 pt-2">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className={`text-[10px] font-mono uppercase tracking-wider ${palette.textSecondary}`}>
                Quick Controls
              </span>
              {activeFlyout && (
                <span className={`text-[10px] ${palette.accentText}`}>
                  Click icon to toggle flyout
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {quickControlItems.map(item => {
                const isSelected = activeFlyout === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-expanded={isSelected}
                    onClick={() => {
                      sound.playBlip();
                      setActiveFlyout(prev => (prev === item.id ? null : item.id));
                    }}
                    className={`flex flex-col items-start gap-1 p-2 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
                      isSelected
                        ? `${palette.accentBg} ${palette.accentBorder} ring-1 ring-cyan-400/40`
                        : item.active
                        ? `${palette.accentBg} ${palette.accentBorder}`
                        : `${palette.surface} ${palette.border} hover:opacity-95`
                    }`}
                  >
                    <div className="w-full flex items-center justify-between gap-1">
                      <span className={item.active || isSelected ? palette.accentText : palette.textSecondary}>
                        {item.icon}
                      </span>
                      {item.active && <Check className={`w-3 h-3 ${palette.accentText} shrink-0`} />}
                    </div>
                    <div className="w-full min-w-0">
                      <div className={`text-[11px] font-semibold truncate ${palette.textPrimary}`}>
                        {item.label}
                      </div>
                      <div className={`text-[10px] font-mono truncate ${palette.textSecondary}`}>
                        {item.status}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface NotificationManagerDrawerProps extends NotificationManagerSharedProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationManagerDrawer: React.FC<NotificationManagerDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  ...rest
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (settings.position === 'separate') return null;

  const palette = NOTIFICATION_THEMES[settings.theme] || NOTIFICATION_THEMES.jarvis;
  const pos = settings.position;

  let containerPositionClass = '';
  let closedTransformClass = '';
  let dimensionStyle: React.CSSProperties = {};

  if (pos === 'right') {
    containerPositionClass = `top-[45px] bottom-0 right-0 border-l ${palette.border}`;
    closedTransformClass = 'translate-x-full';
    dimensionStyle = { width: `${settings.sizePx}px`, maxWidth: '95vw' };
  } else if (pos === 'left') {
    containerPositionClass = `top-[45px] bottom-0 left-0 border-r ${palette.border}`;
    closedTransformClass = '-translate-x-full';
    dimensionStyle = { width: `${settings.sizePx}px`, maxWidth: '95vw' };
  } else if (pos === 'top') {
    containerPositionClass = `top-[45px] left-4 right-4 border ${palette.border} rounded-b-2xl`;
    closedTransformClass = '-translate-y-[120%]';
    dimensionStyle = { height: `${Math.min(480, settings.sizePx)}px`, maxHeight: '78vh' };
  } else {
    // bottom
    containerPositionClass = `bottom-3 left-4 right-4 border ${palette.border} rounded-2xl`;
    closedTransformClass = 'translate-y-[120%]';
    dimensionStyle = { height: `${Math.min(480, settings.sizePx)}px`, maxHeight: '78vh' };
  }

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      {/* Subtle scrim */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30"
      />

      {/* Sliding Drawer Panel */}
      <aside
        role="dialog"
        aria-label="Notification Manager"
        style={dimensionStyle}
        className={`fixed z-50 shadow-2xl overflow-hidden transition-transform duration-300 ease-out ${containerPositionClass} ${
          isOpen ? 'translate-x-0 translate-y-0' : closedTransformClass
        }`}
      >
        <NotificationManagerContent
          mode="drawer"
          onClose={onClose}
          settings={settings}
          {...rest}
        />
      </aside>
    </div>
  );
};
