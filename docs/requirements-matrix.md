# Initial requirement trace

| README requirement | Implementation | Verification |
| --- | --- | --- |
| Required Rust → API → WS → UI path | simulator/src, backend/app, frontend/src | scripts/smoke.py; API WebSocket test |
| Typed JSON and explicit provenance | backend/app/schemas.py; generated TS | API validation tests; Rust serialization test |
| Commit before broadcast | service.ingest; main.telemetry | WebSocket test; smoke persistence |
| Duplicate and ordering protection | TelemetryService.ingest; DB constraint | test_normal_duplicate_and_conflict; test_auth_time_and_ordering |
| Stale/disconnected/historical | service.freshness; telemetry.ts | API freshness tests; frontend unit tests; smoke |
| Two demo anomalies and priorities | measurements; fixture rules | Rust fault test; test_alert_evidence_and_priority; smoke |
| Explainable evidence | Alert.evidence; review queue details | API alert evidence test |
| Demo isolation | Settings; literal identity/source schemas | API schema and auth tests |
| Eleven modules / examinations | Deferred | Not claimed implemented |
| Roles, sync, clinical validation | Deferred | Not claimed implemented |
