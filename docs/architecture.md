# Prototype architecture

The README is the product specification. This implementation establishes the foundation
and the M1–M3 telemetry path, with an initial demo-only alert layer. It does not complete
all roadmap milestones. See [implementation status](implementation-status.md).

```mermaid
flowchart LR
  R[Rust seeded simulator] -->|HTTP JSON + demo token| A[FastAPI / Pydantic]
  A -->|transaction| D[(Local SQLite)]
  D -->|commit before publication| W[Bounded WebSocket queues]
  W --> U[React / TypeScript dashboard]
  U -->|REST snapshot and history| A
```

Run one API worker and one simulator for the virtual instrument. The API serializes
ingestion and commits raw packet data, normalized observations and alert evidence in
one SQLAlchemy transaction. A database uniqueness constraint also protects device
sequence numbers. Alembic owns schema changes; startup fails if the schema is missing.
Queries use short synchronous SQLite sessions; a server database and async driver
are outside this local prototype's scope. SQLite is local persistence, not a backup.

The trust boundary is the laptop. Bind API and Vite to loopback; ingestion requires
`X-Demo-Token`. The checked-in default token is a local demonstration setting, not
a shared deployment credential. Read APIs expose synthetic records without roles.
Only the configured origin is allowed for browser REST/WS clients. DEMO is the only
supported application mode; schemas reject real identities and non-simulated sources.
The Rust CLI also restricts its destination to loopback. No hardware adapters exist.

Startup does not assume acquisition: records received before this API instance started
are HISTORICAL. Device freshness uses both source and receipt times. The backend sends
status heartbeats every second; the UI expires readings locally using server clock
offset and closes a silent stream after five seconds. Reconnection subscribes first,
buffers events while loading REST snapshots, then merges by observation ID and sequence.
Each stream queue is bounded; overflow closes the client with 1013 to force a resnapshot.
There is no persistent event log or multi-worker pub/sub; REST is the recovery source.

This supports operation without Internet once dependencies are installed, while the
local API is running. It does not provide PWA caching or a ground synchronization queue.
Ground sync is explicitly shown as NOT IMPLEMENTED and is separate from sensor status.

Dependencies follow the [FastAPI WebSocket documentation](https://fastapi.tiangolo.com/advanced/websockets/)
and the [Vite development workflow](https://vite.dev/guide/). This is a research prototype,
not a medical device or certified flight software.
