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

export function assignIds(items) {
  if (!Array.isArray(items)) return [];
  return items.map(function(item, index) {
    return { id: index, title: item.title, url: item.url };
  });
}

export function toPlaylistCsv(items) {
  return items.map(function(item) { return item.title + ',' + item.url; }).join('\n');
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractJsonFrom(text, startBrace) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startBrace; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startBrace, i + 1);
    }
  }
  return null;
}

function findInitialData(html) {
  const marker = html.indexOf('ytInitialData');
  if (marker === -1) return null;
  const brace = html.indexOf('{', marker);
  if (brace === -1) return null;
  const jsonText = extractJsonFrom(html, brace);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function titleText(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs) && node.runs.length) {
    return node.runs.map((run) => run.text || '').join('');
  }
  if (typeof node.content === 'string') return node.content;
  return null;
}

function pushVideo(out, seen, videoId, title) {
  if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) return;
  if (seen.has(videoId)) return;
  seen.add(videoId);
  const clean = typeof title === 'string' ? title.trim() : '';
  out.push({ title: clean || videoId, url: watchUrl(videoId) });
}

function collectVideos(node, out, seen) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out, seen);
    return;
  }
  for (const key of ['playlistVideoRenderer', 'videoRenderer', 'gridVideoRenderer']) {
    const renderer = node[key];
    if (renderer && renderer.videoId) pushVideo(out, seen, renderer.videoId, titleText(renderer.title));
  }
  const lockup = node.lockupViewModel;
  if (lockup && lockup.contentId && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
    const meta = lockup.metadata && lockup.metadata.lockupMetadataViewModel;
    pushVideo(out, seen, lockup.contentId, meta && meta.title ? titleText(meta.title) : null);
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === 'object') collectVideos(value, out, seen);
  }
}

function decodeJsonString(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

function extractByRegex(html) {
  const ids = [];
  const seen = new Set();
  const idRe = /"videoId":"([A-Za-z0-9_-]{11})"/g;
  let match;
  while ((match = idRe.exec(html))) {
    if (!seen.has(match[1])) { seen.add(match[1]); ids.push({ id: match[1], index: match.index }); }
  }
  const cssIdRe = /content-id-([A-Za-z0-9_-]{11})/g;
  while ((match = cssIdRe.exec(html))) {
    if (!seen.has(match[1])) { seen.add(match[1]); ids.push({ id: match[1], index: match.index }); }
  }
  if (ids.length === 0) return [];
  const titles = [];
  const titleRe = /"title":\{(?:"runs":\[\{"text":"((?:[^"\\]|\\.)*)"|"simpleText":"((?:[^"\\]|\\.)*)")/g;
  while ((match = titleRe.exec(html))) {
    const text = decodeJsonString(match[1] != null ? match[1] : match[2]).trim();
    titles.push({ text, index: match.index });
  }
  return ids.map((entry, i) => {
    const end = i + 1 < ids.length ? ids[i + 1].index : Infinity;
    const found = titles.find((t) => t.index >= entry.index && t.index < end);
    if (found && found.text) {
      return { title: found.text, url: watchUrl(entry.id) };
    }
    const windowStart = Math.max(0, entry.index - 200);
    const windowEnd = entry.index + 200;
    const window = html.slice(windowStart, windowEnd);
    const ariaLabelMatch = /aria-label="([^"]+)"/.exec(window);
    if (ariaLabelMatch) {
      const text = ariaLabelMatch[1].trim();
      if (text.length > 5 && text.length < 200) {
        return { title: text, url: watchUrl(entry.id) };
      }
    }
    const titleAttrMatch = /title="([^"]+)"/.exec(window);
    if (titleAttrMatch) {
      const text = titleAttrMatch[1].trim();
      if (text.length > 5 && text.length < 200 && !text.includes('YouTube') && !text.includes('Subscribe') && !text.includes('More actions')) {
        return { title: text, url: watchUrl(entry.id) };
      }
    }
    return { title: entry.id, url: watchUrl(entry.id) };
  });
}

export function extractFromHtml(html) {
  if (typeof html !== 'string' || html.trim() === '') return [];
  const out = [];
  const seen = new Set();
  const data = findInitialData(html);
  if (data) collectVideos(data, out, seen);
  if (out.length > 0) return out;
  return extractByRegex(html);
}

const API_BASE = 'https://www.googleapis.com/youtube/v3/playlistItems';
const UNAVAILABLE_TITLES = new Set(['Deleted video', 'Private video']);

function codedError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export function mapApiItems(page) {
  const items = [];
  const seen = new Set();
  let skipped = 0;
  const list = (page && page.items) || [];
  for (const entry of list) {
    const snippet = (entry && entry.snippet) || {};
    const details = (entry && entry.contentDetails) || {};
    const videoId = details.videoId || (snippet.resourceId && snippet.resourceId.videoId);
    const title = typeof snippet.title === 'string' ? snippet.title : '';
    if (!videoId || UNAVAILABLE_TITLES.has(title)) { skipped += 1; continue; }
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    items.push({ title: title || videoId, url: watchUrl(videoId) });
  }
  return { items, nextPageToken: (page && page.nextPageToken) || null, skipped };
}

export async function fetchPlaylist(playlistId, apiKey, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  if (!playlistId) throw codedError('INVALID_PLAYLIST');
  if (!apiKey) throw codedError('MISSING_KEY');
  const items = [];
  const seen = new Set();
  let skipped = 0;
  let pageToken = '';
  for (let page = 0; page < 100; page += 1) {
    const url =
      `${API_BASE}?part=snippet%2CcontentDetails&maxResults=50` +
      `&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    let res;
    try {
      res = await fetchImpl(url);
    } catch {
      throw codedError('NETWORK');
    }
    if (!res.ok) {
      if (res.status === 400) throw codedError('BAD_KEY');
      if (res.status === 403) throw codedError('FORBIDDEN');
      if (res.status === 404) throw codedError('NOT_FOUND');
      throw codedError('HTTP_ERROR');
    }
    let body;
    try {
      body = await res.json();
    } catch {
      throw codedError('HTTP_ERROR');
    }
    const mapped = mapApiItems(body);
    for (const item of mapped.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
    skipped += mapped.skipped;
    pageToken = mapped.nextPageToken;
    if (!pageToken) break;
  }
  return { items, skipped };
}
