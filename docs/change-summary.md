# Stateful simulation and operations upgrade — changed areas

Existing packages, FastAPI ingestion/storage, REST/WS path, SQLAlchemy models, Alembic
history, API type generation and local development workflow were retained and extended.
No microservices, real hardware integration, clinical AI or external medical API was added.

| Area | Files changed / added |
| --- | --- |
| Physiological state and ECG | `simulator/src/physiology.rs`, `simulator/src/runtime.rs`, `simulator/src/lib.rs`, `simulator/src/main.rs` |
| Telemetry contract and provenance | `backend/app/schemas.py`, `backend/app/registry.py`, `backend/app/service.py`, `backend/app/main.py`, `contracts/telemetry.schema.json`, `frontend/openapi.json`, `frontend/src/types/api.d.ts` |
| Persisted operations and adapter interface | `backend/app/operation_schemas.py`, `backend/app/operations.py`, `backend/app/operations_api.py`, `backend/app/devices.py`, `backend/app/database.py`, `backend/alembic/versions/0002_operations.py` |
| Application and readability | `frontend/src/App.tsx`, `frontend/src/styles.css`, `frontend/src/components/medical.tsx`, `frontend/src/screens/{monitoring,examinations,equipment,alerts,simulator,lifestyle,risk,types}.tsx/ts` |
| Interactive body view | New generated `frontend/public/assets/astronaut-body-realistic.png`, clickable SVG region overlay in `frontend/src/components/BodyMap.tsx`, and `BodyMap.test.tsx`; integrated into `frontend/src/screens/risk.tsx` |
| REST/WS recovery and rendering cadence | `frontend/src/services/api.ts`, `frontend/src/useMission.ts`, `frontend/src/telemetry.ts` |
| Backend regression tests | `backend/tests/conftest.py`, `test_api.py`, `test_operations.py`, `test_checkpoint_and_migration.py` (including source-time and stale-acquisition integrity) |
| UI interaction and waveform tests | `frontend/src/App.test.tsx`, `frontend/src/components/medical.test.tsx`, `frontend/src/test/fixtures.ts`, `frontend/src/telemetry.test.ts`, `frontend/vitest.config.ts` |
| Browser tests and screenshots | `frontend/e2e/{flows,visual}.spec.ts`, `frontend/playwright.config.ts`, `scripts/e2e_server.py`, `artifacts/screenshots/` |
| Development and automation | `Makefile`, `scripts/dev.py`, `scripts/smoke.py`, `scripts/export-openapi.py`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/tsconfig.json`, `.github/workflows/ci.yml` |
| Model, interfaces and limitations | `README.md` TODOs/status, `docs/{simulation-model,operations,visual-review,validation,implementation-status,architecture,interface-control,measurement-dictionary,safety-and-hazards,development,demo-script,requirements-matrix}.md` |

Run instructions and verification details are in development.md and validation.md. Existing
uncommitted foundation work in this workspace was preserved. The database migration adds
operation records and acknowledgment fields without deleting original packets or observations.


## Red alerts, additional anomalies and touch controls

This follow-up retains the existing Rust → FastAPI → React architecture and database schema.

| Change | Files |
| --- | --- |
| Automatic full-screen review for both priorities, concise view, optional evidence, turn-signal flashing and reduced-motion support, crew-wide escalation, minimize/reopen and acknowledgment | `frontend/src/App.tsx`, new `frontend/src/components/AlertReview.tsx` |
| 18 px body, 56 px metrics, 56 px touch controls, 64 px review controls, red alert styling and responsive layout | `frontend/src/styles.css` |
| Pulse-rise, respiratory-rise and combined stress fixtures with bounded seeded dynamics | `simulator/src/physiology.rs` |
| Validated fault options, new versioned demo markers and generated contracts | `backend/app/operation_schemas.py`, `backend/app/service.py`, `frontend/openapi.json`, `frontend/src/types/api.d.ts` |
| Fault selection and expanded respiratory chart range | `frontend/src/screens/simulator.tsx`, `frontend/src/components/medical.tsx` |
| Scenario, escalation, acknowledgment, keyboard and viewport regression coverage | `backend/tests/test_added_anomalies.py`, `frontend/src/alerts.test.tsx`, `frontend/e2e/{flows,visual}.spec.ts`, Rust inline tests |
| Updated screenshots, model limits, operator instructions and verified TODOs | `artifacts/screenshots/`, `README.md`, `docs/{development,interface-control,simulation-model,validation,visual-review}.md` |

Verification: 39 backend tests, 11 Rust tests, 22 frontend tests and 11 browser cases pass.
Lint, formatting, typecheck, production build and the real-stack smoke test pass. Viewports and
Chromium keyboard behavior were checked locally; physical touchscreen ergonomics, other browsers,
clinical thresholds and medical urgency rankings remain unvalidated.
