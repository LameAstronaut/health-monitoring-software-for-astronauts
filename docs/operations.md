# Local synthetic medical operations

Run `make setup` after updating dependencies, then `make dev`. Existing SQLite databases
are upgraded through Alembic 0002 without deleting accepted telemetry. The API and Rust
worker remain separate processes; the React app reads shared observations and records.

- **Dashboard:** select one of three crew; inspect timestamped HR/RR/SpO₂/pressure,
  ECG, priority-ordered demo findings and scheduled tasks. Completing a task is explicit.
- **Crew profiles:** personal simulation constants, provenance and measurement history.
- **Live monitoring:** fixed-scale plots, recorded ranges, UTC labels and a separate ECG.
- **Examinations:** choose blood pressure, a lab panel or a bone-density report; the virtual
  adapter queues an acquisition for Rust. Review the returned measurements, add a demo
  note, save and later inspect/export the synthetic report. Without a live worker the
  request fails visibly; lost acquisition times out rather than inventing a reading.
- **Equipment:** six virtual instruments, capabilities, association, connection, firmware,
  last receipt and unknown physical calibration. Event instruments are IDLE, not falsely LIVE.
- **Risk monitoring:** eleven shared-record categories with grouped observations, trends,
  context and missing-instrument notices. No risk scores, diagnoses or AI conclusions.
- **Nutrition:** portion-based synthetic inventory, meal logging, recorded nutrient totals
  and persistent history. Inventory decrement and meal insertion are atomic.
- **Fitness:** start a synthetic activity, request EXERCISE, finish and request RECOVERY;
  retain elapsed wall time and peak accepted HR, or explicitly unavailable HR.
- **EVA:** prepare a demonstration, complete the conceptual checklist, start with live
  synthetic suit telemetry, complete and inspect a persistent action timeline. This is
  not an approved EVA procedure and has no life-support command channel.
- **Alerts:** inspect triggering observations, rule version, UTC time, source and priority;
  explicitly acknowledge as DEMO-OPERATOR and retain history.
- **Simulator:** select scenario, target crew, speed, seed, restart, pause/resume and faults.
  Other crew remain independently at rest. Restart uses a new run; it does not erase records.

Control and operations writes are restricted to loopback, reject untrusted browser origins,
and are DEMO-only. Ingestion/runtime/worker heartbeat additionally require the configured
demo token, which is shared with Rust through environment configuration, never the browser.
These controls are not clinician authentication, medical role access or deployment security.

The common `DeviceAdapter` interface exposes identify/status/capabilities/acquire/stop.
Only `SimulatedAdapter` is implemented. Its acquisition is a durable software request;
Rust returns the fixture through the validated telemetry path. A real implementation
must be separate and must not silently substitute simulated results.

Operation records use a shared SQLAlchemy JSON record table with Pydantic types at API
boundaries. Packets, normalized observations and alert evidence retain the existing tables.
Examination transitions and telemetry writes share a transaction; publication follows commit.
Meals, sessions, tasks, EVA checklists and acknowledgment survive reload and API restart.

Specialist sensorimotor, microbiome and ophthalmic instruments, advanced lab markers,
ground synchronization, clinical review signatures, PWA caching, retention/backup and
shared-user roles remain outside this local prototype. Their absence is visible in the UI.
