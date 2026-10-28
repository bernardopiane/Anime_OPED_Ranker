import { parseYouTubeUrl } from './resolve.js';

export const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';

export function normalizeYouTubeUrl(input) {
  const id = parseYouTubeUrl(typeof input === 'string' ? input.trim() : input);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function oembedUrl(watchUrl) {
  return `${OEMBED_ENDPOINT}?url=${encodeURIComponent(watchUrl)}&format=json`;
}

export async function fetchVideoTitle(input, options = {}) {
  const watchUrl = normalizeYouTubeUrl(input);
  if (!watchUrl) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;

  try {
    const res = await fetchImpl(oembedUrl(watchUrl), {
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok) return null;
    const data = await res.json();
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    return title || null;
  } catch {
    return null;
  }
}
