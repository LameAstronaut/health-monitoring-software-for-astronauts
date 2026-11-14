# Stateful operations verification

Verified locally on 2026-11-14 with Python 3.14.8, Node 26.12.1 and Rust 1.99.1:

- Backend: **39 pytest cases pass**, including the original validation/ordering tests,
  examination acquire/review/save/retrieve, source timestamps and stale acquisition rejection,
  timeout without invented results, persisted
  controls and checkpoints, safe restart, alert acknowledgment, inventory transactions,
  exercise/recovery requests, EVA gating/timeline and upgrade of original packet/alert data.
- Rust: **11 unit tests pass**, including resting stability, gradual correlated response,
  recovery, bounded seeded pulse/respiratory/combined anomalies and acute marker onset within 12 simulated seconds, seed/chunk determinism, checkpoint restore, ECG separation and static-report invariance.
  rustfmt and clippy with warnings denied pass; executable builds.
- Frontend: **23 unit/interaction cases pass**, covering navigation/crew selection, safe
  missing states, retry, examination requests and explicit review/save, meal logging,
  eleven risk categories, control conflicts, critical review, warning banners, minimize/reopen, acknowledgment failure/retry, critical escalation during warning review, controllable flashing, reduced motion and collapsed evidence, stale numerical/ECG values and run separation.
  TypeScript, ESLint, Prettier and production build pass.
- Browser: **11 Playwright cases pass** against real Rust/FastAPI/Vite, including
  acquisition/save/export/reload, all destinations, crew baselines, frozen pause time,
  stale/disconnected numeric and ECG while the API is connected, exercise/recovery,
  sensor loss, meals, fitness, EVA checklist/timeline, and prioritized acknowledged alerts, full-screen focus/minimize/reopen, and new pulse/respiratory fixtures at 1× speed, turn-signal flashing and reduced-motion behavior.
  Readability/keyboard/overflow/button checks pass at 1366×768, 1920×1080 and 1024×768.
- Integration: real Rust publisher → HTTP → SQLite → WebSocket passes, including both
  priority-ordered alerts, invalid packet rejection, sensor loss and API restart history.
- Vite integration: actual page entry point plus proxied health and WebSocket telemetry pass.
- One-command launcher: migration, API and Vite startup/readiness and automatic process
  shutdown verified on Arch Linux with a separate temporary database.
- Alembic 0001→0002 runs against fresh and original-schema temporary databases, retaining
  original observations and alerts. No application records were deleted by the migration.
- Clean `npm ci` succeeds. Python and npm audits reported no known vulnerabilities
  in the checked environment after patching development dependencies.
- Ruff and Bandit pass for the backend. OpenAPI export and TypeScript generation run.

`make check`, `make smoke`, and the Playwright suite pass. Screenshots and review are in
[visual-review.md](visual-review.md). The source reference PDF and owner-selected license
remain outstanding; the corresponding README checkboxes remain open.

Benign Starlette test-client and legacy sqlite fixture datetime deprecation warnings remain. Vite can log EPIPE/ECONNRESET when
development StrictMode or browser navigation closes a WebSocket; clients reconnect and
the browser tests pass. Test servers shut down their owned process groups.

Chromium rendering and screenshots were reviewed on this Arch Linux host. This is not a
formal accessibility/human-factors review. Other browsers, operating systems and toolchain
versions remain unverified. CI is configured but a remote GitHub Actions run has not been observed.
Rust vulnerability auditing, full failure injection, coverage targets, clinical validation,
and formal assurance remain unverified. These checks establish prototype behavior only.
