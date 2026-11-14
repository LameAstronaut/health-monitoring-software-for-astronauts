# Prototype assumptions and hazards

Only synthetic identities and measurements are supported. No real hardware, medical
decisions, clinical prediction or life-support actuation is permitted or implemented.
These notes are a development hazard log, not a formal assurance or certification artifact.

| Hazard | Current handling | Remaining validation |
| --- | --- | --- |
| Old data appears current | Source + receipt expiry, UI timer, disconnected stream state, historical startup | Browser interruption and clock drift campaigns |
| Retries duplicate records | Event idempotency, DB key and sequence constraint | Multi-process behavior; only one worker supported |
| Malformed data becomes live | Strict units, identity, finite numbers and ordering | Wider fuzzing and device-specific plausibility |
| Alert mistaken for diagnosis | Versioned arbitrary scenario markers, SIMULATED labels, evidence | Human-factors review |
| Publication before durability | Transaction commit before queue insertion | Inject disk-full and interrupted-write failures |
| Slow client grows memory | Bounded queue, close + REST resnapshot | Sustained-load tests |
| Demo reaches real records | DEMO-only config and fixed IDs | Separate operational architecture before real integration |
| Unauthorized remote use | Loopback defaults, ingest token, exact browser origin | Roles, TLS and deployment threat model |

The local default token is public demo configuration. This is not a secure shared medical
service. Historical data stays local until removed by the owner; retention, encryption at
rest and backup policies remain future work. Do not put real personal records in this database.

The stateful model uses artificial baselines, rate limits and response constants described in
[simulation-model.md](simulation-model.md). Resting stability and coherent transitions do
not establish medical accuracy. BP/lab/bone-density fixtures are event-only; acquisition
timeout produces FAILED, never invented data. API restart pauses playback and preserves
older readings as HISTORICAL. Browser tests verify real stale/disconnected labels while
the API remains connected, and migration tests retain original packets and alerts.
