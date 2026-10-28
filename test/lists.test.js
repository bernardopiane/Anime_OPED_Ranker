import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTER_ID,
  STARTER_NAME,
  MAX_ITEMS,
  LIST_NAME_MAX,
  ITEM_TITLE_MAX,
  sanitizeName,
  sanitizeTitle,
  uniqueName,
  makeListId,
  createList,
  starterList,
  addItem,
  removeItem,
  moveItem,
  updateItemTitle,
  updateItemUrl,
  renameList,
  structureKey,
  sameStructure,
  normalizeRecord,
  isResumableRecord,
} from '../src/lists.js';

const items = [
  { id: 0, title: 'Noragami', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
  { id: 1, title: 'Ousama Ranking', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  { id: 2, title: 'Mob Psycho', url: 'https://www.youtube.com/watch?v=ccccccccccc' },
];

function list() {
  return createList({ id: 'list-test', name: 'Test', items });
}

test('sanitizeName trims, collapses whitespace, and caps length', () => {
  assert.equal(sanitizeName('  My   list \n '), 'My list');
  assert.equal(sanitizeName('x'.repeat(LIST_NAME_MAX + 20)).length, LIST_NAME_MAX);
  assert.equal(sanitizeName(''), '');
  assert.equal(sanitizeName(null), '');
});

test('sanitizeTitle trims and caps without destroying inner spacing', () => {
  assert.equal(sanitizeTitle('  A  B  '), 'A  B');
  assert.equal(sanitizeTitle('x'.repeat(ITEM_TITLE_MAX + 10)).length, ITEM_TITLE_MAX);
  assert.equal(sanitizeTitle(42), '');
});

test('uniqueName is case-insensitive and appends a counter', () => {
  assert.equal(uniqueName('Mine', ['Other']), 'Mine');
  assert.equal(uniqueName('Mine', ['mine']), 'Mine (2)');
  assert.equal(uniqueName('Mine', ['Mine', 'Mine (2)']), 'Mine (3)');
  assert.equal(uniqueName('', []), 'Untitled list');
});

test('makeListId uses the injected random source', () => {
  assert.equal(makeListId(() => 0), 'list-000000000000');
  assert.equal(makeListId(() => 0.5), 'list-800080008000');
  assert.match(makeListId(), /^list-[a-f0-9]{12}$/);
});

test('createList assigns dense ids and falls back for empty titles', () => {
  const created = createList({
    id: '  x  ',
    name: '  Mine  ',
    items: [
      { id: 7, title: ' One ', url: ' https://youtu.be/aaaaaaaaaaa ' },
      { id: 9, title: '', url: 'https://youtu.be/bbbbbbbbbbb' },
      null,
      { title: 'no url' },
    ],
  });
  assert.equal(created.id, 'x');
  assert.equal(created.name, 'Mine');
  assert.deepEqual(created.items, [
    { id: 0, title: 'One', url: 'https://youtu.be/aaaaaaaaaaa' },
    {
      id: 1,
      title: 'https://youtu.be/bbbbbbbbbbb',
      url: 'https://youtu.be/bbbbbbbbbbb',
    },
  ]);
});

test('createList caps a list at 500 items', () => {
  const many = Array.from({ length: MAX_ITEMS + 10 }, (_, i) => ({
    title: `Item ${i}`,
    url: `https://youtu.be/${String(i).padStart(11, '0')}`,
  }));
  assert.equal(createList({ name: 'Many', items: many }).items.length, MAX_ITEMS);
});

test('starterList uses the reserved id and name', () => {
  const starter = starterList(items);
  assert.equal(starter.id, STARTER_ID);
  assert.equal(starter.name, STARTER_NAME);
  assert.equal(starter.items.length, 3);
});

test('addItem appends with the next id and refuses overflow or a blank url', () => {
  const next = addItem(list(), { title: 'New', url: ' https://youtu.be/ddddddddddd ' });
  assert.equal(next.items.length, 4);
  assert.deepEqual(next.items[3], {
    id: 3,
    title: 'New',
    url: 'https://youtu.be/ddddddddddd',
  });
  assert.equal(addItem(next, { title: 'x', url: '   ' }), null);
  const full = { ...list(), items: Array.from({ length: MAX_ITEMS }, (_, id) => ({ id, title: 'x', url: 'u' })) };
  assert.equal(addItem(full, { title: 'x', url: 'u' }), null);
});

test('removeItem reindexes the remaining items', () => {
  const next = removeItem(list(), 1);
  assert.deepEqual(next.items.map((item) => item.id), [0, 1]);
  assert.deepEqual(next.items.map((item) => item.title), ['Noragami', 'Mob Psycho']);
  assert.equal(removeItem(list(), 99), null);
});

test('moveItem swaps and reindexes, refusing to leave the list', () => {
  const up = moveItem(list(), 2, -1);
  assert.deepEqual(up.items.map((item) => item.id), [0, 1, 2]);
  assert.deepEqual(up.items.map((item) => item.title), ['Noragami', 'Mob Psycho', 'Ousama Ranking']);
  const down = moveItem(list(), 0, 1);
  assert.deepEqual(down.items.map((item) => item.title), ['Ousama Ranking', 'Noragami', 'Mob Psycho']);
  assert.equal(moveItem(list(), 0, -1), null);
  assert.equal(moveItem(list(), 2, 1), null);
  assert.equal(moveItem(list(), 9, 1), null);
});

test('updateItemTitle keeps ids and falls back to the current title', () => {
  const original = list();
  const next = updateItemTitle(original, 1, '  Ranking of Kings  ');
  assert.equal(next.items[1].title, 'Ranking of Kings');
  assert.equal(next.items[1].id, 1);
  assert.equal(updateItemTitle(original, 1, '   ').items[1].title, 'Ousama Ranking');
  assert.equal(updateItemTitle(original, 9, 'x'), null);
  assert.equal(updateItemTitle(original, 1, original.items[1].title), original);
});

test('updateItemUrl trims, refuses blanks, and keeps ids', () => {
  const original = list();
  const next = updateItemUrl(original, 0, ' https://youtu.be/zzzzzzzzzzz ');
  assert.equal(next.items[0].url, 'https://youtu.be/zzzzzzzzzzz');
  assert.equal(next.items[0].id, 0);
  assert.equal(updateItemUrl(original, 0, '   '), null);
  assert.equal(updateItemUrl(original, 0, original.items[0].url), original);
});

test('renameList trims and refuses a blank name', () => {
  assert.equal(renameList(list(), '  New name ').name, 'New name');
  assert.equal(renameList(list(), '   '), null);
});

test('sameStructure ignores title changes but catches url, order, and id changes', () => {
  const renamed = updateItemTitle(list(), 0, 'Renamed');
  assert.equal(sameStructure(list().items, renamed.items), true);

  const urlChanged = updateItemUrl(list(), 0, 'https://youtu.be/zzzzzzzzzzz');
  assert.equal(sameStructure(list().items, urlChanged.items), false);

  const reordered = moveItem(list(), 0, 1);
  assert.equal(sameStructure(list().items, reordered.items), false);
  assert.equal(structureKey(null), '');
  assert.equal(structureKey(list().items), structureKey(list().items));
});

test('normalizeRecord keeps a valid v3 record', () => {
  const record = {
    version: 3,
    activeListId: 'list-a',
    lists: [{ id: 'list-a', name: 'A', items: [{ title: 'One', url: 'u1' }] }],
    ids: [0],
    winners: [],
    fingerprint: 'fp',
    videos: { u1: { videoUrl: 'v1' } },
    volume: 0.5,
  };
  const normalized = normalizeRecord(record);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.activeListId, 'list-a');
  assert.deepEqual(normalized.lists[0], {
    id: 'list-a',
    name: 'A',
    items: [{ id: 0, title: 'One', url: 'u1' }],
  });
  assert.equal(normalized.fingerprint, 'fp');
  assert.deepEqual(normalized.videos, { u1: { videoUrl: 'v1' } });
});

test('normalizeRecord falls back to the starter for unknown active ids and fixes list ids', () => {
  const normalized = normalizeRecord({
    version: 3,
    activeListId: 'missing',
    lists: [
      { id: 'same', name: 'One', items: [] },
      { id: 'same', name: 'Two', items: [] },
      { name: '', items: 'nope' },
      null,
    ],
  });
  assert.equal(normalized.activeListId, STARTER_ID);
  assert.deepEqual(normalized.lists.map((entry) => entry.id), ['same', 'list-2', 'list-3']);
  assert.deepEqual(normalized.lists.map((entry) => entry.name), ['One', 'Two', 'List 3']);
  assert.deepEqual(normalized.lists[2].items, []);
});

test('normalizeRecord migrates a v2 custom source into one list', () => {
  const normalized = normalizeRecord({
    version: 2,
    custom: true,
    sourceName: 'my file.csv',
    items: [
      { id: 3, title: 'Noragami', url: 'https://youtu.be/aaaaaaaaaaa' },
      { id: 8, title: 'Ousama Ranking', url: 'https://youtu.be/bbbbbbbbbbb' },
    ],
    fingerprint: 'old-fp',
    ids: [3, 8],
    winners: [3],
    videos: { 'https://youtu.be/aaaaaaaaaaa': { youtubeId: 'aaaaaaaaaaa' } },
  });
  assert.equal(normalized.activeListId, 'list-migrated');
  assert.equal(normalized.lists.length, 1);
  assert.equal(normalized.lists[0].name, 'my file.csv');
  assert.deepEqual(normalized.lists[0].items.map((item) => item.id), [0, 1]);
  assert.equal(normalized.fingerprint, 'old-fp');
  assert.deepEqual(normalized.ids, [3, 8]);
  assert.deepEqual(normalized.winners, [3]);
  assert.deepEqual(normalized.videos, {
    'https://youtu.be/aaaaaaaaaaa': { youtubeId: 'aaaaaaaaaaa' },
  });
});

test('normalizeRecord migrates a v2 default source to the starter', () => {
  const normalized = normalizeRecord({
    version: 2,
    custom: false,
    ids: [0],
    winners: [],
  });
  assert.equal(normalized.activeListId, STARTER_ID);
  assert.deepEqual(normalized.lists, []);
  assert.deepEqual(normalized.ids, [0]);
});

test('normalizeRecord ignores a custom v2 source with no usable items', () => {
  const normalized = normalizeRecord({ version: 2, custom: true, items: [] });
  assert.equal(normalized.activeListId, STARTER_ID);
  assert.deepEqual(normalized.lists, []);
});

test('normalizeRecord rejects unknown, corrupt, and non-object records', () => {
  for (const value of [null, undefined, 3, 'x', [], {}, { version: 1 }, { version: '3' }]) {
    assert.equal(normalizeRecord(value), null, String(value));
  }
});

test('isResumableRecord requires a complete, unique id set', () => {
  const base = { ids: [0, 1, 2], winners: [0] };
  assert.equal(isResumableRecord(base, [0, 1, 2]), true);
  assert.equal(isResumableRecord({ ids: [0, 1, 2], winners: [] }, [0, 1, 2]), false);
  assert.equal(isResumableRecord({ ids: [0, 1, 2], winners: [9] }, [0, 1, 2]), false);
  assert.equal(isResumableRecord({ ids: [0, 1], winners: [0] }, [0, 1, 2]), false);
  assert.equal(isResumableRecord({ ids: [0, 1, 1], winners: [0] }, [0, 1, 1]), false);
  assert.equal(isResumableRecord(base, [0, 1, 1]), false);
  assert.equal(isResumableRecord(base, []), false);
  assert.equal(isResumableRecord(null, [0]), false);
});
