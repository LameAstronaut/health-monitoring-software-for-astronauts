# Measurement dictionary — stateful DEMO

All current observations have `source_type=SIMULATED`. There are no real-device,
manual or derived ingestion paths. Codes and units are enforced by Pydantic.

| Code | Canonical unit | Representable range | Demo normal fixture |
| --- | --- | --- | --- |
| heart_rate | beats/min | 0–1000 | Per-crew baseline 68 / 72 / 64, smooth state |
| respiratory_rate | breaths/min | 0–1000 | Per-crew baseline 13 / 14 / 12, correlated with modeled HR load |
| spo2 | % | 0–100 | Baseline 98.2 with small slow drift |
| suit_pressure | kPa | 0–1000 | Baseline 30 with small slow drift |
| systolic_bp | mmHg | 0–1000 | Continuous modeled pressure plus explicit BP acquisition |
| diastolic_bp | mmHg | 0–1000 | Continuous modeled pressure plus explicit BP acquisition |
| sleep_duration | h | 0–24 | Latest completed synthetic sleep period: 7.5 / 7 / 8 h per crew |
| weight | kg | 0–1000 | Latest recorded synthetic body mass: 64 / 78 / 82 kg per crew; stable between recordings |
| wbc | 10^9/L | 0–1000 | Explicit lab-panel acquisition only |
| hemoglobin | g/dL | 0–1000 | Explicit lab-panel acquisition only |
| bone_density | g/cm2 | 0–1000 | Explicit bone-density report acquisition only |
| body_temperature | °C | 0–100 | Explicit thermometer examination only; per-crew fixtures 36.6 / 36.7 / 36.8 |

Representation ranges prevent malformed values; they are not validated medical plausibility
checks or clinical alert thresholds. NaN, infinity, strings and booleans are not measurements.
Missing codes are permitted for partial packets (1–9 distinct codes required, restricted
to the registered instrument's capabilities). Static codes require an examination. The UI keeps
each code's own timestamp so a newer partial packet does not refresh other measurements.
Quality is VALID or INVALID. INVALID readings retain provenance and do not trigger rules.

| Freshness/status | Meaning |
| --- | --- |
| NOT_AVAILABLE | No accepted packet or observation |
| LIVE | Current API session; both source and receipt ages within demo freshness window |
| STALE | Age exceeds ASTRA_STALE_SECONDS (default 5) |
| DISCONNECTED | Age exceeds ASTRA_DISCONNECT_SECONDS (default 15), or UI transport lost |
| HISTORICAL | Packet received before this backend instance started |
| IDLE | Virtual event-based instrument available; it is not continuously sampling |
| ERROR / INVALID | Injected sensor error / invalid measurement quality; no nominal reading substituted |
| CALIBRATION_UNKNOWN | No calibration authority or real instrument has been integrated |

These configurable timing windows demonstrate data handling; they are not universal medical
timeouts. Source time, receipt time, sequence, source type, device, crew and raw event ID
are preserved. Simulator values depend only on seed, tick and scenario; UTC timestamps and
UUID run prefixes are deliberately different for each acquisition run.

ECG is a separate 125 Hz `mV` waveform, lead DEMO-II, with logical start time and finite
samples. Source, crew, device, UTC timestamps, quality, run and freshness are carried by
the packet/stream envelope. The UI does not derive ECG from the numerical HR summary.

All nine risk views share these records. Unsupported candidate measurements (such as
OCT, balance testing or microbiome reports) are explicitly unavailable. There are no clinical
risk scores. See [simulation equations and limitations](simulation-model.md).


Sleep duration is a recorded completed sleep period, not an accumulating live timer.
It is republished with continuous synthetic telemetry, editable in Simulator controls,
and available in crew summaries, profiles, history and trends. Zero is valid and
never triggers a terminal fixture. Exercise, faults and a deceased state do not
change this historical duration. Its RECORDED display status distinguishes it from
instantaneous vitals; stale, invalid and disconnected source states remain visible.


Body temperature is an event-based synthetic examination (`BODY_TEMPERATURE`),
acquired through `DEMO-TEMP-001`. It is absent from continuous telemetry and requires
explicit review and save. Saved results appear under Arms & movement in the crew
body view, retaining the acquisition time, thermometer ID and source provenance.
The values and representation bounds are fixtures, not clinical thresholds.
