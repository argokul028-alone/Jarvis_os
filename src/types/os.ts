/**
 * Core Type Definitions for JARVISOS
 */

export type OsMode = 'spatial_hud' | 'desktop_continuum' | 'mobile_handheld' | 'specs_explorer';

export type AppId =
  | 'voice_reactor'
  | 'terminal'
  | 'novafs'
  | 'kernel_monitor'
  | 'synapse_neural'
  | 'vision_hud'
  | 'vault_security'
  | 'iso_builder'
  | 'specs_reader'
  | 'network_settings'
  | 'system_settings'
  | 'notification_center'
  | 'browser'
  | 'browser_private';

export type WindowAppType = AppId | 'web_portal';

export interface WebPortalPayload {
  portalKey: string;
  mode: 'youtube' | 'web';
  title: string;
  url: string;
  searchQuery?: string;
  mediaQuery?: string;
  mediaType?: 'video' | 'playlist';
  videoId?: string;
  playlistId?: string;
  searchUrlTemplate?: string;
  embedRestricted?: boolean;
  requestId: number;
}

export interface WindowState {
  id: string;
  appType?: WindowAppType;
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  portal?: WebPortalPayload;
}

export interface SystemTelemetry {
  cpuUsagePercent: number;
  npuTopsActive: number;
  ramUsedMb: number;
  ramTotalMb: number;
  zramCompressedMb: number;
  effectiveAvailableMb: number;
  cpuTempC: number;
  batteryPercent: number;
  isCharging: boolean;
  activeThreads: number;
  novafsWearLevel: number;
  vaultStatus: string;
}

export type AppShortcutCategory = 'custom' | 'web' | 'desktop' | 'system';

export interface AppShortcut {
  id: string;
  name: string;
  aliases: string[];
  category: AppShortcutCategory;
  url?: string;
  searchUrlTemplate?: string;
  systemAppId?: AppId;
  webFallbackUrl?: string;
  embedRestricted?: boolean;
}

export interface LaunchActionMetadata {
  kind: 'system' | 'web' | 'media' | 'desktop' | 'custom' | 'unrecognized';
  label: string;
  url?: string;
  systemAppId?: AppId;
  searchQuery?: string;
  mediaQuery?: string;
  mediaType?: 'video' | 'playlist';
  videoId?: string;
  playlistId?: string;
  webFallbackUrl?: string;
  searchUrlTemplate?: string;
  displayHost?: string;
  opensInSubWindow?: boolean;
  embedRestricted?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'jarvis';
  text: string;
  timestamp: string;
  actionExecuted?: string;
  launchAction?: LaunchActionMetadata;
}

export type PowerMode = 'power_saver' | 'balanced' | 'performance';

export type SystemPowerPhase = 'running' | 'sleeping' | 'restarting' | 'shutdown';

export interface WifiNetwork {
  id: string;
  ssid: string;
  bssid?: string;
  iface?: string;
  signalPercent: number;
  band: '6 GHz' | '5 GHz' | '2.4 GHz';
  security: 'WPA3' | 'WPA2' | 'WPA' | 'WEP' | 'Open';
  saved: boolean;
  ipAddress: string;
  gateway: string;
  dns: string;
  linkSpeedMbps: number;
}

export interface SystemNetworkInterface {
  name: string;
  kind: 'wifi' | 'ethernet' | 'other';
  state: 'up' | 'down';
  ipv4: string;
  ipv6: string;
  mac: string;
  gateway: string;
  dns: string;
  isDefaultRoute: boolean;
}

export interface BrowserConnectionInfo {
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  type?: string;
}

export type WifiHardwareBackend = 'checking' | 'networkmanager' | 'iw' | 'no-wifi-hardware' | 'error';

export interface WifiState {
  enabled: boolean;
  browserOnline: boolean;
  hasWifiHardware: boolean;
  hardwareBackend: WifiHardwareBackend;
  wifiInterface: string | null;
  activeNetworkId: string | null;
  lastConnectedNetworkId: string | null;
  autoReconnect: boolean;
  networks: WifiNetwork[];
  interfaces: SystemNetworkInterface[];
  dnsServers: string[];
  defaultGateway: string;
  defaultInterface: string;
  environmentNote?: string;
  lastScannedAt?: string;
  loading?: boolean;
  error?: string | null;
  browserConnection?: BrowserConnectionInfo;
}

export interface PowerControlState {
  mode: PowerMode;
  chargeLimit80: boolean;
  batteryPercent: number;
  isCharging: boolean;
  healthPercent: number;
  designCapacityWh: number;
  fullChargeCapacityWh: number;
  cycleCount: number;
  baseTempC: number;
  voltageV: number;
}

export type NotificationPosition = 'right' | 'left' | 'top' | 'bottom' | 'separate';
export type NotificationLayoutStyle = 'list' | 'grid' | 'dynamic';
export type NotificationThemeId = 'jarvis' | 'obsidian' | 'frost' | 'emerald' | 'amber';
export type NotificationCategory = 'system' | 'network' | 'security' | 'power' | 'media' | 'capture';

export type QuickControlId =
  | 'location'
  | 'battery'
  | 'bluetooth'
  | 'hotspot'
  | 'flight_mode'
  | 'nearby_sharing'
  | 'network'
  | 'screenshot'
  | 'vpn_proxy';

export type SystemSettingsSection =
  | 'notifications'
  | 'location'
  | 'battery'
  | 'bluetooth'
  | 'hotspot'
  | 'flight_mode'
  | 'nearby_sharing'
  | 'network'
  | 'screenshot'
  | 'vpn_proxy';

export interface OsNotification {
  id: string;
  title: string;
  message: string;
  source: string;
  category: NotificationCategory;
  timestamp: string;
  read: boolean;
  priority?: 'normal' | 'high';
  actionLabel?: string;
  actionAppId?: AppId;
  actionSettingsSection?: SystemSettingsSection;
  imageDataUrl?: string;
}

export interface NotificationBarSettings {
  position: NotificationPosition;
  sizePx: number;
  opacity: number;
  layoutStyle: NotificationLayoutStyle;
  theme: NotificationThemeId;
  doNotDisturb: boolean;
}

export interface BluetoothDeviceItem {
  id: string;
  name: string;
  connected: boolean;
}

export interface QuickControlsState {
  location: {
    enabled: boolean;
    highAccuracy: boolean;
    permissionState: 'prompt' | 'granted' | 'denied' | 'unsupported';
    lastCoords?: { lat: number; lng: number; accuracyM: number };
    lastUpdated?: string;
    error?: string | null;
  };
  bluetooth: {
    enabled: boolean;
    discoverable: boolean;
    webBluetoothSupported: boolean;
    devices: BluetoothDeviceItem[];
    statusMessage?: string | null;
  };
  hotspot: {
    enabled: boolean;
    ssid: string;
    band: '2.4 GHz' | '5 GHz';
    passphrase: string;
  };
  flightMode: {
    enabled: boolean;
    previousBluetooth: boolean;
    previousHotspot: boolean;
    previousWifi: boolean;
  };
  nearbySharing: {
    enabled: boolean;
    visibility: 'off' | 'contacts' | 'everyone';
    deviceName: string;
  };
  screenshot: {
    defaultMode: 'fullscreen' | 'workspace' | 'delay3s';
    format: 'png' | 'webp';
    lastCaptureUrl?: string;
    lastCapturedAt?: string;
  };
  vpnProxy: {
    enabled: boolean;
    mode: 'vpn' | 'proxy';
    profileName: string;
    serverAddress: string;
    port: string;
    protocol: 'WireGuard' | 'OpenVPN' | 'SOCKS5' | 'HTTP';
  };
}

export interface EngineeringPart {
  partNumber: number;
  totalParts: number;
  title: string;
  subtitle: string;
  sections: {
    id: string;
    heading: string;
    content: string;
    diagram?: string;
    codeSnippet?: {
      language: string;
      code: string;
    };
    table?: {
      headers: string[];
      rows: string[][];
    };
  }[];
}
