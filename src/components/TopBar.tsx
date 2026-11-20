import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Sparkles,
  ShieldCheck,
  Wifi,
  WifiOff,
  Network,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  Moon,
  RotateCw,
  Power,
  Shield,
  Bell,
  BellOff,
} from 'lucide-react';
import { sound } from '../utils/audio-fx';
import {
  OsMode,
  PowerControlState,
  PowerMode,
  SystemPowerPhase,
  SystemTelemetry,
  WifiState,
} from '../types/os';
import { calculatePowerMetrics } from '../utils/power-network';

interface TopBarProps {
  osMode: OsMode;
  onSelectMode: (mode: OsMode) => void;
  telemetry: SystemTelemetry;
  wifiState: WifiState;
  powerState: PowerControlState;
  onToggleWifi: () => void;
  onOpenNetworkSettings: () => void;
  onSelectPowerMode: (mode: PowerMode) => void;
  onToggleChargeLimit80: () => void;
  onSystemPowerAction: (phase: Exclude<SystemPowerPhase, 'running'>) => void;
  onWakeJarvis: () => void;
  unreadNotificationCount: number;
  notificationManagerOpen: boolean;
  doNotDisturb: boolean;
  onToggleNotificationManager: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  osMode,
  onSelectMode,
  telemetry,
  wifiState,
  powerState,
  onToggleWifi,
  onOpenNetworkSettings,
  onSelectPowerMode,
  onToggleChargeLimit80,
  onSystemPowerAction,
  onWakeJarvis,
  unreadNotificationCount,
  notificationManagerOpen,
  doNotDisturb,
  onToggleNotificationManager,
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [batteryMenuOpen, setBatteryMenuOpen] = useState(false);

  const batteryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Dismiss battery popover on outside click or Escape
  useEffect(() => {
    if (!batteryMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (batteryMenuRef.current && !batteryMenuRef.current.contains(e.target as Node)) {
        setBatteryMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBatteryMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [batteryMenuOpen]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.setSoundEnabled(next);
    if (next) sound.playBlip();
  };

  const activeNetwork = wifiState.networks.find(n => n.id === wifiState.activeNetworkId) || null;
  const powerMetrics = calculatePowerMetrics(powerState);

  const renderBatteryIcon = () => {
    if (powerMetrics.isActivelyCharging) {
      return <BatteryCharging className="w-4 h-4 text-emerald-400" />;
    }
    if (powerMetrics.isPausedByChargeLimit) {
      return <BatteryMedium className="w-4 h-4 text-cyan-400" />;
    }
    if (powerMetrics.displayedPercent >= 75) {
      return <BatteryFull className="w-4 h-4 text-cyan-400" />;
    }
    if (powerMetrics.displayedPercent >= 30) {
      return <BatteryMedium className="w-4 h-4 text-amber-400" />;
    }
    return <BatteryLow className="w-4 h-4 text-red-400" />;
  };

  return (
    <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-2 border-b border-cyan-500/20 bg-slate-950/90 select-none z-50 shrink-0 font-sans">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#home"
          onClick={e => {
            e.preventDefault();
            onSelectMode('spatial_hud');
          }}
          className="text-base font-display font-black tracking-wider text-cyan-400 whitespace-nowrap shrink-0 hover:text-cyan-300 transition-colors"
        >
          JARVISOS
        </a>
        <span className="text-[10px] font-mono text-cyan-500/60 hidden sm:inline">v1.0.4-aegis</span>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav className="hidden md:flex items-center gap-5 text-xs font-mono text-slate-400">
        <button
          onClick={() => {
            sound.playBlip();
            onSelectMode('spatial_hud');
          }}
          className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 ${
            osMode === 'spatial_hud' ? 'text-cyan-400 font-bold' : ''
          }`}
        >
          Spatial HUD
        </button>
        <button
          onClick={() => {
            sound.playBlip();
            onSelectMode('desktop_continuum');
          }}
          className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 ${
            osMode === 'desktop_continuum' ? 'text-cyan-400 font-bold' : ''
          }`}
        >
          Desktop Workspace
        </button>
        <button
          onClick={() => {
            sound.playBlip();
            onSelectMode('specs_explorer');
          }}
          className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 ${
            osMode === 'specs_explorer' ? 'text-cyan-400 font-bold' : ''
          }`}
        >
          Engineering Specs (12 Parts)
        </button>
        <button
          onClick={() => {
            sound.playBlip();
            onSelectMode('mobile_handheld');
          }}
          className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 ${
            osMode === 'mobile_handheld' ? 'text-cyan-400 font-bold' : ''
          }`}
        >
          Mobile Interface
        </button>
      </nav>

      {/* Zone 3: System Tray (Wi-Fi Switch + Network Settings, Battery Health & Power, Sound) + Wake Jarvis */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <div className="hidden xl:flex items-center gap-3 text-xs font-mono text-slate-400 mr-1">
          <span className="text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            OK
          </span>
          <span className="text-cyan-400 tabular-nums">RAM: {telemetry.ramUsedMb}MB</span>
          <span className="text-slate-300 font-bold tabular-nums">{timeStr}</span>
        </div>

        {/* System Network / Real Hardware Wi-Fi Icon + Radio Switch */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              sound.playBlip();
              onOpenNetworkSettings();
            }}
            title={
              wifiState.hasWifiHardware
                ? wifiState.enabled
                  ? activeNetwork
                    ? `Wi-Fi: ${activeNetwork.ssid} (${activeNetwork.signalPercent}%) — Open Network Settings`
                    : `Wi-Fi On (${wifiState.wifiInterface || 'wlan0'}) — Open Network Settings`
                  : 'Wi-Fi Radio Off — Open Network Settings'
                : wifiState.browserOnline
                ? `System Network Online (${wifiState.defaultInterface || 'host'}) — Open Network Settings`
                : 'System Network Offline — Open Network Settings'
            }
            aria-label="Open Network Settings"
            className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 rounded"
          >
            {wifiState.hasWifiHardware ? (
              wifiState.enabled ? (
                <Wifi
                  className={`w-4 h-4 ${
                    activeNetwork ? 'text-cyan-400' : 'text-amber-400'
                  }`}
                />
              ) : (
                <WifiOff className="w-4 h-4 text-slate-500" />
              )
            ) : (
              <Network
                className={`w-4 h-4 ${
                  wifiState.browserOnline ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
            )}
          </button>

          {wifiState.hasWifiHardware && (
            <button
              type="button"
              role="switch"
              aria-checked={wifiState.enabled}
              aria-label={wifiState.enabled ? 'Turn Wi-Fi off' : 'Turn Wi-Fi on'}
              title={wifiState.enabled ? 'Switch Wi-Fi Radio Off' : 'Switch Wi-Fi Radio On'}
              onClick={() => {
                sound.playBlip();
                onToggleWifi();
              }}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 shrink-0 ${
                wifiState.enabled ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-slate-950 transition-transform ${
                  wifiState.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          )}
        </div>

        {/* Battery Icon & Health/Power Popover */}
        <div className="relative" ref={batteryMenuRef}>
          <button
            type="button"
            onClick={() => {
              sound.playBlip();
              setBatteryMenuOpen(prev => !prev);
            }}
            aria-expanded={batteryMenuOpen}
            aria-haspopup="dialog"
            aria-label="Battery Health and Power Options"
            title={`Battery ${powerMetrics.displayedPercent}% (${powerMetrics.statusLabel})`}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors text-xs font-mono tabular-nums whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
              batteryMenuOpen
                ? 'bg-slate-800 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-slate-700 hover:text-cyan-300'
            }`}
          >
            {renderBatteryIcon()}
            <span>{powerMetrics.displayedPercent}%</span>
          </button>

          {batteryMenuOpen && (
            <div
              role="dialog"
              aria-label="Battery Health and Power Controls"
              className="absolute right-0 mt-2 w-80 max-w-[92vw] rounded-xl bg-slate-900/98 border border-cyan-500/30 shadow-2xl backdrop-blur-xl text-slate-100 z-50 overflow-hidden"
            >
              {/* Section 1: Charge Level & Progress Bar */}
              <div className="p-4 border-b border-slate-800 space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono font-bold tabular-nums text-slate-100">
                      {powerMetrics.displayedPercent}%
                    </span>
                    <span className="text-xs font-medium text-cyan-400">
                      {powerMetrics.statusLabel}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {powerMetrics.powerDrawWatts}W
                  </span>
                </div>

                {/* Progress Bar with optional 80% Conservation Marker */}
                <div className="relative h-2 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      powerMetrics.isActivelyCharging
                        ? 'bg-emerald-400'
                        : powerMetrics.displayedPercent < 25
                        ? 'bg-red-400'
                        : 'bg-cyan-400'
                    }`}
                    style={{ width: `${powerMetrics.displayedPercent}%` }}
                  />
                  {powerState.chargeLimit80 && (
                    <div
                      title="80% Charge Limit"
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                      style={{ left: '80%' }}
                    />
                  )}
                </div>

                <div className="text-[11px] font-mono tabular-nums text-slate-400">
                  {powerMetrics.estimateLabel}
                </div>
              </div>

              {/* Section 2: Battery Health Telemetry */}
              <div className="px-4 py-3 border-b border-slate-800">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Battery Health
                  </span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    {powerState.healthPercent}% · {powerMetrics.healthStatus}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Capacity</span>
                    <span className="text-slate-200">
                      {powerState.fullChargeCapacityWh}/{powerState.designCapacityWh} Wh
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Cycles</span>
                    <span className="text-slate-200">{powerState.cycleCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Temp</span>
                    <span className="text-slate-200">{powerMetrics.batteryTempC} °C</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Voltage</span>
                    <span className="text-slate-200">{powerState.voltageV.toFixed(1)} V</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Power Mode Segmented Control */}
              <div className="px-4 py-3 border-b border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">Power Mode</span>
                  <span className="text-[11px] font-mono text-slate-400 truncate">
                    {powerMetrics.governorLabel}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'power_saver', label: 'Power Saver' },
                      { id: 'balanced', label: 'Balanced' },
                      { id: 'performance', label: 'Performance' },
                    ] as const
                  ).map(option => {
                    const active = powerState.mode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          sound.playBlip();
                          onSelectPowerMode(option.id);
                        }}
                        className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 4: 80% Charge Limit Conservation Toggle */}
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-200">80% Charge Limit</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {powerState.chargeLimit80
                      ? 'Active · Caps charging at 80% for cell longevity'
                      : 'Stops charging at 80% to preserve battery health'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={powerState.chargeLimit80}
                  aria-label="Toggle 80% battery charge limit"
                  onClick={() => {
                    sound.playConfirm();
                    onToggleChargeLimit80();
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0 ${
                    powerState.chargeLimit80 ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-slate-950 transition-transform ${
                      powerState.chargeLimit80 ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Section 5: System Power Actions */}
              <div className="p-3 bg-slate-950/60 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sound.playBlip();
                    setBatteryMenuOpen(false);
                    onSystemPowerAction('sleeping');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Moon className="w-3.5 h-3.5 text-cyan-400" />
                  Sleep
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playBlip();
                    setBatteryMenuOpen(false);
                    onSystemPowerAction('restarting');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                  Restart
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playBlip();
                    setBatteryMenuOpen(false);
                    onSystemPowerAction('shutdown');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-red-300 bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Power className="w-3.5 h-3.5 text-red-400" />
                  Shut Down
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notification Manager Trigger */}
        <button
          type="button"
          onClick={() => {
            sound.playBlip();
            onToggleNotificationManager();
          }}
          aria-expanded={notificationManagerOpen}
          aria-label={
            unreadNotificationCount > 0
              ? `Open Notification Manager (${unreadNotificationCount} unread)`
              : 'Open Notification Manager'
          }
          title={
            doNotDisturb
              ? 'Notification Manager (Do Not Disturb active)'
              : 'Open Notification Manager'
          }
          className={`relative flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors text-xs font-mono tabular-nums whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
            notificationManagerOpen
              ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
              : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-cyan-300'
          }`}
        >
          {doNotDisturb ? (
            <BellOff className="w-4 h-4 text-amber-400" />
          ) : (
            <Bell className={`w-4 h-4 ${unreadNotificationCount > 0 ? 'text-cyan-400' : ''}`} />
          )}
          {unreadNotificationCount > 0 && (
            <span className="text-[11px] font-bold text-cyan-300">
              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
            </span>
          )}
        </button>

        {/* Audio Mute Toggle */}
        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundEnabled ? 'Mute system audio' : 'Unmute system audio'}
          className="p-1.5 text-slate-400 hover:text-cyan-400 transition-colors shrink-0"
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-cyan-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={() => {
            sound.playReactorHum();
            onWakeJarvis();
          }}
          className="px-3.5 py-1.5 text-xs font-mono font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-all shadow-[0_0_15px_rgba(0,229,255,0.4)] whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Wake Jarvis</span>
        </button>
      </div>
    </header>
  );
};
