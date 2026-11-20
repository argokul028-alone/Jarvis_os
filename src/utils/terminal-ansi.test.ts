import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPromptPath,
  longestCommonPrefix,
  parseAnsiText,
  stripAnsiCodes,
} from './terminal-ansi.ts';

test('parseAnsiText parses standard, bold, and 256-color SGR codes accurately', () => {
  const raw = '\x1b[1;34mprojects\x1b[0m  \x1b[32mrun.sh\x1b[0m  \x1b[38;5;196malert\x1b[0m';
  const segments = parseAnsiText(raw);
  assert.equal(segments.length, 5);
  assert.equal(segments[0].text, 'projects');
  assert.equal(segments[0].bold, true);
  assert.equal(segments[0].fg, '#60a5fa');
  assert.equal(segments[2].text, 'run.sh');
  assert.equal(segments[2].fg, '#4ade80');
  assert.equal(segments[4].text, 'alert');
  assert.equal(segments[4].fg, '#ff0000');
  assert.equal(stripAnsiCodes(raw), 'projects  run.sh  alert');
});

test('formatPromptPath collapses homeDir to tilde like bash \\w', () => {
  assert.equal(formatPromptPath('/tmp/jarvis-home', '/tmp/jarvis-home'), '~');
  assert.equal(formatPromptPath('/tmp/jarvis-home/projects/demo', '/tmp/jarvis-home'), '~/projects/demo');
  assert.equal(formatPromptPath('/etc/nginx', '/tmp/jarvis-home'), '/etc/nginx');
  assert.equal(formatPromptPath('/', '/tmp/jarvis-home'), '/');
});

test('longestCommonPrefix computes shared bash tab-completion prefix', () => {
  assert.equal(longestCommonPrefix(['package.json', 'package-lock.json']), 'package');
  assert.equal(longestCommonPrefix(['README.md']), 'README.md');
  assert.equal(longestCommonPrefix(['alpha', 'beta']), '');
});
