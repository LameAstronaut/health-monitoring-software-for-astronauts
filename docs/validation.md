# Scaffold verification

Verified locally on 2026-11-14 with Python 3.14.8, Node 26.12.1 and Rust 1.99.1:

- Backend: 19 pytest cases pass (schema, provenance, auth, idempotency, ordering,
  finite numbers, UTC normalization, expiry, restart persistence, alerts and WebSocket delivery).
- Rust: 4 unit tests pass; rustfmt and clippy with warnings denied pass; executable builds.
- Frontend: 5 tests pass (freshness, sample ordering/deduplication, reconnect, malformed
  frames and silent-stream expiry); TypeScript, ESLint, Prettier and production build pass.
- Integration: real Rust publisher → HTTP → SQLite → WebSocket passes, including both
  priority-ordered alerts, invalid packet rejection, sensor loss and API restart history.
- Alembic initial migration runs against fresh temporary databases in tests and smoke.
- Clean `npm ci` succeeds. Python and npm audits reported no known vulnerabilities
  in the checked environment after patching development dependencies.
- Ruff and Bandit pass for the backend. OpenAPI export and TypeScript generation run.

The sandbox blocked local socket operations; pytest and the cross-process smoke were
run with the required execution permission. A Starlette test-client deprecation warning
about its future HTTP client migration remains; the tests pass.

Browser rendering and keyboard interaction were not manually verified because no browser
preview tool was available. CI has been configured, but a remote GitHub Actions run has
not been observed. Other supported Python/Node/Rust versions have not been tested here.
Rust vulnerability auditing, full failure injection, coverage targets, clinical validation,
and formal assurance remain unverified. These checks establish prototype behavior only.
