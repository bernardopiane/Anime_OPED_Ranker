import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYouTubeUrl, oembedUrl, fetchVideoTitle } from '../src/youtube.js';

const ID = 'dQw4w9WgXcQ';
const WATCH = `https://www.youtube.com/watch?v=${ID}`;

test('normalizeYouTubeUrl accepts every supported YouTube link form', () => {
  const inputs = [
    WATCH,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}&t=30s`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `  ${WATCH}  `,
  ];
  for (const input of inputs) {
    assert.equal(normalizeYouTubeUrl(input), WATCH, input);
  }
});

test('normalizeYouTubeUrl rejects non-YouTube and malformed links', () => {
  const inputs = [
    '',
    '   ',
    null,
    undefined,
    42,
    'https://animethemes.moe/anime/noragami/OP1-NCBD1080',
    'https://www.youtube.com/watch?v=too-short',
    `https://www.youtube.com/watch?v=${ID}x`,
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'not a url',
  ];
  for (const input of inputs) {
    assert.equal(normalizeYouTubeUrl(input), null, String(input));
  }
});

test('oembedUrl encodes the canonical watch URL', () => {
  assert.equal(
    oembedUrl(WATCH),
    'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json',
  );
});

test('fetchVideoTitle requests oEmbed and trims the title', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ title: '  A Cruel Angel’s Thesis  ' }) };
  };
  assert.equal(await fetchVideoTitle(WATCH, { fetchImpl }), 'A Cruel Angel’s Thesis');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, oembedUrl(WATCH));
  assert.deepEqual(calls[0].init.headers, { Accept: 'application/json' });
});

test('fetchVideoTitle canonicalises share and shorts links before asking', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ title: 'x' }) };
  };
  assert.equal(await fetchVideoTitle(`https://youtu.be/${ID}`, { fetchImpl }), 'x');
  assert.equal(urls[0], oembedUrl(WATCH));
});

test('fetchVideoTitle returns null on HTTP, network, and payload failures', async () => {
  const cases = [
    async () => ({ ok: false, status: 404, json: async () => ({}) }),
    async () => {
      throw new Error('offline');
    },
    async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ title: '   ' }) }),
    async () => ({ ok: true, json: async () => ({ title: 42 }) }),
  ];
  for (const fetchImpl of cases) {
    assert.equal(await fetchVideoTitle(WATCH, { fetchImpl }), null);
  }
});

test('fetchVideoTitle does not fetch an invalid link', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, json: async () => ({ title: 'x' }) };
  };
  assert.equal(await fetchVideoTitle('https://example.com/nope', { fetchImpl }), null);
  assert.equal(called, false);
});
