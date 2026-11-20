import React from 'react';
import {
  BatteryCharging,
  Bell,
  Bluetooth,
  Camera,
  Download,
  Lock,
  MapPin,
  Network,
  Plane,
  Radio,
  RefreshCw,
  RotateCcw,
  Share2,
  Shield,
  Trash2,
  Wifi,
} from 'lucide-react';
import {
  NotificationBarSettings,
  NotificationLayoutStyle,
  NotificationPosition,
  NotificationThemeId,
  PowerControlState,
  PowerMode,
  QuickControlsState,
  SystemSettingsSection,
  WifiState,
} from '../types/os';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../utils/notification-manager';
import { calculatePowerMetrics } from '../utils/power-network';
import { NOTIFICATION_THEMES } from './NotificationManagerPanel';
import { sound } from '../utils/audio-fx';

interface SystemSettingsAppProps {
  activeSection: SystemSettingsSection;
  onSelectSection: (section: SystemSettingsSection) => void;
  notificationSettings: NotificationBarSettings;
  quickControls: QuickControlsState;
  wifiState: WifiState;
  powerState: PowerControlState;
  screenshotCountdown: number | null;
  onUpdateNotificationSettings: (partial: Partial<NotificationBarSettings>) => void;
  onSendTestNotification: () => void;
  onToggleLocation: (enabled: boolean) => void;
  onToggleLocationHighAccuracy: (highAccuracy: boolean) => void;
  onRefreshLocation: () => void;
  onSelectPowerMode: (mode: PowerMode) => void;
  onToggleChargeLimit80: () => void;
  onToggleBluetooth: (enabled: boolean) => void;
  onToggleBluetoothDiscoverable: (discoverable: boolean) => void;
  onScanBluetooth: () => void;
  onToggleBluetoothDevice: (deviceId: string) => void;
  onRemoveBluetoothDevice: (deviceId: string) => void;
  onUpdateHotspot: (partial: Partial<QuickControlsState['hotspot']>) => void;
  onToggleFlightMode: (enabled: boolean) => void;
  onUpdateNearbySharing: (partial: Partial<QuickControlsState['nearbySharing']>) => void;
  onOpenNetworkSettings: () => void;
  onScanWifi: () => void | Promise<void>;
  onCaptureScreenshot: (mode: 'fullscreen' | 'workspace' | 'delay3s') => void;
  onUpdateScreenshotPrefs: (partial: Partial<QuickControlsState['screenshot']>) => void;
  onUpdateVpnProxy: (partial: Partial<QuickControlsState['vpnProxy']>) => void;
}

const SwitchButton: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
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
      checked ? 'bg-cyan-500' : 'bg-slate-700'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-slate-950 transition-transform ${
        checked ? 'translate-x-4.5' : 'translate-x-1'
      }`}
    />
  </button>
);

export const SystemSettingsApp: React.FC<SystemSettingsAppProps> = ({
  activeSection,
  onSelectSection,
  notificationSettings,
  quickControls,
  wifiState,
  powerState,
  screenshotCountdown,
  onUpdateNotificationSettings,
  onSendTestNotification,
  onToggleLocation,
  onToggleLocationHighAccuracy,
  onRefreshLocation,
  onSelectPowerMode,
  onToggleChargeLimit80,
  onToggleBluetooth,
  onToggleBluetoothDiscoverable,
  onScanBluetooth,
  onToggleBluetoothDevice,
  onRemoveBluetoothDevice,
  onUpdateHotspot,
  onToggleFlightMode,
  onUpdateNearbySharing,
  onOpenNetworkSettings,
  onScanWifi,
  onCaptureScreenshot,
  onUpdateScreenshotPrefs,
  onUpdateVpnProxy,
}) => {
  const powerMetrics = calculatePowerMetrics(powerState);

  const navItems: {
    id: SystemSettingsSection;
    label: string;
    status: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'notifications',
      label: 'Notification Bar',
      status: notificationSettings.position,
      icon: <Bell className="w-4 h-4" />,
    },
    {
      id: 'location',
      label: 'Location',
      status: quickControls.location.enabled ? 'On' : 'Off',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      id: 'battery',
      label: 'Battery & Power',
      status: `${powerMetrics.displayedPercent}%`,
      icon: <BatteryCharging className="w-4 h-4" />,
    },
    {
      id: 'bluetooth',
      label: 'Bluetooth',
      status: quickControls.bluetooth.enabled ? 'On' : 'Off',
      icon: <Bluetooth className="w-4 h-4" />,
    },
    {
      id: 'hotspot',
      label: 'Hotspot',
      status: quickControls.hotspot.enabled ? 'Active' : 'Off',
      icon: <Radio className="w-4 h-4" />,
    },
    {
      id: 'flight_mode',
      label: 'Flight Mode',
      status: quickControls.flightMode.enabled ? 'On' : 'Off',
      icon: <Plane className="w-4 h-4" />,
    },
    {
      id: 'nearby_sharing',
      label: 'Nearby Sharing',
      status: quickControls.nearbySharing.enabled ? quickControls.nearbySharing.visibility : 'Off',
      icon: <Share2 className="w-4 h-4" />,
    },
    {
      id: 'network',
      label: 'Network & Wi-Fi',
      status: wifiState.browserOnline ? 'Online' : 'Offline',
      icon: <Wifi className="w-4 h-4" />,
    },
    {
      id: 'screenshot',
      label: 'Screenshot',
      status: quickControls.screenshot.format.toUpperCase(),
      icon: <Camera className="w-4 h-4" />,
    },
    {
      id: 'vpn_proxy',
      label: 'VPN & Proxy',
      status: quickControls.vpnProxy.enabled ? quickControls.vpnProxy.protocol : 'Off',
      icon: <Lock className="w-4 h-4" />,
    },
  ];

  const downloadCapture = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `jarvisos-screenshot.${quickControls.screenshot.format}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full w-full flex bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Left Section Sidebar */}
      <aside className="w-52 shrink-0 border-r border-slate-800 bg-slate-900/60 overflow-y-auto p-2 space-y-1">
        <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
          System Settings
        </div>
        {navItems.map(item => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                sound.playBlip();
                onSelectSection(item.id);
              }}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 font-medium'
                  : 'text-slate-300 hover:bg-slate-800/70 border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className={active ? 'text-cyan-400' : 'text-slate-400'}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500 shrink-0 capitalize">
                {item.status}
              </span>
            </button>
          );
        })}
      </aside>

      {/* Right Detail Pane */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* 1. NOTIFICATION BAR SETTINGS */}
        {activeSection === 'notifications' && (
          <div className="space-y-5 max-w-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Notification Bar Settings</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure dock edge, separate floating window mode, dimensions, translucency, layout style, and theme.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playBlip();
                  onUpdateNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>

            {/* Position */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">Panel Position</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Slide in from any screen edge or detach into a movable Separate Panel window.
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {(
                  [
                    { id: 'right', label: 'Right' },
                    { id: 'left', label: 'Left' },
                    { id: 'top', label: 'Top' },
                    { id: 'bottom', label: 'Bottom' },
                    { id: 'separate', label: 'Separate Panel' },
                  ] as { id: NotificationPosition; label: string }[]
                ).map(pos => {
                  const active = notificationSettings.position === pos.id;
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => {
                        sound.playBlip();
                        onUpdateNotificationSettings({ position: pos.id });
                      }}
                      className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size & Opacity */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Panel Size</span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {notificationSettings.sizePx} px
                  </span>
                </div>
                <input
                  type="range"
                  min={320}
                  max={540}
                  step={10}
                  value={notificationSettings.sizePx}
                  onChange={e => onUpdateNotificationSettings({ sizePx: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </label>

              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Surface Opacity</span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {notificationSettings.opacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={45}
                  max={100}
                  step={1}
                  value={notificationSettings.opacity}
                  onChange={e => onUpdateNotificationSettings({ opacity: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </label>
            </div>

            {/* Style */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-200">Notification Layout Style</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'list', label: 'Stream List', desc: 'Chronological single-column cards' },
                    { id: 'grid', label: 'Grid Cards', desc: 'Compact 2-column tile matrix' },
                    { id: 'dynamic', label: 'Dynamic Focus', desc: 'Spotlight newest alert + grouped feed' },
                  ] as { id: NotificationLayoutStyle; label: string; desc: string }[]
                ).map(st => {
                  const active = notificationSettings.layoutStyle === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        sound.playBlip();
                        onUpdateNotificationSettings({ layoutStyle: st.id });
                      }}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{st.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{st.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Theme */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-200">Appearance Theme</div>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(NOTIFICATION_THEMES) as NotificationThemeId[]).map(themeId => {
                  const t = NOTIFICATION_THEMES[themeId];
                  const active = notificationSettings.theme === themeId;
                  return (
                    <button
                      key={themeId}
                      type="button"
                      onClick={() => {
                        sound.playBlip();
                        onUpdateNotificationSettings({ theme: themeId });
                      }}
                      className={`p-2.5 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${t.swatch}`} />
                      <span className="text-[11px] font-medium whitespace-nowrap">{t.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* DND + Test */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-slate-200">Do Not Disturb</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Silences alert sounds while continuing to log notifications in the hub.
                </div>
              </div>
              <SwitchButton
                checked={notificationSettings.doNotDisturb}
                onChange={() =>
                  onUpdateNotificationSettings({ doNotDisturb: !notificationSettings.doNotDisturb })
                }
                label="Toggle Do Not Disturb"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playConfirm();
                onSendTestNotification();
              }}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-colors"
            >
              Send Test Notification
            </button>
          </div>
        )}

        {/* 2. LOCATION SETTINGS */}
        {activeSection === 'location' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Location Services</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Uses your device browser Geolocation API when enabled. No coordinates are fabricated.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Enable Location Access</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Permission state: <span className="font-mono text-cyan-400">{quickControls.location.permissionState}</span>
                  </div>
                </div>
                <SwitchButton
                  checked={quickControls.location.enabled}
                  onChange={() => onToggleLocation(!quickControls.location.enabled)}
                  label="Toggle Location Access"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-slate-200">High Accuracy Mode</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Requests GPS-grade precision when supported by host hardware.
                  </div>
                </div>
                <SwitchButton
                  checked={quickControls.location.highAccuracy}
                  onChange={() => onToggleLocationHighAccuracy(!quickControls.location.highAccuracy)}
                  label="Toggle High Accuracy Mode"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5 text-xs">
              <div className="font-semibold text-slate-200">Current Position Telemetry</div>
              {quickControls.location.lastCoords ? (
                <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-slate-500">Latitude</div>
                    <div className="text-cyan-300 mt-0.5">
                      {quickControls.location.lastCoords.lat.toFixed(6)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-slate-500">Longitude</div>
                    <div className="text-cyan-300 mt-0.5">
                      {quickControls.location.lastCoords.lng.toFixed(6)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-slate-500">Accuracy</div>
                    <div className="text-cyan-300 mt-0.5">
                      ±{quickControls.location.lastCoords.accuracyM} m
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400">
                  {quickControls.location.error || 'No location fix acquired yet.'}
                </div>
              )}

              <button
                type="button"
                onClick={onRefreshLocation}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-300 inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Request Fresh Fix
              </button>
            </div>
          </div>
        )}

        {/* 3. BATTERY & POWER SETTINGS */}
        {activeSection === 'battery' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Battery & Power Management</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Live synced with the TopBar battery telemetry and Aegis EAS power governor.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl font-mono font-bold tabular-nums text-slate-100">
                    {powerMetrics.displayedPercent}%
                  </span>
                  <span className="text-xs font-medium text-cyan-400">{powerMetrics.statusLabel}</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {powerMetrics.powerDrawWatts}W · {powerMetrics.estimateLabel}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Health</div>
                  <div className="text-emerald-400 mt-0.5">{powerState.healthPercent}%</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Cycles</div>
                  <div className="text-slate-200 mt-0.5">{powerState.cycleCount}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Temp</div>
                  <div className="text-slate-200 mt-0.5">{powerMetrics.batteryTempC} °C</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Voltage</div>
                  <div className="text-slate-200 mt-0.5">{powerState.voltageV.toFixed(1)} V</div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-200">Power Profile</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'power_saver', label: 'Power Saver', desc: 'Extends runtime' },
                    { id: 'balanced', label: 'Balanced', desc: 'Adaptive EAS' },
                    { id: 'performance', label: 'Performance', desc: 'Peak clocks' },
                  ] as const
                ).map(opt => {
                  const active = powerState.mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelectPowerMode(opt.id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">80% Charge Conservation Limit</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Halts charging at 80% to reduce lithium-ion wear.
                  </div>
                </div>
                <SwitchButton
                  checked={powerState.chargeLimit80}
                  onChange={onToggleChargeLimit80}
                  label="Toggle 80% Charge Limit"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. BLUETOOTH SETTINGS */}
        {activeSection === 'bluetooth' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Bluetooth Devices</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pair real peripherals using Web Bluetooth when supported by your browser and hardware.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Bluetooth Radio</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {quickControls.flightMode.enabled
                      ? 'Unavailable while Flight Mode is active.'
                      : quickControls.bluetooth.webBluetoothSupported
                      ? 'Web Bluetooth hardware bridge detected.'
                      : 'Web Bluetooth API not exposed in this browser context.'}
                  </div>
                </div>
                <SwitchButton
                  checked={quickControls.bluetooth.enabled}
                  onChange={() => onToggleBluetooth(!quickControls.bluetooth.enabled)}
                  label="Toggle Bluetooth Radio"
                  disabled={quickControls.flightMode.enabled}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Discoverable Mode</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Allow nearby devices to see {quickControls.nearbySharing.deviceName}.
                  </div>
                </div>
                <SwitchButton
                  checked={quickControls.bluetooth.discoverable}
                  onChange={() =>
                    onToggleBluetoothDiscoverable(!quickControls.bluetooth.discoverable)
                  }
                  label="Toggle Discoverable Mode"
                  disabled={!quickControls.bluetooth.enabled || quickControls.flightMode.enabled}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-200">Paired Devices</div>
                <button
                  type="button"
                  disabled={!quickControls.bluetooth.enabled || quickControls.flightMode.enabled}
                  onClick={onScanBluetooth}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-medium disabled:opacity-40"
                >
                  Scan & Pair Device
                </button>
              </div>

              {quickControls.bluetooth.statusMessage && (
                <div className="text-[11px] text-amber-300">
                  {quickControls.bluetooth.statusMessage}
                </div>
              )}

              {quickControls.bluetooth.devices.length === 0 ? (
                <div className="text-xs text-slate-500 py-3">
                  No Bluetooth devices paired yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {quickControls.bluetooth.devices.map(dev => (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                    >
                      <span className="truncate font-medium text-slate-200">{dev.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleBluetoothDevice(dev.id)}
                          className={`px-2 py-1 rounded text-[11px] ${
                            dev.connected
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {dev.connected ? 'Disconnect' : 'Connect'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveBluetoothDevice(dev.id)}
                          aria-label={`Forget ${dev.name}`}
                          className="p-1 text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. HOTSPOT SETTINGS */}
        {activeSection === 'hotspot' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Personal Hotspot</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure your local access point SSID, frequency band, and WPA2/WPA3 passphrase.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Hotspot Broadcast</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {quickControls.flightMode.enabled
                      ? 'Blocked while Flight Mode is enabled.'
                      : quickControls.hotspot.enabled
                      ? `Active on ${quickControls.hotspot.band}`
                      : 'Off'}
                  </div>
                </div>
                <SwitchButton
                  checked={quickControls.hotspot.enabled}
                  onChange={() => onUpdateHotspot({ enabled: !quickControls.hotspot.enabled })}
                  label="Toggle Hotspot Broadcast"
                  disabled={quickControls.flightMode.enabled}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <label className="space-y-1 block">
                  <span className="text-[11px] text-slate-400">Network Name (SSID)</span>
                  <input
                    type="text"
                    value={quickControls.hotspot.ssid}
                    onChange={e => onUpdateHotspot({ ssid: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-[11px] text-slate-400">Passphrase</span>
                  <input
                    type="text"
                    value={quickControls.hotspot.passphrase}
                    onChange={e => onUpdateHotspot({ passphrase: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-xs text-slate-300">AP Frequency Band</span>
                <div className="flex items-center gap-1.5">
                  {(['2.4 GHz', '5 GHz'] as const).map(band => (
                    <button
                      key={band}
                      type="button"
                      onClick={() => onUpdateHotspot({ band })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${
                        quickControls.hotspot.band === band
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {band}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. FLIGHT MODE SETTINGS */}
        {activeSection === 'flight_mode' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Flight Mode</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Instantly suspends wireless transmitters (Wi-Fi radio, Bluetooth, and Hotspot) and restores previous states on disable.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">Enable Flight Mode</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {quickControls.flightMode.enabled
                    ? 'Active · Wireless transmissions suspended'
                    : 'Inactive · Radios operate normally'}
                </div>
              </div>
              <SwitchButton
                checked={quickControls.flightMode.enabled}
                onChange={() => onToggleFlightMode(!quickControls.flightMode.enabled)}
                label="Toggle Flight Mode"
              />
            </div>
          </div>
        )}

        {/* 7. NEARBY SHARING SETTINGS */}
        {activeSection === 'nearby_sharing' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Nearby Sharing</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Control peer-to-peer visibility and device broadcast identity on local links.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Enable Nearby Sharing</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Allows local file and link handoff with trusted devices.
                  </div>
                </div>
                <SwitchButton
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
                />
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-200">Device Visibility</span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'off', label: 'Hidden' },
                      { id: 'contacts', label: 'Contacts Only' },
                      { id: 'everyone', label: 'Everyone Nearby' },
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
                        className={`py-2 px-2.5 rounded-lg text-xs border whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="space-y-1 block pt-2">
                <span className="text-[11px] text-slate-400">Broadcast Device Name</span>
                <input
                  type="text"
                  value={quickControls.nearbySharing.deviceName}
                  onChange={e => onUpdateNearbySharing({ deviceName: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </label>
            </div>
          </div>
        )}

        {/* 8. NETWORK & WI-FI OVERVIEW (LINKS DIRECTLY TO REAL HARDWARE NETWORK MANAGER) */}
        {activeSection === 'network' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Network & Hardware Wi-Fi</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Direct telemetry from Linux system network interfaces and hardware Wi-Fi radios.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-slate-200">
                  <Network className="w-4 h-4 text-cyan-400" />
                  Hardware Backend: {wifiState.hardwareBackend}
                </span>
                <span className={wifiState.browserOnline ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
                  {wifiState.browserOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Default Interface: {wifiState.defaultInterface || 'N/A'} · Gateway:{' '}
                {wifiState.defaultGateway || 'N/A'} · Wi-Fi Hardware:{' '}
                {wifiState.hasWifiHardware ? wifiState.wifiInterface || 'Present' : 'None detected'}
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onOpenNetworkSettings}
                  className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-colors"
                >
                  Open Full Network & Wi-Fi Manager
                </button>
                <button
                  type="button"
                  onClick={() => void onScanWifi()}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${wifiState.loading ? 'animate-spin' : ''}`} />
                  Refresh Hardware
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 9. SCREENSHOT SETTINGS */}
        {activeSection === 'screenshot' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Screenshot & Capture</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Capture the JARVISOS workspace or request live OS screen capture via Display Media API.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-200">Default Capture Mode</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'workspace', label: 'Workspace Snapshot' },
                      { id: 'fullscreen', label: 'Live Screen Capture' },
                      { id: 'delay3s', label: '3-Second Timer' },
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateScreenshotPrefs({ defaultMode: opt.id })}
                      className={`py-2 px-2.5 rounded-lg text-xs border whitespace-nowrap shrink-0 ${
                        quickControls.screenshot.defaultMode === opt.id
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-300">Image Export Format</span>
                <div className="flex items-center gap-1.5">
                  {(['png', 'webp'] as const).map(fmt => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => onUpdateScreenshotPrefs({ format: fmt })}
                      className={`px-3 py-1 rounded-lg text-xs font-mono uppercase border ${
                        quickControls.screenshot.format === fmt
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={screenshotCountdown !== null}
                onClick={() => onCaptureScreenshot(quickControls.screenshot.defaultMode)}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Camera className="w-3.5 h-3.5" />
                {screenshotCountdown !== null
                  ? `Capturing in ${screenshotCountdown}s…`
                  : 'Capture Screenshot Now'}
              </button>

              {quickControls.screenshot.lastCaptureUrl && (
                <div className="space-y-2 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Latest Capture</span>
                    <button
                      type="button"
                      onClick={() => downloadCapture(quickControls.screenshot.lastCaptureUrl!)}
                      className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                  <img
                    src={quickControls.screenshot.lastCaptureUrl}
                    alt="Latest screenshot"
                    className="w-full max-h-48 object-cover rounded-lg border border-slate-800"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 10. VPN & PROXY SETTINGS */}
        {activeSection === 'vpn_proxy' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-semibold text-slate-100">VPN & System Proxy</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure encrypted VPN tunnel profiles or local HTTP/SOCKS5 proxy routing.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Shield className={`w-4 h-4 ${quickControls.vpnProxy.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      {quickControls.vpnProxy.enabled ? 'Tunnel Active' : 'Tunnel Disconnected'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {quickControls.vpnProxy.protocol} · {quickControls.vpnProxy.serverAddress}:{quickControls.vpnProxy.port}
                    </div>
                  </div>
                </div>
                <SwitchButton
                  checked={quickControls.vpnProxy.enabled}
                  onChange={() =>
                    onUpdateVpnProxy({ enabled: !quickControls.vpnProxy.enabled })
                  }
                  label="Toggle VPN or Proxy"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800">
                {(
                  [
                    { id: 'vpn', label: 'VPN Tunnel', defaultProto: 'WireGuard' as const },
                    { id: 'proxy', label: 'Proxy Server', defaultProto: 'SOCKS5' as const },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateVpnProxy({ mode: opt.id, protocol: opt.defaultProto })}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border ${
                      quickControls.vpnProxy.mode === opt.id
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {(['WireGuard', 'OpenVPN', 'SOCKS5', 'HTTP'] as const).map(proto => (
                  <button
                    key={proto}
                    type="button"
                    onClick={() =>
                      onUpdateVpnProxy({
                        protocol: proto,
                        mode: proto === 'WireGuard' || proto === 'OpenVPN' ? 'vpn' : 'proxy',
                      })
                    }
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-mono border ${
                      quickControls.vpnProxy.protocol === proto
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {proto}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1 block sm:col-span-2">
                  <span className="text-[11px] text-slate-400">Server Address</span>
                  <input
                    type="text"
                    value={quickControls.vpnProxy.serverAddress}
                    onChange={e => onUpdateVpnProxy({ serverAddress: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[11px] text-slate-400">Port</span>
                  <input
                    type="text"
                    value={quickControls.vpnProxy.port}
                    onChange={e => onUpdateVpnProxy({ port: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
