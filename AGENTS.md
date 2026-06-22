# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Local Private Context

- Before any VPS/deployment work, also read the local-only file included below if it exists.
- Keep real VPS host, username, SSH password or private-key notes in `AGENTS.local.md`; do **not** commit those values.
- `AGENTS.local.md` is intentionally ignored by git. If a value is missing, ask the user instead of guessing.
- Do not print secrets, private keys, or passphrases in final answers, logs, PR bodies, or commits.

@/Users/maple/Documents/reader/AGENTS.local.md

## Development Workflow

1. Develop on the local MacBook Air in `/Users/maple/Documents/reader`.
2. For non-trivial development tasks, use Superpowers first, use CodeGraph before code exploration/edits, and follow RTK guidance from `/Users/maple/.codex/RTK.md`.
   - If CodeGraph is not initialized, run `codegraph init && codegraph index` before architecture/symbol analysis.
   - Prefer CodeGraph for symbol lookup, call graphs, feature tracing, and impact checks; use `rg` only for raw text or confirmation.
3. Run the narrowest relevant local checks before pushing. Common checks:
   - Backend: `cargo test` or a focused `cargo test <name>`
   - Frontend: `cd frontend && npm test` / `npm run build` as relevant
   - Formatting/sanity: `git diff --check`
4. Commit focused changes locally, then push to GitHub.
5. Deployment is GitHub-driven: pushing/merging to `main` automatically triggers the existing GitHub Actions deploy workflow. Do not duplicate GitHub Actions secret details here.
6. After push, verify the GitHub Actions run and, when needed, verify the live VPS service directly.

## Commands

### Rust Backend
```bash
cargo run                    # Dev mode
cargo build --release        # Release build
cargo test                   # All tests
cargo test --lib <test_name> # Single test
```

### Local Dev
- Default to single-port mode: build the frontend, run the Rust server, and open `http://localhost:18080`.
- Do not start the Vite dev server (`5173`) unless the user explicitly asks for frontend hot reload/debugging.
- Default backend port is `18080`; check it before starting: `lsof -i :18080`.
- If `18080` is occupied, use the next available port instead of reclaiming the process blindly.
- Prefer explicit port override for local runs: `SERVER_PORT=18080 cargo run`.

### Frontend
```bash
cd frontend && npm install && npm run dev    # Hot-reload frontend only; keep proxy aligned with SERVER_PORT
cd frontend && npm run build                 # Builds to frontend/dist/
```

## Configuration

Loaded from `.env` file (via `dotenvy`) or environment variables. Separator is `__` for nested keys. See `.env.example` for all options.

Key settings:
- `SERVER_HOST` / `SERVER_PORT` — default `0.0.0.0:18080`
- `DATABASE_URL` — SQLite path, default `sqlite:storage/reader.db?mode=rwc`
- `WEB_ROOT` — static files path, default `frontend/dist`
- `SECURE` / `SECURE_KEY` — security mode toggle
- `INVITE_CODE` — registration gate
- `USER_LIMIT` / `USER_BOOK_LIMIT` — default 50 / 2000
- `LOG_LEVEL` — default `info`
- `REQUEST_TIMEOUT_SECS` — default 15

## Architecture

Rust implementation of "阅读3.0" — a book source reading API server.

### Module Structure
- `src/api/` — HTTP handlers & routing (axum), routes under `/reader3/*`
- `src/service/` — Business logic (book search, sources, users)
- `src/parser/` — Content extraction engine with rule-based parsing
- `src/crawler/` — HTTP fetching via reqwest
- `src/model/` — Data structures (BookSource, rules)
- `src/storage/` — SQLite (sqlx), file cache (MD5 key), filesystem ops
- `src/app/` — Config, logging, server setup
- `src/error/` — Error types
- `src/util/` — Utilities

### Request Flow
`api/handlers` → `service/` → `crawler/` (fetch) → `parser/rule_engine` (parse with BookSource rules) → JSON response

### Rule Parsing
`RuleEngine` auto-detects parsing mode:
- **CSS selectors** — default for HTML (`.class`, `#id`, `tag`)
- **JSONPath** — auto-detected for JSON (`$.data.list`)
- **XPath** — lines starting with `/` or `./`
- **JavaScript** — `js:` or `@js:` prefix (rquickjs)
- **Regex** — starts with `:`
- Explicit prefixes: `@css:`, `@json:`, `@xpath:`, `@regex:`

### Book Source Format
JSON objects with `bookSourceUrl`, `bookSourceName`, `searchUrl`/`exploreUrl` (with `${key}` placeholders), and `ruleSearch`/`ruleBookInfo`/`ruleToc`/`ruleContent` parsing rules.

## Important Notes

- **Frontend app**: `frontend/` is the Vue 3 + Vite frontend; production static files come from `frontend/dist/`.
- **Default local URL**: use the Rust server URL (`http://localhost:18080`) because it serves both `/reader3/*` APIs and `frontend/dist` static files.
- **`/storage/` is gitignored**: Contains user data and SQLite DB.
- **Tests exist**: prefer focused tests first, then broader `cargo test` / frontend checks when relevant.
