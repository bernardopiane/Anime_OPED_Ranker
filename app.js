import { parseCsv } from './src/csv.js';
import { createTournament } from './src/tournament.js';
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

function renderMatch() {}
function renderResults() {}

init();
