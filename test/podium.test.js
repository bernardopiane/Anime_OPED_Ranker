import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podiumThumbnail, podiumEntries } from '../src/podium.js';

test('builds a thumbnail URL from a YouTube watch link', () => {
  assert.equal(
    podiumThumbnail('https://www.youtube.com/watch?v=wpsgc3m__zg'),
    'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg',
  );
});

test('builds a thumbnail URL from a youtu.be link', () => {
  assert.equal(
    podiumThumbnail('https://youtu.be/WQ2NsVzqOow'),
    'https://img.youtube.com/vi/WQ2NsVzqOow/hqdefault.jpg',
  );
});

test('returns null for a non-YouTube link', () => {
  assert.equal(podiumThumbnail('https://animethemes.moe/anime/noragami/OP1-NCBD1080'), null);
});

test('returns null for malformed input', () => {
  assert.equal(podiumThumbnail(undefined), null);
  assert.equal(podiumThumbnail('not a url'), null);
});

const a = { id: 0, title: 'A', url: 'https://www.youtube.com/watch?v=wpsgc3m__zg' };
const b = { id: 1, title: 'B', url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' };
const c = { id: 2, title: 'C', url: 'https://www.youtube.com/watch?v=WQ2NsVzqOow' };
const d = { id: 3, title: 'D', url: 'https://www.youtube.com/watch?v=j9xlqXCSBIc' };

test('returns the top three in rank order with ranks and thumbnails', () => {
  assert.deepEqual(podiumEntries([a, b, c, d]), [
    { rank: 1, item: a, thumbnail: 'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg' },
    { rank: 2, item: b, thumbnail: null },
    { rank: 3, item: c, thumbnail: 'https://img.youtube.com/vi/WQ2NsVzqOow/hqdefault.jpg' },
  ]);
});

test('returns fewer than three when the ranking is short', () => {
  assert.deepEqual(podiumEntries([a]), [
    { rank: 1, item: a, thumbnail: 'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg' },
  ]);
});

test('returns an empty array for an empty ranking', () => {
  assert.deepEqual(podiumEntries([]), []);
});

test('skips undefined entries', () => {
  assert.deepEqual(podiumEntries([a, undefined, c]), [
    { rank: 1, item: a, thumbnail: 'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg' },
    { rank: 2, item: c, thumbnail: 'https://img.youtube.com/vi/WQ2NsVzqOow/hqdefault.jpg' },
  ]);
});
