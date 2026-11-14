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
| REST/WS recovery and rendering cadence | `frontend/src/services/api.ts`, `frontend/src/useMission.ts`, `frontend/src/telemetry.ts` |
| Backend regression tests | `backend/tests/conftest.py`, `test_api.py`, `test_operations.py`, `test_checkpoint_and_migration.py` (including source-time and stale-acquisition integrity) |
| UI interaction and waveform tests | `frontend/src/App.test.tsx`, `frontend/src/components/medical.test.tsx`, `frontend/src/test/fixtures.ts`, `frontend/src/telemetry.test.ts`, `frontend/vitest.config.ts` |
| Browser tests and screenshots | `frontend/e2e/{flows,visual}.spec.ts`, `frontend/playwright.config.ts`, `scripts/e2e_server.py`, `artifacts/screenshots/` |
| Development and automation | `Makefile`, `scripts/dev.py`, `scripts/smoke.py`, `scripts/export-openapi.py`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/tsconfig.json`, `.github/workflows/ci.yml` |
| Model, interfaces and limitations | `README.md` TODOs/status, `docs/{simulation-model,operations,visual-review,validation,implementation-status,architecture,interface-control,measurement-dictionary,safety-and-hazards,development,demo-script,requirements-matrix}.md` |

Run instructions and verification details are in development.md and validation.md. Existing
uncommitted foundation work in this workspace was preserved. The database migration adds
operation records and acknowledgment fields without deleting original packets or observations.
