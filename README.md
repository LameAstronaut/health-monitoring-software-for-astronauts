> Recent additions: [Data workspace, manual telemetry, interactive body view, and alert behavior](docs/data-workspace.md).

# ASTRA HEALTH

**Integrated Astronaut Health Monitoring & Medical Operations Platform**  
**Project:** NASA Space Apps Challenge — research and engineering prototype  
**Status:** Working local DEMO — stateful simulation and medical operations

**Target concept:** A unified, easy-to-use medical interface for astronauts aboard the International Space Station (ISS) and authorized ground medical personnel.  
**Prototype environment:** An ordinary laptop with simulated medical and spacesuit telemetry.

**Codebase:** Rust → FastAPI → React now includes stateful three-crew physiology,
separate ECG sampling, playback controls, examinations with saved reports, equipment,
eleven shared risk views, nutrition, fitness, conceptual EVA operations and alert acknowledgment.
See [local setup and commands](docs/development.md), [implemented scope and remaining work](docs/implementation-status.md),
and [architecture](docs/architecture.md). See [model assumptions and limitations](docs/simulation-model.md)
and [screenshots / visual review](docs/visual-review.md). Specialist instruments, clinician roles,
ground synchronization and formal validation remain future work.

> [!IMPORTANT]
> **NOT FLIGHT SOFTWARE. NOT A MEDICAL DEVICE. NOT NASA-CERTIFIED.**
> This repository is a research/demo prototype using **synthetic data only** until separately authorized and validated for real medical integration. It must not be used to make actual medical decisions, operate a spacesuit, control life-support equipment, or claim operational compatibility with the ISS. Any future deployment would require instrument-specific approvals, clinical and human-factors validation, cybersecurity review, and formal system/software assurance.

## Table of contents

1. [Mission and scope](#1-mission-and-scope)
2. [Source specification and standards](#2-source-specification-and-standards)
3. [System architecture](#3-system-architecture)
4. [Technology decisions](#4-technology-decisions)
5. [User interface and workflows](#5-user-interface-and-workflows)
6. [Eleven health-risk modules](#6-eleven-health-risk-modules)
7. [Medical equipment and integration](#7-medical-equipment-and-integration)
8. [Telemetry interface contract](#8-telemetry-interface-contract)
9. [Data model and API](#9-data-model-and-api)
10. [Safety, integrity, offline behavior, and security](#10-safety-integrity-offline-behavior-and-security)
11. [Repository layout](#11-repository-layout)
12. [Getting started](#12-getting-started)
13. [Testing and quality gates](#13-testing-and-quality-gates)
14. [Hackathon demonstration](#14-hackathon-demonstration)
15. [Roadmap and TODO list](#15-roadmap-and-todo-list)
16. [Instructions for Codex contributors](#16-instructions-for-codex-contributors)
17. [Definition of done and references](#17-definition-of-done-and-references)

---

## 1. Mission and scope

### Problem

Astronaut medical data comes from many instruments, examinations, exercise systems, laboratory reports, and environmental systems. A fragmented interface increases workload and can make trends, equipment failures, and data gaps difficult to recognize quickly.

### Proposed solution

**ASTRA HEALTH** is one operational-style interface with:

- A **crew dashboard** with time-sensitive tasks, data freshness, and reviewed alerts.
- **Longitudinal astronaut health records** with measurable provenance.
- **One examination workflow** across medical devices.
- **Eleven health-risk modules**, all backed by a shared measurement model.
- **Equipment registry and diagnostics** showing actual connectivity, faults, and calibration information.
- **Real-time telemetry** from a Rust simulator in the demo; future approved instrument adapters are a separate integration effort.
- **Medical trends, data-quality checks, and explainable anomaly flags** (not automatic diagnoses).
- **Offline-first behavior** for interrupted ground communications.
- A **ground clinician view** and an optional **helmet-HUD-style concept view** for demonstration. The HUD is *not* a claim of compatibility with real EVA displays.

### Intended users

| Role | Primary workflow | Access principle |
|---|---|---|
| Astronaut | Complete assigned examination, review own tasks/results | Minimum necessary access |
| Crew Medical Officer | Assist with approved examinations and data collection | Role-scoped records |
| Flight Surgeon / Ground Medical Officer | Review trends, examinations and alerts | Clinician-authorized access |
| Equipment Maintainer | Inspect connection, calibration and fault status | Device information; not unrestricted medical records |
| Demo Operator | Inject **synthetic** scenarios for judging | Demo mode only |

### MVP success criterion

**One complete, believable workflow:** A demo astronaut is selected → a simulated instrument publishes timestamped telemetry → FastAPI validates and stores it → the UI receives it via WebSocket → an injected anomaly causes an appropriately prioritized **simulated** alert → the operator can inspect the triggering measurements and replay the examination.

### Explicit non-goals for the MVP

- No control of actual ISS hardware, suit pressure, oxygen supply, or clinical treatment.
- No automatic diagnosis, prescription, or unsupervised medical decision.
- No assertion that any named medical device is currently aboard the ISS.
- No pretending a synthetic measurement is a real clinical result.
- No assumption that building a dashboard confers NASA Class A, safety-critical, flight-ready or standards-compliant status.

---

## 2. Source specification and standards

**Primary user-provided source:** `nasa-spaceapps-astronot-saglik-rehberi.pdf` (2 pages, Turkish; *NASA Space Apps: Astronot Sağlık İzleme Sistemi — Yazılım Mimarisi, Programlama Dilleri ve NASA Güvenlik Standartları*).

The source is a **project design guide**, not a certificate of NASA approval. Its contents drive the architecture and engineering checklist here. If this repository is shared, place the PDF at `docs/reference/nasa-spaceapps-astronot-saglik-rehberi.pdf` (or link to its approved storage location).

| Guide section | Adopted project decision |
|---|---|
| §1, p.1 — NASA framework | Use NPR 7150.2D and NASA-STD-8739.8B as engineering/safety reference points; document applicability rather than asserting compliance. |
| §2, p.1 — Layer languages | **Rust** telemetry simulator; **Python/FastAPI** processing; **React/TypeScript** UI. |
| §3, pp.1–2 — ICD and data flow | Rust `POST /api/v1/telemetry` → FastAPI validation / anomaly processing → WebSocket → React UI. JSON contracts with documented schemas. |
| §4, p.2 — Safety/assurance | Freshness-aware HMI, safe startup, input integrity, ordered data, prioritized alerts, tests, static analysis, dependency review, transport security. |
| §5, p.2 — Demo | Live simulator; operator injects **synthetic suit-pressure anomaly** and **synthetic oxygen-decrease anomaly** to demonstrate alert priority. |

### Precise interpretation of NASA references

Use these documents as engineering references and perform a separate formal applicability assessment for any genuine operational system.

- **NPR 7150.2D** — NASA Software Engineering Requirements. [NASA handbook text](https://swehb.nasa.gov/spaces/SITE/pages/123601159/NPR+7150.2D).
- **NASA-STD-8739.8B** — Software Assurance and Software Safety. [NASA standard PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/NASA-STD-87398-Revision-B.pdf).
- **SWE-020** — Classification is assessed by actual intended usage and authority, not automatically assigned because a prototype concerns astronaut health. [NASA handbook](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695405/SWE-020+-+Software+Classification).
- **SWE-134** — Relevant safety-critical design principles include known safe state, ordered commands, validated input/output and error handling. [NASA handbook](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695493/SWE-134+-+Safety-Critical+Software+Design+Requirements).
- **SWE-219 / SWE-220** — For *identified safety-critical software*, NPR 7150.2D calls for 100% MC/DC code test coverage and cyclomatic complexity of 15 or lower, subject to the actual directive's review/waiver provisions. These are **future assurance targets, not current project achievements**. [NASA handbook](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695222/C.+Project+Software+Requirements).
- **SWE-073** — Calls for validating on the target platform **or a high-fidelity simulation**; a generic laptop simulator alone does **not** prove high fidelity. The simulator is a *prototype/test harness* unless equivalence to target timing, interfaces and environment is demonstrated. [NPR 7150.2D, §4.5.8](https://swehb.nasa.gov/spaces/SITE/pages/123601159/NPR+7150.2D).

**Engineering policy:** Record which requirements are `applicable`, `not applicable`, or `not yet assessed` in a traceability matrix; never use badges or README language claiming certification. The guide's suggested NASA classification is a **design assumption to evaluate**, not a fact about this hackathon prototype.

---

## 3. System architecture

### Demo / development data path (required by source PDF)

```text
+------------------------------------------------------------+
| RUST TELEMETRY SIMULATOR                                   |
| - Astronaut state and sensor-model scenarios               |
| - Deterministic normal / fault / disconnected runs         |
| - Instrument IDs, sequence numbers, timestamps, checksums   |
+-------------------------------+----------------------------+
                                |
                       HTTP POST /api/v1/telemetry
                                v
+------------------------------------------------------------+
| PYTHON / FASTAPI BACKEND                                   |
| Validate schema, units, time, sequence, source, integrity   |
| Store raw packet + normalized observations                  |
| Evaluate demo-only anomaly/priority rules                  |
| Maintain examination, device and alert records             |
+--------------------------+-----------------+---------------+
                           |                 |
                   Local database     WebSocket /api/v1/stream
                           |                 |
                           v                 v
                    Persistent records  REACT / TYPESCRIPT
                                        - Crew dashboard
                                        - Examination center
                                        - Live monitor & alerts
                                        - Device status
                                        - Health-risk views
                                        - Ground clinician view
                                        - HUD concept view
```

**Future real-device path (not implemented or certified):** An approved medical-device adapter ingests supported manufacturer outputs → the same normalization/validation pipeline → the same data store and UI. Real adapters must not share credentials or device endpoints with the demo simulator.

### Architecture principles

1. **Source-independent observations:** UI screens consume validated observations, not raw device-specific formats.
2. **Single source of truth:** Persist the accepted packet and derived observation metadata before publishing to clients, or document a deliberate equivalent with failure recovery.
3. **Explicit provenance:** `SIMULATED`, `REAL_DEVICE`, `MANUAL`, and `DERIVED` are different source types.
4. **Fail visibly:** Disconnected, stale, invalid or incomplete data must be visibly marked; never display stale values as live.
5. **No silent fallback:** Never fabricate a replacement medical reading.
6. **Separation of concerns:** Device acquisition ≠ validation ≠ analytics ≠ display.
7. **Read-only by default:** Medical telemetry ingest never implies permission to command physical life-support systems.
8. **Deterministic tests:** The same simulator seed/scenario generates repeatable outputs.
9. **Ground-sync resilient:** Local onboard-style operation cannot rely on uninterrupted ground connectivity.
10. **Accessibility:** Text labels accompany color, keyboard navigation works, alerts are understandable without interpreting a complex chart.

---

## 4. Technology decisions

| Layer | MVP choice | Reason |
|---|---|---|
| Telemetry simulation | **Rust** with Cargo, Tokio, Serde, HTTP client | Strong type/memory-safety properties, predictable simulator logic |
| Backend | **Python 3 + FastAPI + Pydantic** | Typed API validation, async HTTP/WebSocket, scientific ecosystem |
| UI | **React + TypeScript + Vite** | Reusable components, typed contracts, dashboard/PWA capability |
| Data store | **SQLite for local MVP**, SQLAlchemy/Alembic | No separate server needed for demo; later evaluate approved durable storage |
| Charts | Plotly.js or a lightweight compatible React charting library | Time series and telemetry displays |
| Tests | cargo test, pytest, Vitest, Playwright | Unit, integration, UI and end-to-end tests |
| Static analysis | cargo clippy, rustfmt, Ruff or flake8, Bandit, ESLint, TypeScript | Early defect detection |
| Dependency checks | cargo audit, pip audit, npm audit | Track third-party vulnerabilities |
| CI | GitHub Actions | Run build, checks, tests and dependency review |

Rust and TypeScript **reduce classes of mistakes but do not eliminate runtime errors or automatically prove safety**. A PWA **does not by itself ensure offline medical data persistence**; the backend/database and synchronization design are separate requirements.

---

## 5. User interface and workflows

### Information architecture

| Screen | What it must show | Priority |
|---|---|---|
| **Mission Dashboard** | Selected crew, active alerts, freshness, device connectivity, pending examinations, ground-link status | P0 |
| **Crew & Profiles** | Demo crew profiles, historical observations, examination timeline, role-appropriate access | P0 |
| **Examination Center** | Choose person → choose instrument → connect → acquire → validate → review → save | P0 |
| **Live Telemetry** | ECG/HR/SpO₂/pressure stream with units, source, quality and visible timestamps | P0 |
| **Equipment** | ID/model, source type, connected/idle/fault, calibration metadata, last seen | P0 |
| **Alerts** | Severity, affected person, triggering measurements, occurrence time, state, reviewer | P0 |
| **Health Risk Modules** | Eleven specialized views using shared records and analytics | P1/P2 |
| **Fitness & Nutrition** | Exercise/nutrition history, plan adherence, inventory | P2 |
| **Ground Medical View** | Authorized review, annotations, reports, sync queue | P2 |
| **HUD Concept** | Minimal, highly legible status/alert mockup; demo only | P2 |
| **Simulator Control** | Start/stop scenario, seed, fault injection, replay, reset | P0; available only in `DEMO` |

### Required HMI states

Use distinct statuses: `LIVE`, `STALE`, `DISCONNECTED`, `NOT_AVAILABLE`, `INVALID`, `CALIBRATION_UNKNOWN`, `SIMULATED`, `PENDING_REVIEW`, `ACKNOWLEDGED`. Do not use a single generic red indicator for all failure modes.

### Standard examination workflow

1. Select crew member and the approved examination type.
2. Select an available instrument; show connection and calibration status.
3. Start acquisition; check that the person, device, mode and timestamps are associated correctly.
4. Validate incoming values and preserve raw inputs.
5. Display current measurements **with quality and freshness labels**.
6. Review the result; save it to the examination history.
7. If applicable, queue a report for authorized ground review.

The demo uses a virtual instrument; a real connection requires a verified device-specific adapter and all necessary approvals.

---

## 6. Eleven health-risk modules

**Each module is a view over shared observations, examinations and reports; do not create eleven separate apps or databases.** The items below are *supported data candidates*, not claims that instruments/tests are currently installed on the ISS. Values are not diagnoses.

| Module | Key measurements / results to support | Possible source(s) |
|---|---|---|
| **1. ImmuneWatch — Altered immune responses** | WBC; neutrophils, lymphocytes, monocytes, eosinophils, basophils; CD4/CD8 and NK counts; IL-6/TNF-α; CRP; temperature; PCR viral detection/load | CBC analyzer, flow cytometry, immunoassays, thermometer, PCR |
| **2. NeuroAdapt — Sensorimotor and vestibular** | Head angle/angular velocity/acceleration; eye movement and nystagmus; reaction time; hand-eye error; gait speed/step dimensions; balance sway and center-of-pressure | IMU, eye tracker/video, webcam tests, force plate |
| **3. CardioPredict — Cardiovascular** | HR and HRV; ECG waveform; systolic/diastolic BP; MAP; SpO₂; respiratory rate; stroke volume, cardiac output, ejection fraction; chamber volumes; Doppler flow; hemoglobin/hematocrit | ECG, BP monitor, pulse oximeter, ultrasound, blood analyzer |
| **4. DecompSafe — Decompression risk** | Cabin/suit pressure histories; oxygen/nitrogen partial pressure; gas composition; EVA timing; procedure status; temperature; symptom reports; Doppler findings where available | Pressure/gas sensors, EVA log, approved medical assessment |
| **5. MicrobiomeAI — Host–microorganism interactions** | CFU in air/surface samples; bacterial/fungal counts; taxonomic abundance; species richness; Shannon diversity; gene/AMR findings; sampling time/location; PCR results | Sampling records, culture laboratory, sequencer, PCR |
| **6. OxygenGuard — Hypoxia** | SpO₂ and pulse; suit/cabin oxygen fraction and partial pressure; respiratory rate; PaO₂, PaCO₂, pH, HCO₃⁻; EtCO₂; inspired/expired CO₂; hemoglobin; suit/cabin pressure | Pulse oximeter, respiratory monitor, blood gas analyzer, suit/cabin sensors |
| **7. AstroNutrition — Nutrition** | Calories; protein, fat, carbohydrate, fiber; sodium, potassium, calcium, iron, magnesium; vitamins D/C/B12; water intake; body mass; food inventory/expiry; lab nutrient markers when available | Food logs/database, scale, laboratory reports, inventory |
| **8. EVA Assist — EVA injury and performance** | Suit pressure, oxygen/CO₂, humidity, temperature; heart/respiratory rate, SpO₂; EVA duration; joint angles, head movement, grip force; task completion; reaction/cognitive workload measures | Approved suit telemetry, physiological monitors, task logs, motion sensors |
| **9. AstroFit — Reduced fitness** | Rest/exercise HR and HRV; VO₂/VCO₂/RER and VO₂max; BP; respiratory rate; workload, duration, resistance load, repetitions; grip strength, muscle area; BMD and bone-turnover reports | Exercise equipment, ECG, metabolic cart, dynamometer, ultrasound, DXA/labs |
| **10. VisionTrack — SANS** | Visual acuity/field; retinal/optic nerve images; retinal/choroidal thickness, RNFL, optic disc measurements; intraocular pressure; refraction; pupil response; optic nerve sheath diameter | Fundus imaging, OCT, tonometry, visual tests, ultrasound |
| **11. BoneGuard — Bone changes** | BMD, BMC, bone area; trabecular/cortical structural measurements; P1NP, CTX, osteocalcin, bone ALP; calcium, phosphate, 25-OH vitamin D, PTH; urinary calcium/NTX | DXA, HR-pQCT, blood/urine analysis |

### Module implementation contract

For every module, Codex should eventually implement:

- The required `Observation` codes, canonical units, schema validation and metadata.
- An examination/report import or simulator adapter.
- A historical timeline and trend plot.
- A **data-availability** indicator (not every instrument is available at all times).
- Explainable **demo-only** findings and data-quality flags, with no unsupported diagnosis.
- Tests covering valid, missing, malformed, out-of-order, stale and disconnected data.

Do not invent biomedical thresholds, clinical predictions, or physical-device availability. Any clinically relevant rules must be externally reviewed and versioned before use with real data.

---

## 7. Medical equipment and integration

### Shared device interface

Implement a common application-facing adapter capability contract:

- `identify()` → stable ID, model, source kind, supported measurements, firmware/version if available.
- `status()` → connection, availability, last-seen and fault status; calibration where known.
- `acquire()` or `stream()` → observations, source timestamps, quality information.
- `stop()` → safely terminate **software acquisition** without controlling life-support functions.
- `capabilities()` → supported data formats and operations; do not expose unsupported commands.

For demo mode, create virtual instruments for:

1. **Pulse oximeter:** SpO₂, pulse, optional synthetic plethysmography waveform.
2. **ECG:** ECG waveform, HR, optional derived HRV.
3. **Blood pressure monitor:** Systolic/diastolic pressure and pulse.
4. **Spacesuit/cabin telemetry:** Pressure, oxygen/CO₂/environmental readings, connection state.
5. **Hematology analyzer:** Synthetic CBC report.
6. **Blood gas analyzer:** Synthetic pH, PaO₂, PaCO₂ and bicarbonate report.
7. **Ultrasound:** Synthetic/image-fixture reports; not diagnostically realistic imagery by default.
8. **DXA/OCT/lab imports:** Clearly labeled demo reports or licensed fixtures, only as later milestones.

**For a laptop demo:** These are data/behavior emulators, not actual medical-grade devices. The Rust simulator models observations and failure states; a thin per-device adapter maps simulator output into the common interface. Simulated data should be deterministic under a given seed and scenario.

**For future real instruments:** Create individual adapters only after identifying approved hardware, manufacturer interface specifications, supported transports and data formats, authorization constraints, calibration metadata, and validation procedures. Do not assume every instrument provides Bluetooth, USB, FHIR, DICOM or any specific API.

### Simulation isolation

- `DEMO` mode MUST use only synthetic demo identities and data.
- No real-device credentials, endpoints or command channels in demo builds.
- Clear `SIMULATED` watermark on live displays, stored observations and exported reports.
- Never silently fall back from a failed real instrument to fake data.
- Demo scenario injection must be inaccessible from any future operational build.

---

## 8. Telemetry interface contract

This is the first **Interface Control Document (ICD)** for the prototype. The PDF fixes the overall flow; the exact field names and example schema below are **project design additions**.

### Transport

- **Simulator → API:** `POST /api/v1/telemetry` with UTF-8 JSON, initially bound to localhost in development.
- **API → UI:** WebSocket `GET /api/v1/stream` (project-defined route) for accepted observations and alert events.
- **UI → API:** REST GET endpoints for snapshots, history, examination and equipment metadata.
- **Real deployment concept:** TLS-authenticated/encrypted links and approved device credentials; no assumption about ISS networking architecture.

### Example synthetic telemetry packet

```json
{
  "schema_version": "1.0",
  "event_id": "demo-event-000042",
  "sequence": 42,
  "observed_at": "2026-11-14T09:00:00Z",
  "astronaut_id": "DEMO-CREW-001",
  "device_id": "DEMO-SUIT-001",
  "source_type": "SIMULATED",
  "scenario_id": "normal",
  "measurements": [
    {"code": "heart_rate", "value": 72, "unit": "beats/min", "quality": "VALID"},
    {"code": "spo2", "value": 98, "unit": "%", "quality": "VALID"},
    {"code": "suit_pressure", "value": 30.0, "unit": "kPa", "quality": "VALID"}
  ]
}
```

**Every number above is synthetic illustrative test data, not an operational reference value.** The packet may be expanded with mission elapsed time, sensor-specific error information and an integrity field after the schema and canonical encoding are documented.

### Validation rules (MVP)

- Validate version, required fields, ID format, timestamp syntax, value type, known measurement code and unit.
- Store `received_at` **separately** from instrument `observed_at`.
- Reject duplicate `event_id` writes; treat retries idempotently.
- Detect missing/out-of-order sequence values per device; retain appropriate audit metadata.
- Reject non-finite numbers, unauthorized data sources, unsupported units, malformed payloads and invalid device-to-crew associations.
- Never replace invalid data with fabricated defaults.
- Implement configurable **demo freshness** windows; do not claim a universal medical threshold.
- Define explicit permitted-state transitions for simulator controls (`STOPPED → RUNNING → STOPPED`; fault states handled separately).
- Use authenticated transport and cryptographic integrity/authenticity controls where required by the deployment threat model. A plain SHA checksum alone **does not authenticate** a sender.
- Keep raw packets for debugging and normalized observations for clinical-style displays; document retention and access controls.
- The UI may do *additional* freshness checks, but the backend remains authoritative for accepted data quality.

### WebSocket events

Document and implement discriminated unions for:

- `telemetry.observation` — accepted observation plus source/quality/freshness metadata.
- `device.status` — connected, disconnected, error, last seen.
- `alert.created` / `alert.updated` — severity, triggering evidence, acknowledgment state.
- `system.status` — backend stream status, last server heartbeat, simulation mode.

### HTTP endpoints (MVP target)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Backend status, version, mode |
| GET | `/api/v1/crew` | Demo crew |
| GET | `/api/v1/devices` | Device registry/status |
| POST | `/api/v1/telemetry` | Simulator ingestion; demo access controlled |
| GET | `/api/v1/observations?astronaut_id=...` | History/filtering |
| GET | `/api/v1/examinations` | Examination sessions |
| POST | `/api/v1/examinations` | Create demo examination |
| GET | `/api/v1/alerts` | Active and historical alert list |
| GET (WS) | `/api/v1/stream` | Live observations, statuses, alerts |
| POST | `/api/v1/demo/scenarios` | Explicit DEMO-only scenario control |

Use Pydantic to define server-side schemas; generate and consume an OpenAPI contract or shared TypeScript types instead of duplicating field names by hand. Document API error responses and authorization before connecting real hardware.

---

## 9. Data model and API

Use one database, shared across all eleven modules.

| Entity | Essential fields / relationship |
|---|---|
| `CrewMember` | Demo ID; display name; mission ID; profile metadata |
| `Device` | ID, manufacturer/model (if known), source type, capabilities, connection, calibration and last-seen fields |
| `TelemetryPacket` | Event ID, sequence, raw JSON/hash, source ID, observed/received times, validation result |
| `Observation` | Crew ID, examination ID, measurement code/value/unit, timestamps, quality, provenance, raw packet ID |
| `Examination` | Crew, type, assigned device(s), start/end, operator, status, report reference |
| `MedicalReport` | Type, structured results, image/file references, review/signature status |
| `Alert` | Priority, state, trigger rule/version, related observations, evidence, timestamp, acknowledgment |
| `HealthProgram` | Demo exercise/nutrition records and schedule |
| `AuditEvent` | Actor, action, target, timestamp, outcome and correlation ID |

All IDs should be stable; timestamps should be UTC RFC 3339; units should be canonical and documented. Don't use the patient's name as a database key. Track schema migrations.

Potential later interoperability includes HL7 FHIR `Observation` and `DiagnosticReport`, but **FHIR support is not a requirement for M0** and cannot be assumed to exist in ISS instruments.

---

## 10. Safety, integrity, offline behavior, and security

The PDF's engineering requirements are translated into **design and test tasks** below; that does not mean this project already meets NASA requirements.

### Safety and HMI

- [ ] All values show **units, observed timestamp, source type and quality**.
- [ ] On dropped connection or expired freshness window, mark **STALE / NO LIVE DATA**; never present an unchanged value as current.
- [ ] Alerts have explicit severity and review states; critical-style demo alerts are distinguishable from ordinary notifications.
- [ ] Start/restart in a known, safe **software** state: no acquisition assumed, no device commands issued.
- [ ] Reject invalid / out-of-order commands and document supported state transitions.
- [ ] Reject corrupt/malformed input; log without leaking sensitive records.
- [ ] No single bad sample should trigger a claimed clinical diagnosis.
- [ ] Preserve source/quality metadata through transformations, persistence and export.
- [ ] No simulator writes into any actual crew medical record.

### Security and privacy

- [ ] Default to localhost and demo identities; do not expose ingestion unauthenticated on a public network.
- [ ] Add access control/roles before shared deployment or non-demo use.
- [ ] Use TLS for protected network connections; do not conflate encryption with checksums.
- [ ] Keep secrets out of Git; use environment variables and `.env.example`.
- [ ] Log security-relevant operations and review access to medical-style records.
- [ ] Audit third-party dependencies and pin versions with lockfiles.
- [ ] Use synthetic/non-identifiable datasets for public demos and screenshots.

### Offline-first requirements

- [ ] Local UI and API usable without a ground/Internet connection.
- [ ] Persist accepted telemetry in a local durable store.
- [ ] Retain a bounded retry queue for outward synchronization with idempotent keys.
- [ ] Display sync status separately from sensor/measurement freshness.
- [ ] Recover correctly after process restart and interrupted connectivity.
- [ ] Handle full disk, partial writes, clock drift, duplicate messages, and replay.
- [ ] Do not assume PWA caching alone covers offline data storage.

### Quality and assurance

- [ ] Trace each important requirement to code and automated tests.
- [ ] Add a hazard log and Failure Modes and Effects Analysis (FMEA) appropriate to this *prototype*.
- [ ] Use `cargo fmt`, `cargo clippy`, Python lint/security scanning, TypeScript check and ESLint in CI.
- [ ] Add unit, API contract, integration, reconnect and end-to-end tests.
- [ ] Record coverage and complexity; for any future **formally identified safety-critical components**, assess MC/DC and complexity requirements under NPR 7150.2D (SWE-219/SWE-220), rather than claiming they are met.
- [ ] Review reusable libraries and licensing; maintain dependency inventories and vulnerability reports.
- [ ] Obtain independent review/validation for any real-device or medical use.

---

## 11. Repository layout

**Target structure; files do not exist just because they appear below. Codex should create them incrementally.**

```text
astra-health/
├── README.md
├── .gitignore
├── .env.example
├── docs/
│   ├── reference/                 # Uploaded PDF (manually copied here)
│   ├── architecture.md
│   ├── interface-control.md       # ICD v1, API and data contracts
│   ├── measurement-dictionary.md  # Units, codes, source, quality
│   ├── safety-and-hazards.md
│   ├── requirements-matrix.md
│   └── demo-script.md
├── simulator/                     # Rust (Cargo crate)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── config.rs
│   │   ├── model.rs
│   │   ├── telemetry.rs
│   │   └── scenarios.rs
│   └── tests/
├── backend/                       # Python / FastAPI
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── core/                  # Config, auth, logging
│   │   ├── api/                   # Health, telemetry, crew, alerts, WS
│   │   ├── schemas/               # Pydantic / OpenAPI types
│   │   ├── models/                # SQLAlchemy models
│   │   ├── db/                    # Session and migrations
│   │   ├── services/              # Validation, analytics, alerts
│   │   └── devices/               # Adapter abstraction, demo drivers
│   └── tests/
├── frontend/                      # React / TypeScript / Vite
│   ├── package.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── app/                   # Routing and providers
│   │   ├── components/            # Status, chart, measurement, layout
│   │   ├── features/
│   │   │   ├── dashboard/
│   │   │   ├── crew/
│   │   │   ├── examinations/
│   │   │   ├── equipment/
│   │   │   ├── alerts/
│   │   │   ├── risks/
│   │   │   └── simulator/
│   │   ├── services/              # Typed REST/WS client
│   │   └── types/
│   └── tests/
├── e2e/                           # Browser/end-to-end scenarios
├── scripts/                       # Development utilities
└── .github/workflows/             # CI
```

**Keep this monorepo straightforward.** Do not introduce microservices, Kubernetes, a large state manager, or a separate database per health risk for the MVP.

---

## 12. Getting started

### Prerequisites

- Git.
- Python 3.11+ and `venv`.
- Rust toolchain (`rustup`, `cargo`, `rustc`).
- Node.js version compatible with the currently selected Vite release and npm.

For the current codebase, follow **[the verified local setup guide](docs/development.md)**,
including dependency lockfiles and `alembic upgrade head` before starting the API.
On Arch Linux, run `make setup` once, then `make dev` to start the API, UI and simulator.
Open `http://127.0.0.1:5173`; Ctrl+C stops the stack. Run `make check` and `make smoke` to verify it.
The bootstrap examples below describe the original project initialization and are retained
as specification context; do not rerun project generators over the existing source.

### Create the application skeleton

```bash
# From repository root (once cloned or created)
npm create vite@latest frontend -- --template react-ts

# Create Rust simulator
cargo new simulator --bin

# Create Python backend
mkdir -p backend/app backend/tests
python -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install fastapi 'uvicorn[standard]' pydantic sqlalchemy aiosqlite pytest httpx
python -m pip freeze > backend/requirements.txt
```

Codex must also create:

- `backend/app/main.py` with `GET /api/v1/health` and the FastAPI application.
- `backend/app/__init__.py`.
- A documented `backend` dependency file (`pyproject.toml` is preferred once packaging is established).
- `frontend` typed API/WebSocket client and a page showing backend connection state.
- `simulator` dependencies and an HTTP client for telemetry publishing.
- A root `.gitignore` covering Python virtual environments, Rust `target`, Node build folders, `.env`, local databases and test artifacts.

### Development processes (after bootstrapping)

**Terminal A — FastAPI**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# API documentation: http://127.0.0.1:8000/docs
```

**Terminal B — React**

```bash
cd frontend
npm install
npm run dev
```

**Terminal C — Rust simulation (after CLI implementation)**

```bash
cd simulator
cargo run -- --scenario normal --seed 42 --api-url http://127.0.0.1:8000
```

**The CLI flags above are implemented.** The development API listens only on localhost by default. Configure CORS for the exact Vite development origin; avoid broad `*` production CORS policies.

### Minimal smoke test

1. Open the frontend; verify **DEMO / SIMULATED** is unmistakable.
2. Fetch `GET /api/v1/health` and show the backend status.
3. Start Rust simulator in normal mode.
4. Confirm telemetry reaches `POST /api/v1/telemetry`.
5. Confirm accepted observations persist and render over WebSocket.
6. Stop simulator; after the configured demo timeout, the UI must indicate **STALE / DISCONNECTED**.
7. Restart the backend; prior accepted observations must still appear as **historical**, not live.

---

## 13. Testing and quality gates

### Required automated checks

| Area | Minimum checks |
|---|---|
| Rust | `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` |
| Python | Ruff or flake8, Bandit, `pytest`, type checks where configured |
| React | `tsc --noEmit`, ESLint, component/unit tests, `npm run build` |
| End-to-end | Start API + simulator + UI; verify normal and fault scenarios |
| Dependencies | cargo/pip/npm vulnerability review; lockfiles committed |
| API | Schema validation, unexpected units, duplicates, timestamps, unauthorized mode |
| Streaming | Reconnect, dropped frame, out-of-order packet, backlog, client resync |
| Safety UI | Stale labeling, visible source mode, alert priority, keyboard accessibility |

### Minimum test scenarios

1. **Normal telemetry:** all values parse, store and appear with timestamps/units.
2. **Synthetic oxygen decrease:** explicit simulated alert, linked to evidence and scenario ID.
3. **Synthetic suit-pressure anomaly:** explicit simulated alert with priority ordering.
4. **Simulated simultaneous alerts:** consistent priority queue; lower-priority alert does not hide a higher-priority one.
5. **Sensor loss:** device disconnected; readings change to `STALE / NO LIVE DATA`.
6. **Duplicate event ID:** only one persisted observation set.
7. **Out-of-order sequence:** no incorrect reordering of the *live* display; preserve/audit arrival information.
8. **Malformed/implausible payload:** rejected with clear diagnostic response; no false live reading.
9. **API restart:** safe startup and historical data persistence.
10. **Ground link interruption:** local examination workflow still operates and sync remains pending.
11. **Mode isolation:** demo endpoint cannot create operational/real medical records.
12. **Evidence trace:** every demo alert links to the triggering device and observations.

For simulated alert rules, use deliberately **synthetic threshold settings**, documented as demonstration fixtures. Do **not** present those as accepted medical or spacesuit operating limits.

---

## 14. Hackathon demonstration

The source PDF proposes demonstrating a live telemetry stream with induced suit-pressure and oxygen anomalies. Implement that as a **controlled, replayable demo**:

| Step | Operator action | Expected screen behavior |
|---|---|---|
| 1 | Load `DEMO-CREW-001` and start `normal` scenario | Live labeled synthetic HR, SpO₂ and suit pressure; equipment ready |
| 2 | Open Equipment screen | Simulator device identified and last-seen timestamp updates |
| 3 | Trigger `oxygen_drop_demo` | A **simulated** oxygen warning appears with evidence and priority |
| 4 | Trigger `pressure_anomaly_demo` | Second **simulated** alert appears; queue orders by configured priority |
| 5 | Trigger `sensor_disconnect` | Show device disconnected and historical/stale labels, not fake live numbers |
| 6 | Restart stream | Fresh data resumes; previous event and audit history remain accessible |
| 7 | Open Examination History | See packet/observation provenance, timeline and saved report |

**Presentation wording:** “We built a deterministic Rust telemetry simulator and a real-time medical-interface prototype inspired by NASA software assurance practices. It demonstrates validation, freshness awareness, alert prioritization and traceability. Flight qualification and clinical validation remain future work.”

Do **not** call the laptop simulation NASA-approved, NASA-compliant, high-fidelity, or flight-qualified without appropriate evidence.

---

## 15. Roadmap and TODO list

**Priority codes:** `P0` = required first, `P1` = next working layer, `P2` = expansion, `P3` = real-integration research/assurance.  
**Implementation rule:** Finish each milestone's acceptance criterion before starting the next major system.

### M0 — Documentation and project foundation (P0)

- [ ] Add the source PDF under `docs/reference/` (with permission) and link it here.
- [ ] Add project license (owner selection pending).
- [x] Add `.gitignore`.
- [x] Create the Rust, backend, React/TS projects.
- [x] Add root development instructions and `.env.example`.
- [x] Write `docs/architecture.md` with boundaries, trust zones and diagram.
- [x] Write `docs/interface-control.md` with telemetry JSON schema and WS events.
- [x] Write `docs/measurement-dictionary.md` with measurement codes, units, quality/source values.
- [x] Create health endpoint and a frontend connection indicator.
- [x] Add one basic CI workflow for lint/build/tests.

**Done when:** All three project areas compile/run, the UI reaches `GET /api/v1/health`, and a fresh checkout can be set up from instructions.

### M1 — Rust telemetry simulator (P0)

- [x] Define typed telemetry structures and JSON serialization.
- [x] Implement deterministic seeded normal scenario.
- [x] Add individual stateful baselines and gradual REST / EXERCISE / RECOVERY / ANOMALY dynamics.
- [x] Separate physiological integration, ECG sampling, numerical publication and UI rendering.
- [x] Add seeded pause/resume/restart, adjustable speed and persisted model checkpoints.
- [x] Generate HR, SpO₂ and suit-pressure readings with source timestamps.
- [x] Generate monotonically increasing sequence numbers and unique event IDs.
- [x] POST to `/api/v1/telemetry` with retries/backoff appropriate for demo.
- [x] Implement CLI `--scenario`, `--seed`, `--api-url` and `--rate-hz`.
- [x] Implement controlled `oxygen_drop_demo` and `pressure_anomaly_demo` fixtures.
- [x] Add seeded acute pulse-rise, respiratory-rise and combined stress fixtures with bounded onset within 12 simulated seconds from baseline.
- [x] Implement disconnected-sensor and invalid-packet test fixtures.
- [x] Test serialization, determinism, state transitions and error handling.

**Done when:** Rust publishes repeatable packets to the backend and tests reproduce the same synthetic timeline from a seed.

### M2 — FastAPI ingestion and persistence (P0)

- [x] Define Pydantic telemetry schema and error responses.
- [x] Validate source mode, required fields, units, time and sequence.
- [x] Add SQLAlchemy models and database migrations.
- [x] Persist raw packet metadata and normalized observations.
- [x] Prevent duplicate writes by event ID.
- [x] Implement `/api/v1/crew`, `/api/v1/devices`, `/api/v1/observations`.
- [x] Implement `/api/v1/stream` WebSocket with heartbeat/reconnect design.
- [x] Add reliable device last-seen and connection-state tracking.
- [x] Add tests for malformed, duplicate, missing, delayed and out-of-order inputs.

**Done when:** Data is validated, durable, queryable and streamable after backend restart.

### M3 — Crew-facing interface (P0)

- [x] Create application shell, responsive sidebar and header.
- [x] Add visible `DEMO / SIMULATED` state to every medical view.
- [x] Create Mission Dashboard with connection, device and stream freshness states.
- [x] Create Live Telemetry cards and time-series chart.
- [x] Create Crew Profile and measurement history.
- [x] Create Equipment registry screen.
- [x] Create Alerts panel with priority order and traceable evidence.
- [x] Open every new anomaly alert full screen with a concise view, optional evidence, controllable slow red flashing and reduced-motion support.
- [x] Create Simulator Control screen only for demo users.
- [x] Add accessible focus states, keyboard interaction, text status labels.
- [x] Verify 1366×768, 1920×1080 and 1024×768 layouts, 56 px touch controls and keyboard navigation.
- [x] Test reconnection, stale data and empty/loading/error states.

**Done when:** A user can understand what is live, what is simulated, which device produced it and whether the data is trustworthy.

### M4 — First end-to-end examination (P1)

- [x] Implement common device adapter interface and virtual blood-pressure monitor.
- [x] Implement `Examination` session lifecycle.
- [x] Build Select Crew → Select Device → Acquire → Review → Save workflow.
- [x] Store source ID, device ID, quality, units, timestamps and report association.
- [x] Add examination history and simple export for synthetic records.
- [ ] Test repeated acquisitions, disconnect during test and restart recovery.

**Done when:** A complete simulated examination is saved and can be inspected later with its provenance intact.

### M5 — Safety, anomaly and assurance layer (P1)

- [x] Introduce versioned **demo-only** anomaly rules and explainable evidence.
- [x] Implement deterministic alert priority and state machine.
- [x] Implement `STALE`, `DISCONNECTED`, `INVALID`, `SIMULATED` states.
- [x] Implement safe software startup/restart and sequence rejection.
- [ ] Test all failure scenarios in §13.
- [ ] Add audit logs and traceability from requirement → code → test.
- [ ] Enable linters, static analysis, dependency checks and CI gates.
- [x] Document hazard assumptions and what is *not* medically validated.

**Done when:** The judge can force a fault and inspect the exact event, evidence and consistent UI response.

### M6 — Expand instrument and health modules (P2)

- [x] Add virtual ECG with synthetic waveform and clear limits.
- [ ] Add virtual pulse oximeter and quality/error states.
- [x] Add an event-based synthetic blood-panel fixture (WBC / hemoglobin).
- [ ] Add urine and extended laboratory report formats.
- [ ] Add optional ultrasound, DXA and OCT **synthetic report** import.
- [x] Add all eleven health-risk views from §6.
- [x] Add an interactive synthetic body view with selectable regions and linked measurement provenance.
- [x] Add longitudinal trends and availability indicators per module.
- [x] Add Nutrition and Fitness tracking using demo records.
- [ ] Add permitted clinician review/annotation workflow.
- [ ] Add optional HUD **concept-only** screen.

**Done when:** Each module can display its supported demo data or correctly state **NO DATA / DEVICE UNAVAILABLE** rather than fabricating readings.

### M7 — Offline and synchronized operations (P2)

- [x] Persist local data with recovery and migrations.
- [ ] Queue remote-sync records with idempotency keys.
- [ ] Implement pending/synced/failed states and retries.
- [ ] Test loss of Internet/ground connectivity.
- [ ] Test duplicate, interrupted and partial writes, recovery and disk-full cases.
- [ ] Add access controls and audit boundaries for roles.

**Done when:** A simulated ground-link outage cannot prevent local examination history from being saved and viewed.

### M8 — Real-device readiness research (P3; not hackathon deployment)

- [ ] Identify the **exact** candidate instrument models and their availability/approval constraints.
- [ ] Obtain manufacturer interface control documents and legal access to data interfaces.
- [ ] Design approved real-device adapters without unsafe actuation commands.
- [ ] Map FHIR/DICOM/other standards **only where the device supports them**.
- [ ] Develop equipment test benches and reference-data acceptance tests.
- [ ] Establish cybersecurity threat model and medical-data privacy requirements.
- [ ] Define formal hazard analysis, independent verification and clinical validation plan.
- [ ] Request authoritative NASA/partner software-classification and applicable-standard review.
- [ ] Evaluate target platform constraints, UI/human-factors requirements and true simulation fidelity.
- [ ] Never claim operational compatibility before approval and verification.

**Done when:** A reviewed integration and assurance plan exists. *This is not a flight certification milestone.*

---

## 16. Instructions for Codex contributors

**Treat this README as the product specification and task backlog.** The source PDF takes precedence for its explicitly specified stack and data path. Added features in this README are project-level proposals where the PDF is silent; do not falsely attribute them to NASA.

### Agent working rules

1. **Start with M0**, then M1–M3. Build a vertical slice rather than scaffolding all eleven modules at once.
2. Preserve the required stack: **Rust simulator → FastAPI ingestion → React/TypeScript UI**, REST/JSON and WebSocket.
3. Keep code modular but simple; no premature microservices or complex deployment stack.
4. Use **strict schemas and explicit types** at all API boundaries.
5. Keep mock data separate from production-looking data; enforce `source_type = SIMULATED` on demo fixtures.
6. Do not invent clinical threshold values, treatment recommendations, real ISS device protocols, hardware compatibility or NASA compliance.
7. Do not automatically install/enable external services or transmit sensitive user data.
8. Every new feature needs tests and a visible failure state; avoid placeholder UI that implies the device works.
9. Use clear error messages; never silently discard bad packets, hide disconnects or substitute synthetic observations.
10. Use documented environment variables; do not commit credentials, personal medical data or private keys.
11. For significant decisions, update the architecture/ICD/data-dictionary docs and record assumptions.
12. After each task, run relevant tests, check types/lint, explain what changed and identify remaining TODOs.
13. Prefer production-like UI quality but prioritize data correctness and workflow completion over cosmetic polish.
14. Keep the demo reproducible on an ordinary laptop with no medical hardware, no external API, and no Internet connection after dependencies are installed.
15. When asked to implement a future operational integration, **stop at a documented adapter interface** unless verified hardware documentation and authorization are provided.

### Recommended first Codex prompt

> Read `README.md`, especially §§2–5, §§8–13 and M0 of §15. Implement **only M0**: initialize the Rust simulator, Python/FastAPI backend and React/TypeScript Vite UI; create a basic responsive ASTRA HEALTH application shell; add `GET /api/v1/health`; display the API connection state in the UI; document the JSON telemetry contract without implementing unsafe/unsupported features; add basic tests, lint/build scripts, `.gitignore`, `.env.example`, and run instructions. Use synthetic demo data only. Verify that all projects build and report what was tested and what remains unfinished.

### Coding style and pull requests

- Small modules, descriptive names, consistent units, explicit time zones.
- No hidden mutable globals for medical readings or alert state.
- Commit generated lockfiles, not generated virtualenv/build directories.
- Create tests and update TODO checkboxes **only when implemented and verified**.
- PR description: change summary, related requirement, tests executed, screenshots for UI, remaining risks and limitations.

---

## 17. Definition of done and references

A development milestone is **done** only when its functionality works in a fresh local checkout, accepts realistic synthetic inputs, handles failures, passes its automated checks and is documented. A visually convincing screen without a functioning data path does not count.

### First demo release acceptance checklist

- [x] Rust simulator sends reproducible packets to FastAPI.
- [x] API validates, stores and streams measurements.
- [x] React UI displays timestamp, unit, source and freshness.
- [x] Device disconnect is visible; stale data never masquerades as live.
- [x] Two independent demo fault scenarios create explainable synthetic alerts.
- [x] Alert queue prioritizes scenarios consistently.
- [x] A complete simulated examination is stored and replayable.
- [x] All demo screens say `SIMULATED` clearly.
- [x] `cargo test`, backend tests, TypeScript checks and frontend build pass.
- [ ] README setup instructions work on a fresh laptop.
- [x] No claim of medical diagnosis, real-device support or NASA certification appears in the product.

### Primary project source

- User-provided **NASA Space Apps: Astronot Sağlık İzleme Sistemi — Yazılım Mimarisi, Programlama Dilleri ve NASA Güvenlik Standartları (NPR 7150.2D & NASA-STD-8739.8B) Uygulama Rehberi**, pp. 1–2. This README retains the proposed stack, API flow and fault-demonstration concept and qualifies certification claims.

### Authoritative and implementation references

- [NASA NPR 7150.2D — Software Engineering Requirements](https://swehb.nasa.gov/spaces/SITE/pages/123601159/NPR+7150.2D)
- [NASA-STD-8739.8B — Software Assurance and Software Safety](https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/NASA-STD-87398-Revision-B.pdf)
- [NASA SWE-020 — Software Classification](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695405/SWE-020+-+Software+Classification)
- [FastAPI documentation](https://fastapi.tiangolo.com/)
- [React documentation](https://react.dev/learn)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Vite guide](https://vite.dev/guide/)
- [HL7 FHIR Observation](https://hl7.org/fhir/R5/observation.html) — possible future data interoperability, not assumed instrument support

---

**Project motto:** *One interface. Traceable measurements. Explainable alerts. Safe handling of uncertainty.*
