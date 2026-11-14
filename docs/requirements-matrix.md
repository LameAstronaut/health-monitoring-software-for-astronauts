# Initial requirement trace

| README requirement | Implementation | Verification |
| --- | --- | --- |
| Required Rust → API → WS → UI path | simulator/src, backend/app, frontend/src | scripts/smoke.py; API WebSocket test |
| Typed JSON and explicit provenance | backend/app/schemas.py; generated TS | API validation tests; Rust serialization test |
| Commit before broadcast | service.ingest; main.telemetry | WebSocket test; smoke persistence |
| Duplicate and ordering protection | TelemetryService.ingest; DB constraint | test_normal_duplicate_and_conflict; test_auth_time_and_ordering |
| Stale/disconnected/historical | service.freshness; telemetry.ts | API freshness tests; frontend unit tests; smoke |
| Stable stateful model and gradual transitions | physiology.rs; runtime.rs | Rust stability/response/checkpoint tests; browser exercise/recovery |
| Separate ECG and numeric/UI cadence | physiology.rs; waveform schema; useMission.ts | Rust ECG test; UI ECG expiry test; browser live monitor |
| Two demo anomalies and priorities | Physiology::advance; fixture rules | Rust fault test; API evidence test; smoke; browser alerts |
| Explainable evidence | Alert.evidence; review queue details | API alert evidence test |
| Demo isolation | Settings; literal identity/source schemas | API schema and auth tests |
| Event-only examination and saved provenance | devices.py; operations.py; Rust pending commands | API save/timeout/restart tests; browser acquire/save/export/reload |
| Playback, pause, speed, seed and restart | operations_api.py; Rust controlled mode; SimulatorControls | API revision tests; browser frozen clock and expiry |
| Eleven shared health-risk views | screens/risk.tsx; shared observations/reports | UI interaction test; browser category count and unavailable data |
| Meals / inventory, fitness, EVA and task records | operations_api.py; lifestyle.tsx | Backend and browser workflow tests |
| Readability and keyboard interaction | styles.css; shared components | 3 viewport browser checks; screenshots and visual review |
| Backward-compatible database upgrade | Alembic 0002 | test_upgrading_original_schema_preserves_existing_observations_and_alerts |
| Roles, sync, clinical validation | Deferred | Not claimed implemented |
