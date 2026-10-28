import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREFIX,
  RAW_PREFIX,
  MAX_CODE_LENGTH,
  MAX_DECODED_BYTES,
  encodeList,
  decodeList,
  sharePayload,
} from '../src/share.js';
import { MAX_ITEMS } from '../src/lists.js';

const list = {
  id: 'list-a',
  name: 'Best OPs 🎌',
  items: [
    { id: 0, title: '「残酷な天使のテーゼ」 🎵', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { id: 1, title: 'Quote "and" comma, semicolon', url: 'https://youtu.be/bbbbbbbbbbb' },
    { id: 2, title: 'Line\nbreak', url: 'https://www.youtube.com/watch?v=ccccccccccc' },
  ],
};

function rawCode(payload) {
  return RAW_PREFIX + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

async function compressedCode(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return PREFIX + Buffer.from(out).toString('base64url');
}

test('encodeList uses the compressed prefix and round-trips Unicode', async () => {
  const code = await encodeList(list);
  assert.ok(code.startsWith(PREFIX));
  assert.ok(!code.startsWith(RAW_PREFIX));
  const decoded = await decodeList(code);
  assert.equal(decoded.name, 'Best OPs 🎌');
  assert.deepEqual(decoded.items, list.items.map((item) => ({ title: item.title, url: item.url })));
});

test('decodeList accepts the uncompressed prefix and trims titles/names', async () => {
  const code = await encodeList(list, { CompressionStream: null });
  assert.ok(code.startsWith(RAW_PREFIX));
  const decoded = await decodeList(code);
  assert.equal(decoded.name, 'Best OPs 🎌');
  assert.equal(decoded.items.length, 3);
});

test('decodeList tolerates whitespace and line breaks inside a pasted code', async () => {
  const code = await encodeList(list);
  const wrapped = `  ${code.slice(0, 12)}\n${code.slice(12, 40)}\n ${code.slice(40)}  `;
  const decoded = await decodeList(wrapped);
  assert.equal(decoded.items.length, 3);
});

test('decodeList round-trips an empty list', async () => {
  const decoded = await decodeList(await encodeList({ name: 'Empty', items: [] }));
  assert.deepEqual(decoded, { name: 'Empty', items: [] });
});

test('decodeList falls back to the URL for a blank title', async () => {
  const code = rawCode({ v: 1, n: 'x', i: [['https://youtu.be/aaaaaaaaaaa', '   ']] });
  const decoded = await decodeList(code);
  assert.equal(decoded.items[0].title, 'https://youtu.be/aaaaaaaaaaa');
});

test('decodeList applies name and title caps', async () => {
  const code = rawCode({
    v: 1,
    n: 'n'.repeat(200),
    i: [['u', 't'.repeat(500)]],
  });
  const decoded = await decodeList(code);
  assert.equal(decoded.name.length, 80);
  assert.equal(decoded.items[0].title.length, 200);
});

test('sharePayload drops unusable items and caps the count', () => {
  const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({
    title: `T${i}`,
    url: `u${i}`,
  }));
  const payload = sharePayload({ name: '  Many  ', items: [null, { url: '  ' }, ...many] });
  assert.equal(payload.v, 1);
  assert.equal(payload.n, 'Many');
  assert.equal(payload.i.length, MAX_ITEMS);
  assert.deepEqual(payload.i[0], ['u0', 'T0']);
});

test('decodeList rejects foreign prefixes, malformed base64, and wrong versions', async () => {
  assert.equal(await decodeList(''), null);
  assert.equal(await decodeList('garbage'), null);
  assert.equal(await decodeList('oped2:abc'), null);
  assert.equal(await decodeList(`${PREFIX}!!!!`), null);
  assert.equal(await decodeList(RAW_PREFIX), null);
  assert.equal(await decodeList(rawCode({ v: 2, n: 'x', i: [] })), null);
  assert.equal(await decodeList(rawCode({ n: 'x', i: [] })), null);
});

test('decodeList rejects malformed payload shapes', async () => {
  const cases = [
    'null',
    '[]',
    '"x"',
    JSON.stringify({ v: 1, n: 'x', i: 'nope' }),
    JSON.stringify({ v: 1, n: 'x', i: [['u']] }),
    JSON.stringify({ v: 1, n: 'x', i: [[1, 't']] }),
    JSON.stringify({ v: 1, n: 'x', i: [['u', 1]] }),
    JSON.stringify({ v: 1, n: 'x', i: [['  ', 't']] }),
    JSON.stringify({ v: 1, n: 'x', i: [null] }),
  ];
  for (const json of cases) {
    assert.equal(await decodeList(RAW_PREFIX + Buffer.from(json).toString('base64url')), null, json);
  }
});

test('decodeList rejects more than 500 items', async () => {
  const payload = {
    v: 1,
    n: 'x',
    i: Array.from({ length: MAX_ITEMS + 1 }, () => ['u', 't']),
  };
  assert.equal(await decodeList(rawCode(payload)), null);
});

test('decodeList rejects oversized input before decoding', async () => {
  assert.equal(await decodeList(RAW_PREFIX + 'a'.repeat(MAX_CODE_LENGTH)), null);
});

test('decodeList refuses a decompression bomb', async () => {
  const huge = JSON.stringify({
    v: 1,
    n: 'x',
    i: [['u', 'x'.repeat(MAX_DECODED_BYTES)]],
  });
  const code = await compressedCode(huge);
  assert.ok(code.length < MAX_CODE_LENGTH);
  assert.equal(await decodeList(code), null);
});

test('decodeList refuses compressed data when decompression is unavailable', async () => {
  const code = await encodeList(list);
  assert.equal(await decodeList(code, { DecompressionStream: null }), null);
});

test('encodeList throws when the payload exceeds the decoded cap', async () => {
  await assert.rejects(
    encodeList({ name: 'x', items: [{ title: 'x', url: 'u'.repeat(MAX_DECODED_BYTES) }] }),
    /too large/i,
  );
});
