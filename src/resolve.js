export function parseCsvUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/animethemes\.moe\/anime\/([^/]+)\/([^/?#]+)/i);
  if (!m) return null;
  const slug = m[1];
  const rest = m[2];
  const dash = rest.indexOf('-');
  const theme = dash === -1 ? rest : rest.slice(0, dash);
  const tags = dash === -1 ? '' : rest.slice(dash + 1);
  return { slug, theme, tags };
}

export function pickVideo(anime, theme, tags) {
  const themes = (anime && anime.animethemes) || [];
  const match = themes.find((t) => t.slug === theme);
  if (!match) return null;
  const videos = [];
  for (const entry of match.animethemeentries || []) {
    for (const video of entry.videos || []) videos.push(video);
  }
  if (videos.length === 0) return null;
  if (tags) {
    const exact = videos.find((v) => v.tags === tags);
    if (exact) return exact.link || null;
  }
  return videos[0].link || null;
}

export async function fetchVideoForItem(item) {
  if (!item || typeof item.url !== 'string') return { videoUrl: null, pageUrl: item?.url };
  try {
    const parsed = parseCsvUrl(item.url);
    if (!parsed) return { videoUrl: null, pageUrl: item.url };
    const res = await fetch(
      `https://api.animethemes.moe/anime/${parsed.slug}?include=animethemes.animethemeentries.videos`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const link = pickVideo(json.anime, parsed.theme, parsed.tags);
    return { videoUrl: link || null, pageUrl: item.url };
  } catch {
    return { videoUrl: null, pageUrl: item.url };
  }
}
