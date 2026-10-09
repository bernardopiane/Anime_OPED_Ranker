export function parseCsv(text) {
  const items = [];
  let id = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const comma = line.lastIndexOf(',');
    if (comma === -1) continue;
    const title = line.slice(0, comma).trim();
    const url = line.slice(comma + 1).trim();
    if (title === '' || url === '') continue;
    items.push({ id, title, url });
    id += 1;
  }
  return items;
}
