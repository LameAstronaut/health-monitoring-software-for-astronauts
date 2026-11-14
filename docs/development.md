# Run ASTRA HEALTH locally

Requirements: Python 3.11+, Node 24 LTS or newer, stable Rust (tested with 1.99.1),
npm and Git. Internet is needed only for dependency/browser installation.
All commands below start at the repository root unless `cd` is shown.

## Quick start on Arch Linux

The foundation is tested on Arch Linux with the distribution's `python`, `nodejs`,
`npm`, `rust`, `gcc`, and `make` packages. Run from this checkout:

```bash
make setup
make dev
```

Open **http://127.0.0.1:5173**. `make dev` starts the API, Vite and the controlled Rust
simulator, applies migrations, and waits for the API through the frontend proxy.
Press **Ctrl+C** to stop all three processes. Setup creates `.env` only if it does
not exist; the launcher shares its configured token with Rust without sending it
to the browser. Use `backend/.venv/bin/python scripts/dev.py --no-simulator` to
inspect the initial NO DATA state, or add `--check` to verify startup and shut down.
You can choose `--api-port` and `--ui-port` for an isolated local stack. Occupied ports
fail visibly. If only Rust exits, API/UI remain available and telemetry expires normally.
API restart pauses playback; explicitly resume in Simulator controls.

`make check` runs all tests, linters, type checks and the UI build. `make smoke`
exercises the real HTTP/WebSocket path through Vite using temporary databases and
ports. No medical hardware or external service is needed. Manual process commands
are retained below for development and debugging.

```bash
cp .env.example .env
python -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock
backend/.venv/bin/python -m pip install --no-deps -e backend
npm ci --prefix frontend
cargo build --locked --manifest-path simulator/Cargo.toml
```

Apply migrations, then start the API (terminal A):

```bash
cd backend
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The default SQLite database is `backend/astra.db` when started here. A relative database
URL is relative to the backend's working directory; migrate and serve from the same directory.
Set an absolute SQLite URL if running elsewhere. To change the token, edit `.env` and
export the same `ASTRA_DEMO_TOKEN` in the simulator shell. Never put it in Vite variables.

Start UI (terminal B):

```bash
npm run dev --prefix frontend
```

Open **http://127.0.0.1:5173**. The Vite proxy sends REST and WebSocket traffic to the
local API. Use that exact origin (not localhost) with the default CORS/WS configuration.
API documentation: **http://127.0.0.1:8000/docs**.

Start simulator (terminal C):

```bash
cargo run --locked --manifest-path simulator/Cargo.toml -- --controlled
```

The UI's Simulator controls select REST, EXERCISE, RECOVERY and ANOMALY, pause/resume,
restart, seed, speed and faults. Run one publisher. Ctrl+C stops acquisition. A separate
fixed-scenario CLI run (which ignores UI playback controls) can test gradual anomalies:

```bash
cargo run --locked --manifest-path simulator/Cargo.toml -- --scenario ANOMALY --speed 4 --seed 42 --count 12
```

Available flags: `--scenario`, `--seed`, `--api-url`, `--rate-hz` (0.1–20), `--count`
(0 means unlimited), `--speed` (0.25–4), `--controlled`, and `--demo-token` (prefer
ASTRA_DEMO_TOKEN). Scenarios include REST (normal), EXERCISE, RECOVERY, ANOMALY and legacy
anomaly aliases, sensor_disconnect and invalid_packet. Anomalies evolve gradually;
only the legacy disconnect/invalid-packet tests switch delivery/schema at tick five.
The CLI retries identical packets up to four attempts with bounded exponential backoff;
it stops with an error if the packet cannot be delivered. It does not create a durable sender queue.

## Browser interaction and visual tests

```bash
frontend/node_modules/.bin/playwright install chromium
make e2e
```

Tests start a separate temporary database and API/UI at ports 18000/15173, then stop
their owned processes. They exercise acquisition/review/save/export/reload, navigation,
crew selection, pause/expiry, scenarios, faults, nutrition, fitness, EVA and alert review.
Readability checks cover 1366×768, 1920×1080 and 1024×768, including keyboard navigation,
44 px buttons, body/heading/metric sizing and horizontal overflow. Screenshots are written
to `artifacts/screenshots`. See [visual review](visual-review.md).

On this Arch host, the downloaded Chromium fallback was installed under `/tmp/astra-playwright`:
`PLAYWRIGHT_BROWSERS_PATH=/tmp/astra-playwright make e2e`. For your own checkout, use the
default browser install path unless you intentionally configure another path. Runtime
requires no Internet after application dependencies and the test browser are installed.

## Checks

```bash
cd backend
.venv/bin/pytest -q
.venv/bin/ruff check app tests alembic ../scripts
.venv/bin/ruff format --check app tests alembic ../scripts
.venv/bin/bandit -q -r app
cd ..
cargo fmt --manifest-path simulator/Cargo.toml --check
cargo clippy --locked --manifest-path simulator/Cargo.toml -- -D warnings
cargo test --locked --manifest-path simulator/Cargo.toml
npm run lint --prefix frontend
npm run format:check --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
backend/.venv/bin/python scripts/smoke.py
```

The smoke script starts its own temporary API/database, runs Rust scenarios, verifies
stream delivery, durable records, rule priority, disconnect expiry and restart history.
It requires installed Python dependencies and the built Rust binary.
Pass `--frontend` (or use `make smoke`) to include Vite's page entry point and REST/WS proxy.

Regenerate shared REST types:

```bash
backend/.venv/bin/python scripts/export-openapi.py
npm run generate:api --prefix frontend
```

Commit both generated files. CI checks regeneration does not change them. Update lockfiles
when upgrading dependencies; `requirements.lock` pins the tested Python environment,
`package-lock.json` pins npm and `Cargo.lock` pins Rust. For Python upgrades, regenerate
the lock from a clean virtualenv using `pip freeze --exclude-editable`.

The same exporter also writes `contracts/telemetry.schema.json`. Its matching synthetic
example is `contracts/telemetry.example.json`; tests keep the schema aligned with Pydantic.
The JSON Schema describes structure; the backend additionally checks canonical units,
representation bounds, unique measurement codes, identity association and sequence/time order.

The frontend narrowly overrides the linter's minimatch dependency to a patched 11.x
release. Keep the override until the upstream parser updates its dependency, and rerun
lint, type generation and tests when changing it.

Build output is `frontend/dist`. `vite preview` is a static preview, not an integrated
deployment server: a deployment needs a reverse proxy for `/api` including WS upgrades.
No public deployment, credentials service, ground-sync service or hardware is required.
Project licensing has not been selected by the repository owner; no license is assumed.
