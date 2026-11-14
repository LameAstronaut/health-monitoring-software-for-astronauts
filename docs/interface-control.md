# ICD v1 — implemented telemetry slice

Canonical, machine-readable REST schema: `frontend/openapi.json`, exported from Pydantic.
`frontend/src/types/api.d.ts` is generated with openapi-typescript. Regenerate after schema
changes using the commands in [development.md](development.md). `/docs` is interactive API documentation.

The telemetry packet shape matches README §8. Fields outside the schema are rejected.
Only DEMO-CREW-001 and DEMO-SUIT-001 are registered. Supported scenario IDs are `normal`,
`oxygen_drop_demo`, `pressure_anomaly_demo`, and `simultaneous_demo`. CLI disconnect and
invalid-packet scenarios use the normal scenario ID and alter delivery/schema respectively.
Timestamps must have a timezone; generated packets use UTC RFC 3339. Receipt times are
stored separately. No checksum or authenticity claim is made beyond the local demo token.

| Method | Implemented route | Result |
| --- | --- | --- |
| GET | /api/v1/health | Mode, version, server UTC, freshness configuration |
| GET | /api/v1/crew | Synthetic crew registry |
| GET | /api/v1/devices | Virtual instrument, availability and last receipt |
| POST | /api/v1/telemetry | Validated observations and demo alerts; requires X-Demo-Token |
| GET | /api/v1/observations | Bounded recent history; astronaut_id and limit (1–1000) |
| GET | /api/v1/alerts | Priority-ordered history; limit (1–500) |
| WS | /api/v1/stream | Events below; resnapshot REST on every reconnect |

An identical event retry returns 200 with `duplicate=true` and creates no rows or stream
events. Reuse of an event ID with different content, decreasing/duplicate sequence and
backwards source timestamps return 409. Sequence gaps are accepted with `sequence_gap=true`.
The first sequence can be any nonnegative integer. Restart the simulator to resume from
the greatest durable sequence. Run only one publisher; competing publishers fail visibly.
Future timestamps more than five seconds ahead return 422. Old packets can be stored,
but cannot produce live demo alerts. Schema/units/identity violations return 422,
missing/wrong demo token returns 401, and persistence failure returns 503 without publication.
Rejected packets are not persisted; durable rejection audit is a future milestone.

Stream envelopes use `{ "type": "...", "data": ... }`:

| type | data schema | When |
| --- | --- | --- |
| system.status | Health | Immediately and every second |
| device.status | Device | Immediately and every second, even without packets |
| telemetry.observation | Observation | Once for each committed observation |
| alert.created | Alert | Once for each committed demo fixture alert |

The TypeScript envelope union reuses generated REST payload types. Alert review/state
changes (`alert.updated`) are reserved for a later authenticated workflow. Disconnect,
network loss and overload require client reconnection and REST resnapshot; frames are
not a durable replay log. A slow client is closed with 1013; an untrusted Origin with 1008.
Clients must apply sample timestamps and quality even while the stream is connected.

## Demo fixture rules, version demo-fixture-v1

Exact values are arbitrary demonstration markers, **not clinical or suit operating limits**.
Only VALID, fresh observations from a matching explicit scenario produce alerts:

| Scenario | Marker | Priority |
| --- | --- | --- |
| oxygen_drop_demo or simultaneous_demo | spo2 exactly 88 % | 2 / WARNING_DEMO |
| pressure_anomaly_demo or simultaneous_demo | suit_pressure exactly 20 kPa | 1 / CRITICAL_DEMO |

Each alert links its event ID, observation ID, device, crew, rule version and timestamps.
No alert is a diagnosis. Alerts remain PENDING_REVIEW; acknowledge, resolve and clinician
roles have not been implemented. The CLI emits a fault marker once, at zero-based tick 5.
An alert-free queue must never be interpreted as health clearance.
