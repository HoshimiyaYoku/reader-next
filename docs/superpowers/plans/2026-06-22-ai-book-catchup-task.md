# AI Book Catch-up Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible AI资料 catch-up task that can start/pause from the AI资料 page while the Rust backend keeps processing chapters after the frontend closes.

**Architecture:** Keep the first version boring: one in-memory backend task per `(user_ns, book_url)`, serial chapter processing, frontend polling. Each completed chapter saves AI memory immediately, so server restart only loses task state, not completed AI资料.

**Tech Stack:** Rust axum/tokio/reqwest/serde_json/sqlx, Vue 3 + Pinia + Axios + Vitest.

---

## File Structure

- Create `src/model/ai_book_catchup.rs`: request/response/status DTOs plus JSON camelCase contract.
- Create `src/service/ai_book_catchup_service.rs`: in-memory task registry, start/pause/status logic, serial worker loop, minimal model JSON update.
- Modify `src/service/mod.rs`: export the new service.
- Modify `src/api/mod.rs`: add `ai_book_catchup_service` to `AppState`.
- Modify `src/app/bootstrap.rs`: construct the new service.
- Modify `src/api/handlers/ai_book.rs`: add `start/status/pause` handlers near existing AI book memory handlers.
- Modify `src/api/router.rs`: add `/reader3/aiBookCatchup/start`, `/reader3/aiBookCatchup/status`, `/reader3/aiBookCatchup/pause`.
- Modify `src/model/mod.rs`: export the new model.
- Modify `frontend/src/types/index.ts`: add catch-up DTO types.
- Modify `frontend/src/api/aiBook.ts`: add API functions.
- Modify `frontend/src/views/AiBookView.vue`: replace/augment the manual button with progress panel and start/pause polling.
- Add/modify tests:
  - `src/service/ai_book_catchup_service.rs` unit tests for status transition and pause flag.
  - `frontend/src/stores/aiBook.test.ts` or new API-light tests if needed for polling helpers.

## Tasks

### Task 1: Backend DTO and in-memory service skeleton

**Files:**
- Create: `src/model/ai_book_catchup.rs`
- Create: `src/service/ai_book_catchup_service.rs`
- Modify: `src/model/mod.rs`
- Modify: `src/service/mod.rs`

- [x] Write failing Rust tests in the service module for:
  - a started task status reports `running`, `startChapterIndex`, `targetChapterIndex`, `totalChapters`.
  - pausing a running task flips a shared pause flag and returns status `pausing`/`paused` without deleting progress.
- [x] Run: `cargo test --lib ai_book_catchup_service`
- [x] Implement DTOs and service skeleton with `Arc<RwLock<HashMap<String, AiBookCatchupTaskState>>>`.
- [x] Run the same test until green.

### Task 2: Backend worker loop and model update

**Files:**
- Modify: `src/service/ai_book_catchup_service.rs`

- [x] Add tests for applying a model JSON response into memory using a small fake response payload.
- [x] Run: `cargo test --lib ai_book_catchup_service`
- [x] Implement serial worker logic:
  - load current memory;
  - skip if already at target;
  - fetch chapter content;
  - call text model using server `AiModelService` config;
  - parse JSON content;
  - save memory with `AiBookService`;
  - update task state after every chapter;
  - stop after current chapter when pause requested.
- [x] Keep model prompt/schema minimal and backend-only; no map generation in this task.
- [x] Run targeted tests.

### Task 3: Backend HTTP handlers/routes/state wiring

**Files:**
- Modify: `src/api/mod.rs`
- Modify: `src/app/bootstrap.rs`
- Modify: `src/api/handlers/ai_book.rs`
- Modify: `src/api/router.rs`

- [x] Add handlers for start/status/pause reusing existing `resolve_user_ns`, `required_book_url`, `ensure_shelf_book` helpers.
- [x] Start handler computes chapter list and current memory, clamps start/target, then calls service start.
- [x] Status handler returns existing task state or idle derived from saved AI memory.
- [x] Pause handler sets pause flag.
- [x] Run: `cargo test --lib ai_book_catchup_service` and `cargo check`.

### Task 4: Frontend API/types and AI资料 progress UI

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/aiBook.ts`
- Modify: `frontend/src/views/AiBookView.vue`

- [x] Add DTO types and API functions.
- [x] Add status state + polling in `AiBookView.vue`.
- [x] Replace the header one-shot button behavior with:
  - start/continue button;
  - pause button when running/pausing;
  - progress bar and current chapter text;
  - refresh memory after completed/paused/failed status.
- [x] Keep existing `updateToCurrent()` only if needed as fallback, but prefer backend start endpoint.
- [x] Run: `cd frontend && npm test -- aiBook` or the smallest relevant Vitest command available.

### Task 5: Full verification and review

**Files:** all changed files.

- [x] Run `cargo test --lib ai_book_catchup_service`.
- [x] Run `cargo check`.
- [x] Run `cd frontend && npm test` if dependencies are installed; otherwise run `cd frontend && npm run build` after `npm install` if needed.
- [x] Review `git diff` for unrelated changes.
- [x] Dispatch reviewer subagent with the full diff.
