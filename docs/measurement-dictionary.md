# Measurement dictionary v1

All current observations have `source_type=SIMULATED`. There are no real-device,
manual or derived ingestion paths. Codes and units are enforced by Pydantic.

| Code | Canonical unit | Representable range | Demo normal fixture |
| --- | --- | --- | --- |
| heart_rate | beats/min | 0–1000 | Seeded integer 70–76 |
| spo2 | % | 0–100 | Seeded integer 97–99 |
| suit_pressure | kPa | 0–1000 | Seeded 30.0–30.3 |

Representation ranges prevent malformed values; they are not validated medical plausibility
checks or clinical alert thresholds. NaN, infinity, strings and booleans are not measurements.
Missing codes are permitted for partial packets (1–3 distinct codes required). The UI keeps
each code's own timestamp so a newer partial packet does not refresh other measurements.
Quality is VALID or INVALID. INVALID readings retain provenance and do not trigger rules.

| Freshness/status | Meaning |
| --- | --- |
| NOT_AVAILABLE | No accepted packet or observation |
| LIVE | Current API session; both source and receipt ages within demo freshness window |
| STALE | Age exceeds ASTRA_STALE_SECONDS (default 5) |
| DISCONNECTED | Age exceeds ASTRA_DISCONNECT_SECONDS (default 15), or UI transport lost |
| HISTORICAL | Packet received before this backend instance started |
| CALIBRATION_UNKNOWN | No calibration authority or real instrument has been integrated |

These configurable timing windows demonstrate data handling; they are not universal medical
timeouts. Source time, receipt time, sequence, source type, device, crew and raw event ID
are preserved. Simulator values depend only on seed, tick and scenario; UTC timestamps and
UUID run prefixes are deliberately different for each acquisition run.

The eleven risk modules require additional reviewed measurement codes, units and import
contracts. They are not yet exposed; absent readings are not synthesized by the API or UI.
