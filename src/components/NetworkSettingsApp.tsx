import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  Lock,
  RefreshCw,
  Check,
  Shield,
  Globe,
  Trash2,
  Network,
  Plus,
  Laptop,
  AlertCircle,
} from 'lucide-react';
import { WifiNetwork, WifiState } from '../types/os';
import { sound } from '../utils/audio-fx';

interface NetworkSettingsAppProps {
  wifiState: WifiState;
  onToggleWifi: () => void | Promise<void>;
  onConnectNetwork: (ssidOrId: string, passphrase?: string, hidden?: boolean) => Promise<string | null>;
  onDisconnectNetwork: () => void | Promise<void>;
  onForgetNetwork: (ssidOrId: string) => void | Promise<void>;
  onToggleAutoReconnect: () => void;
  onScanNetworks: () => void | Promise<void>;
  onOpenIsoBuilder?: () => void;
}

export const NetworkSettingsApp: React.FC<NetworkSettingsAppProps> = ({
  wifiState,
  onToggleWifi,
  onConnectNetwork,
  onDisconnectNetwork,
  onForgetNetwork,
  onToggleAutoReconnect,
  onScanNetworks,
  onOpenIsoBuilder,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [connectingSsid, setConnectingSsid] = useState<string | null>(null);
  const [promptNetworkId, setPromptNetworkId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showHiddenForm, setShowHiddenForm] = useState(false);
  const [hiddenSsid, setHiddenSsid] = useState('');
  const [hiddenPassphrase, setHiddenPassphrase] = useState('');

  const activeNetwork = wifiState.networks.find(n => n.id === wifiState.activeNetworkId) || null;
  const defaultIface =
    wifiState.interfaces.find(i => i.isDefaultRoute) || wifiState.interfaces[0] || null;
  const isBusy = isScanning || Boolean(wifiState.loading) || Boolean(connectingSsid);

  const handleScan = async () => {
    if (isBusy) return;
    sound.playBlip();
    setConnectError(null);
    setIsScanning(true);
    try {
      await onScanNetworks();
    } finally {
      setIsScanning(false);
    }
  };

  const handleStartConnect = async (net: WifiNetwork) => {
    sound.playBlip();
    setConnectError(null);
    if (net.security === 'Open' || net.saved) {
      setConnectingSsid(net.ssid);
      try {
        const err = await onConnectNetwork(net.ssid);
        if (err) {
          setConnectError(err);
          // If saved connection failed due to missing/expired secret, open password prompt
          if (net.security !== 'Open') {
            setPromptNetworkId(net.id);
            setPassphrase('');
          }
        } else {
          sound.playConfirm();
          setPromptNetworkId(null);
          setPassphrase('');
        }
      } finally {
        setConnectingSsid(null);
      }
      return;
    }
    setPromptNetworkId(net.id);
    setPassphrase('');
  };

  const handleSubmitPassphrase = async (e: React.FormEvent, net: WifiNetwork) => {
    e.preventDefault();
    setConnectError(null);
    setConnectingSsid(net.ssid);
    try {
      const err = await onConnectNetwork(net.ssid, passphrase, false);
      if (err) {
        setConnectError(err);
        return;
      }
      sound.playConfirm();
      setPromptNetworkId(null);
      setPassphrase('');
    } finally {
      setConnectingSsid(null);
    }
  };

  const handleSubmitHiddenNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = hiddenSsid.trim();
    if (!target) {
      setConnectError('Enter the hidden Wi-Fi network name (SSID).');
      return;
    }
    setConnectError(null);
    setConnectingSsid(target);
    try {
      const err = await onConnectNetwork(target, hiddenPassphrase || undefined, true);
      if (err) {
        setConnectError(err);
        return;
      }
      sound.playConfirm();
      setShowHiddenForm(false);
      setHiddenSsid('');
      setHiddenPassphrase('');
    } finally {
      setConnectingSsid(null);
    }
  };

  const signalBars = (percent: number) => {
    const level = percent >= 80 ? 4 : percent >= 60 ? 3 : percent >= 40 ? 2 : 1;
    return (
      <div className="flex items-end gap-0.5 h-3.5 shrink-0" aria-label={`Signal strength ${percent}%`}>
        {[1, 2, 3, 4].map(bar => (
          <span
            key={bar}
            className={`w-1 rounded-xs transition-colors ${
              bar <= level ? 'bg-cyan-400' : 'bg-slate-700'
            }`}
            style={{ height: `${bar * 25}%` }}
          />
        ))}
      </div>
    );
  };

  const headerTitle = wifiState.hasWifiHardware
    ? !wifiState.enabled
      ? 'Wi-Fi Radio Off'
      : activeNetwork
      ? activeNetwork.ssid
      : 'Wi-Fi Ready · Not Connected'
    : wifiState.browserOnline
    ? defaultIface
      ? `System Network (${defaultIface.name})`
      : 'Host Network Online'
    : 'Network Offline';

  const headerSubtitle = wifiState.hasWifiHardware
    ? !wifiState.enabled
      ? `${wifiState.wifiInterface || 'wlan0'} · Radio disabled via ${wifiState.hardwareBackend}`
      : activeNetwork
      ? `${activeNetwork.iface || wifiState.wifiInterface || 'wlan0'} · ${activeNetwork.band} · ${activeNetwork.security} · ${activeNetwork.signalPercent}%`
      : `${wifiState.wifiInterface || 'wlan0'} · Select a scanned network below`
    : wifiState.hardwareBackend === 'checking'
    ? 'Probing Linux hardware network interfaces...'
    : 'No physical 802.11 Wi-Fi adapter in this container';

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Hardware Network Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900/90 border-b border-cyan-500/20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${
              wifiState.hasWifiHardware
                ? wifiState.enabled && activeNetwork
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
                : wifiState.browserOnline
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-amber-400'
            }`}
          >
            {wifiState.hasWifiHardware ? (
              wifiState.enabled ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )
            ) : (
              <Network className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">{headerTitle}</div>
            <div className="text-xs font-mono text-slate-400 truncate mt-0.5 tabular-nums">
              <span>{headerSubtitle}</span>
              <span aria-hidden="true"> · </span>
              <span className={wifiState.browserOnline ? 'text-emerald-400' : 'text-amber-400'}>
                {wifiState.browserOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            {isBusy ? 'Scanning' : wifiState.hasWifiHardware ? 'Scan Wi-Fi' : 'Refresh Hardware'}
          </button>

          {wifiState.hasWifiHardware && (
            <button
              type="button"
              role="switch"
              aria-checked={wifiState.enabled}
              aria-label="Hardware Wi-Fi radio switch"
              disabled={isBusy}
              onClick={() => {
                sound.playBlip();
                setPromptNetworkId(null);
                setConnectError(null);
                void onToggleWifi();
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0 disabled:opacity-50 ${
                wifiState.enabled ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition-transform ${
                  wifiState.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Hardware Error Notice (if any) */}
      {(wifiState.error || connectError) && !promptNetworkId && !showHiddenForm && (
        <div
          role="alert"
          className="px-4 py-2 bg-red-950/50 border-b border-red-500/30 text-xs text-red-200 flex items-center gap-2 shrink-0"
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="truncate">{connectError || wifiState.error}</span>
        </div>
      )}

      {/* Main Content Area */}
      {wifiState.hasWifiHardware && !wifiState.enabled ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
            <WifiOff className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm font-semibold text-slate-200">Wi-Fi hardware radio is off</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Turn on <span className="font-mono text-slate-300">{wifiState.wifiInterface}</span> via NetworkManager to scan nearby 2.4 GHz, 5 GHz, and 6 GHz wireless signals.
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              sound.playConfirm();
              void onToggleWifi();
            }}
            className="px-4 py-2 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            Turn On Wi-Fi
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Panel: Real Scanned Wi-Fi Networks OR Real Hardware Interface Report */}
          <div className="flex-1 flex flex-col overflow-hidden border-b md:border-b-0 md:border-r border-slate-800">
            {wifiState.hasWifiHardware ? (
              <>
                <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between gap-2 text-xs text-slate-400 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-slate-300 truncate">Nearby Wi-Fi Signals</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      {wifiState.networks.length} detected
                    </span>
                  </div>
                  {wifiState.hardwareBackend === 'networkmanager' && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playBlip();
                        setConnectError(null);
                        setShowHiddenForm(v => !v);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      Join Hidden
                    </button>
                  )}
                </div>

                {showHiddenForm && (
                  <form
                    onSubmit={e => void handleSubmitHiddenNetwork(e)}
                    className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 space-y-2 shrink-0"
                  >
                    <div className="text-xs font-medium text-slate-200">Join Hidden Wi-Fi Network</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={hiddenSsid}
                        onChange={e => setHiddenSsid(e.target.value)}
                        placeholder="Network SSID"
                        autoFocus
                        className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        type="password"
                        value={hiddenPassphrase}
                        onChange={e => setHiddenPassphrase(e.target.value)}
                        placeholder="Passphrase (leave blank if Open)"
                        className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowHiddenForm(false);
                          setConnectError(null);
                        }}
                        className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={Boolean(connectingSsid)}
                        className="px-3 py-1 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors disabled:opacity-50"
                      >
                        {connectingSsid ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                    {connectError && (
                      <div role="alert" className="text-xs text-red-400">
                        {connectError}
                      </div>
                    )}
                  </form>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
                  {wifiState.networks.length === 0 ? (
                    <div className="p-6 text-center space-y-2 text-xs text-slate-400">
                      <div className="font-medium text-slate-300">
                        {isBusy ? 'Scanning wireless channels...' : 'No Wi-Fi networks found'}
                      </div>
                      <p className="leading-relaxed">
                        {wifiState.environmentNote ||
                          'Click Scan Wi-Fi to refresh nearby access points on this adapter.'}
                      </p>
                    </div>
                  ) : (
                    wifiState.networks.map(net => {
                      const isConnected = wifiState.activeNetworkId === net.id;
                      const isPrompting = promptNetworkId === net.id;
                      const isJoiningThis = connectingSsid === net.ssid;

                      return (
                        <div key={net.id} className="px-4 py-3 hover:bg-slate-900/50 transition-colors">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {signalBars(net.signalPercent)}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100 truncate">
                                  <span className="truncate" title={net.bssid ? `BSSID: ${net.bssid}` : net.ssid}>
                                    {net.ssid}
                                  </span>
                                  {net.security !== 'Open' && (
                                    <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                                  )}
                                  {isConnected && (
                                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  )}
                                </div>
                                <div className="text-[11px] font-mono tabular-nums text-slate-400 truncate mt-0.5">
                                  <span>{net.band}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{net.security}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{net.signalPercent}%</span>
                                  {net.saved && (
                                    <>
                                      <span aria-hidden="true"> · </span>
                                      <span className="text-cyan-400/90">Saved</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isConnected ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    sound.playBlip();
                                    void onDisconnectNetwork();
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                                >
                                  Disconnect
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleStartConnect(net)}
                                  className="px-2.5 py-1 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                                >
                                  {isJoiningThis ? 'Joining...' : 'Connect'}
                                </button>
                              )}

                              {net.saved && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    sound.playBlip();
                                    void onForgetNetwork(net.ssid);
                                  }}
                                  aria-label={`Forget ${net.ssid}`}
                                  title="Forget saved network"
                                  className="p-1.5 text-slate-500 hover:text-red-400 rounded-md transition-colors shrink-0 disabled:opacity-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isPrompting && (
                            <form
                              onSubmit={e => void handleSubmitPassphrase(e, net)}
                              className="mt-3 pt-3 border-t border-slate-800 space-y-2"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="password"
                                  value={passphrase}
                                  onChange={e => setPassphrase(e.target.value)}
                                  placeholder={`Enter ${net.security} password`}
                                  autoFocus
                                  className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                                />
                                <button
                                  type="submit"
                                  disabled={isJoiningThis}
                                  className="px-3 py-1.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                                >
                                  {isJoiningThis ? 'Joining...' : 'Join'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPromptNetworkId(null);
                                    setConnectError(null);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0"
                                >
                                  Cancel
                                </button>
                              </div>
                              {connectError && (
                                <div role="alert" className="text-xs text-red-400">
                                  {connectError}
                                </div>
                              )}
                            </form>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              /* Honest Real Hardware View when running in Cloud Sandbox without a physical Wi-Fi card */
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-start gap-3">
                    <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1.5 min-w-0">
                      <div className="text-xs font-semibold text-slate-100">
                        No Physical Wi-Fi Adapter Detected in This Environment
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Fake Wi-Fi networks have been removed. This cloud container only exposes virtual Ethernet
                        interfaces — it has no physical 802.11 wireless card. When you boot JARVISOS on real
                        hardware (such as a Lenovo E41-25 via the standalone Linux ISO) or run it locally on Linux
                        with <span className="font-mono text-slate-300">NetworkManager</span>, this panel
                        automatically scans real nearby Wi-Fi signals and connects online.
                      </p>
                      {onOpenIsoBuilder && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playBlip();
                              onOpenIsoBuilder();
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 rounded-md transition-colors whitespace-nowrap"
                          >
                            <Laptop className="w-3.5 h-3.5" />
                            Open Bootable ISO Studio (Wi-Fi Drivers Included)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Real Linux Kernel Interfaces Detected on Host */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span className="font-medium text-slate-300">Detected Linux Network Interfaces</span>
                    <span className="font-mono tabular-nums">{wifiState.interfaces.length} active</span>
                  </div>

                  {wifiState.interfaces.length === 0 ? (
                    <div className="p-4 rounded-lg border border-slate-800 text-xs text-slate-400">
                      {wifiState.hardwareBackend === 'checking'
                        ? 'Scanning system interfaces...'
                        : 'No external system interfaces reported by the host kernel.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
                      {wifiState.interfaces.map(iface => (
                        <div key={iface.name} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-100">
                              <span>{iface.name}</span>
                              <span className="text-[11px] font-normal text-slate-400">
                                {iface.kind} · {iface.state}
                                {iface.isDefaultRoute ? ' · default route' : ''}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-400 truncate mt-0.5">
                              <span>IPv4: {iface.ipv4 || '—'}</span>
                              {iface.mac && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span>MAC: {iface.mac}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-mono shrink-0 ${
                              iface.state === 'up' ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          >
                            {iface.state === 'up' ? 'UP' : 'DOWN'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Real Active Interface Details & Browser Link Status */}
          <div className="w-full md:w-64 flex flex-col bg-slate-900/40 overflow-y-auto shrink-0">
            <div className="px-4 py-2.5 border-b border-slate-800/80 text-xs font-medium text-slate-300">
              Hardware Interface Details
            </div>

            {activeNetwork ? (
              <div className="p-4 space-y-3 text-xs font-mono tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Adapter</span>
                  <span className="text-slate-100">{activeNetwork.iface || wifiState.wifiInterface || 'wlan0'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Backend</span>
                  <span className="text-slate-200">{wifiState.hardwareBackend}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">IPv4</span>
                  <span className="text-cyan-300">{activeNetwork.ipAddress || 'DHCP pending'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Gateway</span>
                  <span className="text-slate-200">{activeNetwork.gateway || wifiState.defaultGateway || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">DNS</span>
                  <span className="text-slate-200 truncate">
                    {activeNetwork.dns || wifiState.dnsServers.join(', ') || '—'}
                  </span>
                </div>
                {activeNetwork.linkSpeedMbps > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Link Rate</span>
                    <span className="text-emerald-400">{activeNetwork.linkSpeedMbps} Mbps</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Security</span>
                  <span className="text-slate-200 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-emerald-400" />
                    {activeNetwork.security}
                  </span>
                </div>
              </div>
            ) : defaultIface ? (
              <div className="p-4 space-y-3 text-xs font-mono tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Interface</span>
                  <span className="text-slate-100">{defaultIface.name}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Type</span>
                  <span className="text-slate-200 capitalize">{defaultIface.kind}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">IPv4</span>
                  <span className="text-cyan-300">{defaultIface.ipv4 || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">DNS</span>
                  <span className="text-slate-200 truncate">
                    {wifiState.dnsServers.join(', ') || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Browser Link</span>
                  <span className={wifiState.browserOnline ? 'text-emerald-400' : 'text-amber-400'}>
                    {wifiState.browserOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                {wifiState.browserConnection?.effectiveType && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Client Uplink</span>
                    <span className="text-slate-200">
                      {wifiState.browserConnection.effectiveType.toUpperCase()}
                      {wifiState.browserConnection.downlinkMbps
                        ? ` · ${wifiState.browserConnection.downlinkMbps} Mbps`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-400 flex items-start gap-2">
                <Globe className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span>Connect to a wireless or wired network to inspect real kernel IPv4, gateway, and DNS telemetry.</span>
              </div>
            )}

            <div className="mt-auto p-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-200">Auto-Reconnect</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Rejoin saved Wi-Fi on boot</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={wifiState.autoReconnect}
                aria-label="Toggle auto-reconnect"
                onClick={() => {
                  sound.playBlip();
                  onToggleAutoReconnect();
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0 ${
                  wifiState.autoReconnect ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-slate-950 transition-transform ${
                    wifiState.autoReconnect ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
