import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylistId, watchUrl, toPlaylistCsv } from '../src/playlist.js';
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
