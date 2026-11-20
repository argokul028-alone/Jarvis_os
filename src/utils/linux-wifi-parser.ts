import type { WifiNetwork } from '../types/os.ts';

/**
 * Splits a single `nmcli -t` (terse) colon-delimited line while respecting
 * backslash-escaped colons (`\:`) and escaped backslashes (`\\`).
 */
export function splitNmcliTerseLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let escaping = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\') {
      escaping = true;
      continue;
    }
    if (ch === ':') {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (escaping) {
    current += '\\';
  }
  fields.push(current);
  return fields;
}

export function classifyWifiBandFromFreq(freqRaw: string | number): '2.4 GHz' | '5 GHz' | '6 GHz' {
  const numeric =
    typeof freqRaw === 'number'
      ? freqRaw
      : Number.parseInt(String(freqRaw).replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(numeric)) {
    if (numeric >= 5925) return '6 GHz';
    if (numeric >= 4900) return '5 GHz';
  }
  return '2.4 GHz';
}

export function normalizeWifiSecurity(raw: string): WifiNetwork['security'] {
  const upper = (raw || '').toUpperCase().trim();
  if (!upper || upper === '--' || upper === 'NONE' || upper === 'OPEN') {
    return 'Open';
  }
  if (upper.includes('SAE') || upper.includes('WPA3')) {
    return 'WPA3';
  }
  if (upper.includes('WPA2') || upper.includes('802.1X') || upper.includes('RSN')) {
    return 'WPA2';
  }
  if (upper.includes('WPA')) {
    return 'WPA';
  }
  if (upper.includes('WEP')) {
    return 'WEP';
  }
  return 'WPA2';
}

export function dbmToSignalPercent(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0;
  if (dbm >= -30) return 100;
  if (dbm <= -90) return 0;
  return Math.round(((dbm + 90) / 60) * 100);
}

export interface ActiveWifiLinkDetails {
  iface?: string;
  ipAddress?: string;
  gateway?: string;
  dns?: string;
  connectionName?: string;
}

/**
 * Parses output of:
 * `nmcli -t -f IN-USE,SSID,BSSID,SIGNAL,FREQ,SECURITY,RATE,DEVICE device wifi list`
 * Deduplicates multiple APs broadcasting the same SSID by keeping the active AP
 * or highest signal strength.
 */
export function parseNmcliWifiList(
  stdout: string,
  savedSsids: Set<string>,
  activeDetails?: ActiveWifiLinkDetails
): { networks: WifiNetwork[]; activeNetworkId: string | null } {
  const bySsid = new Map<string, WifiNetwork & { inUse: boolean }>();

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const cols = splitNmcliTerseLine(line);
    if (cols.length < 6) continue;

    const inUse = cols[0].trim() === '*';
    const ssid = cols[1].trim();
    const bssid = (cols[2] || '').trim();
    const signalNum = Number.parseInt(cols[3] || '0', 10);
    const freqStr = cols[4] || '';
    const securityStr = cols[5] || '';
    const rateStr = cols[6] || '';
    const device = (cols[7] || activeDetails?.iface || '').trim();

    if (!ssid) continue;

    const signalPercent = Number.isFinite(signalNum)
      ? Math.max(0, Math.min(100, signalNum))
      : 0;
    const rateMatch = rateStr.match(/(\d+)/);
    const linkSpeedMbps = rateMatch ? Number.parseInt(rateMatch[1], 10) : 0;

    const id = `ssid:${ssid}`;
    const candidate: WifiNetwork & { inUse: boolean } = {
      id,
      ssid,
      bssid: bssid || undefined,
      iface: device || undefined,
      signalPercent,
      band: classifyWifiBandFromFreq(freqStr),
      security: normalizeWifiSecurity(securityStr),
      saved: savedSsids.has(ssid) || inUse,
      ipAddress: inUse && activeDetails?.ipAddress ? activeDetails.ipAddress : '',
      gateway: inUse && activeDetails?.gateway ? activeDetails.gateway : '',
      dns: inUse && activeDetails?.dns ? activeDetails.dns : '',
      linkSpeedMbps,
      inUse,
    };

    const existing = bySsid.get(ssid);
    if (
      !existing ||
      (candidate.inUse && !existing.inUse) ||
      (!existing.inUse && candidate.signalPercent > existing.signalPercent)
    ) {
      bySsid.set(ssid, candidate);
    }
  }

  let activeNetworkId: string | null = null;
  const sorted = Array.from(bySsid.values()).sort((a, b) => {
    if (a.inUse !== b.inUse) return a.inUse ? -1 : 1;
    if (a.saved !== b.saved) return a.saved ? -1 : 1;
    return b.signalPercent - a.signalPercent;
  });

  const networks: WifiNetwork[] = sorted.map(({ inUse, ...net }) => {
    if (inUse) activeNetworkId = net.id;
    return net;
  });

  return { networks, activeNetworkId };
}

/**
 * Fallback parser for `iw dev <iface> scan` on bare-metal Linux systems without NetworkManager.
 */
export function parseIwScanOutput(
  stdout: string,
  iface: string,
  activeSsid: string | null,
  activeDetails?: ActiveWifiLinkDetails
): { networks: WifiNetwork[]; activeNetworkId: string | null } {
  const blocks = stdout.split(/^BSS\s+/m).slice(1);
  const bySsid = new Map<string, WifiNetwork & { inUse: boolean }>();

  for (const block of blocks) {
    const bssidMatch = block.match(/^([0-9a-fA-F:]{17})/);
    const ssidMatch = block.match(/^\s*SSID:\s*(.+)$/m);
    if (!ssidMatch) continue;
    const ssid = ssidMatch[1].trim();
    if (!ssid) continue;

    const freqMatch = block.match(/^\s*freq:\s*(\d+)/m);
    const signalMatch = block.match(/^\s*signal:\s*(-?\d+(?:\.\d+)?)\s*dBm/m);
    const hasSae = /\bSAE\b/i.test(block);
    const hasRsn = /^\s*RSN:/m.test(block);
    const hasWpa = /^\s*WPA:/m.test(block);
    const hasPrivacy = /capability:.*\bPrivacy\b/i.test(block);

    let security: WifiNetwork['security'] = 'Open';
    if (hasSae) security = 'WPA3';
    else if (hasRsn) security = 'WPA2';
    else if (hasWpa) security = 'WPA';
    else if (hasPrivacy) security = 'WEP';

    const dbm = signalMatch ? Number.parseFloat(signalMatch[1]) : -75;
    const signalPercent = dbmToSignalPercent(dbm);
    const inUse = Boolean(activeSsid && activeSsid === ssid);
    const id = `ssid:${ssid}`;

    const candidate: WifiNetwork & { inUse: boolean } = {
      id,
      ssid,
      bssid: bssidMatch ? bssidMatch[1].toUpperCase() : undefined,
      iface,
      signalPercent,
      band: classifyWifiBandFromFreq(freqMatch ? freqMatch[1] : 2412),
      security,
      saved: inUse,
      ipAddress: inUse && activeDetails?.ipAddress ? activeDetails.ipAddress : '',
      gateway: inUse && activeDetails?.gateway ? activeDetails.gateway : '',
      dns: inUse && activeDetails?.dns ? activeDetails.dns : '',
      linkSpeedMbps: 0,
      inUse,
    };

    const existing = bySsid.get(ssid);
    if (
      !existing ||
      (candidate.inUse && !existing.inUse) ||
      (!existing.inUse && candidate.signalPercent > existing.signalPercent)
    ) {
      bySsid.set(ssid, candidate);
    }
  }

  let activeNetworkId: string | null = null;
  const sorted = Array.from(bySsid.values()).sort((a, b) => {
    if (a.inUse !== b.inUse) return a.inUse ? -1 : 1;
    return b.signalPercent - a.signalPercent;
  });

  const networks: WifiNetwork[] = sorted.map(({ inUse, ...net }) => {
    if (inUse) activeNetworkId = net.id;
    return net;
  });

  return { networks, activeNetworkId };
}

export function parseIpRouteDefaultGateway(stdout: string): {
  gateway: string;
  iface: string;
} {
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('default ')) continue;
    const viaMatch = line.match(/\bvia\s+([^\s]+)/);
    const devMatch = line.match(/\bdev\s+([^\s]+)/);
    return {
      gateway: viaMatch ? viaMatch[1] : '',
      iface: devMatch ? devMatch[1] : '',
    };
  }
  return { gateway: '', iface: '' };
}

export function parseResolvConfDns(content: string): string[] {
  const servers: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^nameserver\s+([^\s#]+)/i);
    if (match && match[1] && !servers.includes(match[1])) {
      servers.push(match[1]);
    }
  }
  return servers;
}
