# Run ASTRA HEALTH locally

Requirements: Python 3.11+, Node 24 LTS or newer, stable Rust with
edition 2024 support (1.85+), npm and Git. Internet is needed only for dependency installation.
All commands below start at the repository root unless `cd` is shown.

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
cargo run --locked --manifest-path simulator/Cargo.toml -- --scenario normal --seed 42
```

Ctrl+C stops acquisition. Test the one-shot combined anomaly fixture:

```bash
cargo run --locked --manifest-path simulator/Cargo.toml -- --scenario simultaneous_demo --seed 42 --count 8
```

Available flags: `--scenario`, `--seed`, `--api-url`, `--rate-hz` (0.1–20), `--count`
(0 means unlimited), `--demo-token` (prefer ASTRA_DEMO_TOKEN environment variable).
Scenarios: normal, oxygen_drop_demo, pressure_anomaly_demo, simultaneous_demo,
sensor_disconnect, invalid_packet. Faults occur at the sixth tick. Run one simulator at a time.
The CLI retries identical packets up to four attempts with bounded exponential backoff;
it stops with an error if the packet cannot be delivered. It does not create a durable sender queue.

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

Regenerate shared REST types:

```bash
backend/.venv/bin/python scripts/export-openapi.py
npm run generate:api --prefix frontend
```

Commit both generated files. CI checks regeneration does not change them. Update lockfiles
when upgrading dependencies; `requirements.lock` pins the tested Python environment,
`package-lock.json` pins npm and `Cargo.lock` pins Rust. For Python upgrades, regenerate
the lock from a clean virtualenv using `pip freeze --exclude-editable`.

The frontend narrowly overrides the linter's minimatch dependency to a patched 11.x
release. Keep the override until the upstream parser updates its dependency, and rerun
lint, type generation and tests when changing it.

Build output is `frontend/dist`. `vite preview` is a static preview, not an integrated
deployment server: a deployment needs a reverse proxy for `/api` including WS upgrades.
No public deployment, credentials service, ground-sync service or hardware is required.
Project licensing has not been selected by the repository owner; no license is assumed.
