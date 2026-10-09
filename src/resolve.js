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

export function parseYouTubeUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#]|$)/i,
  );
  return m ? m[1] : null;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

async function fetchWithRetry(url, attempts, backoff) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(backoff(attempt - 1));
    try {
      const res = await fetch(url);
      if (res && isRetryableStatus(res.status)) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Request failed');
}

export async function fetchVideoForItem(item, options = {}) {
  if (!item || typeof item.url !== 'string') return { videoUrl: null, pageUrl: item?.url };
  const youtubeId = parseYouTubeUrl(item.url);
  if (youtubeId) return { videoUrl: null, youtubeId, pageUrl: item.url };
  const attempts = options.attempts ?? 3;
  const backoff = options.backoff ?? ((n) => 300 * 3 ** n);
  try {
    const parsed = parseCsvUrl(item.url);
    if (!parsed) return { videoUrl: null, pageUrl: item.url };
    const res = await fetchWithRetry(
      `https://api.animethemes.moe/anime/${parsed.slug}?include=animethemes.animethemeentries.videos`,
      attempts,
      backoff,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const link = pickVideo(json.anime, parsed.theme, parsed.tags);
    return { videoUrl: link || null, pageUrl: item.url };
  } catch {
    return { videoUrl: null, pageUrl: item.url };
  }
}
