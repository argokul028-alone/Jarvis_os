import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_NEWTAB_URL,
  assignTabToGroup,
  buildJarvisSearchUrl,
  canTabGoBack,
  canTabGoForward,
  countFindMatchesInStrings,
  createBrowserTab,
  createTabGroup,
  extractSearchQueryFromUrl,
  goBackInTab,
  goForwardInTab,
  isValidBookmarkInput,
  navigateTabTo,
  removeTabGroupAndUngroup,
  resolveOmniboxInput,
  sanitizeEnabledExtensions,
  splitTextForFind,
  toSafeFirestoreId,
  toggleTabGroupCollapsed,
} from './browser-engine.ts';

test('resolveOmniboxInput classifies newtab, URLs, domains, unsafe schemes, and search queries', () => {
  assert.equal(resolveOmniboxInput('').kind, 'newtab');
  assert.equal(resolveOmniboxInput(BROWSER_NEWTAB_URL).kind, 'newtab');

  const domain = resolveOmniboxInput('en.wikipedia.org/wiki/Iron_Man');
  assert.equal(domain.kind, 'web');
  assert.equal(domain.url, 'https://en.wikipedia.org/wiki/Iron_Man');
  assert.equal(domain.defaultRenderMode, 'embed');

  const restricted = resolveOmniboxInput('https://github.com/facebook/react');
  assert.equal(restricted.kind, 'web');
  assert.equal(restricted.defaultRenderMode, 'reader');

  const query = resolveOmniboxInput('quantum computing breakthroughs 2026');
  assert.equal(query.kind, 'search');
  assert.equal(query.searchQuery, 'quantum computing breakthroughs 2026');
  assert.equal(extractSearchQueryFromUrl(query.url), 'quantum computing breakthroughs 2026');

  const blocked = resolveOmniboxInput('javascript:alert(1)');
  assert.equal(blocked.kind, 'search');
  assert.ok(blocked.url.startsWith('jarvis://search?q='));
});

test('tab navigation stack handles navigate, back, forward, and branch truncation', () => {
  let tab = createBrowserTab(BROWSER_NEWTAB_URL, null, 'tab-1');
  assert.equal(canTabGoBack(tab), false);
  assert.equal(canTabGoForward(tab), false);

  tab = navigateTabTo(tab, 'https://en.wikipedia.org');
  tab = navigateTabTo(tab, 'jarvisos architecture');
  assert.equal(tab.historyStack.length, 3);
  assert.equal(canTabGoBack(tab), true);
  assert.equal(canTabGoForward(tab), false);

  tab = goBackInTab(tab);
  assert.equal(tab.url, 'https://en.wikipedia.org/');
  assert.equal(canTabGoForward(tab), true);

  // Navigating to a new page after going back truncates forward stack
  tab = navigateTabTo(tab, 'https://news.ycombinator.com');
  assert.equal(tab.historyStack.length, 3);
  assert.equal(canTabGoForward(tab), false);

  tab = goBackInTab(tab);
  tab = goForwardInTab(tab);
  assert.equal(tab.url, 'https://news.ycombinator.com/');
});

test('tab groups support create, assign, collapse, and ungroup removal', () => {
  const t1 = createBrowserTab(BROWSER_NEWTAB_URL, null, 't1');
  const t2 = createBrowserTab('https://github.com', null, 't2');
  const group = createTabGroup('Research', 'cyan', 'g1');

  let tabs = assignTabToGroup([t1, t2], 't1', group.id);
  tabs = assignTabToGroup(tabs, 't2', group.id);
  assert.equal(tabs[0].groupId, 'g1');
  assert.equal(tabs[1].groupId, 'g1');

  const collapsed = toggleTabGroupCollapsed([group], 'g1');
  assert.equal(collapsed[0].collapsed, true);

  const removed = removeTabGroupAndUngroup(collapsed, tabs, 'g1');
  assert.equal(removed.groups.length, 0);
  assert.equal(removed.tabs[0].groupId, null);
  assert.equal(removed.tabs[1].groupId, null);
});

test('find-on-page accurately splits and counts case-insensitive and case-sensitive matches', () => {
  const insens = splitTextForFind('JARVIS runs jarvisOS on Jarvis core', 'jarvis', false, 0);
  assert.equal(insens.matchCount, 3);
  assert.equal(insens.segments.filter(s => s.isMatch).length, 3);
  assert.deepEqual(
    insens.segments.filter(s => s.isMatch).map(s => s.matchIndex),
    [0, 1, 2]
  );

  const sens = splitTextForFind('JARVIS runs jarvisOS on Jarvis core', 'Jarvis', true, 0);
  assert.equal(sens.matchCount, 1);

  const total = countFindMatchesInStrings(['Alpha beta', 'Beta gamma BETA'], 'beta', false);
  assert.equal(total, 3);
});

test('firestore IDs, bookmark inputs, and extension allowlists validate strictly', () => {
  assert.match(toSafeFirestoreId('bm/123?foo=bar'), /^[a-zA-Z0-9_-]+$/);
  assert.equal(isValidBookmarkInput('Wikipedia', 'https://en.wikipedia.org'), true);
  assert.equal(isValidBookmarkInput('', 'https://en.wikipedia.org'), false);
  assert.equal(isValidBookmarkInput('Bad', 'javascript:void(0)'), false);

  const cleanExt = sanitizeEnabledExtensions(['ad_shield', 'unknown_ext', 'quick_notes', 'ad_shield']);
  assert.deepEqual(cleanExt, ['ad_shield', 'quick_notes']);

  assert.equal(buildJarvisSearchUrl('hello world'), 'jarvis://search?q=hello%20world');
  assert.equal(buildJarvisSearchUrl('space news', 'news'), 'jarvis://search?q=space%20news&tab=news');
  assert.equal(extractSearchQueryFromUrl('jarvis://search?q=space%20news&tab=news'), 'space news');
  const resolvedNews = resolveOmniboxInput('jarvis://search?q=space%20news&tab=news');
  assert.equal(resolvedNews.kind, 'search');
  assert.equal(resolvedNews.searchQuery, 'space news');
  assert.equal(resolvedNews.searchTab, 'news');
});
