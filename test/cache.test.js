import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECORD_VERSION,
  sourceFingerprint,
  isMatchingSource,
  videoCacheEntries,
  hydrateVideoCache,
} from '../src/cache.js';

const items = [
  { id: 0, title: 'Noragami', url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' },
  { id: 1, title: 'Ousama Ranking', url: 'https://animethemes.moe/anime/ousama_ranking/OP2' },
];

test('sourceFingerprint is stable for identical items', () => {
  assert.equal(sourceFingerprint(items), sourceFingerprint([...items]));
});

test('sourceFingerprint changes when a url changes', () => {
  const edited = [{ ...items[0], url: 'https://animethemes.moe/anime/noragami/OP2' }, items[1]];
  assert.notEqual(sourceFingerprint(items), sourceFingerprint(edited));
});

test('sourceFingerprint changes when a title changes', () => {
  const edited = [{ ...items[0], title: 'Noragami Aragoto' }, items[1]];
  assert.notEqual(sourceFingerprint(items), sourceFingerprint(edited));
});

test('isMatchingSource is true only for a record with the same fingerprint', () => {
  assert.equal(isMatchingSource(null, items), false);
  assert.equal(isMatchingSource({}, items), false);
  assert.equal(isMatchingSource({ fingerprint: sourceFingerprint(items) }, items), true);
  assert.equal(isMatchingSource({ fingerprint: 'stale' }, items), false);
});

test('RECORD_VERSION is 3', () => {
  assert.equal(RECORD_VERSION, 3);
});

test('videoCacheEntries maps the current items by url and skips failures', () => {
  const resolved = new Map([
    [0, { videoUrl: 'https://v.animethemes.moe/Noragami-OP1.webm', pageUrl: items[0].url }],
    [1, { videoUrl: null, pageUrl: items[1].url }],
  ]);
  assert.deepEqual(videoCacheEntries(resolved, items), {
    [items[0].url]: { videoUrl: 'https://v.animethemes.moe/Noragami-OP1.webm' },
  });
});

test('videoCacheEntries records YouTube ids', () => {
  const ytItems = [{ id: 0, title: 'X', url: 'https://youtu.be/j9xlqXCSBIc' }];
  const resolved = new Map([[0, { videoUrl: null, youtubeId: 'j9xlqXCSBIc', pageUrl: ytItems[0].url }]]);
  assert.deepEqual(videoCacheEntries(resolved, ytItems), {
    'https://youtu.be/j9xlqXCSBIc': { youtubeId: 'j9xlqXCSBIc' },
  });
});

test('hydrateVideoCache restores entries by url regardless of order', () => {
  const cache = {
    [items[0].url]: { videoUrl: 'https://v.animethemes.moe/Noragami-OP1.webm' },
    [items[1].url]: { youtubeId: 'j9xlqXCSBIc' },
  };
  assert.deepEqual(hydrateVideoCache(cache, [...items].reverse()), [
    [1, { videoUrl: null, youtubeId: 'j9xlqXCSBIc', pageUrl: items[1].url }],
    [0, { videoUrl: 'https://v.animethemes.moe/Noragami-OP1.webm', pageUrl: items[0].url }],
  ]);
});

test('hydrateVideoCache ignores unknown urls and malformed entries', () => {
  assert.deepEqual(hydrateVideoCache(undefined, items), []);
  assert.deepEqual(hydrateVideoCache({ 'https://other.example/x': { videoUrl: 'a' } }, items), []);
  assert.deepEqual(hydrateVideoCache({ [items[0].url]: { pageUrl: 'x' } }, items), []);
  assert.deepEqual(hydrateVideoCache({ [items[0].url]: 'nope' }, items), []);
});
