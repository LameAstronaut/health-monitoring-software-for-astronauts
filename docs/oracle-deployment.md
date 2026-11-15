# Oracle deployment record

Deployment date: 2026-11-15. Application source revision: `f4f6ed9`.

- Host: `84.235.231.52`, SSH user `ubuntu`.
- OS: Ubuntu 24.04.4 LTS, amd64, approximately 1 GB RAM.
- Checkout: `/home/ubuntu/astronaut-health`.
- Configured public origin: `http://84.235.231.52`.
- Stack: Docker Compose project `memento-mori`, with API, simulator worker and Caddy/static frontend.
- A persistent 3 GB swap file supports builds on this small VM.
- Host firewall allows TCP 80/443. Oracle Cloud ingress must separately allow TCP 80.
- Private deployment configuration is in ignored `deploy/server.env`, with owner-only permissions.
  SSH keys and worker credentials are not stored in this repository.

The production images were built on the server using the existing deployment scripts.
All three services started, and the API health check passed. Verification through the
internal web gateway passed for HTML, JavaScript assets, REST, WebSocket (using the
configured public Origin), private worker-route blocking and the running simulator.

At this checkpoint public HTTP probes timed out. The Oracle Cloud port-80 ingress rule
was still awaiting configuration by the owner. Public browser access and HTTPS have
not been verified. The configured IP-only origin uses HTTP.

## Update and maintenance

After connecting with SSH, run:

```sh
cd /home/ubuntu/astronaut-health
git pull --ff-only origin main
sudo bash scripts/server.sh update
```

Status, readiness, backup and logs:

```sh
cd /home/ubuntu/astronaut-health
sudo bash scripts/server.sh status
sudo bash scripts/server.sh check
sudo bash scripts/server.sh backup
sudo bash scripts/server.sh logs
```

The normal readiness command uses the public origin and requires Oracle ingress to be
configured. Images and application data remain on this server; GitHub stores the source.
Compose restart policies restore services after a reboot. Do not commit `deploy/server.env`.
