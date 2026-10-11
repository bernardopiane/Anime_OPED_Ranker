const ID_RE = /^[A-Za-z0-9_-]{2,60}$/;

export function parsePlaylistId(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (ID_RE.test(trimmed)) return trimmed;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const id = url.searchParams.get('list');
  return id && ID_RE.test(id) ? id : null;
}

export function watchUrl(videoId) {
  return 'https://www.youtube.com/watch?v=' + videoId;
}

export function toPlaylistCsv(items) {
  return items.map(function(item) { return item.title + ',' + item.url; }).join('\n');
}
