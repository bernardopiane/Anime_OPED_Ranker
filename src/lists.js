export const STARTER_ID = 'starter';
export const STARTER_NAME = 'Starter list';
export const MAX_ITEMS = 500;
export const LIST_NAME_MAX = 80;
export const ITEM_TITLE_MAX = 200;

export function sanitizeName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, LIST_NAME_MAX).trim();
}

export function sanitizeTitle(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, ITEM_TITLE_MAX).trim();
}

export function uniqueName(name, names = []) {
  const base = sanitizeName(name) || 'Untitled list';
  const taken = new Set(
    names
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (taken.has(`${base} (${suffix})`.toLowerCase())) suffix += 1;
  return `${base} (${suffix})`;
}

export function makeListId(random = Math.random) {
  let out = '';
  for (let i = 0; i < 3; i += 1) {
    out += Math.floor(random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  }
  return `list-${out}`;
}

function reindex(items) {
  return items.map((item, index) => ({ id: index, title: item.title, url: item.url }));
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const raw of items) {
    if (out.length >= MAX_ITEMS) break;
    if (!raw || typeof raw.url !== 'string') continue;
    const url = raw.url.trim();
    if (!url) continue;
    out.push({
      id: out.length,
      title: sanitizeTitle(raw.title) || url,
      url,
    });
  }
  return out;
}

export function createList({ id, name, items } = {}) {
  const cleanId = typeof id === 'string' && id.trim() ? id.trim() : makeListId();
  return {
    id: cleanId,
    name: sanitizeName(name) || 'Untitled list',
    items: normalizeItems(items),
  };
}

export function starterList(items) {
  return {
    id: STARTER_ID,
    name: STARTER_NAME,
    items: normalizeItems(items),
  };
}

export function addItem(list, item) {
  if (!list || !Array.isArray(list.items)) return null;
  if (list.items.length >= MAX_ITEMS) return null;
  if (!item || typeof item.url !== 'string') return null;
  const url = item.url.trim();
  if (!url) return null;
  const title = sanitizeTitle(item.title) || url;
  return {
    ...list,
    items: [...list.items, { id: list.items.length, title, url }],
  };
}

export function removeItem(list, itemId) {
  if (!list || !Array.isArray(list.items)) return null;
  const index = list.items.findIndex((item) => item.id === itemId);
  if (index === -1) return null;
  return { ...list, items: reindex(list.items.filter((_, i) => i !== index)) };
}

export function moveItem(list, itemId, delta) {
  if (!list || !Array.isArray(list.items)) return null;
  const index = list.items.findIndex((item) => item.id === itemId);
  if (index === -1) return null;
  const target = index + delta;
  if (target < 0 || target >= list.items.length) return null;
  const items = [...list.items];
  [items[index], items[target]] = [items[target], items[index]];
  return { ...list, items: reindex(items) };
}

export function updateItemTitle(list, itemId, title) {
  if (!list || !Array.isArray(list.items)) return null;
  const index = list.items.findIndex((item) => item.id === itemId);
  if (index === -1) return null;
  const current = list.items[index];
  const nextTitle = sanitizeTitle(title) || current.title || current.url;
  if (nextTitle === current.title) return list;
  return {
    ...list,
    items: list.items.map((item, i) => (i === index ? { ...item, title: nextTitle } : item)),
  };
}

export function updateItemUrl(list, itemId, url) {
  if (!list || !Array.isArray(list.items)) return null;
  const index = list.items.findIndex((item) => item.id === itemId);
  if (index === -1) return null;
  const nextUrl = typeof url === 'string' ? url.trim() : '';
  if (!nextUrl) return null;
  if (nextUrl === list.items[index].url) return list;
  return {
    ...list,
    items: list.items.map((item, i) => (i === index ? { ...item, url: nextUrl } : item)),
  };
}

export function renameList(list, name) {
  if (!list) return null;
  const nextName = sanitizeName(name);
  if (!nextName) return null;
  if (nextName === list.name) return list;
  return { ...list, name: nextName };
}

export function structureKey(items) {
  if (!Array.isArray(items)) return '';
  return items.map((item) => `${item.id}\u0000${item.url}`).join('\u0001');
}

export function sameStructure(a, b) {
  return structureKey(a) === structureKey(b);
}

function bracketFields(record) {
  return {
    ids: Array.isArray(record.ids) ? [...record.ids] : [],
    winners: Array.isArray(record.winners) ? [...record.winners] : [],
    fingerprint: typeof record.fingerprint === 'string' ? record.fingerprint : '',
    videos:
      record.videos && typeof record.videos === 'object' && !Array.isArray(record.videos)
        ? record.videos
        : {},
  };
}

function normalizeV3(record) {
  const lists = [];
  const seen = new Set();
  const rawLists = Array.isArray(record.lists) ? record.lists : [];
  rawLists.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    if (!id || seen.has(id)) id = `list-${index + 1}`;
    while (seen.has(id)) id = `${id}-x`;
    seen.add(id);
    lists.push({
      id,
      name: sanitizeName(raw.name) || `List ${index + 1}`,
      items: normalizeItems(raw.items),
    });
  });

  let activeListId = typeof record.activeListId === 'string' ? record.activeListId : '';
  if (activeListId !== STARTER_ID && !seen.has(activeListId)) activeListId = STARTER_ID;

  return {
    version: 3,
    activeListId: activeListId || STARTER_ID,
    lists,
    ...bracketFields(record),
  };
}

function migrateV2(record) {
  const lists = [];
  let activeListId = STARTER_ID;
  if (record.custom === true && Array.isArray(record.items)) {
    const items = normalizeItems(record.items);
    if (items.length > 0) {
      lists.push({
        id: 'list-migrated',
        name: sanitizeName(record.sourceName) || 'Imported list',
        items,
      });
      activeListId = 'list-migrated';
    }
  }
  return {
    version: 3,
    activeListId,
    lists,
    ...bracketFields(record),
  };
}

export function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (record.version === 3) return normalizeV3(record);
  if (record.version === 2) return migrateV2(record);
  return null;
}

export function isResumableRecord(record, ids) {
  if (!record || !Array.isArray(ids) || ids.length === 0) return false;
  if (!Array.isArray(record.winners) || record.winners.length === 0) return false;
  if (!Array.isArray(record.ids) || record.ids.length !== ids.length) return false;
  const expected = new Set(ids);
  if (expected.size !== ids.length) return false;
  if (new Set(record.ids).size !== record.ids.length) return false;
  if (!record.ids.every((id) => expected.has(id))) return false;
  return record.winners.every((id) => expected.has(id));
}
