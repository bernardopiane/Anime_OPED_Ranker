import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';

test('parses a simple line into title and url', () => {
  const items = parseCsv('Noragami,https://animethemes.moe/anime/noragami/OP1-NCBD1080');
  assert.deepEqual(items, [
    { id: 0, title: 'Noragami', url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' },
  ]);
});

test('preserves commas inside titles', () => {
  const items = parseCsv('Chi.: Chikyuu no Undou ni Tsuite,https://x/y');
  assert.equal(items[0].title, 'Chi.: Chikyuu no Undou ni Tsuite');
  assert.equal(items[0].url, 'https://x/y');
});

test('skips blank lines', () => {
  const items = parseCsv('\n\nA,http://a\n\n');
  assert.equal(items.length, 1);
});

test('parses the real CSV file into items', () => {
  const text = readFileSync(new URL('../opening list.csv', import.meta.url), 'utf8');
  const items = parseCsv(text);
  assert.ok(items.length > 1);
  assert.ok(items.every((i, index) => i.id === index));
  assert.ok(items.every((i) => i.title.length > 0));
  assert.ok(items.every((i) => /^https?:\/\//.test(i.url)));
});
