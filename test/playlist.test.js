import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylistId, watchUrl, toPlaylistCsv, extractFromHtml, mapApiItems, fetchPlaylist, assignIds } from '../src/playlist.js';
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

test('watchUrl builds a standard watch link', () => {
  assert.equal(watchUrl('aaaaaaaaaaa'), 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
});

test('toPlaylistCsv emits title,link rows with no header', () => {
  const csv = toPlaylistCsv([
    { title: 'First OP', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Second OP', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ]);
  assert.equal(
    csv,
    'First OP,https://www.youtube.com/watch?v=aaaaaaaaaaa\n' +
      'Second OP,https://www.youtube.com/watch?v=bbbbbbbbbbb',
  );
});

test('a comma in a title survives a round-trip through parseCsv', () => {
  const url = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
  const csv = toPlaylistCsv([{ title: 'Naruto, Opening 1', url }]);
  assert.deepEqual(parseCsv(csv), [{ id: 0, title: 'Naruto, Opening 1', url }]);
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
