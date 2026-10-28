# List Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep several named YouTube ranking lists in the browser, edit them in-app, and share one as a single code string.

**Architecture:** One versioned localStorage record holds `lists` plus the active list's bracket. Pure modules own list CRUD, v2 → v3 migration, share encoding, and YouTube title lookup. A fourth screen plus a share modal provide the UI; the tournament engine is untouched.

**Tech Stack:** Vanilla ES modules, `CompressionStream('deflate-raw')`, YouTube oEmbed, `node --test`, existing design tokens.

**Spec:** `docs/superpowers/specs/2026-10-28-list-library-design.md`

## Global Constraints

- No dependencies, build step, backend, account, OAuth, API key, or EventSub.
- Keep `index.html`, `tokens.css`, `styles.css`, `app.js`, and `src/*.js`.
- One storage key, `anime-op-ed-ranker/v1`, record version 3.
- The starter list is virtual (`starter`), read-only, sourced from `opening list.csv`.
- Only the active list carries `ids`, `winners`, and `fingerprint`.
- Switching or structural edits on the active list ends the run with one `alert()`, never a confirm.
- Title or list renames preserve progress.
- Share codes: `oped1:` + base64url(deflate-raw UTF-8 JSON), fallback `oped1u:` + base64url(UTF-8 JSON).
- Decode caps: 200,000 input characters, 256 KB decoded output, 500 items.
- Names 80 chars, titles 200 chars, lists 500 items.
- No persisted id-keyed resolve cache; only the URL-keyed `videos` cache.
- Update `README.md` and `design.md`; run `node --test`; commit per task.

## Review Focus

- Title rename keeps resume; adding/removing/reordering/URL edit clears it.
- Switching lists warns once before losing winners and never switches silently.
- Duplicating the starter yields an editable copy and does not activate it.
- Share round-trips Japanese titles, emoji, quotes, and newlines; foreign or
  truncated codes fail cleanly; decompression is bounded.
- v2 saves migrate without losing a custom source, videos cache, or bracket.
- With the library untouched, today's start → rank → results flow is identical.

---

### Task 1: List model and migration

**Files:**
- Create: `src/lists.js`
- Test: `test/lists.test.js`

**Interfaces:**
- Produces: constants `STARTER_ID`, `STARTER_NAME`, `MAX_ITEMS`,
  `LIST_NAME_MAX`, `ITEM_TITLE_MAX`; helpers `sanitizeName`, `sanitizeTitle`,
  `uniqueName`, `makeListId`, `createList`, `starterList`, `addItem`,
  `removeItem`, `moveItem`, `updateItemTitle`, `updateItemUrl`, `renameList`,
  `structureKey`, `sameStructure`, `normalizeRecord`, `isResumableRecord`.

- [ ] **Step 1: Write failing tests** covering sanitation and unique names,
  CRUD with reindexing, item/title limits, structure comparison, starter shape,
  v2 custom/default migration, corrupt input, and resume rejection for
  duplicates/foreign ids.
- [ ] **Step 2: Implement `src/lists.js`** with immutable operations returning
  new lists (`null` when an operation is invalid).
- [ ] **Step 3: Run `node --test test/lists.test.js`** until green.
- [ ] **Step 4: Commit.**

### Task 2: Share codes

**Files:**
- Create: `src/share.js`
- Test: `test/share.test.js`

**Interfaces:**
- Produces: `PREFIX`, `RAW_PREFIX`, `MAX_CODE_LENGTH`, `MAX_DECODED_BYTES`,
  `encodeList(list, options)`, `decodeList(code, options)`.

- [ ] **Step 1: Write failing tests** for compressed and raw round trips,
  Unicode, malformed input, caps, and the compression fallback.
- [ ] **Step 2: Implement** byte-based base64url, streaming compress/decompress
  with output caps, and strict payload validation.
- [ ] **Step 3: Run the share tests.**
- [ ] **Step 4: Commit.**

### Task 3: YouTube title lookup

**Files:**
- Create: `src/youtube.js`
- Test: `test/youtube.test.js`

**Interfaces:**
- Produces: `normalizeYouTubeUrl`, `oembedUrl`, `fetchVideoTitle`.

- [ ] **Step 1: Write failing tests** for every supported URL form, oEmbed URL
  encoding, success, failure, and invalid payloads.
- [ ] **Step 2: Implement** the module with injected `fetchImpl`.
- [ ] **Step 3: Run the tests and commit.**

### Task 4: Storage and cache

**Files:**
- Modify: `src/cache.js`, `src/storage.js`, `test/cache.test.js`
- Test: `test/storage.test.js` (new)

- [ ] **Step 1: Update cache tests** to version 3 and URL-keyed helpers only.
- [ ] **Step 2: Implement** `RECORD_VERSION = 3`, remove `cacheEntries` /
  `hydrateEntries`, add `loadRaw` / `saveBackup` to storage.
- [ ] **Step 3: Run the tests and commit.**

### Task 5: Library and editor markup and styles

**Files:**
- Modify: `index.html`, `styles.css`
- Add: `#lists-screen`, library and editor views, `#share-modal`, a Lists
  button on the start screen.
- Test: extend `test/styles.test.js` for the new card/row/modal rules.

- [ ] **Step 1: Add markup** with semantic headings, labels, and live regions.
- [ ] **Step 2: Add CSS** using existing tokens, 44 px targets, and 320 px
  resilience.
- [ ] **Step 3: Run the style tests and commit.**

### Task 6: Wire library, editor, and activation in `app.js`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Replace `customSource` state** with `library` plus
  `activeListId`; load, migrate, back up, and hydrate the v3 record.
- [ ] **Step 2: Implement** persistence, library rendering, activation with the
  run-ending alert, editor rendering, add/remove/move/url/title edits, and
  starter duplication.
- [ ] **Step 3: Rewire** Start, Resume, Reset, CSV upload, and playlist import
  to lists.
- [ ] **Step 4: Manually verify** reload, resume, switching, and editing; run
  `node --test`; commit.

### Task 7: Share and import UI

**Files:**
- Modify: `app.js`, `index.html`

- [ ] **Step 1: Implement** the share modal open/close, focus trap, copy, and
  import with unique names and status messages.
- [ ] **Step 2: Verify** round trip and malformed codes manually.
- [ ] **Step 3: Run `node --test` and commit.**

### Task 8: Documentation and final verification

**Files:**
- Modify: `README.md`, `design.md`

- [ ] **Step 1: Document** the library workflow, share codes, and module map.
- [ ] **Step 2: Document** the library card, editor row, and share modal in the
  design system.
- [ ] **Step 3: Run `node --test` and a full manual pass.**
- [ ] **Step 4: Commit.**
