import { parseCsv } from './src/csv.js';
import { createTournament, nextMatchup, recordWinner, getProgress, isComplete, getRanking, getCurrentRanking, shuffleIds } from './src/tournament.js';
import { fetchVideoForItem } from './src/resolve.js';
import { save, load, clear } from './src/storage.js';
import {
  RECORD_VERSION,
  sourceFingerprint,
  isMatchingSource,
  cacheEntries,
  hydrateEntries,
  videoCacheEntries,
  hydrateVideoCache,
} from './src/cache.js';
import { podiumEntries } from './src/podium.js';
import { normalizeChannel, createChatConnection } from './src/twitch.js';
import {
  createPlaylistBookmarklet,
  normalizePlaylistItems,
  normalizePlaylistUrl,
  toPlaylistCsv,
  assignIds,
} from './src/playlist.js';

const CSV_URL = 'opening%20list.csv';

const state = {
  items: [],
  tournament: null,
  customSource: false,
  sourceName: '',
};

const el = (id) => document.getElementById(id);

function showScreen(name) {
  for (const screen of ['start', 'match', 'results']) {
    el(`${screen}-screen`).classList.toggle('hidden', screen !== name);
  }
}

function initTheme() {
  const toggle = el('theme-toggle');
  if (!toggle) return;
  const root = document.documentElement;
  const sync = () => {
    const isDark = root.dataset.theme !== 'light';
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  sync();
  toggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem('oped-theme', next);
    } catch {}
    sync();
  });
}

function persist() {
  const record = {
    fingerprint: sourceFingerprint(state.items),
    ids: state.tournament.ids,
    winners: state.tournament.winners,
    resolved: cacheEntries(resolved),
    videos: videoCacheEntries(resolved, state.items),
    version: RECORD_VERSION,
    volume: masterVolume,
    custom: state.customSource,
  };
  if (state.customSource) {
    record.items = state.items;
    record.sourceName = state.sourceName;
  }
  const ok = save(record);
  el('warning').classList.toggle('hidden', ok);
}

async function loadItems() {
  const res = await fetch(CSV_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load CSV (HTTP ${res.status})`);
  return parseCsv(await res.text());
}

function isValidItems(items) {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.every(
      (item) =>
        item &&
        typeof item.id === 'number' &&
        typeof item.title === 'string' &&
        typeof item.url === 'string',
    )
  );
}

function idsOf(items) {
  return items.map((i) => i.id);
}

function isIdPermutation(candidate, ids) {
  if (!Array.isArray(candidate) || candidate.length !== ids.length) return false;
  const expected = new Set(ids);
  if (expected.size !== ids.length) return false;
  return candidate.every((id) => expected.has(id));
}

function isResumable(saved) {
  if (!isMatchingSource(saved, state.items) || saved.version !== RECORD_VERSION) return false;
  if (!Array.isArray(saved.winners) || saved.winners.length === 0) return false;
  const ids = idsOf(state.items);
  if (!isIdPermutation(saved.ids, ids)) return false;
  if (saved.winners.some((winner) => !ids.includes(winner))) return false;
  try {
    getProgress({ ids: saved.ids, winners: saved.winners });
    return true;
  } catch {
    return false;
  }
}

function updateResumeButton(savedRecord = load()) {
  const resumeBtn = el('resume-btn');
  if (isResumable(savedRecord)) {
    const { round, totalRounds } = getProgress(state.tournament);
    resumeBtn.textContent = `Resume — Round ${round} of ${totalRounds}`;
    resumeBtn.classList.remove('hidden');
  } else {
    resumeBtn.textContent = 'Resume';
    resumeBtn.classList.add('hidden');
  }
}

function updateSourceLabel() {
  const n = state.items.length;
  el('status').textContent = state.customSource
    ? `${n} openings loaded from ${state.sourceName}.`
    : `${n} openings ready.`;
}

function useItems(items, sourceName) {
  state.items = items;
  state.customSource = true;
  state.sourceName = sourceName;
  resolved.clear();
  resolving.clear();
  cleanupMedia('a');
  cleanupMedia('b');
  state.tournament = createTournament(idsOf(items));
  persist();
  updateResumeButton(null);
  updateSourceLabel();
  showScreen('start');
}

async function init() {
  const saved = load();
  if (saved && typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) {
    masterVolume = saved.volume;
  }

  initPlaylistTool();

  if (saved && saved.custom === true && isValidItems(saved.items)) {
    state.items = saved.items;
    state.customSource = true;
    state.sourceName = typeof saved.sourceName === 'string' ? saved.sourceName : 'your file';
  } else {
    try {
      state.items = await loadItems();
    } catch (err) {
      el('status').textContent = `Error: ${err.message}. Serve the site over HTTP.`;
      return;
    }
  }

  if (isMatchingSource(saved, state.items) && saved.version === RECORD_VERSION) {
    for (const [id, info] of hydrateEntries(saved.resolved)) resolved.set(id, info);
  }
  if (saved && saved.version === RECORD_VERSION) {
    for (const [id, info] of hydrateVideoCache(saved.videos, state.items)) resolved.set(id, info);
  }
  state.tournament = createTournament(idsOf(state.items));
  if (isResumable(saved)) {
    state.tournament = { ids: [...saved.ids], winners: [...saved.winners] };
  }
  updateResumeButton(saved);
  updateSourceLabel();

  el('start-btn').addEventListener('click', () => {
    if (isResumable(load()) && !confirm('Start a new ranking? Your saved progress will be replaced.')) {
      return;
    }
    const ids = idsOf(state.items);
    const order = el('shuffle').checked ? shuffleIds(ids) : ids;
    state.tournament = createTournament(order);
    persist();
    showScreen('match');
    renderMatch();
  });

  el('resume-btn').addEventListener('click', () => {
    showScreen('match');
    renderMatch();
  });

  el('reset-btn').addEventListener('click', async () => {
    if (!confirm('Clear all progress and load the default list?')) return;
    clear();
    resolved.clear();
    resolving.clear();
    state.customSource = false;
    state.sourceName = '';
    try {
      state.items = await loadItems();
    } catch (err) {
      el('status').textContent = `Error: ${err.message}. Serve the site over HTTP.`;
      return;
    }
    state.tournament = createTournament(idsOf(state.items));
    updateResumeButton(null);
    updateSourceLabel();
    showScreen('start');
  });

  el('file-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      el('status').textContent = 'Could not read that file.';
      return;
    }
    const items = parseCsv(text);
    if (!isValidItems(items)) {
      el('status').textContent = 'No valid "title,link" rows found in that file.';
      return;
    }
    useItems(items, file.name);
  });

  el('undo-btn').addEventListener('click', () => {
    state.tournament.winners = state.tournament.winners.slice(0, -1);
    persist();
    renderMatch();
  });

  el('pause-btn').addEventListener('click', () => {
    persist();
    cleanupMedia('a');
    cleanupMedia('b');
    activeSide = null;
    lockedSide = null;
    updateResumeButton();
    showScreen('start');
  });

  const volumeInput = el('volume');
  volumeInput.value = String(masterVolume);
  volumeInput.addEventListener('input', () => {
    masterVolume = Number(volumeInput.value);
    applyAudio();
    persist();
  });

  initTwitch();
  showScreen('start');
}

function setChatStatus(message, isError) {
  const node = el('twitch-status');
  node.textContent = message;
  node.classList.toggle('is-error', Boolean(isError));
}

function setChatControls(active) {
  el('twitch-connect-btn').textContent = active ? 'Disconnect' : 'Connect';
  el('twitch-channel').disabled = active;
}

function handleChatStatus(status) {
  chatState = status.state;
  if (status.state === 'connected') {
    chatChannel = status.channel;
    saveChatChannel(status.channel);
  }

  const active =
    status.state === 'connecting' ||
    status.state === 'connected' ||
    status.state === 'reconnecting';
  setChatControls(active);

  if (status.state === 'connecting') {
    setChatStatus('Connecting…');
  } else if (status.state === 'connected') {
    setChatStatus(`Connected to #${status.channel}`);
  } else if (status.state === 'reconnecting') {
    const seconds = Math.max(1, Math.round((status.delay ?? 0) / 1000));
    const retry = (status.attempt ?? 0) >= 3 ? ' Still trying — check the channel name.' : '';
    setChatStatus(`Reconnecting in ${seconds}s…${retry}`);
  } else if (status.state === 'error') {
    setChatStatus(status.message || 'Connection failed.', true);
    chat = null;
  } else {
    setChatStatus('Not connected');
  }
}

function toggleChat() {
  if (chat) {
    chat.disconnect();
    chat = null;
    return;
  }

  const input = el('twitch-channel');
  const channel = normalizeChannel(input.value);
  if (!channel) {
    setChatStatus('Enter a valid Twitch channel name.', true);
    return;
  }

  input.value = channel;
  saveChatChannel(channel);
  chat = createChatConnection({ channel, onStatus: handleChatStatus });
  chat.connect();
}

function initTwitch() {
  if (!el('twitch-channel')) return;

  const saved = savedChatChannel();
  if (saved) el('twitch-channel').value = saved;

  el('twitch-connect-btn').addEventListener('click', toggleChat);
  el('twitch-channel').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    toggleChat();
  });
}

const resolved = new Map();
const resolving = new Map();

const media = {
  a: { adapter: null, button: null },
  b: { adapter: null, button: null },
};
let activeSide = null;
let lockedSide = null;
let masterVolume = 1;

const CHAT_CHANNEL_KEY = 'oped-twitch-channel';
let chat = null;
let chatState = 'idle';
let chatChannel = '';

function savedChatChannel() {
  try {
    return normalizeChannel(localStorage.getItem(CHAT_CHANNEL_KEY));
  } catch {
    return null;
  }
}

function saveChatChannel(channel) {
  try {
    if (channel) localStorage.setItem(CHAT_CHANNEL_KEY, channel);
  } catch {}
}

function applyAudio() {
  for (const side of ['a', 'b']) {
    const entry = media[side];
    const muted = side !== activeSide;
    if (entry && entry.adapter) entry.adapter.setAudio(muted, masterVolume);
    if (entry && entry.button) entry.button.textContent = muted ? 'Unmute' : 'Mute';
  }
}

function cleanupMedia(side) {
  const entry = media[side];
  if (entry && entry.adapter && entry.adapter.destroy) {
    try {
      entry.adapter.destroy();
    } catch {}
  }
  media[side] = { adapter: null, button: null };
}

function setActive(side) {
  activeSide = side;
  applyAudio();
}

function toggleUnmute(side) {
  if (lockedSide === side) {
    lockedSide = null;
    activeSide = null;
  } else {
    lockedSide = side;
    activeSide = side;
  }
  applyAudio();
}

function ensureResolved(item) {
  if (resolved.has(item.id)) return Promise.resolve();
  const inFlight = resolving.get(item.id);
  if (inFlight) return inFlight;
  const pending = fetchVideoForItem(item)
    .then((data) => {
      resolved.set(item.id, data);
      persist();
    })
    .catch(() => {
      resolved.set(item.id, { videoUrl: null, pageUrl: item.url });
      persist();
    })
    .finally(() => {
      resolving.delete(item.id);
    });
  resolving.set(item.id, pending);
  return pending;
}

function itemById(id) {
  return state.items.find((i) => i.id === id);
}

let ytApiPromise = null;

function loadYouTubeApi() {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => reject(new Error('YouTube IFrame API failed to load'));
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function makeScrub() {
  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'scrub';
  scrub.min = '0';
  scrub.max = '1000';
  scrub.value = '0';
  return scrub;
}

function actionButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function nativeAdapter(video) {
  return {
    setAudio(muted, volume) {
      video.muted = muted;
      video.volume = volume;
    },
    togglePlay() {
      if (video.paused) video.play();
      else video.pause();
    },
    destroy() {},
  };
}

function youtubeAdapter(scrub) {
  const adapter = {
    ready: false,
    player: null,
    timer: null,
    duration: 0,
    setAudio(muted, volume) {
      if (!adapter.ready || !adapter.player) return;
      if (muted) adapter.player.mute();
      else {
        adapter.player.unMute();
        adapter.player.setVolume(Math.round(volume * 100));
      }
    },
    togglePlay() {
      if (!adapter.ready || !adapter.player) return;
      if (adapter.player.getPlayerState() === 1) adapter.player.pauseVideo();
      else adapter.player.playVideo();
    },
    startScrub() {
      adapter.timer = setInterval(() => {
        if (!adapter.player) return;
        adapter.duration = adapter.player.getDuration ? adapter.player.getDuration() : 0;
        if (adapter.duration > 0) {
          const t = adapter.player.getCurrentTime ? adapter.player.getCurrentTime() : 0;
          scrub.value = String(Math.round((t / adapter.duration) * 1000));
        }
      }, 250);
      scrub.addEventListener('input', () => {
        if (adapter.player && adapter.duration > 0) {
          adapter.player.seekTo((Number(scrub.value) / 1000) * adapter.duration, true);
        }
      });
    },
    destroy() {
      if (adapter.timer) clearInterval(adapter.timer);
      if (adapter.player && typeof adapter.player.destroy === 'function') {
        try {
          adapter.player.destroy();
        } catch {}
      }
      adapter.player = null;
    },
  };
  return adapter;
}

function panelSignature(item) {
  const info = resolved.get(item.id);
  const kind = !info ? 'loading' : info.videoUrl ? 'video' : info.youtubeId ? 'yt' : 'fallback';
  const ref = info ? info.videoUrl || info.youtubeId || item.url : '';
  return `${item.id}|${kind}|${ref}`;
}

function failToFallback(side, item, adapter) {
  if (media[side].adapter !== adapter) return;
  if (activeSide === side) activeSide = null;
  cleanupMedia(side);
  resolved.set(item.id, { videoUrl: null, pageUrl: item.url });
  const panel = el(`panel-${side}`);
  if (panel.dataset.id === String(item.id)) {
    panel.dataset.sig = '';
    renderPanel(side, item);
  }
  applyAudio();
}

function renderPanel(side, item, animate = false) {
  const panel = el(`panel-${side}`);
  const sig = panelSignature(item);
  if (panel.dataset.sig === sig) {
    applyAudio();
    return;
  }
  cleanupMedia(side);
  panel.dataset.id = String(item.id);
  panel.dataset.sig = sig;
  panel.setAttribute('aria-label', item.title);

  const info = resolved.get(item.id);
  panel.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'panel-head';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = item.title;
  const cap = document.createElement('span');
  cap.className = 'keycap';
  cap.setAttribute('aria-hidden', 'true');
  cap.textContent = side === 'a' ? '← A' : 'B →';
  head.append(title, cap);
  panel.appendChild(head);

  const controls = document.createElement('div');
  controls.className = 'controls';

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'pick-btn';
  pickBtn.textContent = side === 'a' ? 'Pick A' : 'Pick B';
  pickBtn.setAttribute('aria-label', `Pick ${item.title}`);
  pickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pick(side);
  });

  if (info && info.videoUrl) {
    const video = document.createElement('video');
    video.src = info.videoUrl;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    panel.appendChild(video);

    const scrub = makeScrub();
    const syncScrub = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        scrub.value = String(Math.round((video.currentTime / video.duration) * 1000));
      }
    };
    video.addEventListener('timeupdate', syncScrub);
    video.addEventListener('loadedmetadata', syncScrub);
    scrub.addEventListener('input', () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = (Number(scrub.value) / 1000) * video.duration;
      }
    });
    scrub.addEventListener('click', (e) => e.stopPropagation());
    scrub.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.appendChild(scrub);

    const adapter = nativeAdapter(video);
    const playBtn = actionButton('Play/Pause', () => adapter.togglePlay());
    const unmuteBtn = actionButton('Unmute', () => toggleUnmute(side));
    unmuteBtn.classList.add('unmute');
    controls.append(playBtn, unmuteBtn);
    panel.appendChild(controls);
    media[side] = { adapter, button: unmuteBtn };

    video.addEventListener('error', () => failToFallback(side, item, adapter));
  } else if (info && info.youtubeId) {
    const holder = document.createElement('div');
    holder.className = 'yt';
    panel.appendChild(holder);

    const scrub = makeScrub();
    scrub.addEventListener('click', (e) => e.stopPropagation());
    scrub.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.appendChild(scrub);

    const adapter = youtubeAdapter(scrub);
    const playBtn = actionButton('Play/Pause', () => adapter.togglePlay());
    const unmuteBtn = actionButton('Unmute', () => toggleUnmute(side));
    unmuteBtn.classList.add('unmute');
    controls.append(playBtn, unmuteBtn);
    panel.appendChild(controls);
    media[side] = { adapter, button: unmuteBtn };

    const failed = () => failToFallback(side, item, adapter);

    loadYouTubeApi()
      .then((YT) => {
        if (media[side].adapter !== adapter) return;
        adapter.player = new YT.Player(holder, {
          videoId: info.youtubeId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            mute: 1,
            loop: 1,
            playlist: info.youtubeId,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (media[side].adapter !== adapter) return;
              adapter.ready = true;
              adapter.setAudio(side !== activeSide, masterVolume);
              adapter.startScrub();
            },
            onError: failed,
          },
        });
      })
      .catch(failed);
  } else if (info) {
    panel.appendChild(fallback(item, side));
    media[side] = { adapter: null, button: null };
  } else {
    panel.appendChild(loadingBox());
    media[side] = { adapter: null, button: null };
  }

  panel.appendChild(pickBtn);
  applyAudio();

  if (!info) {
    const id = item.id;
    ensureResolved(item).then(() => {
      if (resolved.has(id) && panel.dataset.id === String(id) && el(`panel-${side}`) === panel) {
        renderPanel(side, item);
      }
    });
  }

  if (animate) {
    panel.classList.remove('panel--enter');
    void panel.offsetWidth;
    panel.classList.add('panel--enter');
  }
}

function loadingBox() {
  const box = document.createElement('div');
  box.className = 'loading';
  box.textContent = 'Loading preview…';
  return box;
}

function fallback(item, side) {
  const box = document.createElement('div');
  box.className = 'fallback';
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = /youtube\.com|youtu\.be/i.test(item.url) ? 'Open on YouTube' : 'Open on animethemes.moe';
  box.textContent = 'Preview unavailable — ';
  box.appendChild(link);

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'retry';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resolved.delete(item.id);
    const panel = el(`panel-${side}`);
    if (panel && panel.dataset.id === String(item.id)) renderPanel(side, item);
  });
  box.appendChild(retryBtn);
  return box;
}

function pick(side) {
  const panel = el(`panel-${side}`);
  const id = Number(panel.dataset.id);
  const matchup = nextMatchup(state.tournament);
  if (!matchup || (id !== matchup.a && id !== matchup.b)) return;
  state.tournament = recordWinner(state.tournament, id);
  persist();
  if (isComplete(state.tournament)) renderResults();
  else renderMatch();
}

function renderLadder(total, current) {
  const ladder = el('round-ladder');
  if (!ladder) return;
  ladder.innerHTML = '';
  for (let r = 1; r <= total; r += 1) {
    const seg = document.createElement('span');
    seg.className = 'rung';
    if (r < current) seg.classList.add('is-done');
    else if (r === current) seg.classList.add('is-now');
    ladder.appendChild(seg);
  }
}

function renderMatch() {
  if (isComplete(state.tournament)) {
    renderResults();
    return;
  }
  activeSide = null;
  lockedSide = null;
  const matchup = nextMatchup(state.tournament);
  const a = itemById(matchup.a);
  const b = itemById(matchup.b);

  const prevA = el('panel-a').dataset.id;
  const prevB = el('panel-b').dataset.id;
  renderPanel('a', a, prevA !== undefined && prevA !== String(a.id));
  renderPanel('b', b, prevB !== undefined && prevB !== String(b.id));

  const progress = getProgress(state.tournament);
  el('progress-label').textContent = `Round ${progress.round} of ${progress.totalRounds}`;
  renderLadder(progress.totalRounds, progress.round);

  const status = el('match-status');
  if (status) {
    status.textContent = `Round ${progress.round} of ${progress.totalRounds}. ${a.title} versus ${b.title}.`;
  }
}

el('panel-a').addEventListener('click', () => pick('a'));
el('panel-b').addEventListener('click', () => pick('b'));

el('panel-a').addEventListener('mouseenter', () => setActive('a'));
el('panel-a').addEventListener('mouseleave', () => setActive(lockedSide));
el('panel-b').addEventListener('mouseenter', () => setActive('b'));
el('panel-b').addEventListener('mouseleave', () => setActive(lockedSide));

document.addEventListener('keydown', (e) => {
  const modal = el('preview-modal');
  if (!modal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      closePreview();
    } else if (e.key === 'Tab') {
      const focusables = modal.querySelectorAll('a[href], button:not([disabled])');
      if (focusables.length) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    return;
  }
  if (el('match-screen').classList.contains('hidden')) return;
  if (e.target instanceof HTMLInputElement) return;
  if (e.repeat) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === 'ArrowLeft' && !e.shiftKey) pick('a');
  else if (e.key === 'ArrowRight' && !e.shiftKey) pick('b');
  else if (e.key.toLowerCase() === 'u') {
    el('panel-a').querySelector('.unmute')?.click();
  }
});

function rankedItems() {
  return getRanking(state.tournament).map(itemById);
}

function toCsv(items) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = items.map((item, i) => `${i + 1},${esc(item.title)},${esc(item.url)}`);
  return ['rank,title,url', ...rows].join('\n');
}

function toText(items) {
  return items.map((item, i) => `${i + 1}. ${item.title}`).join('\n');
}

let previewCloseTimer = null;
let previewReturnFocus = null;

function openPreview() {
  const items = getCurrentRanking(state.tournament).map(itemById);
  const list = el('preview-list');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.title;
    li.appendChild(link);
    list.appendChild(li);
  }
  const modal = el('preview-modal');
  previewReturnFocus = document.activeElement;
  clearTimeout(previewCloseTimer);
  modal.classList.remove('hidden');
  void modal.offsetHeight;
  modal.classList.add('is-open');
  el('preview-close').focus();
}

function closePreview() {
  const modal = el('preview-modal');
  modal.classList.remove('is-open');
  clearTimeout(previewCloseTimer);
  previewCloseTimer = setTimeout(() => modal.classList.add('hidden'), 200);
  if (previewReturnFocus && typeof previewReturnFocus.focus === 'function') {
    previewReturnFocus.focus();
  }
  previewReturnFocus = null;
}

el('preview-btn').addEventListener('click', openPreview);
el('preview-close').addEventListener('click', closePreview);
el('preview-modal').addEventListener('click', (e) => {
  if (e.target === el('preview-modal')) closePreview();
});

const CROWN_SVG =
  '<svg class="podium-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l5 4 4-6 4 6 5-4-1.5 11h-15L3 7z"/></svg>';

const PLACE_LABELS = { 1: 'Champion', 2: 'Runner-up', 3: 'Third place' };

function podiumShowTile(title) {
  const span = document.createElement('span');
  span.className = 'podium-show';
  span.textContent = title;
  return span;
}

function renderPodium(items) {
  const podium = el('podium');
  podium.innerHTML = '';
  for (const { rank, item, thumbnail } of podiumEntries(items)) {
    const li = document.createElement('li');
    li.className = `podium-slot podium-slot--${rank}`;
    li.insertAdjacentHTML('beforeend', CROWN_SVG);

    if (thumbnail) {
      const figure = document.createElement('div');
      figure.className = 'podium-figure';
      const img = document.createElement('img');
      img.className = 'podium-thumb';
      img.src = thumbnail;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => figure.replaceWith(podiumShowTile(item.title)));
      figure.appendChild(img);
      li.appendChild(figure);
    }

    const stand = document.createElement('div');
    stand.className = 'podium-stand';
    const place = document.createElement('span');
    place.className = 'podium-place';
    place.textContent = PLACE_LABELS[rank] || String(rank);
    const rankEl = document.createElement('span');
    rankEl.className = 'podium-rank';
    rankEl.textContent = String(rank);
    const title = document.createElement('a');
    title.className = 'podium-title';
    title.href = item.url;
    title.target = '_blank';
    title.rel = 'noopener';
    title.textContent = item.title;
    stand.append(place, rankEl, title);
    li.appendChild(stand);

    podium.appendChild(li);
  }
}

function renderResults() {
  cleanupMedia('a');
  cleanupMedia('b');
  activeSide = null;
  lockedSide = null;
  const items = rankedItems();
  renderPodium(items);
  const list = el('results-list');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.title;
    li.appendChild(link);
    list.appendChild(li);
  }
  showScreen('results');
}

el('copy-btn').addEventListener('click', async () => {
  const btn = el('copy-btn');
  try {
    await navigator.clipboard.writeText(toText(rankedItems()));
    btn.textContent = 'Copied!';
  } catch {
    btn.textContent = 'Copy failed';
  }
  setTimeout(() => (btn.textContent = 'Copy'), 1500);
});

el('download-btn').addEventListener('click', () => {
  const blob = new Blob([toCsv(rankedItems())], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'op-ed-ranking.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

el('again-btn').addEventListener('click', () => {
  if (!confirm('Clear progress and start over?')) return;
  state.tournament = createTournament(state.items.map((i) => i.id));
  persist();
  updateResumeButton(null);
  showScreen('start');
});

initTheme();

let pendingPlaylistItems = null;
let playlistWindow = null;

function playlistStatus(message, isError) {
  const node = el('playlist-status');
  node.textContent = message;
  node.classList.toggle('is-error', Boolean(isError));
}

function setPlaylistResults(items) {
  pendingPlaylistItems = items.length ? items : null;
  const has = Boolean(pendingPlaylistItems);
  el('playlist-download-btn').disabled = !has;
  el('playlist-use-btn').disabled = !has;
  if (!has) {
    playlistStatus('No videos found in that playlist.', true);
    return;
  }
  const noun = items.length === 1 ? 'video' : 'videos';
  playlistStatus(`Found ${items.length} ${noun}.`);
}

function buildPlaylistBookmarklet() {
  return createPlaylistBookmarklet(location.href.split('#')[0], location.origin);
}

const YOUTUBE_ORIGINS = new Set([
  'https://youtube.com',
  'https://www.youtube.com',
  'https://m.youtube.com',
  'https://music.youtube.com',
]);

function importPlaylistItems(items) {
  const normalized = normalizePlaylistItems(items);
  if (normalized.length === 0) {
    setPlaylistResults([]);
    return;
  }
  setPlaylistResults(normalized);
}

function restorePlaylistImport() {
  if (!location.hash.startsWith('#playlist-import=')) return;
  const encoded = new URLSearchParams(location.hash.slice(1)).get('playlist-import');
  try {
    importPlaylistItems(JSON.parse(encoded || 'null'));
  } catch {
    playlistStatus('The returned playlist data was invalid. Run the bookmarklet again.', true);
  }
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}

function initPlaylistTool() {
  if (!el('playlist-tool')) return;

  const bookmarklet = el('playlist-bookmarklet');
  bookmarklet.href = buildPlaylistBookmarklet();
  el('playlist-open-btn').addEventListener('click', () => {
    const url = normalizePlaylistUrl(el('playlist-url').value);
    if (!url) {
      playlistStatus('Enter a valid YouTube playlist link.', true);
      return;
    }
    pendingPlaylistItems = null;
    el('playlist-download-btn').disabled = true;
    el('playlist-use-btn').disabled = true;
    playlistWindow = window.open(url, 'anime-oped-playlist-import');
    if (!playlistWindow) {
      playlistStatus('Your browser blocked the playlist tab. Allow pop-ups, then try again.', true);
      return;
    }
    playlistWindow.focus();
    playlistStatus('Playlist opened. Click the saved bookmarklet on the YouTube tab to import its videos.');
  });

  el('playlist-copy-bookmarklet').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet.getAttribute('href'));
      playlistStatus('Bookmarklet copied. Add it as a browser bookmark, then click it on YouTube.');
    } catch {
      playlistStatus('Could not copy the bookmarklet. Drag its link to your bookmarks bar instead.', true);
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== playlistWindow || !YOUTUBE_ORIGINS.has(event.origin)) return;
    if (!event.data || event.data.type !== 'anime-op-ed-ranker-playlist') return;
    importPlaylistItems(event.data.videos);
  });

  restorePlaylistImport();

  el('playlist-download-btn').addEventListener('click', () => {
    if (!pendingPlaylistItems) return;
    const blob = new Blob([toPlaylistCsv(pendingPlaylistItems)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yt-playlist.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  el('playlist-use-btn').addEventListener('click', () => {
    if (!pendingPlaylistItems) return;
    useItems(assignIds(pendingPlaylistItems), 'YouTube playlist');
  });
}


init();
