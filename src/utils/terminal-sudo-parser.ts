export type ParsedPrivilegeAction =
  | { kind: 'normal' }
  | { kind: 'exit-shell' }
  | { kind: 'sudo-invalidate' }
  | { kind: 'sudo-validate' }
  | { kind: 'sudo-list' }
  | { kind: 'sudo-help' }
  | { kind: 'sudo-root-shell'; loginShell: boolean; nonInteractive: boolean }
  | { kind: 'sudo-command'; command: string; nonInteractive: boolean }
  | { kind: 'sudo-usage-error'; message: string };

/**
 * Parses top-level privilege-control commands (`sudo ...`, `su ...`, `exit`, `logout`).
 * Leaves pipelines, comments, and multi-command chains as `normal` so bash handles them natively,
 * EXCEPT when the command itself begins with `sudo` or is a standalone `exit`/`logout`.
 */
export function parsePrivilegeCommand(rawInput: string): ParsedPrivilegeAction {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return { kind: 'normal' };
  }

  // Standalone exit / logout (without shell operators)
  if (/^(exit|logout)(\s+\d+)?$/i.test(trimmed)) {
    return { kind: 'exit-shell' };
  }

  // Bare `su`, `su -`, `su root`, `su - root` -> route through authenticated sudo root login shell
  if (/^su(\s+-(\s+root)?|\s+root)?$/.test(trimmed)) {
    return { kind: 'sudo-root-shell', loginShell: true, nonInteractive: false };
  }

  // Must start with `sudo` as the command token
  const sudoMatch = trimmed.match(/^sudo(?:\s+([\s\S]*))?$/);
  if (!sudoMatch) {
    return { kind: 'normal' };
  }

  const rest = (sudoMatch[1] || '').trim();
  if (!rest) {
    return { kind: 'sudo-help' };
  }

  // Walk leading flags cleanly without mangling quoted command strings
  let idx = 0;
  let loginShell = false;
  let interactiveShell = false;
  let invalidate = false;
  let validate = false;
  let listPrivs = false;
  let showHelp = false;
  let nonInteractive = false;
  let targetUser: string | null = null;

  while (idx < rest.length) {
    while (idx < rest.length && /\s/.test(rest[idx])) idx++;
    if (idx >= rest.length) break;

    if (rest.slice(idx, idx + 2) === '--') {
      const nextSpace = rest.indexOf(' ', idx);
      const longFlag = nextSpace === -1 ? rest.slice(idx) : rest.slice(idx, nextSpace);
      if (longFlag === '--') {
        idx += 2;
        while (idx < rest.length && /\s/.test(rest[idx])) idx++;
        break;
      }
      if (longFlag === '--login') loginShell = true;
      else if (longFlag === '--shell') interactiveShell = true;
      else if (longFlag === '--reset-timestamp') invalidate = true;
      else if (longFlag === '--validate') validate = true;
      else if (longFlag === '--list') listPrivs = true;
      else if (longFlag === '--help') showHelp = true;
      else if (longFlag === '--non-interactive') nonInteractive = true;
      else {
        return { kind: 'sudo-usage-error', message: `sudo: unrecognized option '${longFlag}'` };
      }
      idx = nextSpace === -1 ? rest.length : nextSpace;
      continue;
    }

    if (rest[idx] !== '-') {
      break;
    }

    // Parse short flag cluster (e.g. -i, -s, -k, -n, -H, -E, -u root)
    const nextSpace = rest.indexOf(' ', idx);
    const token = nextSpace === -1 ? rest.slice(idx) : rest.slice(idx, nextSpace);
    idx = nextSpace === -1 ? rest.length : nextSpace;

    if (token === '-') break;

    for (let j = 1; j < token.length; j++) {
      const ch = token[j];
      if (ch === 'i') loginShell = true;
      else if (ch === 's') interactiveShell = true;
      else if (ch === 'k' || ch === 'K') invalidate = true;
      else if (ch === 'v') validate = true;
      else if (ch === 'l') listPrivs = true;
      else if (ch === 'h') showHelp = true;
      else if (ch === 'n') nonInteractive = true;
      else if (ch === 'H' || ch === 'E' || ch === 'P' || ch === 'S') {
        // Accepted standard sudo flags
      } else if (ch === 'u') {
        while (idx < rest.length && /\s/.test(rest[idx])) idx++;
        const uEnd = rest.indexOf(' ', idx);
        targetUser = uEnd === -1 ? rest.slice(idx) : rest.slice(idx, uEnd);
        idx = uEnd === -1 ? rest.length : uEnd;
      } else {
        return { kind: 'sudo-usage-error', message: `sudo: invalid option -- '${ch}'` };
      }
    }
  }

  if (targetUser && targetUser !== 'root') {
    return {
      kind: 'sudo-usage-error',
      message: `sudo: switching to user '${targetUser}' is not permitted in this sandbox (only root elevation is configured).`,
    };
  }

  if (showHelp) return { kind: 'sudo-help' };
  if (invalidate) return { kind: 'sudo-invalidate' };
  if (listPrivs) return { kind: 'sudo-list' };

  const remainingCmd = rest.slice(idx).trim();

  if (validate && !remainingCmd) {
    return { kind: 'sudo-validate' };
  }

  // `sudo -i` or `sudo -s` with no extra command -> root login/interactive shell
  if ((loginShell || interactiveShell) && !remainingCmd) {
    return { kind: 'sudo-root-shell', loginShell: loginShell || !interactiveShell, nonInteractive };
  }

  // `sudo su`, `sudo su -`, `sudo su root`, `sudo bash` -> root login shell
  if (/^(su(\s+-(\s+root)?|\s+root)?|(\/bin\/|\/usr\/bin\/)?(bash|sh)(\s+-l|\s+--login)?)$/.test(remainingCmd)) {
    return { kind: 'sudo-root-shell', loginShell: true, nonInteractive };
  }

  if (remainingCmd) {
    return { kind: 'sudo-command', command: remainingCmd, nonInteractive };
  }

  return { kind: 'sudo-help' };
}
