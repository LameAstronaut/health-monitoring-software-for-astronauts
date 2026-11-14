# ICD — stateful DEMO telemetry and operations

Canonical, machine-readable REST schema: `frontend/openapi.json`, exported from Pydantic.
`frontend/src/types/api.d.ts` is generated with openapi-typescript. Regenerate after schema
changes using the commands in [development.md](development.md). `/docs` is interactive API documentation.
The standalone packet schema and sample are `contracts/telemetry.schema.json` and
`contracts/telemetry.example.json`; run `make contracts` to regenerate the schema and API types.

The telemetry packet shape matches README §8. Fields outside the schema are rejected.
Three synthetic crew and their separate suit monitors are registered, plus shared virtual
blood-pressure, lab-panel and bone-density instruments. New scenario IDs are REST, EXERCISE,
RECOVERY, ANOMALY and EXAMINATION. Legacy packet scenario IDs remain accepted. The Rust CLI's
legacy anomaly aliases now use gradual ANOMALY dynamics, rather than a sixth-sample jump.
Timestamps must have a timezone; generated packets use UTC RFC 3339. Receipt times are
stored separately. No checksum or authenticity claim is made beyond the local demo token.

| Method | Implemented route | Result |
| --- | --- | --- |
| GET | /api/v1/health | Mode, version, server UTC, freshness configuration |
| GET | /api/v1/crew | Synthetic crew registry |
| GET | /api/v1/devices | Virtual instrument, availability and last receipt |
| POST | /api/v1/telemetry | Validated observations and demo alerts; requires X-Demo-Token |
| GET | /api/v1/observations | Bounded recent history; astronaut_id and limit (1–2400) |
| GET | /api/v1/alerts | Priority-ordered history; limit (1–500) |
| WS | /api/v1/stream | Events below; resnapshot REST on every reconnect |
| GET | /api/v1/waveforms | Recent ECG chunks with source, quality and freshness |
| GET | /api/v1/crew/summaries | Per-crew latest recorded summaries |
| GET | /api/v1/operations | Durable tasks, examinations, meals, inventory, fitness, EVA and controls |
| GET / POST | /api/v1/demo/control | Read desired/observed playback state; revision-checked commands |
| GET | /api/v1/demo/runtime | Worker checkpoints, next sequences and pending examinations; token required |
| POST | /api/v1/demo/heartbeat | Worker acknowledgment/heartbeat; token required |
| GET / POST | /api/v1/examinations | History / initiate acquisition |
| POST | /api/v1/examinations/{id}/actions | SAVE reviewed results or CANCEL |
| POST | /api/v1/alerts/{id}/acknowledge | Idempotent DEMO-OPERATOR acknowledgment |
| POST | /api/v1/nutrition/meals | Log meal and atomically decrement stock |
| POST | /api/v1/fitness/sessions | Start a synthetic session and request EXERCISE |
| POST | /api/v1/fitness/sessions/{id}/finish | Complete session, store history, request RECOVERY |
| POST | /api/v1/eva/sessions | Prepare conceptual EVA checklist/timeline |
| POST | /api/v1/eva/sessions/{id}/actions | Check step, gated START, COMPLETE |
| POST | /api/v1/tasks/{id}/complete | Complete a scheduled demonstration task |

New fields retain wire `schema_version=1.0` and are additive for ingestion compatibility:
`run_id`, `revision`, `simulated_at`, `model_state`, `waveform`, `examination_id`. Old packets
without these fields remain readable. Physiological state and ECG sample offsets use logical
time; `observed_at` and `received_at` remain wall-clock UTC. The generated schema is canonical.
Event-only instruments require an associated pending examination and a complete result set.

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
| telemetry.waveform | WaveformReading | Separate ECG chunk; default 125 Hz logical samples |
| alert.created | Alert | Once for each committed demo fixture alert |

The TypeScript envelope union reuses generated REST payload types. Demo acknowledgment
is polled through REST history; clinician review and stream `alert.updated` remain future work. Disconnect,
network loss and overload require client reconnection and REST resnapshot; frames are
not a durable replay log. A slow client is closed with 1013; an untrusted Origin with 1008.
Clients must apply sample timestamps and quality even while the stream is connected.

## Demo fixture rules

Exact values are arbitrary demonstration markers, **not clinical or suit operating limits**.
Only VALID, fresh observations from a matching explicit scenario produce alerts:

| Scenario / version | Marker | Priority |
| --- | --- | --- |
| ANOMALY / demo-fixture-v2 | spo2 <=92 % | 2 / WARNING_DEMO |
| ANOMALY / demo-fixture-v2 | suit_pressure <=25 kPa | 1 / CRITICAL_DEMO |
| Legacy oxygen_drop_demo or simultaneous_demo / v1 | spo2 exactly 88 % | 2 / WARNING_DEMO |
| Legacy pressure_anomaly_demo or simultaneous_demo / v1 | suit_pressure exactly 20 kPa | 1 / CRITICAL_DEMO |

Each alert links its event ID, observation ID, device, crew, rule version and timestamps.
No alert is a diagnosis. Alerts transition from PENDING_REVIEW to ACKNOWLEDGED with a stored
demo operator and time. Alerts are deduplicated per rule/crew/run; restart playback to
demonstrate a new event. Resolution, clinician signatures and role authorization remain future work.
An alert-free queue must never be interpreted as health clearance.

Operator mutations require loopback and reject untrusted browser origins. Ingestion, runtime
and heartbeat require the demo token. Revision conflicts, invalid examination transitions,
missing live data and insufficient stock return explicit 409 errors. A lost acquisition
becomes FAILED after 20 wall-clock seconds without manufacturing a result. See
[operations](operations.md) and [model limitations](simulation-model.md).
An examination's acquired time retains the instrument source timestamp; receipt time remains
separate in the linked observation/packet. Old samples cannot fulfill a new acquisition.
