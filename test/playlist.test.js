import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  parsePlaylistId,
  normalizePlaylistUrl,
  normalizePlaylistItems,
  createPlaylistBookmarklet,
  watchUrl,
  toPlaylistCsv,
  extractFromHtml,
  mapApiItems,
  fetchPlaylist,
  assignIds,
} from '../src/playlist.js';
import { parseCsv } from '../src/csv.js';

test('parsePlaylistId reads the list param from a playlist URL', () => {
  assert.equal(
    parsePlaylistId('https://www.youtube.com/playlist?list=PLabcDEF1234567890'),
    'PLabcDEF1234567890',
  );
});

test('parsePlaylistId reads list from youtu.be, mobile, and music hosts', () => {
  assert.equal(parsePlaylistId('https://youtu.be/xyz?list=PLfoo123'), 'PLfoo123');
  assert.equal(parsePlaylistId('https://m.youtube.com/playlist?list=PLbar456'), 'PLbar456');
  assert.equal(parsePlaylistId('https://music.youtube.com/playlist?list=PLbaz789'), 'PLbaz789');
});

test('parsePlaylistId reads list from a watch URL that carries one', () => {
  assert.equal(
    parsePlaylistId('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PLwatch01'),
    'PLwatch01',
  );
});

test('parsePlaylistId accepts a bare playlist id', () => {
  assert.equal(parsePlaylistId('  PLbareID123  '), 'PLbareID123');
});

test('parsePlaylistId returns null when there is no usable id', () => {
  assert.equal(parsePlaylistId('https://www.youtube.com/watch?v=aaaaaaaaaaa'), null);
  assert.equal(parsePlaylistId('https://example.com/playlist?list=x%20y'), null);
  assert.equal(parsePlaylistId('not a url'), null);
  assert.equal(parsePlaylistId(''), null);
  assert.equal(parsePlaylistId(undefined), null);
});

test('normalizePlaylistUrl accepts YouTube playlist links only', () => {
  assert.equal(
    normalizePlaylistUrl('https://m.youtube.com/playlist?list=PLabcDEF1234567890'),
    'https://www.youtube.com/playlist?list=PLabcDEF1234567890',
  );
  assert.equal(normalizePlaylistUrl('https://example.com/playlist?list=PLabcDEF123'), null);
  assert.equal(normalizePlaylistUrl('PLabcDEF123'), null);
});

test('normalizePlaylistItems validates and de-duplicates extracted videos', () => {
  assert.deepEqual(normalizePlaylistItems([
    { title: ' First OP ', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Duplicate', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Share', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
    { title: 'Not YouTube', url: 'https://example.com/watch?v=ccccccccccc' },
    { title: 'Bad ID', url: 'https://www.youtube.com/watch?v=short' },
  ]), [
    { title: 'First OP', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
  ]);
});

test('bookmarklet sends only indexed videos from the active playlist', () => {
  const playlistId = 'PLtarget123';
  const links = [
    ['aaaaaaaaaaa', playlistId, '1'],
    ['bbbbbbbbbbb', 'PLother123', '2'],
    ['ccccccccccc', playlistId, null],
    ['ddddddddddd', playlistId, '3'],
  ].map(([videoId, listId, index]) => {
    const url = new URL(`https://www.youtube.com/watch?v=${videoId}`);
    if (listId) url.searchParams.set('list', listId);
    if (index) url.searchParams.set('index', index);
    return {
      href: url.href,
      getAttribute(name) {
        return name === 'title' ? `Video ${videoId}` : null;
      },
      closest() { return null; },
      textContent: '',
    };
  });
  const host = { querySelectorAll: () => links };
  let message;
  runInNewContext(
    createPlaylistBookmarklet('https://ranker.example/', 'https://ranker.example')
      .slice('javascript:'.length),
    {
      URL,
      location: { href: `https://www.youtube.com/playlist?list=${playlistId}` },
      document: { querySelectorAll: () => [host] },
      window: {
        opener: { closed: false, postMessage: (payload) => { message = payload; } },
      },
      alert() {},
    },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(message.videos)), [
    { title: 'Video aaaaaaaaaaa', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Video ddddddddddd', url: 'https://www.youtube.com/watch?v=ddddddddddd' },
  ]);
});

test('watchUrl builds a standard watch link', () => {
  assert.equal(watchUrl('aaaaaaaaaaa'), 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
});

test('toPlaylistCsv emits the quoted script format with a header', () => {
  const csv = toPlaylistCsv([
    { title: 'First OP', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Second OP', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ]);
  assert.equal(
    csv,
    'video title,url\r\n' +
      '"First OP","https://www.youtube.com/watch?v=aaaaaaaaaaa"\r\n' +
      '"Second OP","https://www.youtube.com/watch?v=bbbbbbbbbbb"',
  );
});

test('quoted playlist CSV round-trips commas and quotes in titles', () => {
  const url = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
  const csv = toPlaylistCsv([{ title: 'Naruto, "Opening 1"', url }]);
  assert.deepEqual(parseCsv(csv), [{ id: 0, title: 'Naruto, "Opening 1"', url }]);
});

test('extractFromHtml regex fallback pairs titles within each video id range', () => {
  const html =
    '"title":{"simpleText":"Before All"} ' +
    '"videoId":"aaaaaaaaaaa" ' +
    '"title":{"simpleText":"  A Title  "} ' +
    '"videoId":"bbbbbbbbbbb" ' +
    '"videoId":"ccccccccccc" ' +
    '"title":{"simpleText":"C Title"}';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'A Title', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'bbbbbbbbbbb', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
    { title: 'C Title', url: 'https://www.youtube.com/watch?v=ccccccccccc' },
  ]);
});

test('extractFromHtml reads playlistVideoRenderer nodes in order', () => {
  const html =
    '<script>var ytInitialData = {"contents":{"items":[' +
    '{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"runs":[{"text":"First OP"}]}}},' +
    '{"playlistVideoRenderer":{"videoId":"bbbbbbbbbbb","title":{"runs":[{"text":"Second OP, Remix"}]}}}' +
    ']}};</script>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'First OP', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Second OP, Remix', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ]);
});

test('extractFromHtml reads newer lockupViewModel nodes', () => {
  const html =
    '<script>window["ytInitialData"] = {"a":{"b":[' +
    '{"lockupViewModel":{"contentId":"ccccccccccc","contentType":"LOCKUP_CONTENT_TYPE_VIDEO",' +
    '"metadata":{"lockupMetadataViewModel":{"title":{"content":"Third OP"}}}}}' +
    ']}};</script>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'Third OP', url: 'https://www.youtube.com/watch?v=ccccccccccc' },
  ]);
});

test('extractFromHtml skips earlier ytInitialData references before the page data', () => {
  const html =
    '<script>if (typeof ytInitialData !== "undefined") use({type:"ready"});</script>' +
    '<script>var ytInitialData = {"items":[' +
    '{"lockupViewModel":{"contentId":"ddddddddddd","contentType":"LOCKUP_CONTENT_TYPE_VIDEO",' +
    '"metadata":{"lockupMetadataViewModel":{"title":{"content":"Fourth OP"}}}}}' +
    ']};</script>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'Fourth OP', url: 'https://www.youtube.com/watch?v=ddddddddddd' },
  ]);
});

test('extractFromHtml adds titled playlist cards after the initial data without suggested videos', () => {
  const html =
    '<script>var ytInitialData = {"items":[' +
    '{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"simpleText":"First OP"}}}' +
    ']};</script>' +
    '<div class="ytLockupViewModelHost content-id-aaaaaaaaaaa">' +
    '<h3 title="First OP"><a href="https://www.youtube.com/watch?v=aaaaaaaaaaa&amp;list=PLplaylist123&amp;index=1"' +
    ' class="ytLockupMetadataViewModelTitle">First OP</a></h3></div>' +
    '<div class="ytLockupViewModelHost content-id-bbbbbbbbbbb">' +
    '<h3 title="Second &amp; Final"><a href="https://www.youtube.com/watch?v=bbbbbbbbbbb&amp;list=PLplaylist123&amp;index=2"' +
    ' class="ytLockupMetadataViewModelTitle">Second &amp; Final</a></h3></div>' +
    '<div class="ytLockupViewModelHost content-id-ccccccccccc">' +
    '<h3 title="Suggested"><a href="https://www.youtube.com/watch?v=ccccccccccc"' +
    ' class="ytLockupMetadataViewModelTitle">Suggested</a></h3></div>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'First OP', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Second & Final', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ]);
});

test('extractFromHtml de-duplicates repeated video ids', () => {
  const html =
    '<script>var ytInitialData = {"items":[' +
    '{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"simpleText":"Once"}}},' +
    '{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"simpleText":"Once"}}}' +
    ']};</script>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'Once', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
  ]);
});

test('extractFromHtml falls back to raw video ids when ytInitialData is absent', () => {
  const html = 'x "videoId":"ddddddddddd" y "videoId":"eeeeeeeeeee"';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'ddddddddddd', url: 'https://www.youtube.com/watch?v=ddddddddddd' },
    { title: 'eeeeeeeeeee', url: 'https://www.youtube.com/watch?v=eeeeeeeeeee' },
  ]);
});

test('extractFromHtml regex fallback extracts from CSS class content-id pattern', () => {
  const html =
    '<div class="content-id-fffffffffff"></div> ' +
    '<div class="content-id-ggggggggggg"></div>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'fffffffffff', url: 'https://www.youtube.com/watch?v=fffffffffff' },
    { title: 'ggggggggggg', url: 'https://www.youtube.com/watch?v=ggggggggggg' },
  ]);
});

test('extractFromHtml returns an empty array when there are no videos', () => {
  assert.deepEqual(extractFromHtml('<html><body>nothing</body></html>'), []);
  assert.deepEqual(extractFromHtml(''), []);
  assert.deepEqual(extractFromHtml(undefined), []);
});

test('mapApiItems builds links and skips unavailable entries', () => {
  const page = {
    nextPageToken: 'p2',
    items: [
      { snippet: { title: 'A' }, contentDetails: { videoId: 'aaaaaaaaaaa' } },
      { snippet: { title: 'Deleted video' }, contentDetails: {} },
      { snippet: { title: 'B', resourceId: { videoId: 'bbbbbbbbbbb' } }, contentDetails: {} },
    ],
  };
  assert.deepEqual(mapApiItems(page), {
    items: [
      { title: 'A', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
      { title: 'B', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
    ],
    nextPageToken: 'p2',
    skipped: 1,
  });
});

test('fetchPlaylist paginates, aggregates, and counts skips', async () => {
  const pages = {
    first: {
      nextPageToken: 'p2',
      items: [
        { snippet: { title: 'A' }, contentDetails: { videoId: 'aaaaaaaaaaa' } },
        { snippet: { title: 'Private video' }, contentDetails: {} },
      ],
    },
    p2: {
      items: [{ snippet: { title: 'C' }, contentDetails: { videoId: 'ccccccccccc' } }],
    },
  };
  const fetchImpl = async (url) => {
    const token = new URL(url).searchParams.get('pageToken');
    const body = token ? pages[token] : pages.first;
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await fetchPlaylist('PLtest', 'KEY', { fetchImpl });
  assert.deepEqual(result.items, [
    { title: 'A', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'C', url: 'https://www.youtube.com/watch?v=ccccccccccc' },
  ]);
  assert.equal(result.skipped, 1);
});

test('fetchPlaylist maps HTTP error statuses to codes', async () => {
  const withStatus = (status) => async () => ({ ok: false, status, json: async () => ({}) });
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: withStatus(400) }), (e) => e.code === 'BAD_KEY');
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: withStatus(403) }), (e) => e.code === 'FORBIDDEN');
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: withStatus(404) }), (e) => e.code === 'NOT_FOUND');
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: withStatus(500) }), (e) => e.code === 'HTTP_ERROR');
});

test('fetchPlaylist rejects a blank playlist id', async () => {
  await assert.rejects(fetchPlaylist('', 'SOMEKEY'), (e) => e.code === 'INVALID_PLAYLIST');
});

test('fetchPlaylist flags a missing key and network failures', async () => {
  await assert.rejects(fetchPlaylist('PL', '', {}), (e) => e.code === 'MISSING_KEY');
  const boom = async () => { throw new Error('down'); };
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: boom }), (e) => e.code === 'NETWORK');
});

test('assignIds gives sequential numeric ids starting at 0 and preserves each title and url', () => {
  const items = [
    { title: 'A', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'B', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ];
  assert.deepEqual(assignIds(items), [
    { id: 0, title: 'A', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { id: 1, title: 'B', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ]);
});

test('assignIds returns an empty array for an empty input', () => {
  assert.deepEqual(assignIds([]), []);
});

test('fetchPlaylist rejects with HTTP_ERROR when an ok response body is not valid JSON', async () => {
  const badJsonFetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } });
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: badJsonFetch }), (e) => e.code === 'HTTP_ERROR');
});
