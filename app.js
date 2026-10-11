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
    resumeBtn.textContent = `Resume — ${getProgress(state.tournament).percent}%`;
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

  showScreen('start');
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

function renderPanel(side, item) {
  const panel = el(`panel-${side}`);
  cleanupMedia(side);
  panel.dataset.id = String(item.id);
  const info = resolved.get(item.id);
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = item.title;
  panel.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'controls';

  const showFallback = () => {
    panel.innerHTML = '';
    panel.appendChild(title);
    panel.appendChild(fallback(item, side));
  };

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
    controls.append(playBtn, unmuteBtn);
    panel.appendChild(controls);
    media[side] = { adapter, button: unmuteBtn };

    video.addEventListener('error', () => {
      if (media[side].adapter !== adapter) return;
      cleanupMedia(side);
      if (activeSide === side) activeSide = null;
      showFallback();
      applyAudio();
    });
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
    controls.append(playBtn, unmuteBtn);
    panel.appendChild(controls);
    media[side] = { adapter, button: unmuteBtn };

    const failed = () => {
      if (media[side].adapter !== adapter) return;
      cleanupMedia(side);
      if (activeSide === side) activeSide = null;
      showFallback();
      applyAudio();
    };

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
    panel.appendChild(controls);
    media[side] = { adapter: null, button: null };
  } else {
    panel.appendChild(loadingBox());
    media[side] = { adapter: null, button: null };
  }

  applyAudio();

  if (!info) {
    const id = item.id;
    ensureResolved(item).then(() => {
      if (resolved.has(id) && panel.dataset.id === String(id)) renderPanel(side, item);
    });
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
  el('progress-bar').style.transform = `scaleX(${progress.percent / 100})`;
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
  if (!el('preview-modal').classList.contains('hidden')) {
    if (e.key === 'Escape') closePreview();
    return;
  }
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

let previewCloseTimer = null;

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
  clearTimeout(previewCloseTimer);
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function closePreview() {
  const modal = el('preview-modal');
  modal.classList.remove('is-open');
  clearTimeout(previewCloseTimer);
  previewCloseTimer = setTimeout(() => modal.classList.add('hidden'), 200);
}

el('preview-btn').addEventListener('click', openPreview);
el('preview-close').addEventListener('click', closePreview);
el('preview-modal').addEventListener('click', (e) => {
  if (e.target === el('preview-modal')) closePreview();
});

function renderResults() {
  cleanupMedia('a');
  cleanupMedia('b');
  activeSide = null;
  lockedSide = null;
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

init();
