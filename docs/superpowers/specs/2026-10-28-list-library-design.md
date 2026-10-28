# List library — design

## Intent

Let a user keep several named YouTube ranking lists, build or tweak them
without touching a CSV, and hand one to someone else as a single string of
characters. Today a list is either the bundled `opening list.csv` or a one-off
file upload; changing a single video means rebuilding the file.

## Goals

- Add named lists that live in the browser and survive a reload.
- Build a list by pasting a YouTube link; the title defaults to the video's
  own title and stays editable.
- Keep the bundled 99-item `opening list.csv` available as a read-only starter.
- Switch lists explicitly, with a clear warning that the current run ends.
- Share a list as one text code; import a code as a new list.
- Keep the app static and dependency-free. No backend, account, OAuth, API
  key, or EventSub.
- Leave the existing tournament, media, Twitch voting, results, and CSV
  downloads working.

## Non-goals

- Server-side storage or accounts.
- Sharing bracket progress, winners, or results. Codes carry the list only.
- Drag-and-drop reordering (arrow buttons are enough).
- Per-list run history, undo across switches, or multi-tab conflict handling.
- Fetching titles from anything other than YouTube.
- A separate HTML page. The builder is a fourth screen in `index.html`.

## Anti-goals

- Switching lists must never silently destroy a run.
- A share code must never be able to run script, inject HTML, or decompress
  without a bound.
- A broken or foreign code must produce a friendly error, not a crash.
- Editing a title must not invalidate saved bracket progress.
- Reindexing items must not serve a cached video for the wrong item.

## Constraints

- `index.html`, `app.js`, `styles.css`, `tokens.css`, and `src/*.js`; no build.
- `node --test` for tests.
- Existing design system in `design.md` and `tokens.css`; system fonts only.
- Existing storage key `anime-op-ed-ranker/v1`; one versioned record.
- YouTube links are accepted in every form `parseYouTubeUrl` already handles:
  `watch?v=`, `youtu.be`, `embed`, `shorts`, and `live`.

## Approaches considered

1. **One versioned record plus a manager screen (chosen).** The existing save
   grows a `lists` array and an `activeListId`. Only the active list carries
   bracket fields. Pure list and share modules keep `app.js` thin, and the
   existing persistence, resume, and download paths stay recognisable.
2. **One localStorage key per list.** Cleaner isolation, but requires sweeping
   changes to storage, reset, resume, and every place that reads the current
   record. Rejected as more churn for the same result.
3. **A separate builder page.** Avoids touching the SPA, but duplicates theme,
   storage, YouTube parsing, and navigation. Rejected by requirement.

## Storage

`anime-op-ed-ranker/v1` stores one JSON record:

```js
{
  version: 3,
  activeListId: 'starter' | '<list id>',
  lists: [{ id, name, items: [{ id, title, url }] }],
  fingerprint, ids, winners,   // bracket for the active list only
  videos: { [url]: { videoUrl } | { youtubeId } },
  volume
}
```

- `lists` holds only user-created lists. The starter is virtual: its items come
  from `opening list.csv` and its id is always `starter`.
- Item ids are dense integers (`0..n-1`) within a list, preserving the existing
  tournament and media code.
- The persisted id-keyed resolve cache is dropped. `videos` is keyed by URL,
  so it stays valid across reindexing and list switches.
- On load, a v2 record is converted in memory: a custom v2 source becomes one
  user list named after its source; a default v2 source becomes the starter.
  Bracket fields and `videos` carry over. Before the first v3 save, the raw v2
  string is copied to `anime-op-ed-ranker/backup/v2`.
- A corrupt record is treated as an empty library. The next save replaces it;
  the backup is never deleted automatically.

## Behaviour

### Lists

- The library screen lists the starter first, then user lists, each with its
  name and video count. The active list is badged.
- **Use** activates a list. If the current list has recorded winners, one
  `alert()` explains that the run ends; there is no confirm dialog and no
  second chance. Activating clears the bracket for the newly active list.
- **New list** creates an empty list and opens it in the editor. It is not
  activated, so it cannot end a run.
- **Duplicate** copies a list under a unique name (`Name (2)`, `Name (3)`) and
  opens the copy. Duplicating the starter is how it becomes editable.
- **Delete** asks for confirmation, then removes a user list. Deleting the
  active list falls back to the starter and clears the bracket.
- **Reset** on the start screen clears the bracket and returns to the starter;
  the library, videos cache, and volume are kept.
- List names are trimmed and capped at 80 characters.

### Editing

- The editor shows the list name, video count, an add form, and one row per
  video.
- Add form: a YouTube link and an optional title. A blank title fetches the
  video title through YouTube's oEmbed endpoint; on failure the 11-character
  video id is used. The stored URL is canonical
  `https://www.youtube.com/watch?v=<id>`.
- Rows edit the title and the URL in place, and move a video up or down or
  remove it. No drag and drop.
- Adding, removing, reordering, or changing a URL is structural. On the active
  list it ends the run, with one `alert()` if winners exist, then resets the
  bracket. Renaming a title or a list is not structural and keeps progress.
- Titles are trimmed and capped at 200 characters; a blank title falls back to
  the video id.
- A list holds at most 500 videos. The starter is read-only in the editor.
- Editing an inactive list never touches the active bracket.

### Sharing

- A code is `oped1:` followed by base64url of `deflate-raw`-compressed UTF-8
  JSON. If compression is unavailable it falls back to `oped1u:` plus base64url
  of the raw UTF-8 JSON. The decoder accepts both prefixes.
- Payload: `{ "v": 1, "n": "<name>", "i": [["<url>", "<title>"], …] }`.
- Full URLs are stored, so mixed starter lists and CSV lists are shareable.
- Import validates the prefix, JSON shape, version, item count, and string
  fields, assigns fresh item ids, and adds a new list with a unique name. It
  does not activate the list.
- Decoding refuses inputs over 200,000 characters and decoded output over
  256 KB. `TextEncoder`/`TextDecoder` are used so Japanese titles and emoji
  survive; `btoa` is only ever applied to bytes.

### Other entry points

- CSV upload and playlist import create user lists named after the file or
  `YouTube playlist`, then activate them (with the same ending notice).
- The share modal is reachable from the library. It also offers an import box,
  so a recipient can paste a code without opening a list first.

## UI

The start screen gains a **Lists** button next to Start / Resume / Reset and
shows which list is active in its status line.

The new `#lists-screen` has two views:

- **Library:** heading, New list, Import, and Back; a stacked list of cards.
- **Editor:** heading with the list name input, a back link, the add form, a
  status line, and numbered rows with title, URL, up, down, and remove.

A second modal (`#share-modal`) handles share and import, reusing the existing
modal markup, focus trap, scrim, and reduced-motion behaviour.

All new CSS uses existing tokens and follows the existing card, action, field,
modal, and responsive conventions. Target sizes stay at 44 px and the layout
must survive 320 px.

## Module boundaries

### `src/lists.js`

Pure list model, no DOM:

- Constants: `STARTER_ID`, `STARTER_NAME`, `MAX_ITEMS`, `LIST_NAME_MAX`,
  `ITEM_TITLE_MAX`.
- `makeListId(random)` / `uniqueName(name, names)` / `sanitizeName` /
  `sanitizeTitle`.
- `createList({ id, name, items })`, `starterList(items)`.
- `addItem(list, { title, url })`, `removeItem(list, itemId)`,
  `moveItem(list, itemId, delta)`, `updateItemTitle(list, itemId, title)`,
  `updateItemUrl(list, itemId, url)`, `renameList(list, name)`.
- `structureKey(items)` / `sameStructure(a, b)`.
- `normalizeRecord(record)` (v2 → v3) and `isResumableRecord(record, ids)`.

### `src/share.js`

- `encodeList(list, options)` → `Promise<string>`.
- `decodeList(code, options)` → `Promise<{ name, items } | null>`.
- `PREFIX`, `RAW_PREFIX`, `MAX_CODE_LENGTH`, `MAX_DECODED_BYTES`.
- `CompressionStream` / `DecompressionStream` are injectable for tests.

### `src/youtube.js`

- `normalizeYouTubeUrl(input)` → canonical watch URL or `null`.
- `oembedUrl(watchUrl)`.
- `fetchVideoTitle(url, { fetchImpl })` → title or `null`.

### `app.js`

Owns the library state, active list, bracket, editor, share modal, and all wiring
to the existing screens and imports. `persist()` writes the v3 record.

## Tests

- `test/lists.test.js`: name/title sanitation, unique names, add/remove/move/
  reindex, URL and title edits, limits, structure comparison, starter shape,
  v2 → v3 migration (custom, default, corrupt), and `isResumableRecord`
  rejecting duplicates and foreign ids.
- `test/share.test.js`: round-trip compressed and raw codes, Unicode, quotes,
  whitespace, foreign prefix, malformed base64/JSON, version and shape
  rejection, item and byte caps, and the raw fallback.
- `test/youtube.test.js`: URL normalisation for every supported form, oEmbed
  URL encoding, title success, HTTP failure, invalid JSON, blank title, and
  network rejection.
- `test/cache.test.js`: version bumped to 3; URL-keyed cache only.

Manual checks: build a list, reload, resume, switch lists (with and without a
run), edit titles versus structure, duplicate the starter, share and re-import,
and 320 / 768 px layouts with reduced motion.

## Documentation

Update `README.md` with the library workflow and share codes, and `design.md`
with the library card, editor row, and share modal conventions.

## Risks and mitigations

- **Run loss on switch.** Explicit Use + a single alert; no bare dropdown.
- **Decompression bombs.** Input and output caps, streaming read that aborts
  above the cap, and strict shape validation.
- **Unicode and emoji.** Byte-based base64 with `TextEncoder`/`TextDecoder`.
- **Reindex cache corruption.** Only the URL-keyed cache is persisted; clears
  the in-memory id cache after structural edits.
- **Migration loss.** Raw v2 backup before the first v3 save; tolerated
  corrupt records.
- **Title fetch failure or rate limits.** oEmbed failure falls back to the
  video id; adding never blocks on it permanently.

## Left to the builder

- Exact spacing of library cards and editor rows.
- Whether the share modal opens on Share or Import by default.
- The precise wording of the run-ending alert.
