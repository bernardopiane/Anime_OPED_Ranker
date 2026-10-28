import { MAX_ITEMS, sanitizeName, sanitizeTitle } from './lists.js';

export const PREFIX = 'oped1:';
export const RAW_PREFIX = 'oped1u:';
export const MAX_CODE_LENGTH = 200000;
export const MAX_DECODED_BYTES = 256 * 1024;
const FORMAT = 'deflate-raw';
const CHUNK = 0x8000;

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function streamCtor(options, name) {
  if (name in options) return options[name];
  return globalThis[name] ?? null;
}

async function pipe(bytes, Ctor, limit) {
  if (typeof Ctor !== 'function') throw new Error('Streams unavailable');
  const stream = new Ctor(FORMAT);
  const writer = stream.writable.getWriter();
  let failure = null;
  const writing = writer
    .write(bytes)
    .then(() => writer.close())
    .catch((err) => {
      failure = err;
    });

  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new Error('Decoded data is too large');
      }
      chunks.push(value);
    }
  } finally {
    if (typeof reader.releaseLock === 'function') reader.releaseLock();
  }

  await writing;
  if (failure) throw failure;
  return concat(chunks, total);
}

function shareItems(list) {
  if (!list || !Array.isArray(list.items)) return [];
  return list.items
    .filter((item) => item && typeof item.url === 'string' && item.url.trim() !== '')
    .slice(0, MAX_ITEMS)
    .map((item) => [item.url.trim(), sanitizeTitle(item.title)]);
}

export function sharePayload(list) {
  return {
    v: 1,
    n: sanitizeName(list && list.name) || 'Shared list',
    i: shareItems(list),
  };
}

export async function encodeList(list, options = {}) {
  const json = JSON.stringify(sharePayload(list));
  const encoded = new TextEncoder().encode(json);
  if (encoded.byteLength > MAX_DECODED_BYTES) {
    throw new Error('This list is too large to share.');
  }

  const Ctor = streamCtor(options, 'CompressionStream');
  if (typeof Ctor === 'function') {
    try {
      const compressed = await pipe(encoded, Ctor, MAX_DECODED_BYTES);
      return PREFIX + base64UrlEncode(compressed);
    } catch {
      // Fall through to the uncompressed prefix.
    }
  }
  return RAW_PREFIX + base64UrlEncode(encoded);
}

function parsePayload(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.v !== 1) return null;
  if (!Array.isArray(payload.i) || payload.i.length > MAX_ITEMS) return null;

  const name = sanitizeName(payload.n) || 'Shared list';
  const items = [];
  for (const entry of payload.i) {
    if (!Array.isArray(entry) || entry.length < 2) return null;
    const [rawUrl, rawTitle] = entry;
    if (typeof rawUrl !== 'string' || typeof rawTitle !== 'string') return null;
    const url = rawUrl.trim();
    if (!url) return null;
    items.push({ title: sanitizeTitle(rawTitle) || url, url });
  }
  return { name, items };
}

export async function decodeList(code, options = {}) {
  if (typeof code !== 'string') return null;
  const text = code.trim();
  if (!text || text.length > MAX_CODE_LENGTH) return null;

  let body;
  let compressed;
  if (text.startsWith(PREFIX)) {
    body = text.slice(PREFIX.length);
    compressed = true;
  } else if (text.startsWith(RAW_PREFIX)) {
    body = text.slice(RAW_PREFIX.length);
    compressed = false;
  } else {
    return null;
  }

  const clean = body.replace(/\s+/g, '');
  if (!clean) return null;

  let bytes;
  try {
    bytes = base64UrlDecode(clean);
  } catch {
    return null;
  }
  if (bytes.byteLength > MAX_DECODED_BYTES) return null;

  if (compressed) {
    const Ctor = streamCtor(options, 'DecompressionStream');
    if (typeof Ctor !== 'function') return null;
    try {
      bytes = await pipe(bytes, Ctor, MAX_DECODED_BYTES);
    } catch {
      return null;
    }
  }

  let textPayload;
  try {
    textPayload = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  return parsePayload(textPayload);
}
