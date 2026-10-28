const KEY = 'anime-op-ed-ranker/v1';
const LEGACY_KEY = 'krisgo-opening-list/v1';
export const BACKUP_KEY = 'anime-op-ed-ranker/backup/v2';

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadRaw() {
  try {
    return localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

export function load() {
  const raw = loadRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveBackup(raw) {
  if (typeof raw !== 'string' || raw === '') return false;
  try {
    localStorage.setItem(BACKUP_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
  }
}
