import { parseYouTubeUrl } from './resolve.js';

export function podiumThumbnail(url) {
  const id = parseYouTubeUrl(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
