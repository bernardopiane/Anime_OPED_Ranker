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

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const JOIN_TIMEOUT_MS = 10000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];
const TERMINAL_NOTICE_IDS = new Set(['msg_channel_suspended', 'msg_banned']);

export function createChatConnection({
  channel,
  onPrivmsg = () => {},
  onStatus = () => {},
  WebSocketImpl = globalThis.WebSocket,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  const target = String(channel ?? '').replace(/^#/, '').toLowerCase();
  const joinedChannel = `#${target}`;
  const nick = `justinfan${Math.floor(10000 + Math.random() * 90000)}`;

  let socket = null;
  let joinTimer = null;
  let reconnectTimer = null;
  let attempt = 0;
  let joined = false;
  let manual = false;

  function emitStatus(state, extra = {}) {
    onStatus({ state, channel: target, ...extra });
  }

  function clearJoinTimer() {
    if (joinTimer !== null) {
      clearTimeoutImpl(joinTimer);
      joinTimer = null;
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeoutImpl(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function detach(sock) {
    sock.onopen = null;
    sock.onmessage = null;
    sock.onerror = null;
    sock.onclose = null;
  }

  function scheduleReconnect() {
    if (manual || reconnectTimer !== null) return;
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
    attempt += 1;
    emitStatus('reconnecting', { delay, attempt });
    reconnectTimer = setTimeoutImpl(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  }

  function failSocket(sock) {
    if (sock !== socket) return;
    clearJoinTimer();
    joined = false;
    socket = null;
    detach(sock);
    try {
      sock.close();
    } catch {
    }
    scheduleReconnect();
  }

  function terminate(message) {
    manual = true;
    clearJoinTimer();
    clearReconnectTimer();
    const sock = socket;
    socket = null;
    joined = false;
    if (sock) {
      detach(sock);
      try {
        sock.close();
      } catch {
      }
    }
    emitStatus('error', { message: message || 'Twitch rejected the connection.' });
  }

  function handleMessage(line) {
    const message = parseIrcMessage(line);
    if (!message) return;

    if (message.command === 'PING') {
      if (socket) socket.send(`PONG :${message.trailing ?? 'tmi.twitch.tv'}\r\n`);
      return;
    }

    if (message.command === '366') {
      const matches = message.params.some((param) => param.toLowerCase() === joinedChannel);
      if (matches && !joined) {
        clearJoinTimer();
        attempt = 0;
        joined = true;
        emitStatus('connected');
      }
      return;
    }

    if (message.command === 'PRIVMSG') {
      if (!joined || message.params[0]?.toLowerCase() !== joinedChannel) return;
      const login = message.prefix?.split('!')[0];
      if (!login) return;
      onPrivmsg({ username: login.toLowerCase(), text: message.trailing ?? '' });
      return;
    }

    if (message.command === 'NOTICE') {
      const id = message.tags?.['msg-id'];
      const text = message.trailing ?? '';
      if (TERMINAL_NOTICE_IDS.has(id) || /login authentication failed/i.test(text)) {
        terminate(text || id);
      }
      return;
    }

    if (message.command === 'RECONNECT' && socket) {
      failSocket(socket);
    }
  }

  function openSocket() {
    if (manual) return;
    if (typeof WebSocketImpl !== 'function') {
      terminate('WebSocket is not supported in this browser.');
      return;
    }

    let sock;
    try {
      sock = new WebSocketImpl(IRC_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    socket = sock;
    joined = false;

    sock.onopen = () => {
      if (sock !== socket) return;
      sock.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
      sock.send(`NICK ${nick}\r\n`);
      sock.send(`JOIN ${joinedChannel}\r\n`);
      joinTimer = setTimeoutImpl(() => {
        joinTimer = null;
        failSocket(sock);
      }, JOIN_TIMEOUT_MS);
    };

    sock.onmessage = (event) => {
      if (sock !== socket) return;
      const data = typeof event?.data === 'string' ? event.data : '';
      for (const line of data.split(/\r?\n/)) {
        if (line.trim()) handleMessage(line);
      }
    };

    sock.onerror = () => {
      if (sock === socket) failSocket(sock);
    };

    sock.onclose = () => {
      if (sock !== socket) return;
      clearJoinTimer();
      joined = false;
      socket = null;
      scheduleReconnect();
    };
  }

  function connect() {
    if (socket) return;
    manual = false;
    attempt = 0;
    emitStatus('connecting');
    openSocket();
  }

  function disconnect() {
    manual = true;
    clearJoinTimer();
    clearReconnectTimer();
    const sock = socket;
    socket = null;
    joined = false;
    if (sock) {
      detach(sock);
      try {
        sock.close();
      } catch {
      }
    }
    emitStatus('idle');
  }

  return { connect, disconnect };
}
