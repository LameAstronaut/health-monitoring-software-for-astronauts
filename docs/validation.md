# Codebase audit verification

Verified locally on 2026-11-15 on Arch Linux with Python 3.14, Node 26 and Chromium.
Data workspace, its reference-table endpoints and associated tests were subsequently removed at the user’s request. The counts below record the preceding audit.
Removal verification: 111 backend tests, 155 frontend tests, 23 Rust tests and five targeted
browser workflows passed, together with lint, formatting, type checking and the production build.
The subsequent manual telemetry editor removal passed 154 frontend tests, four targeted
browser workflows (screen layouts, body regions, sleep and weight), lint, formatting,
type checking and the production build. Simulator API fixtures remain available to tests.

These results describe the audited revision; they do not establish clinical validity or
prove the absence of all defects.

| Check | Verified result |
| --- | --- |
| Backend pytest | 115 passed, including migrations, persisted checkpoints, malformed input, timestamps, alerts, examination lifecycle, inventory, fitness, EVA and public-demo settings |
| Frontend Vitest | 157 passed across 24 files |
| Rust | 23 passed; rustfmt and clippy with warnings denied passed |
| Playwright | 29 passed against the real Rust/FastAPI/Vite stack |
| Full repository checks | `make check` passed: tests, Ruff, Bandit, ESLint, Prettier, TypeScript and production build |
| Cross-process integration | `scripts/smoke.py --frontend` passed: Rust → HTTP → SQLite → WebSocket, Vite proxy, invalid packets, disconnect and API restart |
| Generated contracts | OpenAPI/TypeScript/telemetry schema regenerated without changes |
| Production assets | Root and `/mission/` builds passed; prefixed assets and bundled body images/portraits checked |
| Dependency advisory checks | npm audit and pip-audit of the locked Python requirements reported no known vulnerabilities |
| Server script syntax | `bash -n` passed for the server and Ubuntu/Debian bootstrap scripts |

The browser suite exercises every navigation destination and crew selection; examination
acquisition/review/save/export/reload; weekly calendar and reminders; meals and inventory;
fitness/recovery; EVA checklist/timeline; manual telemetry and faults; alert priority,
focus, acknowledgment, minimization, audio/mute and reduced motion; mood; reaction practice
and persisted averages; body regions; reference-table imports and editable revisions;
sleep/weight; vehicle radiation pause/restart and crew independence.

The full-screen sweep checks every screen at widths 320, 390, 640, 768, 1366 and 1920 px
for horizontal overflow, JavaScript page errors, unloaded images and unlabeled form controls.
Additional dashboard readability and keyboard checks run at 1366×768, 1920×1080 and
1024×768. Test evidence is saved under `frontend/test-results/<test-name>`; tests no longer
overwrite curated presentation screenshots.

## Fixes from this audit

- Isolated observations and ECG immediately during crew switches; retained stable array
  references between clock ticks and memoized unchanged trend charts.
- Added automatic full-snapshot retries and preserved buffered stream events when a snapshot
  fails. Delayed alert-creation events cannot undo an acknowledgment, and pending alerts
  precede acknowledged history in bounded API/stream results.
- Selected body/risk records by source time across observations and saved reports, scoped
  them to the selected crew, and marked invalid results instead of displaying their numbers.
- Enclosed alert evidence tables in keyboard-scrollable regions to fix mobile page overflow.
  Confined alert flashing to its icon at a one-second period; reading surfaces stay steady.
  Recovery/navigation attention pulses change borders, retaining reduced-motion support.
- Cleared manual overrides when exercise/recovery begins, used source time for session peaks,
  used the server clock for elapsed session time and clamped negative durations. Prevented
  paused or deceased-crew EVA starts and deceased-crew exercise starts.
- Rejected backward vehicle-radiation timestamps and malformed NASA source URLs.
- Used indexed latest-packet observations for complete crew summaries instead of aggregating
  the entire telemetry history on every poll, retaining sparse-packet fallback behavior.
- Corrected asset paths for deployments under a URL prefix; expanded initial telemetry
  snapshots to the advertised 2,400-observation session limit.
- Fixed stale smoke-test counts, browser fault-application steps, removed-control assertions,
  shared-alert leakage between scenarios and assumptions that restart deletes saved reports.
  Isolated test deployment settings from production/GitHub Pages environment settings.
- Corrected formatting failures and stale current-scope documentation.

## Limits and remaining work

No Docker trial, Oracle deployment, or native Ubuntu/Debian host run was performed. The
server scripts and public-demo API behavior have local automated coverage; deployment
readiness still requires verification on the destination server. Other browser engines,
long-duration load/retention and formal accessibility/medical assurance remain unverified.
Reaction practice results remain browser-local as documented; a shared reaction-results API
and ground synchronization are not implemented.

The backend test run emits upstream Starlette/httpx and legacy SQLite fixture datetime
adapter deprecation warnings. Vite may log EPIPE/ECONNRESET when browser navigation closes
a proxied WebSocket; the complete browser suite passes and owned test processes shut down.
