import { parseCsv } from './src/csv.js';
import { createTournament, nextMatchup, recordWinner, getProgress, isComplete } from './src/tournament.js';
import { fetchVideoForItem } from './src/resolve.js';
import { save, load, clear } from './src/storage.js';

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
  save({ items: state.items, winners: state.tournament.winners, version: 1 });
}

async function loadItems() {
  const res = await fetch(CSV_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load CSV (HTTP ${res.status})`);
  return parseCsv(await res.text());
}

function idsOf(items) {
  return items.map((i) => i.id);
}

async function init() {
  try {
    state.items = await loadItems();
  } catch (err) {
    el('status').textContent = `Error: ${err.message}. Serve the site over HTTP.`;
    return;
  }

  const saved = load();
  const resumable = saved && saved.items && saved.items.length === state.items.length;
  state.tournament = createTournament(idsOf(state.items));
  if (resumable && saved.winners && saved.winners.length > 0) {
    state.tournament.winners = saved.winners;
    el('resume-btn').classList.remove('hidden');
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
    state.tournament = createTournament(idsOf(state.items));
    el('resume-btn').classList.add('hidden');
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
const resolving = new Set();

async function ensureResolved(item) {
  if (resolved.has(item.id) || resolving.has(item.id)) return;
  resolving.add(item.id);
  const data = await fetchVideoForItem(item);
  resolved.set(item.id, data);
  resolving.delete(item.id);
}

function itemById(id) {
  return state.items.find((i) => i.id === id);
}

function renderPanel(side, item) {
  const panel = el(`panel-${side}`);
  panel.dataset.id = String(item.id);
  const info = resolved.get(item.id);
  const muted = panel.dataset.muted !== 'false';
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
    video.muted = muted;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.addEventListener('error', () => {
      video.replaceWith(fallback(item));
    });
    panel.appendChild(video);

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
    unmuteBtn.textContent = muted ? 'Unmute' : 'Mute';
    unmuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.dataset.muted = panel.dataset.muted === 'false' ? 'true' : 'false';
      video.muted = panel.dataset.muted === 'true';
      unmuteBtn.textContent = video.muted ? 'Unmute' : 'Mute';
    });

    controls.append(playBtn, unmuteBtn);
    panel.appendChild(controls);
  } else {
    panel.appendChild(fallback(item));
    panel.appendChild(controls);
  }

  if (!info) {
    ensureResolved(item).then(() => renderPanel(side, item));
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

document.addEventListener('keydown', (e) => {
  if (el('match-screen').classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') pick('a');
  else if (e.key === 'ArrowRight') pick('b');
  else if (e.key.toLowerCase() === 'u') {
    const panel = el('panel-a');
    panel.querySelector('.controls button:last-child')?.click();
  }
});

function renderResults() {}

init();
