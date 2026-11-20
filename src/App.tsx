import React, { useState, useEffect, useMemo } from 'react';
import {
  OsMode,
  AppId,
  WindowState,
  SystemTelemetry,
  AppShortcut,
  WebPortalPayload,
  WifiState,
  PowerControlState,
  PowerMode,
  SystemPowerPhase,
  OsNotification,
  NotificationBarSettings,
  QuickControlsState,
  SystemSettingsSection,
} from './types/os';
import { TopBar } from './components/TopBar';
import { Dock } from './components/Dock';
import { HeliosWindowManager } from './components/HeliosWindowManager';
import { SpecsExplorerApp } from './components/SpecsExplorerApp';
import { PowerOverlay } from './components/PowerOverlay';
import {
  NotificationManagerDrawer,
  NotificationManagerSharedProps,
} from './components/NotificationManagerPanel';
import { sound } from './utils/audio-fx';
import { loadCustomApps, saveCustomApps } from './utils/app-launcher';
import {
  applyHardwareNetworkSnapshot,
  calculatePowerMetrics,
  createInitialPowerState,
  createInitialWifiState,
  loadHardwarePrefs,
  saveHardwarePrefs,
  validateWifiPassphrase,
} from './utils/power-network';
import {
  applyFlightModeToggle,
  clampNotificationSettings,
  countUnreadNotifications,
  createInitialNotifications,
  dismissNotification,
  loadNotificationSettings,
  loadQuickControlsState,
  markAllNotificationsRead,
  markNotificationRead,
  pushNotification,
  saveNotificationSettings,
  saveQuickControlsState,
} from './utils/notification-manager';
import type { BrowserConnectionInfo } from './types/os';

function readBrowserConnectionInfo(): BrowserConnectionInfo | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const conn = (navigator as Navigator & { connection?: any }).connection;
  if (!conn) return undefined;
  return {
    effectiveType: typeof conn.effectiveType === 'string' ? conn.effectiveType : undefined,
    downlinkMbps: typeof conn.downlink === 'number' ? conn.downlink : undefined,
    rttMs: typeof conn.rtt === 'number' ? conn.rtt : undefined,
    type: typeof conn.type === 'string' ? conn.type : undefined,
  };
}

export default function App() {
  const [osMode, setOsMode] = useState<OsMode>('spatial_hud');
  const [activeWindowId, setActiveWindowId] = useState<string | null>('voice_reactor');
  const [topZIndex, setTopZIndex] = useState(10);
  const [customApps, setCustomApps] = useState<AppShortcut[]>(() => loadCustomApps());
  const [systemPowerPhase, setSystemPowerPhase] = useState<SystemPowerPhase>('running');

  const [wifiState, setWifiState] = useState<WifiState>(() => {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const base = createInitialWifiState(online);
    const prefs = loadHardwarePrefs();
    return {
      ...base,
      autoReconnect:
        typeof prefs.autoReconnect === 'boolean' ? prefs.autoReconnect : base.autoReconnect,
      browserConnection: readBrowserConnectionInfo(),
    };
  });

  const [powerState, setPowerState] = useState<PowerControlState>(() => {
    const base = createInitialPowerState();
    const prefs = loadHardwarePrefs();
    return {
      ...base,
      mode: prefs.powerMode || base.mode,
      chargeLimit80:
        typeof prefs.chargeLimit80 === 'boolean' ? prefs.chargeLimit80 : base.chargeLimit80,
    };
  });

  const [notifications, setNotifications] = useState<OsNotification[]>(() =>
    createInitialNotifications()
  );
  const [notificationSettings, setNotificationSettings] = useState<NotificationBarSettings>(() =>
    loadNotificationSettings()
  );
  const [quickControls, setQuickControls] = useState<QuickControlsState>(() => {
    const webBt = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    return loadQuickControlsState(webBt);
  });
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SystemSettingsSection>('notifications');
  const [screenshotCountdown, setScreenshotCountdown] = useState<number | null>(null);

  const addNotification = (
    item: Omit<OsNotification, 'id' | 'timestamp' | 'read'>
  ) => {
    setNotifications(prev => pushNotification(prev, item));
    if (!notificationSettings.doNotDisturb) {
      sound.playBlip();
    }
  };

  const handleAddCustomApp = (shortcut: AppShortcut) => {
    setCustomApps(prev => {
      const next = [shortcut, ...prev.filter(item => item.name.toLowerCase() !== shortcut.name.toLowerCase())];
      saveCustomApps(next);
      return next;
    });
  };

  const handleRemoveCustomApp = (idOrName: string): boolean => {
    const target = idOrName.trim().toLowerCase();
    let removed = false;
    setCustomApps(prev => {
      const next = prev.filter(item => {
        const matches = item.id === idOrName || item.name.toLowerCase() === target || item.aliases.includes(target);
        if (matches) removed = true;
        return !matches;
      });
      if (removed) {
        saveCustomApps(next);
      }
      return next;
    });
    return removed;
  };

  const [telemetry, setTelemetry] = useState<SystemTelemetry>({
    cpuUsagePercent: 24,
    npuTopsActive: 45.2,
    ramUsedMb: 1480,
    ramTotalMb: 4096,
    zramCompressedMb: 2048,
    effectiveAvailableMb: 6144,
    cpuTempC: 44.2,
    batteryPercent: 96,
    isCharging: true,
    activeThreads: 42,
    novafsWearLevel: 0.8,
    vaultStatus: 'Hardware Attested (S-EL1)',
  });

  // Windows in Helios Window Manager
  const [windows, setWindows] = useState<WindowState[]>([
    {
      id: 'voice_reactor',
      title: 'JARVIS Arc Core AI',
      icon: '🎙️',
      x: 48,
      y: 60,
      width: 440,
      height: 520,
      minimized: false,
      maximized: false,
      zIndex: 10,
    },
    {
      id: 'terminal',
      title: 'Linux Terminal (bash)',
      icon: '💻',
      x: 500,
      y: 60,
      width: 680,
      height: 440,
      minimized: false,
      maximized: false,
      zIndex: 8,
    },
  ]);

  // Fetch telemetry from backend if available
  useEffect(() => {
    fetch('/api/system/telemetry')
      .then(r => r.json())
      .then(data => {
        if (data.memory) {
          setTelemetry(prev => ({
            ...prev,
            ramUsedMb: data.memory.usedMb || prev.ramUsedMb,
            cpuTempC: data.scheduler?.cpuTempC || prev.cpuTempC,
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Persist hardware prefs (Wi-Fi & Power) locally
  useEffect(() => {
    saveHardwarePrefs(wifiState, powerState);
  }, [wifiState, powerState]);

  // Persist Notification Bar settings & Quick Controls locally
  useEffect(() => {
    saveNotificationSettings(notificationSettings);
  }, [notificationSettings]);

  useEffect(() => {
    saveQuickControlsState(quickControls);
  }, [quickControls]);

  // Fetch real system hardware network interfaces & Wi-Fi signals from Linux backend
  const fetchSystemNetworkStatus = async (rescan = false) => {
    setWifiState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/network/status${rescan ? '?rescan=1' : ''}`);
      const data = await res.json();
      if (!res.ok) {
        setWifiState(prev => ({
          ...prev,
          loading: false,
          hardwareBackend: 'error',
          error: data.error || `Failed to query network hardware (HTTP ${res.status})`,
        }));
        return;
      }
      setWifiState(prev => ({
        ...applyHardwareNetworkSnapshot(prev, data),
        browserConnection: readBrowserConnectionInfo(),
      }));
    } catch (err: any) {
      setWifiState(prev => ({
        ...prev,
        loading: false,
        hardwareBackend: 'error',
        error: err?.message || 'Unable to reach system network hardware daemon.',
      }));
    }
  };

  useEffect(() => {
    void fetchSystemNetworkStatus(false);
  }, []);

  // Live browser online/offline & Network Information API sync
  useEffect(() => {
    const syncBrowserNet = () => {
      setWifiState(prev => ({
        ...prev,
        browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        browserConnection: readBrowserConnectionInfo(),
      }));
    };
    window.addEventListener('online', syncBrowserNet);
    window.addEventListener('offline', syncBrowserNet);
    const conn = (navigator as Navigator & { connection?: any }).connection;
    conn?.addEventListener?.('change', syncBrowserNet);
    return () => {
      window.removeEventListener('online', syncBrowserNet);
      window.removeEventListener('offline', syncBrowserNet);
      conn?.removeEventListener?.('change', syncBrowserNet);
    };
  }, []);

  // Live browser Battery Status API sync when supported
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<any> };
    if (typeof nav.getBattery !== 'function') return;

    let batteryObj: any = null;
    let mounted = true;

    const syncBattery = () => {
      if (!mounted || !batteryObj) return;
      const pct = Math.round((batteryObj.level ?? 0.96) * 100);
      setPowerState(prev => ({
        ...prev,
        batteryPercent: pct > 0 ? pct : prev.batteryPercent,
        isCharging: Boolean(batteryObj.charging),
      }));
    };

    nav
      .getBattery()
      .then(batt => {
        if (!mounted || !batt) return;
        batteryObj = batt;
        syncBattery();
        batt.addEventListener?.('levelchange', syncBattery);
        batt.addEventListener?.('chargingchange', syncBattery);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      if (batteryObj) {
        batteryObj.removeEventListener?.('levelchange', syncBattery);
        batteryObj.removeEventListener?.('chargingchange', syncBattery);
      }
    };
  }, []);

  const handleToggleWifi = async () => {
    if (!wifiState.hasWifiHardware) {
      setWifiState(prev => ({
        ...prev,
        error: 'No physical Wi-Fi adapter is attached to this cloud sandbox. Boot the JARVISOS ISO on real hardware to control Wi-Fi radio.',
      }));
      return;
    }
    const nextEnabled = !wifiState.enabled;
    setWifiState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/network/wifi/radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWifiState(prev => ({
          ...prev,
          loading: false,
          error: data.error || 'Failed to switch Wi-Fi hardware radio.',
        }));
        return;
      }
      setWifiState(prev => applyHardwareNetworkSnapshot(prev, data));
      addNotification({
        title: nextEnabled ? 'Wi-Fi Radio Enabled' : 'Wi-Fi Radio Off',
        message: nextEnabled
          ? 'Hardware Wi-Fi transceiver powered on and scanning.'
          : 'Hardware Wi-Fi transceiver powered off.',
        source: 'Network',
        category: 'network',
        actionLabel: 'Network Settings',
        actionAppId: 'network_settings',
      });
    } catch (err: any) {
      setWifiState(prev => ({
        ...prev,
        loading: false,
        error: err?.message || 'Failed to communicate with Wi-Fi hardware.',
      }));
    }
  };

  const handleConnectWifi = async (
    ssid: string,
    passphrase?: string,
    hidden = false
  ): Promise<string | null> => {
    const existing = wifiState.networks.find(n => n.ssid === ssid || n.id === ssid);
    const targetSsid = existing ? existing.ssid : ssid.trim();
    if (!targetSsid) {
      return 'Wi-Fi network name (SSID) is required.';
    }

    if (existing) {
      const validation = validateWifiPassphrase(existing, passphrase);
      if (!validation.valid) {
        return validation.error || 'Invalid Wi-Fi passphrase.';
      }
    }

    setWifiState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/network/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: targetSsid,
          passphrase: passphrase || undefined,
          hidden,
          iface: existing?.iface || wifiState.wifiInterface || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || `Could not connect to "${targetSsid}".`;
        setWifiState(prev => ({ ...prev, loading: false, error: msg }));
        return msg;
      }
      setWifiState(prev => applyHardwareNetworkSnapshot(prev, data));
      addNotification({
        title: `Connected to ${targetSsid}`,
        message: 'Hardware Wi-Fi link established.',
        source: 'Network',
        category: 'network',
        actionLabel: 'Inspect Network',
        actionAppId: 'network_settings',
      });
      return null;
    } catch (err: any) {
      const msg = err?.message || 'Network hardware connection request failed.';
      setWifiState(prev => ({ ...prev, loading: false, error: msg }));
      return msg;
    }
  };

  const handleDisconnectWifi = async () => {
    const active = wifiState.networks.find(n => n.id === wifiState.activeNetworkId);
    setWifiState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/network/wifi/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iface: active?.iface || wifiState.wifiInterface || undefined,
          ssid: active?.ssid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWifiState(prev => ({
          ...prev,
          loading: false,
          error: data.error || 'Failed to disconnect Wi-Fi.',
        }));
        return;
      }
      setWifiState(prev => applyHardwareNetworkSnapshot(prev, data));
      addNotification({
        title: 'Wi-Fi Disconnected',
        message: active?.ssid
          ? `Disconnected from ${active.ssid}.`
          : 'Disconnected from active Wi-Fi network.',
        source: 'Network',
        category: 'network',
        actionLabel: 'Network Settings',
        actionAppId: 'network_settings',
      });
    } catch (err: any) {
      setWifiState(prev => ({
        ...prev,
        loading: false,
        error: err?.message || 'Failed to disconnect Wi-Fi.',
      }));
    }
  };

  const handleForgetWifi = async (ssidOrId: string) => {
    const target = wifiState.networks.find(n => n.id === ssidOrId || n.ssid === ssidOrId);
    const ssid = target ? target.ssid : ssidOrId.replace(/^ssid:/, '');
    setWifiState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/network/wifi/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWifiState(prev => ({
          ...prev,
          loading: false,
          error: data.error || `Failed to forget "${ssid}".`,
        }));
        return;
      }
      setWifiState(prev => applyHardwareNetworkSnapshot(prev, data));
    } catch (err: any) {
      setWifiState(prev => ({
        ...prev,
        loading: false,
        error: err?.message || `Failed to forget "${ssid}".`,
      }));
    }
  };

  const handleToggleAutoReconnect = () => {
    setWifiState(prev => ({ ...prev, autoReconnect: !prev.autoReconnect }));
  };

  const handleScanWifi = async () => {
    await fetchSystemNetworkStatus(true);
  };

  const handleSelectPowerMode = (mode: PowerMode) => {
    setPowerState(prev => ({ ...prev, mode }));
    addNotification({
      title: 'Power Profile Updated',
      message: `Switched Aegis EAS power governor to ${mode.replace('_', ' ')} mode.`,
      source: 'Power',
      category: 'power',
      actionLabel: 'Battery Settings',
      actionSettingsSection: 'battery',
    });
  };

  const handleToggleChargeLimit80 = () => {
    const next = !powerState.chargeLimit80;
    setPowerState(prev => ({ ...prev, chargeLimit80: next }));
    addNotification({
      title: next ? '80% Charge Limit Enabled' : '80% Charge Limit Disabled',
      message: next
        ? 'Battery charging will pause at 80% to preserve long-term cell health.'
        : 'Battery will charge to 100% full capacity.',
      source: 'Power',
      category: 'power',
      actionLabel: 'Battery Settings',
      actionSettingsSection: 'battery',
    });
  };

  const handleRequestLocation = (highAccuracyOverride?: boolean) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setQuickControls(prev => ({
        ...prev,
        location: {
          ...prev.location,
          permissionState: 'unsupported',
          error: 'Geolocation API is not available in this browser.',
        },
      }));
      return;
    }

    const useHighAccuracy =
      typeof highAccuracyOverride === 'boolean'
        ? highAccuracyOverride
        : quickControls.location.highAccuracy;

    setQuickControls(prev => ({
      ...prev,
      location: { ...prev.location, error: null },
    }));

    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
        };
        setQuickControls(prev => ({
          ...prev,
          location: {
            ...prev.location,
            enabled: true,
            permissionState: 'granted',
            lastCoords: coords,
            lastUpdated: new Date().toISOString(),
            error: null,
          },
        }));
        addNotification({
          title: 'Location Fix Acquired',
          message: `Coordinates ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (±${coords.accuracyM}m).`,
          source: 'Location',
          category: 'system',
          actionLabel: 'Location Settings',
          actionSettingsSection: 'location',
        });
      },
      err => {
        setQuickControls(prev => ({
          ...prev,
          location: {
            ...prev.location,
            permissionState: err.code === 1 ? 'denied' : prev.location.permissionState,
            error: err.message || 'Location permission was declined or unavailable.',
          },
        }));
      },
      { enableHighAccuracy: useHighAccuracy, timeout: 8000, maximumAge: 30000 }
    );
  };

  const handleToggleLocation = (enabled: boolean) => {
    setQuickControls(prev => ({
      ...prev,
      location: { ...prev.location, enabled, error: null },
    }));
    if (enabled) {
      handleRequestLocation();
    } else {
      addNotification({
        title: 'Location Services Off',
        message: 'Device geolocation access has been turned off.',
        source: 'Location',
        category: 'system',
        actionLabel: 'Location Settings',
        actionSettingsSection: 'location',
      });
    }
  };

  const handleToggleLocationHighAccuracy = (highAccuracy: boolean) => {
    setQuickControls(prev => ({
      ...prev,
      location: { ...prev.location, highAccuracy },
    }));
    if (quickControls.location.enabled) {
      handleRequestLocation(highAccuracy);
    }
  };

  const handleToggleBluetooth = (enabled: boolean) => {
    if (quickControls.flightMode.enabled && enabled) return;
    setQuickControls(prev => ({
      ...prev,
      bluetooth: {
        ...prev.bluetooth,
        enabled,
        discoverable: enabled ? prev.bluetooth.discoverable : false,
        statusMessage: null,
      },
    }));
    addNotification({
      title: enabled ? 'Bluetooth Enabled' : 'Bluetooth Turned Off',
      message: enabled
        ? 'Bluetooth radio is ready for device pairing.'
        : 'Bluetooth radio has been powered down.',
      source: 'Bluetooth',
      category: 'system',
      actionLabel: 'Bluetooth Settings',
      actionSettingsSection: 'bluetooth',
    });
  };

  const handleToggleBluetoothDiscoverable = (discoverable: boolean) => {
    setQuickControls(prev => ({
      ...prev,
      bluetooth: { ...prev.bluetooth, discoverable },
    }));
  };

  const handleScanBluetooth = async () => {
    const bt = (navigator as Navigator & { bluetooth?: any }).bluetooth;
    if (!bt || typeof bt.requestDevice !== 'function') {
      setQuickControls(prev => ({
        ...prev,
        bluetooth: {
          ...prev.bluetooth,
          webBluetoothSupported: false,
          statusMessage:
            'Web Bluetooth hardware chooser is not exposed in this browser/iframe context.',
        },
      }));
      return;
    }

    try {
      const device = await bt.requestDevice({ acceptAllDevices: true });
      const name = device?.name || 'Bluetooth Peripheral';
      const id = device?.id || `bt_${Date.now()}`;
      setQuickControls(prev => ({
        ...prev,
        bluetooth: {
          ...prev.bluetooth,
          enabled: true,
          statusMessage: `Paired with ${name}.`,
          devices: [
            { id, name, connected: true },
            ...prev.bluetooth.devices.filter(d => d.id !== id),
          ],
        },
      }));
      addNotification({
        title: 'Bluetooth Device Paired',
        message: `Connected to ${name}.`,
        source: 'Bluetooth',
        category: 'system',
        actionLabel: 'Bluetooth Settings',
        actionSettingsSection: 'bluetooth',
      });
    } catch (err: any) {
      setQuickControls(prev => ({
        ...prev,
        bluetooth: {
          ...prev.bluetooth,
          statusMessage:
            err?.name === 'NotFoundError'
              ? 'Device scan cancelled.'
              : err?.message || 'Bluetooth scan could not complete.',
        },
      }));
    }
  };

  const handleToggleBluetoothDevice = (deviceId: string) => {
    setQuickControls(prev => ({
      ...prev,
      bluetooth: {
        ...prev.bluetooth,
        devices: prev.bluetooth.devices.map(d =>
          d.id === deviceId ? { ...d, connected: !d.connected } : d
        ),
      },
    }));
  };

  const handleRemoveBluetoothDevice = (deviceId: string) => {
    setQuickControls(prev => ({
      ...prev,
      bluetooth: {
        ...prev.bluetooth,
        devices: prev.bluetooth.devices.filter(d => d.id !== deviceId),
      },
    }));
  };

  const handleUpdateHotspot = (partial: Partial<QuickControlsState['hotspot']>) => {
    if (quickControls.flightMode.enabled && partial.enabled) return;
    setQuickControls(prev => ({
      ...prev,
      hotspot: { ...prev.hotspot, ...partial },
    }));
    if (typeof partial.enabled === 'boolean') {
      addNotification({
        title: partial.enabled ? 'Personal Hotspot Active' : 'Personal Hotspot Stopped',
        message: partial.enabled
          ? `Broadcasting ${partial.ssid || quickControls.hotspot.ssid} on ${partial.band || quickControls.hotspot.band}.`
          : 'Local hotspot access point has been turned off.',
        source: 'Hotspot',
        category: 'network',
        actionLabel: 'Hotspot Settings',
        actionSettingsSection: 'hotspot',
      });
    }
  };

  const handleToggleFlightMode = (enabled: boolean) => {
    const result = applyFlightModeToggle(quickControls, enabled, wifiState.enabled);
    setQuickControls(result.nextState);
    if (wifiState.hasWifiHardware) {
      if (result.disableWifi && wifiState.enabled) {
        void handleToggleWifi();
      } else if (result.restoreWifi && !wifiState.enabled) {
        void handleToggleWifi();
      }
    }
    addNotification({
      title: enabled ? 'Flight Mode Enabled' : 'Flight Mode Disabled',
      message: enabled
        ? 'Bluetooth, Hotspot, and wireless transmitters have been suspended.'
        : 'Wireless radios restored to their previous state.',
      source: 'System',
      category: 'system',
      actionLabel: 'Flight Mode Settings',
      actionSettingsSection: 'flight_mode',
    });
  };

  const handleUpdateNearbySharing = (partial: Partial<QuickControlsState['nearbySharing']>) => {
    setQuickControls(prev => ({
      ...prev,
      nearbySharing: { ...prev.nearbySharing, ...partial },
    }));
    if (typeof partial.enabled === 'boolean') {
      addNotification({
        title: partial.enabled ? 'Nearby Sharing Enabled' : 'Nearby Sharing Off',
        message: partial.enabled
          ? `Visible to ${partial.visibility || quickControls.nearbySharing.visibility} as ${partial.deviceName || quickControls.nearbySharing.deviceName}.`
          : 'Nearby peer-to-peer discovery disabled.',
        source: 'Nearby Sharing',
        category: 'system',
        actionLabel: 'Sharing Settings',
        actionSettingsSection: 'nearby_sharing',
      });
    }
  };

  const buildWorkspaceSnapshotDataUrl = (format: 'png' | 'webp'): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#020617');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // Subtle HUD grid
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1280; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 720);
      ctx.stroke();
    }
    for (let y = 0; y < 720; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1280, y);
      ctx.stroke();
    }

    // Top bar
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.fillRect(0, 0, 1280, 48);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(1280, 48);
    ctx.stroke();

    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('JARVISOS · WORKSPACE CAPTURE', 24, 31);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(
      `${new Date().toLocaleString()} · Battery ${effectiveTelemetry.batteryPercent}% · RAM ${effectiveTelemetry.ramUsedMb}MB`,
      540,
      30
    );

    // Draw open Helios windows
    const visibleWins = windows.filter(w => !w.minimized);
    const scaleX = 1280 / Math.max(window.innerWidth, 1280);
    const scaleY = 720 / Math.max(window.innerHeight, 720);
    visibleWins.forEach(win => {
      const wx = Math.max(20, Math.round(win.x * scaleX));
      const wy = Math.max(64, Math.round(win.y * scaleY));
      const ww = Math.min(1240 - wx, Math.round(win.width * scaleX));
      const wh = Math.min(680 - wy, Math.round(win.height * scaleY));

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = win.id === activeWindowId ? '#22d3ee' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 2;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeRect(wx, wy, ww, wh);

      ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
      ctx.fillRect(wx, wy, ww, 32);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`${win.icon} ${win.title}`, wx + 12, wy + 21);
    });

    return canvas.toDataURL(format === 'webp' ? 'image/webp' : 'image/png');
  };

  const executeScreenshotCapture = async (mode: 'fullscreen' | 'workspace') => {
    const format = quickControls.screenshot.format;
    let dataUrl = '';
    let captureSource = 'Workspace Snapshot';

    if (mode === 'fullscreen' && navigator.mediaDevices?.getDisplayMedia) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL(format === 'webp' ? 'image/webp' : 'image/png');
          captureSource = 'Live Screen Capture';
        }
        stream.getTracks().forEach(t => t.stop());
      } catch {
        dataUrl = buildWorkspaceSnapshotDataUrl(format);
        captureSource = 'Workspace Snapshot (Display capture declined)';
      }
    } else {
      dataUrl = buildWorkspaceSnapshotDataUrl(format);
    }

    if (!dataUrl) return;
    const nowIso = new Date().toISOString();
    setQuickControls(prev => ({
      ...prev,
      screenshot: {
        ...prev.screenshot,
        lastCaptureUrl: dataUrl,
        lastCapturedAt: nowIso,
      },
    }));

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `jarvisos-capture-${Date.now()}.${format}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification({
      title: 'Screenshot Captured',
      message: `${captureSource} saved as ${format.toUpperCase()}.`,
      source: 'Capture',
      category: 'capture',
      imageDataUrl: dataUrl,
      actionLabel: 'Screenshot Settings',
      actionSettingsSection: 'screenshot',
    });
  };

  const handleCaptureScreenshot = (mode: 'fullscreen' | 'workspace' | 'delay3s') => {
    if (screenshotCountdown !== null) return;
    if (mode === 'delay3s') {
      setScreenshotCountdown(3);
      let remaining = 3;
      const timer = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          window.clearInterval(timer);
          setScreenshotCountdown(null);
          void executeScreenshotCapture('workspace');
        } else {
          setScreenshotCountdown(remaining);
        }
      }, 1000);
      return;
    }
    void executeScreenshotCapture(mode);
  };

  const handleUpdateScreenshotPrefs = (partial: Partial<QuickControlsState['screenshot']>) => {
    setQuickControls(prev => ({
      ...prev,
      screenshot: { ...prev.screenshot, ...partial },
    }));
  };

  const handleUpdateVpnProxy = (partial: Partial<QuickControlsState['vpnProxy']>) => {
    setQuickControls(prev => ({
      ...prev,
      vpnProxy: { ...prev.vpnProxy, ...partial },
    }));
    if (typeof partial.enabled === 'boolean') {
      const nextProto = partial.protocol || quickControls.vpnProxy.protocol;
      const nextServer = partial.serverAddress || quickControls.vpnProxy.serverAddress;
      addNotification({
        title: partial.enabled ? `${nextProto} Connected` : `${nextProto} Disconnected`,
        message: partial.enabled
          ? `Routing traffic through ${nextServer}:${partial.port || quickControls.vpnProxy.port}.`
          : 'Direct network routing restored.',
        source: 'VPN / Proxy',
        category: 'network',
        actionLabel: 'VPN Settings',
        actionSettingsSection: 'vpn_proxy',
      });
    }
  };

  const handleSendTestNotification = () => {
    addNotification({
      title: 'Notification Hub Test Alert',
      message: `Theme: ${notificationSettings.theme} · Style: ${notificationSettings.layoutStyle} · Position: ${notificationSettings.position}.`,
      source: 'System',
      category: 'system',
      actionLabel: 'Open Settings',
      actionSettingsSection: 'notifications',
    });
  };

  const effectiveTelemetry = useMemo<SystemTelemetry>(() => {
    const metrics = calculatePowerMetrics(powerState);
    return {
      ...telemetry,
      cpuTempC: Number((telemetry.cpuTempC + metrics.cpuTempDeltaC).toFixed(1)),
      batteryPercent: metrics.displayedPercent,
      isCharging: metrics.isActivelyCharging,
    };
  }, [telemetry, powerState]);

  const openApp = (id: AppId, options?: { forceWindow?: boolean }) => {
    sound.playBlip();
    if (
      id === 'notification_center' &&
      !options?.forceWindow &&
      notificationSettings.position !== 'separate'
    ) {
      setNotificationDrawerOpen(true);
      return;
    }
    const existing = windows.find(w => w.id === id);

    if (existing) {
      const nextZ = topZIndex + 1;
      setTopZIndex(nextZ);
      setWindows(prev =>
        prev.map(w =>
          w.id === id ? { ...w, minimized: false, zIndex: nextZ } : w
        )
      );
      setActiveWindowId(id);
    } else {
      // Default window geometry based on app type
      const nextZ = topZIndex + 1;
      setTopZIndex(nextZ);

      let title = 'JARVIS App';
      let icon = '⚡';
      let w = 580;
      let h = 480;

      switch (id) {
        case 'voice_reactor':
          title = 'JARVIS Arc Core AI';
          icon = '🎙️';
          w = 440;
          h = 520;
          break;
        case 'terminal':
          title = 'Linux Terminal (bash)';
          icon = '💻';
          w = 680;
          h = 440;
          break;
        case 'novafs':
          title = 'NovaFS Flash Storage Manager';
          icon = '💾';
          w = 640;
          h = 460;
          break;
        case 'kernel_monitor':
          title = 'Aegis Microkernel & EAS Scheduler';
          icon = '⚡';
          w = 620;
          h = 440;
          break;
        case 'synapse_neural':
          title = 'Synapse Neural Console (NPU 45 TOPS)';
          icon = '🧠';
          w = 620;
          h = 460;
          break;
        case 'vision_hud':
          title = 'Helios Vision Grounding & Spatial HUD';
          icon = '👁️';
          w = 680;
          h = 480;
          break;
        case 'vault_security':
          title = 'VaultOS Secure Enclave (S-EL1)';
          icon = '🛡️';
          w = 580;
          h = 440;
          break;
        case 'iso_builder':
          title = 'Lenovo E41-25 Bootable ISO Studio';
          icon = '💿';
          w = 660;
          h = 500;
          break;
        case 'specs_reader':
          title = 'JARVISOS 12-Part Engineering Specifications';
          icon = '📖';
          w = 780;
          h = 540;
          break;
        case 'network_settings':
          title = 'Network & Wi-Fi Settings';
          icon = '📶';
          w = 680;
          h = 460;
          break;
        case 'system_settings':
          title = 'JARVISOS System Settings';
          icon = '⚙️';
          w = 760;
          h = 520;
          break;
        case 'notification_center':
          title = 'Notification Manager';
          icon = '🔔';
          w = Math.max(360, Math.min(540, notificationSettings.sizePx));
          h = Math.min(620, Math.max(480, window.innerHeight - 130));
          break;
        case 'browser':
          title = 'JARVIS Browser';
          icon = '🌐';
          w = Math.min(980, Math.max(640, window.innerWidth - 96));
          h = Math.min(620, Math.max(460, window.innerHeight - 132));
          break;
        case 'browser_private':
          title = 'JARVIS Private Browser';
          icon = '🕶️';
          w = Math.min(960, Math.max(640, window.innerWidth - 110));
          h = Math.min(600, Math.max(460, window.innerHeight - 140));
          break;
      }

      // Stagger window position
      const offset = (windows.length % 5) * 30;
      const newWin: WindowState = {
        id,
        title,
        icon,
        x: Math.max(16, Math.min(window.innerWidth - w - 32, 80 + offset)),
        y: Math.max(46, Math.min(window.innerHeight - h - 88, 56 + offset)),
        width: w,
        height: h,
        minimized: false,
        maximized: false,
        zIndex: nextZ,
      };

      setWindows(prev => [...prev, newWin]);
      setActiveWindowId(id);
    }
  };

  const openWebPortal = (payload: WebPortalPayload) => {
    sound.playConfirm();
    const nextZ = topZIndex + 1;
    setTopZIndex(nextZ);

    setWindows(prev => {
      const existing = prev.find(w => w.id === payload.portalKey);
      if (existing) {
        return prev.map(w =>
          w.id === payload.portalKey
            ? {
                ...w,
                title: payload.title,
                icon: payload.mode === 'youtube' ? '▶️' : '🌐',
                minimized: false,
                zIndex: nextZ,
                portal: payload,
              }
            : w
        );
      }

      const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
      const width = Math.min(760, Math.max(420, vw - 120));
      const height = Math.min(520, Math.max(380, vh - 160));
      const offset = (prev.length % 5) * 28;
      const x = Math.max(16, Math.min(vw - width - 24, 180 + offset));
      const y = Math.max(48, Math.min(vh - height - 88, 64 + offset));

      const newWin: WindowState = {
        id: payload.portalKey,
        appType: 'web_portal',
        title: payload.title,
        icon: payload.mode === 'youtube' ? '▶️' : '🌐',
        x,
        y,
        width,
        height,
        minimized: false,
        maximized: false,
        zIndex: nextZ,
        portal: payload,
      };
      return [...prev, newWin];
    });
    setActiveWindowId(payload.portalKey);
  };

  const updateWindowTitle = (id: string, title: string) => {
    setWindows(prev => {
      const target = prev.find(w => w.id === id);
      if (!target || target.title === title) return prev;
      return prev.map(w => (w.id === id ? { ...w, title } : w));
    });
  };

  const focusWindow = (id: string) => {
    const existing = windows.find(w => w.id === id);
    if (activeWindowId === id && existing && !existing.minimized) {
      return;
    }
    const nextZ = topZIndex + 1;
    setTopZIndex(nextZ);
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, minimized: false, zIndex: nextZ } : w))
    );
    setActiveWindowId(id);
  };

  const closeWindow = (id: string) => {
    sound.playBlip();
    setWindows(prev => prev.filter(w => w.id !== id));
    if (activeWindowId === id) {
      const remaining = windows.filter(w => w.id !== id);
      setActiveWindowId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const minimizeWindow = (id: string) => {
    sound.playBlip();
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, minimized: true } : w))
    );
    if (activeWindowId === id) {
      setActiveWindowId(null);
    }
  };

  const maximizeWindow = (id: string) => {
    sound.playBlip();
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, maximized: !w.maximized } : w))
    );
  };

  const moveWindow = (id: string, x: number, y: number) => {
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, x, y } : w))
    );
  };

  const handleUpdateNotificationSettings = (partial: Partial<NotificationBarSettings>) => {
    const prevPosition = notificationSettings.position;
    const next = clampNotificationSettings({ ...notificationSettings, ...partial });
    setNotificationSettings(next);

    if (partial.position && partial.position !== prevPosition) {
      if (next.position === 'separate') {
        setNotificationDrawerOpen(false);
        openApp('notification_center', { forceWindow: true });
      } else {
        setWindows(prev => prev.filter(w => w.id !== 'notification_center'));
        setNotificationDrawerOpen(true);
      }
    } else if (next.position === 'separate' && typeof partial.sizePx === 'number') {
      setWindows(prev =>
        prev.map(w =>
          w.id === 'notification_center'
            ? { ...w, width: Math.max(360, Math.min(540, next.sizePx)) }
            : w
        )
      );
    }
  };

  const handleToggleNotificationManager = () => {
    if (notificationSettings.position === 'separate') {
      const existing = windows.find(w => w.id === 'notification_center' && !w.minimized);
      if (existing) {
        closeWindow('notification_center');
      } else {
        openApp('notification_center');
      }
      return;
    }
    setNotificationDrawerOpen(prev => !prev);
  };

  const handleOpenSettingsSection = (section: SystemSettingsSection) => {
    setNotificationDrawerOpen(false);
    if (section === 'network') {
      openApp('network_settings');
      return;
    }
    setActiveSettingsSection(section);
    openApp('system_settings');
  };

  const unreadNotificationCount = useMemo(
    () => countUnreadNotifications(notifications),
    [notifications]
  );

  const isNotificationManagerOpen =
    notificationSettings.position === 'separate'
      ? windows.some(w => w.id === 'notification_center' && !w.minimized)
      : notificationDrawerOpen;

  const notificationManagerProps: NotificationManagerSharedProps = {
    notifications,
    settings: notificationSettings,
    quickControls,
    wifiState,
    powerState,
    screenshotCountdown,
    onUpdateSettings: handleUpdateNotificationSettings,
    onMarkRead: id => setNotifications(prev => markNotificationRead(prev, id)),
    onMarkAllRead: () => setNotifications(prev => markAllNotificationsRead(prev)),
    onDismissNotification: id => setNotifications(prev => dismissNotification(prev, id)),
    onClearAllNotifications: () => setNotifications([]),
    onOpenSettingsSection: handleOpenSettingsSection,
    onOpenApp: openApp,
    onToggleLocation: handleToggleLocation,
    onToggleLocationHighAccuracy: handleToggleLocationHighAccuracy,
    onRefreshLocation: () => handleRequestLocation(),
    onSelectPowerMode: handleSelectPowerMode,
    onToggleChargeLimit80: handleToggleChargeLimit80,
    onToggleBluetooth: handleToggleBluetooth,
    onToggleBluetoothDiscoverable: handleToggleBluetoothDiscoverable,
    onScanBluetooth: () => void handleScanBluetooth(),
    onToggleBluetoothDevice: handleToggleBluetoothDevice,
    onUpdateHotspot: handleUpdateHotspot,
    onToggleFlightMode: handleToggleFlightMode,
    onUpdateNearbySharing: handleUpdateNearbySharing,
    onToggleWifi: handleToggleWifi,
    onScanWifi: handleScanWifi,
    onConnectWifi: handleConnectWifi,
    onCaptureScreenshot: handleCaptureScreenshot,
    onUpdateScreenshotPrefs: handleUpdateScreenshotPrefs,
    onUpdateVpnProxy: handleUpdateVpnProxy,
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans select-none hud-grid">
      {/* Ambient Sci-Fi Glow Circles in background */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-600/5 blur-[100px] pointer-events-none" />

      {/* Top Bar Navigation */}
      <TopBar
        osMode={osMode}
        onSelectMode={setOsMode}
        telemetry={effectiveTelemetry}
        wifiState={wifiState}
        powerState={powerState}
        onToggleWifi={handleToggleWifi}
        onOpenNetworkSettings={() => openApp('network_settings')}
        onSelectPowerMode={handleSelectPowerMode}
        onToggleChargeLimit80={handleToggleChargeLimit80}
        onSystemPowerAction={setSystemPowerPhase}
        onWakeJarvis={() => openApp('voice_reactor')}
        unreadNotificationCount={unreadNotificationCount}
        notificationManagerOpen={isNotificationManagerOpen}
        doNotDisturb={notificationSettings.doNotDisturb}
        onToggleNotificationManager={handleToggleNotificationManager}
      />

      {/* Central Viewport depending on OS Mode */}
      <main className="relative flex-1 overflow-hidden">
        {/* MODE 1 & 2: SPATIAL HUD or DESKTOP CONTINUUM */}
        {(osMode === 'spatial_hud' || osMode === 'desktop_continuum') && (
          <>
            {/* Background HUD Graphics (in Spatial Mode) */}
            {osMode === 'spatial_hud' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                <div className="relative flex items-center justify-center w-[480px] h-[480px]">
                  <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-spin" style={{ animationDuration: '60s' }} />
                  <div className="absolute inset-12 rounded-full border border-dashed border-cyan-500/30 animate-spin" style={{ animationDuration: '45s', animationDirection: 'reverse' }} />
                  <div className="absolute inset-28 rounded-full border border-cyan-400/20" />
                  <div className="text-center font-display text-cyan-400 font-bold tracking-widest text-sm">
                    JARVISOS
                    <div className="text-[10px] font-mono text-cyan-500 font-normal mt-1">
                      AEGIS CAPABILITY CORE
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Floating Windows Managed by Helios WM */}
            <HeliosWindowManager
              windows={windows}
              activeWindowId={activeWindowId}
              telemetry={effectiveTelemetry}
              customApps={customApps}
              wifiState={wifiState}
              onToggleWifi={handleToggleWifi}
              onConnectWifi={handleConnectWifi}
              onDisconnectWifi={handleDisconnectWifi}
              onForgetWifi={handleForgetWifi}
              onToggleAutoReconnect={handleToggleAutoReconnect}
              onScanWifi={handleScanWifi}
              onAddCustomApp={handleAddCustomApp}
              onRemoveCustomApp={handleRemoveCustomApp}
              onFocusWindow={focusWindow}
              onCloseWindow={closeWindow}
              onMinimizeWindow={minimizeWindow}
              onMaximizeWindow={maximizeWindow}
              onMoveWindow={moveWindow}
              onUpdateWindowTitle={updateWindowTitle}
              onOpenApp={openApp}
              onOpenWebPortal={openWebPortal}
              activeSettingsSection={activeSettingsSection}
              onSelectSettingsSection={setActiveSettingsSection}
              onSendTestNotification={handleSendTestNotification}
              onRemoveBluetoothDevice={handleRemoveBluetoothDevice}
              notificationManagerProps={notificationManagerProps}
            />

            {/* Bottom Dock */}
            <Dock
              activeAppId={activeWindowId}
              openAppIds={windows.filter(w => !w.minimized).map(w => w.id)}
              portalWindows={windows.filter(
                w =>
                  w.appType === 'web_portal' ||
                  w.id === 'network_settings' ||
                  w.id === 'browser_private' ||
                  w.id === 'system_settings' ||
                  w.id === 'notification_center'
              )}
              onOpenApp={openApp}
              onFocusWindow={focusWindow}
            />
          </>
        )}

        {/* MODE 3: 12-PART MASTER ENGINEERING SPECIFICATIONS EXPLORER */}
        {osMode === 'specs_explorer' && (
          <div className="absolute inset-0 z-20">
            <SpecsExplorerApp />
          </div>
        )}

        {/* MODE 4: MOBILE HANDHELD MODE */}
        {osMode === 'mobile_handheld' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[380px] h-[780px] rounded-[48px] bg-slate-900 border-4 border-cyan-500/40 shadow-[0_0_50px_rgba(0,229,255,0.3)] overflow-hidden flex flex-col relative">
              {/* Phone Speaker & Dynamic Island */}
              <div className="h-6 bg-black flex items-center justify-center shrink-0">
                <div className="w-24 h-4 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-cyan-400/60 mr-2" />
                  <div className="w-6 h-1 rounded-full bg-slate-800" />
                </div>
              </div>

              {/* Mobile Content (Arc Core + Mini Apps) */}
              <div className="flex-1 overflow-hidden relative">
                <HeliosWindowManager
                  windows={windows.map(w => ({ ...w, maximized: true }))}
                  activeWindowId={activeWindowId}
                  telemetry={effectiveTelemetry}
                  customApps={customApps}
                  wifiState={wifiState}
                  onToggleWifi={handleToggleWifi}
                  onConnectWifi={handleConnectWifi}
                  onDisconnectWifi={handleDisconnectWifi}
                  onForgetWifi={handleForgetWifi}
                  onToggleAutoReconnect={handleToggleAutoReconnect}
                  onScanWifi={handleScanWifi}
                  onAddCustomApp={handleAddCustomApp}
                  onRemoveCustomApp={handleRemoveCustomApp}
                  onFocusWindow={focusWindow}
                  onCloseWindow={closeWindow}
                  onMinimizeWindow={minimizeWindow}
                  onMaximizeWindow={maximizeWindow}
                  onMoveWindow={moveWindow}
                  onUpdateWindowTitle={updateWindowTitle}
                  onOpenApp={openApp}
                  onOpenWebPortal={openWebPortal}
                  activeSettingsSection={activeSettingsSection}
                  onSelectSettingsSection={setActiveSettingsSection}
                  onSendTestNotification={handleSendTestNotification}
                  onRemoveBluetoothDevice={handleRemoveBluetoothDevice}
                  notificationManagerProps={notificationManagerProps}
                />
              </div>

              {/* Mobile Gesture Bar */}
              <div className="h-8 bg-black flex items-center justify-center shrink-0">
                <div className="w-32 h-1 bg-slate-600 rounded-full" />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Slide-out Notification Manager Drawer (Right / Left / Top / Bottom) */}
      <NotificationManagerDrawer
        isOpen={notificationDrawerOpen}
        onClose={() => setNotificationDrawerOpen(false)}
        {...notificationManagerProps}
      />

      {/* Full-Screen System Power Overlay (Sleep / Restart / Shut Down) */}
      <PowerOverlay
        phase={systemPowerPhase}
        onWake={() => setSystemPowerPhase('running')}
        onPowerOn={() => setSystemPowerPhase('restarting')}
      />
    </div>
  );
}
