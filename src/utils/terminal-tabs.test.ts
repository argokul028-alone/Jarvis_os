import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampContextMenuPosition,
  deriveDuplicatedTabTitle,
  formatTerminalTabLabel,
  insertTabAfter,
  normalizeCustomTabTitle,
} from './terminal-tabs.ts';

test('clampContextMenuPosition keeps context menu strictly inside container bounds', () => {
  assert.deepEqual(clampContextMenuPosition(120, 40, 680, 440), { x: 120, y: 40 });
  assert.deepEqual(clampContextMenuPosition(660, 430, 680, 440, 196, 132, 8), {
    x: 476,
    y: 300,
  });
  assert.deepEqual(clampContextMenuPosition(-20, -10, 680, 440, 196, 132, 8), {
    x: 8,
    y: 8,
  });
});

test('normalizeCustomTabTitle trims, collapses whitespace, and clears empty titles', () => {
  assert.equal(normalizeCustomTabTitle('  API   Server  '), 'API Server');
  assert.equal(normalizeCustomTabTitle('   '), undefined);
  assert.equal(normalizeCustomTabTitle(''), undefined);
  const longTitle = 'a'.repeat(60);
  assert.equal(normalizeCustomTabTitle(longTitle)?.length, 40);
});

test('deriveDuplicatedTabTitle appends (copy) only when source has custom title', () => {
  assert.equal(deriveDuplicatedTabTitle(undefined), undefined);
  assert.equal(deriveDuplicatedTabTitle('   '), undefined);
  assert.equal(deriveDuplicatedTabTitle('Build Logs'), 'Build Logs (copy)');
  assert.equal(deriveDuplicatedTabTitle('Build Logs (copy)'), 'Build Logs (copy)');
});

test('formatTerminalTabLabel prefers customTitle and falls back to dynamic shell status', () => {
  assert.equal(
    formatTerminalTabLabel({
      customTitle: 'Backend API',
      tabIndex: 0,
      isRoot: false,
      isRunning: false,
      shortPath: '~/projects',
    }),
    'Backend API'
  );
  assert.equal(
    formatTerminalTabLabel({
      tabIndex: 0,
      isRoot: false,
      isRunning: false,
      shortPath: '~',
    }),
    'bash 1: ~'
  );
  assert.equal(
    formatTerminalTabLabel({
      tabIndex: 1,
      isRoot: true,
      isRunning: false,
      shortPath: '/root',
    }),
    'root: /root'
  );
});

test('insertTabAfter places duplicated tab directly after source tab', () => {
  const tabs = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
  const updated = insertTabAfter(tabs, 't1', { id: 't1-dup' });
  assert.deepEqual(
    updated.map(t => t.id),
    ['t1', 't1-dup', 't2', 't3']
  );
});
