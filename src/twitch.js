const CHANNEL_PATTERN = /^[a-z0-9_]{1,25}$/;

const TAG_UNESCAPES = {
  s: ' ',
  ':': ';',
  '\\': '\\',
  r: '\r',
  n: '\n',
};

export function normalizeChannel(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value) return null;
  value = value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^m\./i, '');
  value = value.replace(/^twitch\.tv\//i, '');
  value = value.replace(/^[@#]/, '');
  value = value.split(/[/?#]/)[0].toLowerCase();
  return CHANNEL_PATTERN.test(value) ? value : null;
}

export function parseTags(raw) {
  const tags = {};
  if (typeof raw !== 'string' || !raw) return tags;
  for (const pair of raw.split(';')) {
    if (!pair) continue;
    const equals = pair.indexOf('=');
    const key = equals === -1 ? pair : pair.slice(0, equals);
    const value = equals === -1 ? '' : pair.slice(equals + 1);
    tags[key] = value.replace(/\\(.)/g, (match, char) => TAG_UNESCAPES[char] ?? match);
  }
  return tags;
}

export function parseIrcMessage(line) {
  if (typeof line !== 'string') return null;
  let rest = line.replace(/[\r\n]+$/, '');
  if (!rest.trim()) return null;

  let tags = {};
  let prefix = null;

  if (rest.startsWith('@')) {
    const space = rest.indexOf(' ');
    if (space === -1) return null;
    tags = parseTags(rest.slice(1, space));
    rest = rest.slice(space + 1).trimStart();
  }

  if (rest.startsWith(':')) {
    const space = rest.indexOf(' ');
    if (space === -1) {
      prefix = rest.slice(1);
      rest = '';
    } else {
      prefix = rest.slice(1, space);
      rest = rest.slice(space + 1);
    }
  }

  let trailing = null;
  const trailingAt = rest.indexOf(' :');
  if (trailingAt !== -1) {
    trailing = rest.slice(trailingAt + 2);
    rest = rest.slice(0, trailingAt);
  } else if (rest.startsWith(':')) {
    trailing = rest.slice(1);
    rest = '';
  }

  const parts = rest.split(/\s+/).filter(Boolean);
  const command = parts.shift();
  if (!command) return null;
  return { tags, prefix, command, params: parts, trailing };
}

export function parseVoteCommand(text) {
  if (typeof text !== 'string') return null;
  if (text.startsWith('!1')) return 'a';
  if (text.startsWith('!2')) return 'b';
  return null;
}
