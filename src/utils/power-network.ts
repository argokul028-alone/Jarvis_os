import type {
  PowerControlState,
  PowerMode,
  SystemNetworkInterface,
  WifiHardwareBackend,
  WifiNetwork,
  WifiState,
} from '../types/os.ts';

export const HARDWARE_PREFS_STORAGE_KEY = 'jarvisos_hardware_prefs_v1';

export interface HardwareNetworkSnapshot {
  hasWifiHardware: boolean;
  hardwareBackend: WifiHardwareBackend;
  wifiInterface: string | null;
  enabled: boolean;
  activeNetworkId: string | null;
  networks: WifiNetwork[];
  interfaces: SystemNetworkInterface[];
  dnsServers: string[];
  defaultGateway: string;
  defaultInterface: string;
  environmentNote?: string;
  scannedAt?: string;
  error?: string | null;
}

export function createInitialWifiState(browserOnline = true): WifiState {
  return {
    enabled: false,
    browserOnline,
    hasWifiHardware: false,
    hardwareBackend: 'checking',
    wifiInterface: null,
    activeNetworkId: null,
    lastConnectedNetworkId: null,
    autoReconnect: true,
    networks: [],
    interfaces: [],
    dnsServers: [],
    defaultGateway: '',
    defaultInterface: '',
    loading: true,
    error: null,
  };
}

export function applyHardwareNetworkSnapshot(
  prev: WifiState,
  snapshot: HardwareNetworkSnapshot
): WifiState {
  return {
    ...prev,
    hasWifiHardware: Boolean(snapshot.hasWifiHardware),
    hardwareBackend: snapshot.hardwareBackend,
    wifiInterface: snapshot.wifiInterface || null,
    enabled: Boolean(snapshot.enabled),
    activeNetworkId: snapshot.activeNetworkId || null,
    lastConnectedNetworkId: snapshot.activeNetworkId || prev.lastConnectedNetworkId,
    networks: Array.isArray(snapshot.networks) ? snapshot.networks : [],
    interfaces: Array.isArray(snapshot.interfaces) ? snapshot.interfaces : [],
    dnsServers: Array.isArray(snapshot.dnsServers) ? snapshot.dnsServers : [],
    defaultGateway: snapshot.defaultGateway || '',
    defaultInterface: snapshot.defaultInterface || '',
    environmentNote: snapshot.environmentNote,
    lastScannedAt: snapshot.scannedAt || new Date().toISOString(),
    loading: false,
    error: snapshot.error ?? null,
  };
}

export function createInitialPowerState(): PowerControlState {
  return {
    mode: 'balanced',
    chargeLimit80: false,
    batteryPercent: 96,
    isCharging: true,
    healthPercent: 94,
    designCapacityWh: 45.0,
    fullChargeCapacityWh: 42.3,
    cycleCount: 142,
    baseTempC: 33.8,
    voltageV: 11.4,
  };
}

export function toggleWifiState(state: WifiState): WifiState {
  if (!state.hasWifiHardware) {
    return state;
  }
  if (state.enabled) {
    return {
      ...state,
      enabled: false,
      lastConnectedNetworkId: state.activeNetworkId || state.lastConnectedNetworkId,
      activeNetworkId: null,
    };
  }

  let restoredId: string | null = null;
  if (state.autoReconnect) {
    const candidateId = state.lastConnectedNetworkId;
    const candidate = state.networks.find(n => n.id === candidateId && n.saved);
    if (candidate) {
      restoredId = candidate.id;
    } else {
      const firstSaved = state.networks.find(n => n.saved);
      restoredId = firstSaved ? firstSaved.id : null;
    }
  }

  return {
    ...state,
    enabled: true,
    activeNetworkId: restoredId,
  };
}

export function validateWifiPassphrase(
  network: Pick<WifiNetwork, 'ssid' | 'security' | 'saved'>,
  passphrase?: string
): { valid: boolean; error?: string } {
  if (network.security === 'Open' || network.saved) {
    return { valid: true };
  }
  const trimmed = (passphrase || '').trim();
  if (!trimmed) {
    return { valid: false, error: `Enter the ${network.security} passphrase for ${network.ssid}.` };
  }
  const minLength = network.security === 'WEP' ? 5 : 8;
  if (trimmed.length < minLength) {
    return {
      valid: false,
      error: `Wi-Fi passphrase must be at least ${minLength} characters.`,
    };
  }
  return { valid: true };
}

export function connectToWifiNetwork(
  state: WifiState,
  networkId: string,
  passphrase?: string
): { state: WifiState; error?: string } {
  const target = state.networks.find(n => n.id === networkId);
  if (!target) {
    return { state, error: 'Selected network was not found.' };
  }

  const validation = validateWifiPassphrase(target, passphrase);
  if (!validation.valid) {
    return { state, error: validation.error };
  }

  const nextNetworks = state.networks.map(n =>
    n.id === networkId ? { ...n, saved: true } : n
  );

  return {
    state: {
      ...state,
      enabled: true,
      activeNetworkId: networkId,
      lastConnectedNetworkId: networkId,
      networks: nextNetworks,
    },
  };
}

export function disconnectWifi(state: WifiState): WifiState {
  return {
    ...state,
    activeNetworkId: null,
  };
}

export function forgetWifiNetwork(state: WifiState, networkId: string): WifiState {
  const nextNetworks = state.networks.map(n =>
    n.id === networkId ? { ...n, saved: false } : n
  );
  return {
    ...state,
    activeNetworkId: state.activeNetworkId === networkId ? null : state.activeNetworkId,
    lastConnectedNetworkId:
      state.lastConnectedNetworkId === networkId ? null : state.lastConnectedNetworkId,
    networks: nextNetworks,
  };
}

export interface ComputedPowerMetrics {
  displayedPercent: number;
  isActivelyCharging: boolean;
  isPausedByChargeLimit: boolean;
  statusLabel: string;
  estimateLabel: string;
  powerDrawWatts: number;
  batteryTempC: number;
  cpuTempDeltaC: number;
  healthStatus: 'Good' | 'Fair' | 'Replace Soon';
  modeLabel: string;
  governorLabel: string;
}

export function getPowerModeSpecs(mode: PowerMode): {
  label: string;
  watts: number;
  cpuTempDeltaC: number;
  batteryTempDeltaC: number;
  governor: string;
} {
  switch (mode) {
    case 'power_saver':
      return {
        label: 'Power Saver',
        watts: 4.8,
        cpuTempDeltaC: -4.2,
        batteryTempDeltaC: -1.8,
        governor: 'EAS Efficiency Cap (1.6 GHz)',
      };
    case 'performance':
      return {
        label: 'Performance',
        watts: 15.2,
        cpuTempDeltaC: 6.5,
        batteryTempDeltaC: 3.6,
        governor: 'EAS Turbo Boost (3.0 GHz)',
      };
    default:
      return {
        label: 'Balanced',
        watts: 9.5,
        cpuTempDeltaC: 0,
        batteryTempDeltaC: 0,
        governor: 'EAS Adaptive PID',
      };
  }
}

export function classifyBatteryHealth(healthPercent: number): 'Good' | 'Fair' | 'Replace Soon' {
  if (healthPercent >= 85) return 'Good';
  if (healthPercent >= 70) return 'Fair';
  return 'Replace Soon';
}

export function calculatePowerMetrics(power: PowerControlState): ComputedPowerMetrics {
  const specs = getPowerModeSpecs(power.mode);
  const clampedRaw = Math.max(1, Math.min(100, Math.round(power.batteryPercent)));

  const isPausedByChargeLimit = power.chargeLimit80 && power.isCharging && clampedRaw >= 80;
  const displayedPercent = isPausedByChargeLimit ? 80 : clampedRaw;
  const isActivelyCharging = power.isCharging && !isPausedByChargeLimit && displayedPercent < 100;

  const remainingWh = (displayedPercent / 100) * power.fullChargeCapacityWh;
  let statusLabel = 'On Battery';
  let estimateLabel = '';

  if (isPausedByChargeLimit) {
    statusLabel = 'Charging Paused (80% Limit)';
    estimateLabel = 'Conservation cap active · Plugged in';
  } else if (power.isCharging && displayedPercent >= 100) {
    statusLabel = 'Fully Charged';
    estimateLabel = 'Plugged in · AC Power';
  } else if (isActivelyCharging) {
    const targetPercent = power.chargeLimit80 ? 80 : 100;
    const missingWh = Math.max(0, ((targetPercent - displayedPercent) / 100) * power.fullChargeCapacityWh);
    const chargeRateWatts = 28;
    const mins = Math.max(5, Math.round((missingWh / chargeRateWatts) * 60));
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    statusLabel = 'Charging';
    estimateLabel =
      hrs > 0
        ? `${hrs}h ${remMins}m to ${targetPercent}%`
        : `${remMins}m to ${targetPercent}%`;
  } else {
    const hoursLeft = remainingWh / specs.watts;
    const totalMins = Math.max(10, Math.round(hoursLeft * 60));
    const hrs = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    statusLabel = 'Discharging';
    estimateLabel = `${hrs}h ${remMins}m remaining`;
  }

  return {
    displayedPercent,
    isActivelyCharging,
    isPausedByChargeLimit,
    statusLabel,
    estimateLabel,
    powerDrawWatts: specs.watts,
    batteryTempC: Number((power.baseTempC + specs.batteryTempDeltaC).toFixed(1)),
    cpuTempDeltaC: specs.cpuTempDeltaC,
    healthStatus: classifyBatteryHealth(power.healthPercent),
    modeLabel: specs.label,
    governorLabel: specs.governor,
  };
}

interface StoredHardwarePrefs {
  autoReconnect?: boolean;
  powerMode?: PowerMode;
  chargeLimit80?: boolean;
}

export function loadHardwarePrefs(): StoredHardwarePrefs {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(HARDWARE_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveHardwarePrefs(wifi: WifiState, power: PowerControlState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: StoredHardwarePrefs = {
      autoReconnect: wifi.autoReconnect,
      powerMode: power.mode,
      chargeLimit80: power.chargeLimit80,
    };
    window.localStorage.setItem(HARDWARE_PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}
