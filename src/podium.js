import { parseYouTubeUrl } from './resolve.js';

export function podiumThumbnail(url) {
  const id = parseYouTubeUrl(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export function podiumEntries(rankedItems) {
  const entries = [];
  for (const item of rankedItems) {
    if (!item) continue;
    entries.push({ rank: entries.length + 1, item, thumbnail: podiumThumbnail(item.url) });
    if (entries.length === 3) break;
  }
  return entries;
}
