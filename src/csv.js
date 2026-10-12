export function parseCsv(text) {
  const items = [];
  let id = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const comma = line.lastIndexOf(',');
    if (comma === -1) continue;
    const title = parseField(line.slice(0, comma));
    const url = parseField(line.slice(comma + 1));
    if (title === '' || url === '') continue;
    if ((title.toLowerCase() === 'title' || title.toLowerCase() === 'video title') && url.toLowerCase() === 'url') {
      continue;
    }
    items.push({ id, title, url });
    id += 1;
  }
  return items;
}

function parseField(value) {
  const field = value.trim();
  if (field.startsWith('"') && field.endsWith('"')) {
    return field.slice(1, -1).replace(/""/g, '"');
  }
  return field;
}
