import { parseCsv } from './src/csv.js';
import { createTournament, nextMatchup, recordWinner, getProgress, isComplete, getRanking, getCurrentRanking, shuffleIds } from './src/tournament.js';
import { fetchVideoForItem, parseYouTubeUrl } from './src/resolve.js';
import { save, load, loadRaw, saveBackup } from './src/storage.js';
import {
  RECORD_VERSION,
  sourceFingerprint,
  videoCacheEntries,
  hydrateVideoCache,
} from './src/cache.js';
import {
  STARTER_ID,
  MAX_ITEMS,
  sanitizeTitle,
  uniqueName,
  createList,
  starterList,
  addItem,
  removeItem,
  moveItem,
  updateItemTitle,
  updateItemUrl,
  renameList,
  sameStructure,
  isResumableRecord,
  normalizeRecord,
} from './src/lists.js';
import { encodeList, decodeList } from './src/share.js';
import { normalizeYouTubeUrl, fetchVideoTitle } from './src/youtube.js';
import { podiumEntries } from './src/podium.js';
import { normalizeChannel, createChatConnection, parseVoteCommand } from './src/twitch.js';
import { createPoll, castVote, tally, clearPoll } from './src/voting.js';
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
  starter: starterList([]),
  lists: [],
  activeListId: STARTER_ID,
  videos: {},
  editingId: STARTER_ID,
};

const el = (id) => document.getElementById(id);

function showScreen(name) {
  for (const screen of ['start', 'match', 'results', 'lists']) {
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
    toggle.setAttribute('aria-label', 'Dark theme');
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
  state.videos = { ...state.videos, ...videoCacheEntries(resolved, state.items) };
  const record = {
    version: RECORD_VERSION,
    activeListId: state.activeListId,
    lists: state.lists,
    fingerprint: sourceFingerprint(state.items),
    ids: state.tournament ? state.tournament.ids : [],
    winners: state.tournament ? state.tournament.winners : [],
    videos: state.videos,
    volume: masterVolume,
  };
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

function findList(id) {
  if (id === STARTER_ID) return state.starter;
  return state.lists.find((list) => list.id === id) || null;
}

function activeList() {
  return findList(state.activeListId) || state.starter;
}

function listNames() {
  return [state.starter.name, ...state.lists.map((list) => list.name)];
}

function hydrateResolved() {
  resolutionEpoch += 1;
  resolved.clear();
  resolving.clear();
  for (const [id, info] of hydrateVideoCache(state.videos, state.items)) resolved.set(id, info);
}

function runInProgress() {
  return Boolean(state.tournament && state.tournament.winners.length > 0);
}

function updateResumeButton() {
  const resumeBtn = el('resume-btn');
  if (runInProgress() && !isComplete(state.tournament)) {
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
  const noun = n === 1 ? 'opening' : 'openings';
  el('status').textContent =
    state.activeListId === STARTER_ID
      ? `${n} ${noun} ready.`
      : `${n} ${noun} loaded from ${activeList().name}.`;
}

function resetTournament() {
  discardPoll();
  cleanupMedia('a');
  cleanupMedia('b');
  activeSide = null;
  lockedSide = null;
  state.tournament = createTournament(idsOf(state.items));
}

function endRunForChange() {
  if (!state.tournament) return;
  if (state.tournament.winners.length > 0) {
    alert('Changing this list ends the current ranking. The bracket will start fresh.');
  }
  resetTournament();
}

function activateList(id) {
  const list = findList(id);
  if (!list) return false;
  if (id === state.activeListId) return true;
  if (runInProgress()) {
    alert(`Switching to “${list.name}” ends the current ranking. The new list starts fresh.`);
  }
  state.activeListId = list.id;
  state.items = list.items;
  hydrateResolved();
  resetTournament();
  persist();
  updateResumeButton();
  updateSourceLabel();
  renderLibrary();
  return true;
}

function createAndActivate(items, name) {
  const list = createList({ name: uniqueName(name, listNames()), items });
  state.lists.push(list);
  activateList(list.id);
  showScreen('start');
}

function applyListEdit(before, after) {
  const index = state.lists.findIndex((list) => list.id === after.id);
  if (index === -1) return false;
  const structural = !sameStructure(before.items, after.items);
  const active = after.id === state.activeListId;
  state.lists[index] = after;
  if (active) {
    state.items = after.items;
    if (structural) {
      endRunForChange();
      hydrateResolved();
      updateResumeButton();
    }
    updateSourceLabel();
  }
  persist();
  return true;
}

function uiButton(label, onClick, className, ariaLabel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  if (className) btn.className = className;
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  btn.addEventListener('click', onClick);
  return btn;
}

function renderLibrary() {
  const list = el('library-list');
  if (!list) return;
  list.innerHTML = '';
  for (const entry of [state.starter, ...state.lists]) {
    list.appendChild(libraryCard(entry));
  }
}

function libraryCard(entry) {
  const li = document.createElement('li');
  li.className = 'list-card';
  const isActive = entry.id === state.activeListId;
  if (isActive) li.classList.add('is-active');

  const head = document.createElement('div');
  head.className = 'list-card-head';
  const title = document.createElement('h2');
  title.textContent = entry.name;
  head.appendChild(title);

  const badge = document.createElement('span');
  if (isActive) {
    badge.className = 'badge';
    badge.textContent = 'Active';
    head.appendChild(badge);
  } else if (entry.id === STARTER_ID) {
    badge.className = 'badge badge--muted';
    badge.textContent = 'Starter';
    head.appendChild(badge);
  }
  li.appendChild(head);

  const meta = document.createElement('p');
  meta.className = 'list-card-meta';
  const count = entry.items.length;
  meta.textContent = `${count} video${count === 1 ? '' : 's'}`;
  li.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (!isActive) {
    actions.appendChild(uiButton('Use', () => activateList(entry.id), 'primary', `Use list ${entry.name}`));
  }
  actions.appendChild(uiButton('Edit', () => openEditor(entry.id), '', `Edit list ${entry.name}`));
  actions.appendChild(uiButton('Share', () => openShare(entry.id), '', `Share list ${entry.name}`));
  if (entry.id === STARTER_ID) {
    actions.appendChild(uiButton('Duplicate to edit', () => duplicateList(entry.id), '', `Duplicate list ${entry.name} to edit`));
  } else {
    actions.appendChild(uiButton('Duplicate', () => duplicateList(entry.id), '', `Duplicate list ${entry.name}`));
    actions.appendChild(uiButton('Delete', () => deleteList(entry.id), 'danger', `Delete list ${entry.name}`));
  }
  li.appendChild(actions);
  return li;
}

function openLibrary() {
  showScreen('lists');
  el('editor-view').classList.add('hidden');
  el('library-view').classList.remove('hidden');
  renderLibrary();
}

function openEditor(id) {
  const list = findList(id);
  if (!list) return;
  state.editingId = list.id;
  showScreen('lists');
  el('library-view').classList.add('hidden');
  el('editor-view').classList.remove('hidden');
  renderEditor();
  el('list-name').focus();
}

function clearEditorFieldErrors() {
  const view = el('editor-view');
  if (!view) return;
  for (const field of view.querySelectorAll('[aria-invalid="true"]')) {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
  }
}

function setEditorStatus(message, isError, field) {
  const node = el('editor-status');
  node.textContent = message;
  node.classList.toggle('is-error', Boolean(isError));
  clearEditorFieldErrors();
  if (isError && field) {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', 'editor-status');
  }
}

function renderEditor() {
  const list = findList(state.editingId);
  if (!list) {
    openLibrary();
    return;
  }
  const readOnly = list.id === STARTER_ID;
  const nameInput = el('list-name');
  nameInput.value = list.name;
  nameInput.disabled = readOnly;

  const count = list.items.length;
  el('editor-count').textContent = `${count} video${count === 1 ? '' : 's'}`;

  const duplicateBtn = el('duplicate-list-btn');
  duplicateBtn.classList.remove('hidden');
  duplicateBtn.textContent = readOnly ? 'Duplicate to edit' : 'Duplicate';

  el('add-item-form').classList.toggle('hidden', readOnly);
  setEditorStatus(readOnly ? 'The starter list is read-only. Duplicate it to make changes.' : '');

  const items = el('editor-items');
  items.innerHTML = '';
  list.items.forEach((item, index) => {
    items.appendChild(editorRow(list, item, index, readOnly));
  });
}

function editorRow(list, item, index, readOnly) {
  const li = document.createElement('li');
  li.className = 'editor-item';

  const fields = document.createElement('div');
  fields.className = 'editor-item-fields';

  const titleLabel = document.createElement('label');
  titleLabel.className = 'field';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = 'Title';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.maxLength = 200;
  titleInput.value = item.title;
  titleInput.disabled = readOnly;
  titleInput.setAttribute('aria-label', `Title for video ${index + 1}`);
  titleInput.addEventListener('change', () => {
    const current = findList(list.id);
    if (!current) return;
    const typed = sanitizeTitle(titleInput.value);
    if (!typed) {
      titleInput.value = item.title;
      setEditorStatus('A title cannot be empty.', true, titleInput);
      return;
    }
    const next = updateItemTitle(current, item.id, typed);
    if (!next) {
      titleInput.value = item.title;
      setEditorStatus('A title cannot be empty.', true, titleInput);
      return;
    }
    if (next === current) {
      titleInput.value = item.title;
      return;
    }
    applyListEdit(current, next);
    titleInput.value = next.items[index].title;
    setEditorStatus('Title saved.');
  });
  titleLabel.append(titleSpan, titleInput);

  const urlLabel = document.createElement('label');
  urlLabel.className = 'field';
  const urlSpan = document.createElement('span');
  urlSpan.textContent = 'YouTube link';
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.value = item.url;
  urlInput.disabled = readOnly;
  urlInput.spellcheck = false;
  urlInput.setAttribute('aria-label', `Link for video ${index + 1}`);
  urlInput.addEventListener('change', () => {
    const current = findList(list.id);
    if (!current) return;
    const normalized = normalizeYouTubeUrl(urlInput.value);
    if (!normalized) {
      urlInput.value = item.url;
      setEditorStatus('Enter a valid YouTube link.', true, urlInput);
      return;
    }
    const duplicate = current.items.some(
      (entry) => entry.id !== item.id && entry.url === normalized,
    );
    if (duplicate) {
      urlInput.value = item.url;
      setEditorStatus('That video is already in this list.', true, urlInput);
      return;
    }
    const next = updateItemUrl(current, item.id, normalized);
    if (!next || next === current) {
      urlInput.value = item.url;
      return;
    }
    const active = current.id === state.activeListId;
    applyListEdit(current, next);
    renderEditor();
    setEditorStatus(active ? 'Link updated. The ranking was reset.' : 'Link updated.');
  });
  urlLabel.append(urlSpan, urlInput);

  fields.append(titleLabel, urlLabel);

  if (readOnly) {
    li.appendChild(fields);
    return li;
  }

  const actions = document.createElement('div');
  actions.className = 'editor-item-actions';
  const up = uiButton('Up', () => moveListItem(list.id, item.id, -1), '', `Move ${item.title} up`);
  up.disabled = index === 0;
  const down = uiButton('Down', () => moveListItem(list.id, item.id, 1), '', `Move ${item.title} down`);
  down.disabled = index === list.items.length - 1;
  const remove = uiButton('Remove', () => removeListItem(list.id, item.id), 'danger', `Remove ${item.title} from list`);
  actions.append(up, down, remove);
  li.append(fields, actions);
  return li;
}

function moveListItem(listId, itemId, delta) {
  const current = findList(listId);
  if (!current) return;
  const next = moveItem(current, itemId, delta);
  if (!next) return;
  applyListEdit(current, next);
  renderEditor();
  setEditorStatus('Order saved.');
}

function removeListItem(listId, itemId) {
  const current = findList(listId);
  if (!current) return;
  const next = removeItem(current, itemId);
  if (!next) return;
  applyListEdit(current, next);
  renderEditor();
  setEditorStatus('Video removed.');
}

function duplicateList(id) {
  const source = findList(id);
  if (!source) return;
  const copy = createList({ name: uniqueName(source.name, listNames()), items: source.items });
  state.lists.push(copy);
  persist();
  openEditor(copy.id);
}

function deleteList(id) {
  const list = findList(id);
  if (!list || id === STARTER_ID) return;
  if (!confirm(`Delete “${list.name}”? This cannot be undone.`)) return;
  state.lists = state.lists.filter((entry) => entry.id !== id);
  if (state.activeListId === id) {
    state.activeListId = STARTER_ID;
    state.items = state.starter.items;
    hydrateResolved();
    resetTournament();
    updateResumeButton();
    updateSourceLabel();
  }
  persist();
  renderLibrary();
}

async function addListItem(event) {
  event.preventDefault();
  const list = findList(state.editingId);
  if (!list || list.id === STARTER_ID) return;

  const url = normalizeYouTubeUrl(el('add-item-url').value);
  if (!url) {
    setEditorStatus('Enter a valid YouTube link.', true, el('add-item-url'));
    return;
  }
  if (list.items.some((item) => item.url === url)) {
    setEditorStatus('That video is already in this list.', true, el('add-item-url'));
    return;
  }
  if (list.items.length >= MAX_ITEMS) {
    setEditorStatus(`A list holds at most ${MAX_ITEMS} videos.`, true);
    return;
  }

  const typed = sanitizeTitle(el('add-item-title').value);
  const button = el('add-item-btn');
  button.disabled = true;
  setEditorStatus(typed ? 'Adding…' : 'Fetching the video title…');

  let title = typed;
  if (!title) {
    title = (await fetchVideoTitle(url)) || parseYouTubeUrl(url) || url;
  }

  button.disabled = false;
  const current = findList(list.id);
  if (!current || current.id !== state.editingId) return;

  const next = addItem(current, { title, url });
  if (!next) {
    setEditorStatus('Could not add that video.', true, el('add-item-url'));
    return;
  }
  applyListEdit(current, next);
  el('add-item-url').value = '';
  el('add-item-title').value = '';
  renderEditor();
  setEditorStatus(`Added “${title}”.`);
  el('add-item-url').focus();
}

let shareCloseTimer = null;
let shareReturnFocus = null;
let shareRequestToken = 0;

function setShareStatus(message, isError) {
  const node = el('share-status');
  node.textContent = message;
  node.classList.toggle('is-error', Boolean(isError));
}

function setPageInert(inert) {
  el('app').inert = inert;
  const toggle = el('theme-toggle');
  if (toggle) toggle.inert = inert;
}

async function openShare(listId, options = {}) {
  const list = listId ? findList(listId) : null;
  const token = ++shareRequestToken;
  const modal = el('share-modal');
  shareReturnFocus = document.activeElement;
  clearTimeout(shareCloseTimer);
  modal.classList.remove('hidden');
  void modal.offsetHeight;
  modal.classList.add('is-open');
  setPageInert(true);
  setShareStatus('');
  el('share-import-code').value = '';
  el('share-out').classList.toggle('hidden', !list);

  if (list) {
    el('share-code').value = 'Encoding…';
    const count = list.items.length;
    el('share-note').textContent = `Share “${list.name}” (${count} video${count === 1 ? '' : 's'}).`;
    try {
      const code = await encodeList(list);
      if (token === shareRequestToken) el('share-code').value = code;
    } catch (err) {
      if (token === shareRequestToken) {
        el('share-code').value = '';
        setShareStatus(err && err.message ? err.message : 'Could not create a code.', true);
      }
    }
  }

  if (options.focusImport) el('share-import-code').focus();
  else el('share-title').focus();
}

function closeShare() {
  const modal = el('share-modal');
  modal.classList.remove('is-open');
  clearTimeout(shareCloseTimer);
  shareCloseTimer = setTimeout(() => modal.classList.add('hidden'), 200);
  setPageInert(false);
  if (shareReturnFocus && typeof shareReturnFocus.focus === 'function') {
    shareReturnFocus.focus();
  }
  shareReturnFocus = null;
}

async function copyShareCode() {
  const code = el('share-code').value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    setShareStatus('Code copied.');
  } catch {
    el('share-code').select();
    setShareStatus('Could not copy — press Ctrl+C.', true);
  }
}

async function importShareCode() {
  const code = el('share-import-code').value;
  if (!code.trim()) {
    setShareStatus('Paste a code first.', true);
    return;
  }
  const button = el('share-import-btn');
  button.disabled = true;
  setShareStatus('Reading the code…');
  const decoded = await decodeList(code);
  button.disabled = false;
  if (!decoded) {
    setShareStatus('That code is not a valid list.', true);
    return;
  }
  const list = createList({ name: uniqueName(decoded.name, listNames()), items: decoded.items });
  state.lists.push(list);
  persist();
  renderLibrary();
  el('share-import-code').value = '';
  const count = list.items.length;
  setShareStatus(`Imported “${list.name}” with ${count} video${count === 1 ? '' : 's'}.`);
}

async function init() {
  const raw = loadRaw();
  const saved = load();
  if (saved && typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) {
    masterVolume = saved.volume;
  }

  try {
    state.starter = starterList(await loadItems());
  } catch (err) {
    state.starter = starterList([]);
    el('status').textContent = `Error: ${err.message}. Serve the site over HTTP.`;
  }

  const record = normalizeRecord(saved);
  if (record) {
    state.lists = record.lists.filter((list) => list.id !== STARTER_ID);
    state.videos = record.videos;
    const known = state.lists.some((list) => list.id === record.activeListId);
    state.activeListId =
      record.activeListId === STARTER_ID || known ? record.activeListId : STARTER_ID;
    state.items = activeList().items;
    hydrateResolved();
    state.tournament = createTournament(idsOf(state.items));
    if (isResumableRecord(record, idsOf(state.items))) {
      try {
        getProgress({ ids: record.ids, winners: record.winners });
        state.tournament = { ids: [...record.ids], winners: [...record.winners] };
      } catch {
        state.tournament = createTournament(idsOf(state.items));
      }
    }
    if (saved && saved.version === 2 && raw) {
      saveBackup(raw);
      persist();
    }
  } else {
    state.items = state.starter.items;
    hydrateResolved();
    state.tournament = createTournament(idsOf(state.items));
  }

  updateResumeButton();
  updateSourceLabel();
  renderLibrary();

  el('start-btn').addEventListener('click', () => {
    if (state.items.length === 0) {
      el('status').textContent = 'Add at least one video to this list first.';
      return;
    }
    if (
      runInProgress() &&
      !isComplete(state.tournament) &&
      !confirm('Start a new ranking? Your saved progress will be replaced.')
    ) {
      return;
    }
    discardPoll();
    cleanupMedia('a');
    cleanupMedia('b');
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

  el('reset-btn').addEventListener('click', () => {
    if (!confirm('Clear this ranking and return to the starter list? Your lists are kept.')) return;
    state.activeListId = STARTER_ID;
    state.items = state.starter.items;
    hydrateResolved();
    resetTournament();
    persist();
    updateResumeButton();
    updateSourceLabel();
    showScreen('start');
  });

  el('lists-btn').addEventListener('click', openLibrary);
  el('lists-back-btn').addEventListener('click', () => showScreen('start'));
  el('editor-back-btn').addEventListener('click', openLibrary);

  el('new-list-btn').addEventListener('click', () => {
    const list = createList({ name: uniqueName('New list', listNames()), items: [] });
    state.lists.push(list);
    persist();
    openEditor(list.id);
    el('list-name').select();
  });

  el('import-list-btn').addEventListener('click', () => openShare(null, { focusImport: true }));
  el('duplicate-list-btn').addEventListener('click', () => duplicateList(state.editingId));
  el('add-item-form').addEventListener('submit', addListItem);
  el('list-name').addEventListener('change', () => {
    const current = findList(state.editingId);
    if (!current || current.id === STARTER_ID) return;
    const next = renameList(current, el('list-name').value);
    if (!next) {
      el('list-name').value = current.name;
      setEditorStatus('A list needs a name.', true, el('list-name'));
      return;
    }
    if (next === current) {
      el('list-name').value = current.name;
      return;
    }
    applyListEdit(current, next);
    el('list-name').value = next.name;
    setEditorStatus('Name saved.');
  });

  el('share-close').addEventListener('click', closeShare);
  el('share-modal').addEventListener('click', (e) => {
    if (e.target === el('share-modal')) closeShare();
  });
  el('share-copy-btn').addEventListener('click', copyShareCode);
  el('share-import-btn').addEventListener('click', importShareCode);

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
    createAndActivate(items, file.name);
  });

  el('undo-btn').addEventListener('click', () => {
    discardPoll();
    state.tournament.winners = state.tournament.winners.slice(0, -1);
    persist();
    renderMatch();
  });

  el('clear-votes-btn').addEventListener('click', () => {
    if (!chatPoll) return;
    chatPoll = clearPoll(chatPoll);
    renderVotesNow();
  });

  el('pause-btn').addEventListener('click', () => {
    discardPoll();
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

  initPlaylistTool();
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

function chatActive() {
  return chatState === 'connecting' || chatState === 'connected' || chatState === 'reconnecting';
}

function chatLive() {
  return chatState === 'connected';
}

function discardPoll() {
  chatPoll = null;
  if (voteRenderTimer !== null) {
    clearTimeout(voteRenderTimer);
    voteRenderTimer = null;
  }
}

function renderVotesNow() {
  if (!chatPoll) return;
  const counts = tally(chatPoll);

  const vs = el('vs-votes');
  if (vs) vs.textContent = counts.total === 1 ? '1 vote' : `${counts.total} votes`;

  for (const side of ['a', 'b']) {
    const panel = el(`panel-${side}`);
    const meter = panel?.querySelector('.vote-meter');
    if (!meter) continue;
    const sideCount = side === 'a' ? counts.a : counts.b;
    const percent = side === 'a' ? counts.percentA : counts.percentB;
    const countNode = meter.querySelector('.vote-count');
    const unitNode = meter.querySelector('.vote-unit');
    const percentNode = meter.querySelector('.vote-percent');
    const fill = meter.querySelector('.vote-fill');
    if (countNode) countNode.textContent = String(sideCount);
    if (unitNode) unitNode.textContent = sideCount === 1 ? 'vote' : 'votes';
    if (percentNode) percentNode.textContent = `${percent}%`;
    if (fill) fill.style.width = `${percent}%`;
    const unit = sideCount === 1 ? 'vote' : 'votes';
    meter.setAttribute('aria-valuenow', String(percent));
    meter.setAttribute('aria-label', `${side === 'a' ? 'A' : 'B'}: ${sideCount} ${unit}, ${percent}%`);
  }
}

function scheduleVoteRender() {
  if (voteRenderTimer !== null) return;
  renderVotesNow();
  voteRenderTimer = setTimeout(() => {
    voteRenderTimer = null;
    renderVotesNow();
  }, 100);
}

function updateVoteVisibility() {
  const visible = chatActive();
  for (const side of ['a', 'b']) {
    const meter = el(`panel-${side}`)?.querySelector('.vote-meter');
    if (meter) meter.classList.toggle('hidden', !visible);
  }
  const vs = el('vs-votes');
  if (vs) vs.classList.toggle('hidden', !visible);
  const clear = el('clear-votes-btn');
  if (clear) clear.classList.toggle('hidden', !visible);
}

function handleChatMessage({ username, text }) {
  if (!chatLive() || !chatPoll) return;
  if (el('match-screen').classList.contains('hidden')) return;
  const side = parseVoteCommand(text);
  if (!side) return;
  chatPoll = castVote(chatPoll, username, side);
  scheduleVoteRender();
}

function setChatChip(status) {
  const chip = el('chat-status');
  if (!chip) return;
  let text = 'Chat off';
  if (status.state === 'connected') text = `#${status.channel}`;
  else if (status.state === 'connecting') text = 'Connecting…';
  else if (status.state === 'reconnecting') text = 'Reconnecting…';
  else if (status.state === 'error') text = 'Chat error';
  chip.textContent = text;
  chip.classList.toggle('is-live', status.state === 'connected');
  chip.classList.toggle('is-error', status.state === 'error');
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
  setChatChip(status);

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

  updateVoteVisibility();
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
  chat = createChatConnection({
    channel,
    onStatus: handleChatStatus,
    onPrivmsg: handleChatMessage,
  });
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
let resolutionEpoch = 0;

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
let chatPoll = null;
let voteRenderTimer = null;

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
  const epoch = resolutionEpoch;
  const stillCurrent = () =>
    epoch === resolutionEpoch &&
    state.items.some((entry) => entry.id === item.id && entry.url === item.url);
  const pending = fetchVideoForItem(item)
    .then((data) => {
      if (!stillCurrent()) return;
      resolved.set(item.id, data);
      if (data && (data.videoUrl || data.youtubeId)) {
        state.videos[item.url] = data.videoUrl
          ? { videoUrl: data.videoUrl }
          : { youtubeId: data.youtubeId };
      }
      persist();
    })
    .catch(() => {
      if (!stillCurrent()) return;
      resolved.set(item.id, { videoUrl: null, pageUrl: item.url });
      persist();
    })
    .finally(() => {
      if (resolving.get(item.id) === pending) resolving.delete(item.id);
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
  const title = document.createElement('h2');
  title.className = 'title';
  title.textContent = item.title;
  const cap = document.createElement('span');
  cap.className = 'keycap';
  cap.setAttribute('aria-hidden', 'true');
  cap.textContent = side === 'a' ? '← A' : 'B →';
  head.append(title, cap);
  panel.appendChild(head);

  const meter = document.createElement('div');
  meter.className = 'vote-meter hidden';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  meter.setAttribute('aria-label', `${side === 'a' ? 'A' : 'B'}: 0 votes, 0%`);

  const voteCount = document.createElement('span');
  voteCount.className = 'vote-count';
  voteCount.textContent = '0';
  const voteUnit = document.createElement('span');
  voteUnit.className = 'vote-unit';
  voteUnit.textContent = 'votes';
  const votePercent = document.createElement('span');
  votePercent.className = 'vote-percent';
  votePercent.textContent = '0%';
  const voteBar = document.createElement('span');
  voteBar.className = 'vote-bar';
  const voteFill = document.createElement('span');
  voteFill.className = 'vote-fill';
  voteBar.appendChild(voteFill);
  meter.append(voteCount, voteUnit, votePercent, voteBar);
  panel.appendChild(meter);

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
  discardPoll();
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

  chatPoll = createPoll(`${state.tournament.winners.length}:${matchup.a}:${matchup.b}`);
  renderVotesNow();
  updateVoteVisibility();

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

function trapFocus(modal, e) {
  const focusables = modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
  );
  if (!focusables.length) return;
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

document.addEventListener('keydown', (e) => {
  const shareModal = el('share-modal');
  const previewModal = el('preview-modal');
  const openModal = !shareModal.classList.contains('hidden')
    ? shareModal
    : !previewModal.classList.contains('hidden')
      ? previewModal
      : null;
  if (openModal) {
    if (e.key === 'Escape') {
      if (openModal === shareModal) closeShare();
      else closePreview();
    } else if (e.key === 'Tab') {
      trapFocus(openModal, e);
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
  setPageInert(true);
  el('preview-title').focus();
}

function closePreview() {
  const modal = el('preview-modal');
  modal.classList.remove('is-open');
  clearTimeout(previewCloseTimer);
  previewCloseTimer = setTimeout(() => modal.classList.add('hidden'), 200);
  setPageInert(false);
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
      img.fetchPriority = 'high';
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
  discardPoll();
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
  discardPoll();
  state.tournament = createTournament(idsOf(state.items));
  persist();
  updateResumeButton();
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
    createAndActivate(assignIds(pendingPlaylistItems), 'YouTube playlist');
  });
}


init();
