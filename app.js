import { parseCsv } from './src/csv.js';
import { createTournament, nextMatchup, recordWinner, getProgress, isComplete, getRanking } from './src/tournament.js';
import { fetchVideoForItem } from './src/resolve.js';
import { save, load, clear } from './src/storage.js';
import {
  RECORD_VERSION,
  sourceFingerprint,
  isMatchingSource,
  cacheEntries,
  hydrateEntries,
} from './src/cache.js';

const CSV_URL = 'krisgo%20opening%20list.csv';

const state = {
  items: [],
  tournament: null,
};

const el = (id) => document.getElementById(id);

function showScreen(name) {
  for (const screen of ['start', 'match', 'results']) {
    el(`${screen}-screen`).classList.toggle('hidden', screen !== name);
  }
}

function persist() {
  const ok = save({
    fingerprint: sourceFingerprint(state.items),
    winners: state.tournament.winners,
    resolved: cacheEntries(resolved),
    version: RECORD_VERSION,
  });
  el('warning').classList.toggle('hidden', ok);
}

async function loadItems() {
  const res = await fetch(CSV_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load CSV (HTTP ${res.status})`);
  return parseCsv(await res.text());
}

function idsOf(items) {
  return items.map((i) => i.id);
}

function isResumable(saved) {
  if (!isMatchingSource(saved, state.items) || saved.version !== RECORD_VERSION) return false;
  if (!Array.isArray(saved.winners) || saved.winners.length === 0) return false;
  const ids = idsOf(state.items);
  if (saved.winners.some((winner) => !ids.includes(winner))) return false;
  try {
    getProgress({ ids, winners: saved.winners });
    return true;
  } catch {
    return false;
  }
}

async function init() {
  try {
    state.items = await loadItems();
  } catch (err) {
    el('status').textContent = `Error: ${err.message}. Serve the site over HTTP.`;
    return;
  }

  const saved = load();
  if (isMatchingSource(saved, state.items) && saved.version === RECORD_VERSION) {
    for (const [id, info] of hydrateEntries(saved.resolved)) resolved.set(id, info);
  }
  state.tournament = createTournament(idsOf(state.items));
  if (isResumable(saved)) {
    state.tournament.winners = saved.winners;
    const resumeBtn = el('resume-btn');
    resumeBtn.textContent = `Resume — ${getProgress(state.tournament).percent}%`;
    resumeBtn.classList.remove('hidden');
  }

  el('status').textContent = `${state.items.length} openings ready.`;

  el('start-btn').addEventListener('click', () => {
    state.tournament = createTournament(idsOf(state.items));
    persist();
    showScreen('match');
    renderMatch();
  });

  el('resume-btn').addEventListener('click', () => {
    showScreen('match');
    renderMatch();
  });

  el('reset-btn').addEventListener('click', () => {
    if (!confirm('Clear all progress?')) return;
    clear();
    resolved.clear();
    resolving.clear();
    state.tournament = createTournament(idsOf(state.items));
    const resetResume = el('resume-btn');
    resetResume.textContent = 'Resume';
    resetResume.classList.add('hidden');
    el('status').textContent = `${state.items.length} openings ready.`;
    showScreen('start');
  });

  el('undo-btn').addEventListener('click', () => {
    state.tournament.winners = state.tournament.winners.slice(0, -1);
    persist();
    renderMatch();
  });

  showScreen('start');
}

const resolved = new Map();
const resolving = new Map();

const media = {
  a: { video: null, button: null },
  b: { video: null, button: null },
};
let activeSide = null;
let lockedSide = null;

function applyAudio() {
  for (const side of ['a', 'b']) {
    const { video, button } = media[side];
    const muted = side !== activeSide;
    if (video) video.muted = muted;
    if (button) button.textContent = muted ? 'Unmute' : 'Mute';
  }
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

function renderPanel(side, item) {
  const panel = el(`panel-${side}`);
  panel.dataset.id = String(item.id);
  const info = resolved.get(item.id);
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = item.title;
  panel.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'controls';

  if (info && info.videoUrl) {
    const video = document.createElement('video');
    video.src = info.videoUrl;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    panel.appendChild(video);

    const scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.className = 'scrub';
    scrub.min = '0';
    scrub.max = '1000';
    scrub.value = '0';
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

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = 'Play/Pause';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (video.paused) video.play();
      else video.pause();
    });

    const unmuteBtn = document.createElement('button');
    unmuteBtn.type = 'button';
    unmuteBtn.textContent = 'Unmute';
    unmuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleUnmute(side);
    });

    controls.append(playBtn, unmuteBtn);
    panel.appendChild(controls);
    media[side] = { video, button: unmuteBtn };

    video.addEventListener('error', () => {
      video.replaceWith(fallback(item));
      scrub.remove();
      controls.remove();
      media[side] = { video: null, button: null };
      if (activeSide === side) activeSide = null;
      applyAudio();
    });
  } else {
    panel.appendChild(fallback(item));
    panel.appendChild(controls);
    media[side] = { video: null, button: null };
  }

  applyAudio();

  if (!info) {
    const id = item.id;
    ensureResolved(item).then(() => {
      if (resolved.has(id) && panel.dataset.id === String(id)) renderPanel(side, item);
    });
  }
}

function fallback(item) {
  const box = document.createElement('div');
  box.className = 'fallback';
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open on animethemes.moe';
  box.textContent = 'Preview unavailable — ';
  box.appendChild(link);
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
  renderPanel('a', a);
  renderPanel('b', b);

  const progress = getProgress(state.tournament);
  el('progress-bar').style.width = `${progress.percent}%`;
  el('progress-label').textContent =
    `Round ${progress.round}/${progress.totalRounds} · ${progress.done}/${progress.total}`;
}

el('panel-a').addEventListener('click', () => pick('a'));
el('panel-b').addEventListener('click', () => pick('b'));

el('panel-a').addEventListener('mouseenter', () => setActive('a'));
el('panel-a').addEventListener('mouseleave', () => setActive(lockedSide));
el('panel-b').addEventListener('mouseenter', () => setActive('b'));
el('panel-b').addEventListener('mouseleave', () => setActive(lockedSide));

document.addEventListener('keydown', (e) => {
  if (el('match-screen').classList.contains('hidden')) return;
  if (e.target instanceof HTMLInputElement) return;
  if (e.repeat) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === 'ArrowLeft' && !e.shiftKey) pick('a');
  else if (e.key === 'ArrowRight' && !e.shiftKey) pick('b');
  else if (e.key.toLowerCase() === 'u') {
    const panel = el('panel-a');
    panel.querySelector('.controls button:last-child')?.click();
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

function renderResults() {
  const items = rankedItems();
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
  a.download = 'krisgo-top-100.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

el('again-btn').addEventListener('click', () => {
  if (!confirm('Clear progress and start over?')) return;
  clear();
  resolved.clear();
  resolving.clear();
  state.tournament = createTournament(state.items.map((i) => i.id));
  const againResume = el('resume-btn');
  againResume.textContent = 'Resume';
  againResume.classList.add('hidden');
  showScreen('start');
});

init();
