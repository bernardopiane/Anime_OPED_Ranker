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
    if (!seen.has(match[1])) { seen.add(match[1]); ids.push(match[1]); }
  }
  if (ids.length === 0) return [];
  const titles = [];
  const titleRe = /"title":\{(?:"runs":\[\{"text":"((?:[^"\\]|\\.)*)"|"simpleText":"((?:[^"\\]|\\.)*)")/g;
  while ((match = titleRe.exec(html))) {
    titles.push(decodeJsonString(match[1] != null ? match[1] : match[2]));
  }
  return ids.map((id, i) => ({ title: titles[i] || id, url: watchUrl(id) }));
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
