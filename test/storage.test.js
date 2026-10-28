import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  save,
  load,
  loadRaw,
  saveBackup,
  clear,
  BACKUP_KEY,
} from '../src/storage.js';

const KEY = 'anime-op-ed-ranker/v1';
const LEGACY_KEY = 'krisgo-opening-list/v1';

function installStorage() {
  const data = new Map();
  const storage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
  globalThis.localStorage = storage;
  return { data, storage };
}

test('save and load round-trip a record', () => {
  installStorage();
  assert.equal(save({ version: 3, name: 'x' }), true);
  assert.deepEqual(load(), { version: 3, name: 'x' });
});

test('load reads the legacy key when the current key is missing', () => {
  const { data } = installStorage();
  data.set(LEGACY_KEY, JSON.stringify({ version: 2, custom: true }));
  assert.deepEqual(load(), { version: 2, custom: true });
});

test('loadRaw returns the raw string, including corrupt JSON', () => {
  const { data } = installStorage();
  data.set(KEY, '{not json');
  assert.equal(loadRaw(), '{not json');
  assert.equal(load(), null);
  data.delete(KEY);
  assert.equal(loadRaw(), null);
});

test('saveBackup copies a raw v2 record without touching the primary key', () => {
  const { data } = installStorage();
  data.set(KEY, '{"version":2}');
  assert.equal(saveBackup('{"version":2}'), true);
  assert.equal(data.get(BACKUP_KEY), '{"version":2}');
  assert.equal(data.get(KEY), '{"version":2}');
});

test('saveBackup refuses empty and non-string input', () => {
  const { data } = installStorage();
  assert.equal(saveBackup(''), false);
  assert.equal(saveBackup(null), false);
  assert.equal(saveBackup(42), false);
  assert.equal(data.has(BACKUP_KEY), false);
});

test('clear removes the record and legacy key but keeps the backup', () => {
  const { data } = installStorage();
  data.set(KEY, 'a');
  data.set(LEGACY_KEY, 'b');
  data.set(BACKUP_KEY, 'c');
  clear();
  assert.equal(data.has(KEY), false);
  assert.equal(data.has(LEGACY_KEY), false);
  assert.equal(data.get(BACKUP_KEY), 'c');
});

test('save reports failure when storage throws', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('full');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(save({ version: 3 }), false);
  assert.equal(load(), null);
  assert.equal(loadRaw(), null);
  assert.equal(saveBackup('x'), false);
  assert.doesNotThrow(clear);
});
