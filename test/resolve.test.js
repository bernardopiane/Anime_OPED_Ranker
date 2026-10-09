import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvUrl, pickVideo, fetchVideoForItem } from '../src/resolve.js';

function stubFetch(t, impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  t.after(() => {
    globalThis.fetch = original;
  });
}

test('parses slug, theme and tags from a page URL', () => {
  assert.deepEqual(parseCsvUrl('https://animethemes.moe/anime/noragami/OP1-NCBD1080'), {
    slug: 'noragami',
    theme: 'OP1',
    tags: 'NCBD1080',
  });
});

test('parses a theme with no tags', () => {
  assert.deepEqual(parseCsvUrl('https://animethemes.moe/anime/sousou-no-frieren/OP1'), {
    slug: 'sousou-no-frieren',
    theme: 'OP1',
    tags: '',
  });
});

test('parses an ED theme', () => {
  const parsed = parseCsvUrl('https://animethemes.moe/anime/fate-zero-2nd-season/ED3-BD1080');
  assert.equal(parsed.theme, 'ED3');
  assert.equal(parsed.tags, 'BD1080');
});

test('returns null for a non-animethemes URL', () => {
  assert.equal(parseCsvUrl('https://example.com/foo'), null);
});

const anime = {
  animethemes: [
    {
      slug: 'OP1',
      animethemeentries: [
        {
          videos: [
            { tags: 'NCBD1080', link: 'https://v.animethemes.moe/Noragami-OP1.webm' },
            { tags: 'NCBD720', link: 'https://v.animethemes.moe/Noragami-OP1-720.webm' },
          ],
        },
      ],
    },
    { slug: 'ED1', animethemeentries: [{ videos: [{ tags: 'NCBD1080', link: 'https://v.animethemes.moe/Noragami-ED1.webm' }] }] },
  ],
};

test('picks the video whose tags match exactly', () => {
  assert.equal(pickVideo(anime, 'OP1', 'NCBD1080'), 'https://v.animethemes.moe/Noragami-OP1.webm');
});

test('falls back to the first video of the theme when tags do not match', () => {
  assert.equal(pickVideo(anime, 'OP1', 'UNKNOWN'), 'https://v.animethemes.moe/Noragami-OP1.webm');
});

test('returns null for an unknown theme', () => {
  assert.equal(pickVideo(anime, 'OP9', 'NCBD1080'), null);
});

test('returns null when the matching video has no link', () => {
  const linkless = {
    animethemes: [
      { slug: 'OP1', animethemeentries: [{ videos: [{ tags: 'NCBD1080' }] }] },
      { slug: 'ED1', animethemeentries: [{ videos: [{ tags: 'NCBD1080', link: undefined }] }] },
    ],
  };
  assert.equal(pickVideo(linkless, 'OP1', 'NCBD1080'), null);
  assert.equal(pickVideo(linkless, 'OP1', 'BD1080'), null);
  assert.equal(pickVideo(linkless, 'ED1', 'NCBD1080'), null);
});

test('returns null for a non-string url', () => {
  assert.equal(parseCsvUrl(undefined), null);
  assert.equal(parseCsvUrl(null), null);
  assert.equal(parseCsvUrl(42), null);
});

test('fetchVideoForItem resolves to a null video when fetch rejects', async (t) => {
  stubFetch(t, () => Promise.reject(new Error('network down')));
  const item = { url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' };
  assert.deepEqual(await fetchVideoForItem(item), { videoUrl: null, pageUrl: item.url });
});

test('fetchVideoForItem resolves to a null video when the response is not ok', async (t) => {
  stubFetch(t, async () => ({ ok: false, status: 500 }));
  const item = { url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' };
  assert.deepEqual(await fetchVideoForItem(item), { videoUrl: null, pageUrl: item.url });
});

test('fetchVideoForItem resolves to a null video when no theme matches', async (t) => {
  stubFetch(t, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ anime: { animethemes: [{ slug: 'OP9', animethemeentries: [] }] } }),
  }));
  const item = { url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' };
  assert.deepEqual(await fetchVideoForItem(item), { videoUrl: null, pageUrl: item.url });
});

test('fetchVideoForItem returns the direct link for a matching video', async (t) => {
  let requested;
  stubFetch(t, async (url) => {
    requested = url;
    return { ok: true, status: 200, json: async () => ({ anime }) };
  });
  const item = { url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' };
  assert.deepEqual(await fetchVideoForItem(item), {
    videoUrl: 'https://v.animethemes.moe/Noragami-OP1.webm',
    pageUrl: item.url,
  });
  assert.equal(
    requested,
    'https://api.animethemes.moe/anime/noragami?include=animethemes.animethemeentries.videos',
  );
});

test('fetchVideoForItem does not throw when item.url is missing', async (t) => {
  let called = false;
  stubFetch(t, async () => {
    called = true;
    throw new Error('fetch should not be called');
  });
  assert.deepEqual(await fetchVideoForItem({}), { videoUrl: null, pageUrl: undefined });
  assert.equal(called, false);
});
