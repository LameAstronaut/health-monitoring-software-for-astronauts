FROM node:24-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV ASTRA_FRONTEND_BASE_PATH=/
RUN npm run build

FROM rust:1-bookworm AS simulator-build
WORKDIR /build/simulator
COPY simulator/Cargo.toml simulator/Cargo.lock ./
COPY simulator/src ./src
ENV CARGO_BUILD_JOBS=1
RUN cargo build --release --locked

FROM python:3.12-slim-bookworm AS api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend
WORKDIR /app/backend
COPY backend/requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY backend/ ./
COPY scripts/server_api.py scripts/backup_database.py scripts/check_server.py /app/scripts/
COPY --from=simulator-build /build/simulator/target/release/astra-simulator /usr/local/bin/astra-simulator
RUN useradd --uid 10001 --create-home astra && mkdir /data && chown astra:astra /data
USER astra
EXPOSE 8000
CMD ["python", "/app/scripts/server_api.py"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-build /build/frontend/dist /srv
