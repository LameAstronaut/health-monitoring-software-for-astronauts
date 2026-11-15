PYTHON := $(CURDIR)/backend/.venv/bin/python
SIMULATOR := simulator/target/debug/astra-simulator

.PHONY: help setup dev backend frontend simulator check smoke contracts e2e server-config server-up server-check server-backup

help:
	@printf '%s\n' 'make setup     Install locked dependencies and apply local migrations' 'make dev       Start API, dashboard and synthetic simulator; Ctrl+C stops all' 'make check     Run tests, lint, type checks and production build' 'make smoke     Exercise API, Rust, database and Vite REST/WebSocket proxy' 'make contracts Regenerate JSON schemas and TypeScript API types'
	@printf '%s\n' 'make server-config ORIGIN=https://host  Configure server hosting' 'make server-up     Build and start all services on this server (Docker access required)' 'make server-check  Verify the hosted stack' 'make server-backup Create a consistent database snapshot'

setup:
	test -f .env || cp .env.example .env
	python3 -m venv backend/.venv
	$(PYTHON) -m pip install -r backend/requirements.lock
	$(PYTHON) -m pip install --no-deps -e backend
	npm ci --prefix frontend
	cargo build --locked --manifest-path simulator/Cargo.toml
	cd backend && .venv/bin/alembic upgrade head

dev:
	cargo build --locked --manifest-path simulator/Cargo.toml
	$(PYTHON) scripts/dev.py

backend:
	cd backend && .venv/bin/alembic upgrade head && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

frontend:
	npm run dev --prefix frontend

simulator:
	cargo run --locked --manifest-path simulator/Cargo.toml -- --controlled

check:
	cd backend && .venv/bin/pytest -q
	cd backend && .venv/bin/ruff check app tests alembic ../scripts
	cd backend && .venv/bin/ruff format --check app tests alembic ../scripts
	cd backend && .venv/bin/bandit -q -r app
	cargo fmt --manifest-path simulator/Cargo.toml --check
	cargo clippy --locked --manifest-path simulator/Cargo.toml -- -D warnings
	cargo test --locked --manifest-path simulator/Cargo.toml
	npm run lint --prefix frontend
	npm run format:check --prefix frontend
	npm test --prefix frontend
	npm run build --prefix frontend

smoke:
	cargo build --locked --manifest-path simulator/Cargo.toml
	$(PYTHON) scripts/smoke.py --frontend

contracts:
	$(PYTHON) scripts/export-openapi.py
	npm run generate:api --prefix frontend

e2e:
	cargo build --locked --manifest-path simulator/Cargo.toml
	npm run test:e2e --prefix frontend

server-config:
	python3 scripts/configure_server.py --origin "$(ORIGIN)"

server-up:
	bash scripts/server.sh up

server-check:
	bash scripts/server.sh check

server-backup:
	bash scripts/server.sh backup
