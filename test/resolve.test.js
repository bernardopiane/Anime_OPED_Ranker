import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvUrl, pickVideo } from '../src/resolve.js';

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
