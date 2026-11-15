# Host the complete app on Ubuntu or Debian

The frontend, FastAPI, Rust simulator, SQLite database, and HTTPS gateway all run
on your server. The scripts also build the app on that server. GitHub holds the
source; no Pages, separate frontend host, or publishing app images to a registry
is required. Setup downloads the base images and build dependencies normally.

The existing interface and controls are preserved. There is no added login or
operator role. Visitors share the same synthetic demo state. Reaction practice
results and interface preferences retain their existing browser-local behavior;
server records such as mood, examinations, and telemetry are shared.

Supported bootstrap targets: Ubuntu 22.04/24.04/26.04/26.10 and Debian 12/13,
on amd64 or arm64. Python, Node, and Rust application versions come from the
container build stages, avoiding dependence on the distribution's application
toolchain versions. Oracle Ampere ARM instances build native ARM images.

## Initial setup on the server

Clone this repository on the VM, then run from its root:

```sh
sudo bash scripts/bootstrap-ubuntu-debian.sh
bash scripts/server.sh configure https://demo.example.com
sudo bash scripts/server.sh up
```

Replace the hostname with your own. Point its DNS at the VM and allow TCP 80/443
through Oracle's network rules. Account for any existing web services using those
ports. The bootstrap does not change OCI rules or remove existing software.

The bootstrap installs prerequisites and Docker Engine/Compose using Docker's
official repository for the detected Ubuntu/Debian release. If existing packages
conflict, it stops with an explanation instead of removing them. It enables the
Docker service at boot. See the official [Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
and [Debian](https://docs.docker.com/engine/install/debian/) instructions.

For initial access by IPv4 address without a domain:

```sh
bash scripts/server.sh configure http://YOUR_SERVER_IP
sudo bash scripts/server.sh up
```

HTTP with a custom port is also supported, such as `http://YOUR_SERVER_IP:9080`.
Use a real hostname with the HTTPS example for automatic TLS certificates.
Both OCI network rules and Docker-published ports affect reachability; do not
assume UFW alone controls Docker traffic. See Docker's firewall notes in the
installation instructions.

`configure` writes ignored `deploy/server.env` with mode 0600 and a generated
worker secret. Reconfiguring the origin preserves that secret. No secret is
printed or passed into the frontend. `deploy/server.env.example` documents the
fields. Keep the real file outside Git.

`up` builds the API/Rust image and frontend/gateway image sequentially to limit
peak build memory, applies migrations, and starts all services. It then runs a
readiness check against the configured public origin. DNS and public routing
must work for that check; if they do not, the containers remain running so you
can inspect logs and correct configuration.

## Commands

| Action | Command |
| --- | --- |
| Start/build or apply the current checkout | `sudo bash scripts/server.sh up` |
| Update after pulling source | `sudo bash scripts/server.sh update` |
| Service status | `sudo bash scripts/server.sh status` |
| Follow bounded logs | `sudo bash scripts/server.sh logs` |
| Check frontend, assets, REST, WebSocket and worker | `sudo bash scripts/server.sh check` |
| Make a consistent database snapshot | `sudo bash scripts/server.sh backup` |
| Stop services, retaining data | `sudo bash scripts/server.sh stop` |

`make server-config ORIGIN=https://demo.example.com` is an alternative to
`configure`. `make server-up`, `make server-check`, and `make server-backup`
require the same Docker access as their script equivalents.

To update the hosted app:

```sh
git pull --ff-only origin main
sudo bash scripts/server.sh update
```

The script builds before stopping the current services. If an API is running,
it creates a database snapshot before the restart. It recreates the worker
alongside the API so their private network namespace stays consistent. Automatic
GitHub-triggered deployment is a separate wiring step once server access is known;
these commands do not require publishing images or assets to another host.

## Persistence and restarts

Compose project `memento-mori` owns persistent volumes for the application database
and Caddy certificates/configuration. Services use `restart: unless-stopped`.
The API and worker use one SQLite volume and one simulator publisher. Repeated
`up`/`update` calls retain the database, saved reports, and checkpointed runs.

The `public_demo` backend profile preserves the user's running/paused choice on
API restart; local development still pauses on restart as before. Existing
request validation and browser-origin checks remain. Only the gateway has public
ports, and worker ingestion/runtime routes are blocked at that gateway.

Backups are stored at `/data/backups` in the application volume, created using
SQLite's backup API and checked with `PRAGMA quick_check`. A snapshot in that
volume protects against a bad application update; copy important snapshots off
the VM for protection against disk/instance loss. For example:

```sh
sudo docker compose --project-name memento-mori --env-file deploy/server.env \
  -f deploy/compose.yaml cp api:/data/backups ./deploy/backups
```

For restoration, stop all services first, preserve the current database, and
restore a chosen snapshot into the database volume with the service's ownership
(UID 10001). Check migration compatibility before restarting. Do not remove
volumes to update the application. Long-running telemetry also needs disk-space
monitoring and a retention policy; the scripts do not delete historical records.

## Files and deployment checks

- `deploy/Dockerfile`: Debian-based build/runtime stages for Node, Rust, Python,
  and the Caddy frontend gateway.
- `deploy/compose.yaml`: all services, private networking, persistent volumes,
  health checks, restart policies, and log-size limits.
- `deploy/Caddyfile`: production static assets, SPA fallback, REST/WebSocket
  proxying, HTTPS, and private-route exclusions.
- `scripts/server_api.py`: one migration step followed by a single API worker.
- `scripts/check_server.py`: opt-in verification run by `server.sh up/check` on
  the actual server, including live radiation readings and private-route checks.

The frontend build uses `/` explicitly. The previous GitHub Pages workflow is
manual-only so commits no longer automatically publish a separate frontend copy.
The local development workflow remains available, and `make setup` uses `python3`
for compatibility with Ubuntu/Debian's executable naming.

Verification for this change is limited to script checks, backend tests, and the
frontend production build. No Docker trial or remote installation was performed,
as requested. The server readiness command is included for the eventual deployment.
