# 006 — Remove dead easing tokens

- **Status**: TODO
- **Commit**: 05cc1f0
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`tokens.css`), 2–3 lines removed

## Problem

`tokens.css` defines three easing curves but only `--ease-out` is ever used.
`--ease-in` and `--ease-in-out` have zero references. `--ease-in` is
especially worth deleting: it is the one easing the motion philosophy bans on
UI, and leaving it in the token set invites a future misuse.

`tokens.css:48-50` — current:

```css
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
```

A grep for `--ease-in`/`--ease-in-out` across `styles.css`, `app.js`, and
`src/*.js` returns no matches.

## Target

Delete both unused declarations, keeping `--ease-out`:

```css
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
```

Also check `--dur-long`: after plans **002** and **004** it has no remaining
consumers. Run the grep in Step 2; if it returns no matches, delete the
`--dur-long: 420ms;` line too. If any file still uses it, leave it.

## Repo conventions to follow

- Motion tokens live in the `:root` block of `tokens.css` under the
  `--ease-*` / `--dur-*` group. Delete lines only; add nothing.
- Do not rename or reorder the surviving tokens.

## Steps

1. `tokens.css`: delete the `--ease-in` and `--ease-in-out` lines (49-50).
2. `tokens.css`: run `Select-String -Path styles.css,app.js,src/*.js -Pattern '--dur-long'`. If there are **no** matches, delete the `--dur-long: 420ms;` line; otherwise leave it and note why.
3. Re-run the grep for `--ease-in`/`--ease-in-out` to confirm zero references remain.

## Boundaries

- Do NOT touch `--ease-out`, `--dur-micro`, `--dur-short`, or `--dur-screen`.
- Do NOT change any `styles.css` rule.
- If `--dur-long` still has consumers (e.g. plans 002/004 not yet applied), leaving it is correct — do not force-remove it.
- If the cited lines differ from this excerpt (drift since `05cc1f0`), STOP and report.

## Verification

- **Mechanical**: `node --test` → 67 pass, 0 fail. `Select-String -Path tokens.css -Pattern 'ease-in'` → no matches. `Select-String -Path styles.css,app.js,src/*.js -Pattern '--ease-in|--ease-out'` → only `--ease-out` references.
- **Feel check**: run the site and confirm nothing regressed — button, panel, screen, and modal motion behave exactly as before (no token was in use).
- **Done when**: the two banned/unused easing tokens are gone and every remaining easing token is referenced at least once.

## Dependencies

- Independent, but **run last**: the `--dur-long` cleanup step only applies once plans 002 and 004 are in place.
