# AGENTS.md

## Workflow rules

- **Always create a git commit checkpoint before starting any significant change.** Commit the current working state first so there is a clean point to roll back to, then make the change.
- **Always commit after making changes.** Commit completed work without being asked.
- **Only push when explicitly asked.** Never run `git push` unless the user requests it.

## Project commands

- Run the site locally: double-click `Start.cmd` (Windows), or run `python -m http.server 8000` (or `npx serve`), then open `http://localhost:8000`. The site must be served over HTTP; it will not work via `file://`.
- Run tests: `node --test`
