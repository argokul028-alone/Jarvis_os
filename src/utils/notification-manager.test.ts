import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFlightModeToggle,
  clampNotificationSettings,
  countUnreadNotifications,
  createInitialQuickControlsState,
  dismissNotification,
  filterNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  pushNotification,
} from './notification-manager.ts';

test('clampNotificationSettings validates positions, styles, themes, size, and opacity bounds', () => {
  const clamped = clampNotificationSettings({
    position: 'bottom',
    sizePx: 999,
    opacity: 10,
    layoutStyle: 'dynamic',
    theme: 'frost',
    doNotDisturb: true,
  });
  assert.equal(clamped.position, 'bottom');
  assert.equal(clamped.sizePx, 540);
  assert.equal(clamped.opacity, 45);
  assert.equal(clamped.layoutStyle, 'dynamic');
  assert.equal(clamped.theme, 'frost');
  assert.equal(clamped.doNotDisturb, true);

  const fallback = clampNotificationSettings({
    position: 'invalid' as any,
    layoutStyle: 'unknown' as any,
    theme: 'neon' as any,
    sizePx: 100,
    opacity: 200,
  });
  assert.equal(fallback.position, 'right');
  assert.equal(fallback.layoutStyle, 'list');
  assert.equal(fallback.theme, 'jarvis');
  assert.equal(fallback.sizePx, 320);
  assert.equal(fallback.opacity, 100);
});

test('notification lifecycle helpers handle push, read, filter, unread count, and dismiss', () => {
  let list = pushNotification([], {
    id: 'n1',
    title: 'Battery Alert',
    message: 'Switched to Power Saver mode.',
    source: 'Power',
    category: 'power',
  });
  list = pushNotification(list, {
    id: 'n2',
    title: 'Screenshot Saved',
    message: 'Captured workspace PNG.',
    source: 'Capture',
    category: 'capture',
  });

  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'n2');
  assert.equal(countUnreadNotifications(list), 2);
  assert.equal(filterNotifications(list, 'capture').length, 1);

  list = markNotificationRead(list, 'n2');
  assert.equal(countUnreadNotifications(list), 1);
  assert.equal(filterNotifications(list, 'unread').length, 1);

  list = markAllNotificationsRead(list);
  assert.equal(countUnreadNotifications(list), 0);

  list = dismissNotification(list, 'n1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'n2');
});

test('applyFlightModeToggle suspends Bluetooth/Hotspot/Wi-Fi and restores prior states cleanly', () => {
  const base = createInitialQuickControlsState(false);
  const activeRadios = {
    ...base,
    bluetooth: { ...base.bluetooth, enabled: true, discoverable: true },
    hotspot: { ...base.hotspot, enabled: true },
  };

  const onResult = applyFlightModeToggle(activeRadios, true, true);
  assert.equal(onResult.nextState.flightMode.enabled, true);
  assert.equal(onResult.nextState.bluetooth.enabled, false);
  assert.equal(onResult.nextState.hotspot.enabled, false);
  assert.equal(onResult.disableWifi, true);

  const offResult = applyFlightModeToggle(onResult.nextState, false, false);
  assert.equal(offResult.nextState.flightMode.enabled, false);
  assert.equal(offResult.nextState.bluetooth.enabled, true);
  assert.equal(offResult.nextState.hotspot.enabled, true);
  assert.equal(offResult.restoreWifi, true);
});
