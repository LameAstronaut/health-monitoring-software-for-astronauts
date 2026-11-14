# Implemented scope and remaining milestones

The README supplied the stack, transport, contracts, UI states and incremental milestone
order. The codebase implements a useful M0–M3 vertical slice plus initial M5 fixture rules.
This document supplements the specification; it does not mark entire milestones complete.
See [local verification results and limits](validation.md).

Implemented: local configuration, SQLAlchemy + Alembic persistence, strict telemetry
schemas, deterministic Rust values and fault scenarios, token-protected ingestion,
sequence/order/duplicate checks, REST history, bounded WebSocket delivery, prioritized
traceable demo alerts, responsive React mission/history/equipment views, UTC timestamps,
explicit quality/source/freshness, API schema generation, tests and CI.

Remaining work:

- Source reference PDF is not present; no document or license was fabricated.
- Examination lifecycle, virtual blood-pressure adapter, review/save/report replay (M4).
- Authenticated review and acknowledgment, roles and durable audit events (M5/M7).
- Eleven specialized health-risk views, extended measurement dictionary and imports (M6).
- Durable ground-sync queue, backup/retention, disk-full recovery and PWA cache (M7).
- Physical-device adapters and formal medical/safety assurance (M8).
- Browser automation and broader stream overload/reconnect and storage failure testing.
- Complete dependency security review, MC/DC, independent validation and NASA applicability.

The current API does not implement examinations or demo scenario-control endpoints.
The UI documents CLI controls and does not imply those future workflows are available.
Alerts are stored fixture events with PENDING_REVIEW state, not reviewed clinical records.
