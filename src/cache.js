export const RECORD_VERSION = 2;

export function sourceFingerprint(items) {
  return items.map((item) => `${item.id}\u0000${item.title}\u0000${item.url}`).join('\u0001');
}

export function isMatchingSource(saved, items) {
  return Boolean(saved) && typeof saved.fingerprint === 'string' && saved.fingerprint === sourceFingerprint(items);
}

export function cacheEntries(resolved) {
  return [...resolved.entries()].filter(([, info]) => info && (info.videoUrl || info.youtubeId));
}

export function hydrateEntries(entries) {
  const out = [];
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    if (
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'number' &&
      entry[1] &&
      typeof entry[1] === 'object' &&
      (entry[1].videoUrl || entry[1].youtubeId)
    ) {
      out.push(entry);
    }
  }
  return out;
}

export function videoCacheEntries(resolved, items) {
  const out = {};
  for (const item of items) {
    if (!item || typeof item.url !== 'string') continue;
    const info = resolved.get(item.id);
    if (!info) continue;
    if (info.videoUrl) out[item.url] = { videoUrl: info.videoUrl };
    else if (info.youtubeId) out[item.url] = { youtubeId: info.youtubeId };
  }
  return out;
}

export function hydrateVideoCache(cache, items) {
  const out = [];
  if (!cache || typeof cache !== 'object') return out;
  for (const item of items) {
    if (!item || typeof item.url !== 'string') continue;
    const entry = cache[item.url];
    if (!entry || typeof entry !== 'object') continue;
    if (entry.videoUrl) {
      out.push([item.id, { videoUrl: entry.videoUrl, pageUrl: item.url }]);
    } else if (entry.youtubeId) {
      out.push([item.id, { videoUrl: null, youtubeId: entry.youtubeId, pageUrl: item.url }]);
    }
  }
  return out;
}
