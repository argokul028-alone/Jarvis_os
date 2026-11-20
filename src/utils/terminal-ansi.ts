export interface AnsiSegment {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

const STANDARD_COLORS: Record<number, string> = {
  30: '#334155', // black (legible on dark bg)
  31: '#f87171', // red
  32: '#4ade80', // green
  33: '#facc15', // yellow
  34: '#60a5fa', // blue
  35: '#c084fc', // magenta
  36: '#22d3ee', // cyan
  37: '#e2e8f0', // white
};

const BRIGHT_COLORS: Record<number, string> = {
  90: '#64748b',
  91: '#fca5a5',
  92: '#86efac',
  93: '#fde047',
  94: '#93c5fd',
  95: '#d8b4fe',
  96: '#67e8f9',
  97: '#ffffff',
};

const BG_STANDARD_COLORS: Record<number, string> = {
  40: '#0f172a',
  41: '#7f1d1d',
  42: '#14532d',
  43: '#713f12',
  44: '#1e3a8a',
  45: '#581c87',
  46: '#164e63',
  47: '#cbd5e1',
};

const BG_BRIGHT_COLORS: Record<number, string> = {
  100: '#334155',
  101: '#b91c1c',
  102: '#15803d',
  103: '#a16207',
  104: '#1d4ed8',
  105: '#7e22ce',
  106: '#0e7490',
  107: '#f8fafc',
};

function xterm256ToHex(n: number): string | undefined {
  if (!Number.isInteger(n) || n < 0 || n > 255) return undefined;
  const basic = [
    '#1e293b', '#ef4444', '#22c55e', '#eab308', '#3b82f6', '#a855f7', '#06b6d4', '#e2e8f0',
    '#64748b', '#f87171', '#4ade80', '#facc15', '#60a5fa', '#c084fc', '#22d3ee', '#ffffff',
  ];
  if (n < 16) return basic[n];
  if (n >= 232) {
    const shade = 8 + (n - 232) * 10;
    const hex = shade.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }
  const idx = n - 16;
  const r = Math.floor(idx / 36);
  const g = Math.floor((idx % 36) / 6);
  const b = idx % 6;
  const toVal = (c: number) => (c === 0 ? 0 : 55 + c * 40).toString(16).padStart(2, '0');
  return `#${toVal(r)}${toVal(g)}${toVal(b)}`;
}

// Strip non-SGR control sequences (OSC title, cursor moves, etc.) while preserving SGR color codes
function sanitizeNonSgrAnsi(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences
    .replace(/\x1b\[[0-9;?]*[A-LN-Za-ln-z]/g, '') // Non-m CSI sequences
    .replace(/\x1b[()#][0-9A-Za-z]/g, ''); // Charset selectors
}

export function parseAnsiText(raw: string): AnsiSegment[] {
  if (!raw) return [];
  const cleaned = sanitizeNonSgrAnsi(raw);
  const segments: AnsiSegment[] = [];
  const sgrRegex = /\x1b\[([0-9;]*)m/g;

  let style: Omit<AnsiSegment, 'text'> = {};
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sgrRegex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: cleaned.slice(lastIndex, match.index), ...style });
    }

    const codeStr = match[1];
    const codes = codeStr === '' ? [0] : codeStr.split(';').map(c => parseInt(c, 10));

    for (let i = 0; i < codes.length; i++) {
      const code = Number.isNaN(codes[i]) ? 0 : codes[i];
      if (code === 0) {
        style = {};
      } else if (code === 1) {
        style = { ...style, bold: true };
      } else if (code === 2) {
        style = { ...style, dim: true };
      } else if (code === 3) {
        style = { ...style, italic: true };
      } else if (code === 4) {
        style = { ...style, underline: true };
      } else if (code === 7) {
        style = { ...style, inverse: true };
      } else if (code === 22) {
        style = { ...style, bold: false, dim: false };
      } else if (code === 23) {
        style = { ...style, italic: false };
      } else if (code === 24) {
        style = { ...style, underline: false };
      } else if (code === 27) {
        style = { ...style, inverse: false };
      } else if (code === 39) {
        style = { ...style, fg: undefined };
      } else if (code === 49) {
        style = { ...style, bg: undefined };
      } else if (STANDARD_COLORS[code]) {
        style = { ...style, fg: STANDARD_COLORS[code] };
      } else if (BRIGHT_COLORS[code]) {
        style = { ...style, fg: BRIGHT_COLORS[code] };
      } else if (BG_STANDARD_COLORS[code]) {
        style = { ...style, bg: BG_STANDARD_COLORS[code] };
      } else if (BG_BRIGHT_COLORS[code]) {
        style = { ...style, bg: BG_BRIGHT_COLORS[code] };
      } else if (code === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        const hex = xterm256ToHex(codes[i + 2]);
        if (hex) style = { ...style, fg: hex };
        i += 2;
      } else if (code === 48 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        const hex = xterm256ToHex(codes[i + 2]);
        if (hex) style = { ...style, bg: hex };
        i += 2;
      } else if (code === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        const r = Math.max(0, Math.min(255, codes[i + 2]));
        const g = Math.max(0, Math.min(255, codes[i + 3]));
        const b = Math.max(0, Math.min(255, codes[i + 4]));
        style = { ...style, fg: `rgb(${r}, ${g}, ${b})` };
        i += 4;
      } else if (code === 48 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        const r = Math.max(0, Math.min(255, codes[i + 2]));
        const g = Math.max(0, Math.min(255, codes[i + 3]));
        const b = Math.max(0, Math.min(255, codes[i + 4]));
        style = { ...style, bg: `rgb(${r}, ${g}, ${b})` };
        i += 4;
      }
    }

    lastIndex = sgrRegex.lastIndex;
  }

  if (lastIndex < cleaned.length) {
    segments.push({ text: cleaned.slice(lastIndex), ...style });
  }

  return segments;
}

export function stripAnsiCodes(raw: string): string {
  return sanitizeNonSgrAnsi(raw).replace(/\x1b\[[0-9;]*m/g, '');
}

export function formatPromptPath(cwd: string, homeDir: string): string {
  if (!cwd) return '~';
  const normCwd = cwd.replace(/\/+$/, '') || '/';
  const normHome = homeDir.replace(/\/+$/, '');
  if (normHome && normCwd === normHome) return '~';
  if (normHome && normCwd.startsWith(`${normHome}/`)) {
    return `~${normCwd.slice(normHome.length)}`;
  }
  return normCwd;
}

export function longestCommonPrefix(values: string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0];
  for (let i = 1; i < values.length; i++) {
    while (prefix && !values[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
    if (!prefix) break;
  }
  return prefix;
}
