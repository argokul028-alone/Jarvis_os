import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivilegeCommand } from './terminal-sudo-parser.ts';

test('parsePrivilegeCommand recognizes sudo -i, sudo -s, sudo su -, and exit accurately', () => {
  assert.deepEqual(parsePrivilegeCommand('sudo -i'), {
    kind: 'sudo-root-shell',
    loginShell: true,
    nonInteractive: false,
  });
  assert.deepEqual(parsePrivilegeCommand('sudo -s'), {
    kind: 'sudo-root-shell',
    loginShell: false,
    nonInteractive: false,
  });
  assert.deepEqual(parsePrivilegeCommand('sudo su -'), {
    kind: 'sudo-root-shell',
    loginShell: true,
    nonInteractive: false,
  });
  assert.deepEqual(parsePrivilegeCommand('exit'), { kind: 'exit-shell' });
  assert.deepEqual(parsePrivilegeCommand('logout'), { kind: 'exit-shell' });
});

test('parsePrivilegeCommand handles single-command sudo, flags, and comments cleanly', () => {
  assert.deepEqual(parsePrivilegeCommand('sudo apt-get update && echo done'), {
    kind: 'sudo-command',
    command: 'apt-get update && echo done',
    nonInteractive: false,
  });
  assert.deepEqual(parsePrivilegeCommand('sudo -n id -u'), {
    kind: 'sudo-command',
    command: 'id -u',
    nonInteractive: true,
  });
  assert.deepEqual(parsePrivilegeCommand('sudo -k'), { kind: 'sudo-invalidate' });
  assert.deepEqual(parsePrivilegeCommand('sudo -l'), { kind: 'sudo-list' });
  assert.deepEqual(parsePrivilegeCommand('# sudo -i in comment'), { kind: 'normal' });
  assert.deepEqual(parsePrivilegeCommand('id -u'), { kind: 'normal' });
});
