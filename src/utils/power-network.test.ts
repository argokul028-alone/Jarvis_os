import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHardwareNetworkSnapshot,
  createInitialWifiState,
  createInitialPowerState,
  toggleWifiState,
  connectToWifiNetwork,
  disconnectWifi,
  forgetWifiNetwork,
  calculatePowerMetrics,
  classifyBatteryHealth,
} from './power-network.ts';

test('createInitialWifiState starts with zero fake Wi-Fi networks until hardware scan completes', () => {
  const initial = createInitialWifiState(true);
  assert.equal(initial.networks.length, 0);
  assert.equal(initial.activeNetworkId, null);
  assert.equal(initial.hasWifiHardware, false);
  assert.equal(initial.hardwareBackend, 'checking');
});

test('applyHardwareNetworkSnapshot hydrates real scanned networks and supports radio toggle & connect validation', () => {
  const initial = createInitialWifiState(true);
  const hydrated = applyHardwareNetworkSnapshot(initial, {
    hasWifiHardware: true,
    hardwareBackend: 'networkmanager',
    wifiInterface: 'wlp2s0',
    enabled: true,
    activeNetworkId: 'ssid:HomeRouter',
    networks: [
      {
        id: 'ssid:HomeRouter',
        ssid: 'HomeRouter',
        signalPercent: 84,
        band: '5 GHz',
        security: 'WPA2',
        saved: true,
        ipAddress: '192.168.1.24',
        gateway: '192.168.1.1',
        dns: '1.1.1.1',
        linkSpeedMbps: 433,
      },
      {
        id: 'ssid:OfficeWPA3',
        ssid: 'OfficeWPA3',
        signalPercent: 72,
        band: '5 GHz',
        security: 'WPA3',
        saved: false,
        ipAddress: '',
        gateway: '',
        dns: '',
        linkSpeedMbps: 0,
      },
      {
        id: 'ssid:LibraryOpen',
        ssid: 'LibraryOpen',
        signalPercent: 55,
        band: '2.4 GHz',
        security: 'Open',
        saved: false,
        ipAddress: '',
        gateway: '',
        dns: '',
        linkSpeedMbps: 0,
      },
    ],
    interfaces: [],
    dnsServers: ['1.1.1.1'],
    defaultGateway: '192.168.1.1',
    defaultInterface: 'wlp2s0',
  });

  assert.equal(hydrated.hasWifiHardware, true);
  assert.equal(hydrated.activeNetworkId, 'ssid:HomeRouter');

  const disabled = toggleWifiState(hydrated);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.activeNetworkId, null);

  const reenabled = toggleWifiState(disabled);
  assert.equal(reenabled.enabled, true);
  assert.equal(reenabled.activeNetworkId, 'ssid:HomeRouter');

  const shortPass = connectToWifiNetwork(hydrated, 'ssid:OfficeWPA3', '1234');
  assert.ok(shortPass.error);
  assert.equal(shortPass.state.activeNetworkId, 'ssid:HomeRouter');

  const validPass = connectToWifiNetwork(hydrated, 'ssid:OfficeWPA3', 'office-secret-99');
  assert.equal(validPass.error, undefined);
  assert.equal(validPass.state.activeNetworkId, 'ssid:OfficeWPA3');

  const openConnect = connectToWifiNetwork(validPass.state, 'ssid:LibraryOpen');
  assert.equal(openConnect.error, undefined);
  assert.equal(openConnect.state.activeNetworkId, 'ssid:LibraryOpen');

  const disconnected = disconnectWifi(openConnect.state);
  assert.equal(disconnected.activeNetworkId, null);

  const forgotten = forgetWifiNetwork(validPass.state, 'ssid:OfficeWPA3');
  assert.equal(forgotten.activeNetworkId, null);
  assert.equal(forgotten.networks.find(n => n.id === 'ssid:OfficeWPA3')?.saved, false);
});

test('calculatePowerMetrics enforces 80% conservation charge limit and reflects power mode wattage', () => {
  const base = createInitialPowerState();

  const normal = calculatePowerMetrics(base);
  assert.equal(normal.displayedPercent, 96);
  assert.equal(normal.isPausedByChargeLimit, false);
  assert.equal(normal.healthStatus, 'Good');

  const capped = calculatePowerMetrics({ ...base, chargeLimit80: true });
  assert.equal(capped.isPausedByChargeLimit, true);
  assert.equal(capped.displayedPercent, 80);
  assert.equal(capped.isActivelyCharging, false);
  assert.match(capped.statusLabel, /80% Limit/);

  const saver = calculatePowerMetrics({ ...base, isCharging: false, mode: 'power_saver' });
  const perf = calculatePowerMetrics({ ...base, isCharging: false, mode: 'performance' });
  assert.ok(saver.powerDrawWatts < perf.powerDrawWatts);
  assert.ok(saver.batteryTempC < perf.batteryTempC);
});

test('classifyBatteryHealth classifies thresholds accurately', () => {
  assert.equal(classifyBatteryHealth(94), 'Good');
  assert.equal(classifyBatteryHealth(78), 'Fair');
  assert.equal(classifyBatteryHealth(62), 'Replace Soon');
});
