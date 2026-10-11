import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podiumThumbnail } from '../src/podium.js';

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
