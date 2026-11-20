import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLaunchIntent,
  validateAndNormalizeUrl,
  createCustomAppShortcut,
  buildPortalPayloadFromAction,
  type ResolvedLaunchIntent,
} from './app-launcher.ts';
import type { AppShortcut } from '../types/os.ts';

test('resolves YouTube and X/Twitter into JARVIS sub-windows', () => {
  const yt = resolveLaunchIntent('open youtube');
  assert.ok(yt);
  assert.equal(yt.action.kind, 'media');
  assert.equal(yt.action.opensInSubWindow, true);
  assert.equal(yt.action.url, 'https://www.youtube.com');

  const tw = resolveLaunchIntent('Hey Jarvis, please open twiter');
  assert.ok(tw);
  assert.equal(tw.action.kind, 'web');
  assert.equal(tw.action.label, 'X (Twitter)');
  assert.equal(tw.action.url, 'https://x.com');
  assert.equal(tw.action.opensInSubWindow, true);
  assert.equal(tw.action.embedRestricted, true);
});

test('resolves openyoutube and play beliver, standalone song playback, and playlist commands', () => {
  const believer = resolveLaunchIntent('openyoutube and play beliver');
  assert.ok(believer);
  assert.equal(believer.action.kind, 'media');
  assert.equal(believer.action.opensInSubWindow, true);
  assert.equal(believer.action.mediaType, 'video');
  assert.equal(believer.action.mediaQuery, 'believer');

  const anySong = resolveLaunchIntent('play any song');
  assert.ok(anySong);
  assert.equal(anySong.action.kind, 'media');
  assert.equal(anySong.action.mediaType, 'video');
  assert.equal(anySong.action.opensInSubWindow, true);

  const anyPlaylist = resolveLaunchIntent('open any playlist');
  assert.ok(anyPlaylist);
  assert.equal(anyPlaylist.action.kind, 'media');
  assert.equal(anyPlaylist.action.mediaType, 'playlist');
  assert.equal(anyPlaylist.action.opensInSubWindow, true);

  const lofiPlaylist = resolveLaunchIntent('play lofi playlist');
  assert.ok(lofiPlaylist);
  assert.equal(lofiPlaylist.action.kind, 'media');
  assert.equal(lofiPlaylist.action.mediaType, 'playlist');
  assert.equal(lofiPlaylist.action.mediaQuery, 'lofi playlist');

  const directYtUrl = resolveLaunchIntent('open https://www.youtube.com/watch?v=7wtfhZwyrcc');
  assert.ok(directYtUrl);
  assert.equal(directYtUrl.action.kind, 'media');
  assert.equal(directYtUrl.action.videoId, '7wtfhZwyrcc');
  const portal = buildPortalPayloadFromAction(directYtUrl.action);
  assert.equal(portal.portalKey, 'portal-youtube');
  assert.equal(portal.mode, 'youtube');
});

test('resolves direct in-app search queries across multiple natural phrasings', () => {
  const ytSearch = resolveLaunchIntent('open youtube and search lofi hip hop');
  assert.ok(ytSearch);
  assert.equal(ytSearch.action.kind, 'media');
  assert.equal(ytSearch.action.searchQuery, 'lofi hip hop');
  assert.equal(ytSearch.action.url, 'https://www.youtube.com/results?search_query=lofi%20hip%20hop');
  assert.equal(ytSearch.action.opensInSubWindow, true);

  const xSearch = resolveLaunchIntent('search twitter for spacex launch');
  assert.ok(xSearch);
  assert.equal(xSearch.action.label, 'X (Twitter)');
  assert.equal(xSearch.action.url, 'https://x.com/search?q=spacex%20launch');
  assert.equal(xSearch.action.opensInSubWindow, true);

  const ghSearch = resolveLaunchIntent('github search rust microkernel');
  assert.ok(ghSearch);
  assert.equal(ghSearch.action.label, 'GitHub');
  assert.equal(ghSearch.action.url, 'https://github.com/search?q=rust%20microkernel');
});

test('resolves desktop app protocol links and includes web fallbacks when available', () => {
  const vscode = resolveLaunchIntent('open vs code');
  assert.ok(vscode);
  assert.equal(vscode.action.kind, 'desktop');
  assert.equal(vscode.action.url, 'vscode://');
  assert.equal(vscode.action.webFallbackUrl, 'https://vscode.dev');
  assert.equal(vscode.action.opensInSubWindow, false);

  const spotifyApp = resolveLaunchIntent('launch spotify desktop and search daft punk');
  assert.ok(spotifyApp);
  assert.equal(spotifyApp.action.kind, 'desktop');
  assert.equal(spotifyApp.action.url, 'spotify:search:daft%20punk');
  assert.equal(spotifyApp.action.webFallbackUrl, 'https://open.spotify.com');
});

test('resolves all built-in JARVISOS system modules by name and alias', () => {
  const cases: Array<[string, string]> = [
    ['open terminal', 'terminal'],
    ['open novafs', 'novafs'],
    ['launch kernel monitor', 'kernel_monitor'],
    ['open synapse', 'synapse_neural'],
    ['open vision hud', 'vision_hud'],
    ['open vault', 'vault_security'],
    ['open iso builder', 'iso_builder'],
    ['open specs', 'specs_reader'],
    ['open arc core', 'voice_reactor'],
  ];

  for (const [cmd, expectedAppId] of cases) {
    const result: ResolvedLaunchIntent | null = resolveLaunchIntent(cmd);
    assert.ok(result, `Expected command "${cmd}" to resolve`);
    assert.equal(result.action.kind, 'system');
    assert.equal(result.action.systemAppId, expectedAppId);
  }
});

test('prioritizes user custom apps over built-in shortcuts and opens web custom apps in sub-window', () => {
  const created = createCustomAppShortcut(
    'My Portfolio',
    'myportfolio.dev',
    'https://myportfolio.dev/search?q={query}'
  );
  assert.ok(created.shortcut);
  const customApps: AppShortcut[] = [created.shortcut];

  const direct = resolveLaunchIntent('open my portfolio', customApps);
  assert.ok(direct);
  assert.equal(direct.action.kind, 'custom');
  assert.equal(direct.action.url, 'https://myportfolio.dev/');
  assert.equal(direct.action.opensInSubWindow, true);

  const withSearch = resolveLaunchIntent('open my portfolio and search robotics', customApps);
  assert.ok(withSearch);
  assert.equal(withSearch.action.url, 'https://myportfolio.dev/search?q=robotics');
});

test('handles arbitrary website domains and rejects unsafe protocols', () => {
  const domain = resolveLaunchIntent('open bbc.com');
  assert.ok(domain);
  assert.equal(domain.action.kind, 'web');
  assert.equal(domain.action.url, 'https://bbc.com/');
  assert.equal(domain.action.opensInSubWindow, true);

  const xss = validateAndNormalizeUrl('javascript:alert(1)');
  assert.equal(xss.valid, false);

  const dataUri = validateAndNormalizeUrl('data:text/html,<script>alert(1)</script>');
  assert.equal(dataUri.valid, false);
});

test('ignores general conversation and provides fallback for unknown open commands', () => {
  assert.equal(resolveLaunchIntent('Report hardware specs on Lenovo E41-25'), null);
  assert.equal(resolveLaunchIntent('What is open source software?'), null);
  assert.equal(resolveLaunchIntent('open source licenses explained'), null);

  const unknown = resolveLaunchIntent('open zzzunknownapp99');
  assert.ok(unknown);
  assert.equal(unknown.action.kind, 'unrecognized');
  assert.equal(unknown.shouldAutoLaunch, false);
  assert.ok(unknown.action.url?.includes('google.com/search?q=zzzunknownapp99'));
});
