# Research workspace and manual telemetry

The application remains a local, synthetic demonstrator. It is not NASA-certified or validated for flight or clinical decisions.

## Manual telemetry

Open **Simulator controls → Manual telemetry editor**. Enter one or more values and select **Apply readings**. Empty fields continue following the physiology model. The Rust worker applies overrides to published summaries for the selected crew only; the numerical model and ECG continue independently. Paused/disconnected workers do not publish. Overrides clear on restart, when the target crew changes, or with **Clear all overrides**. Sensor-quality faults still mark overridden readings invalid. For alert testing, choose ANOMALY; the existing demonstration rules and one-alert-per-rule-per-run behavior remain in effect.

## NASA references

NASA's [Open Science Data Repository](https://osdr.nasa.gov/bio/repo/) contains space-life-science studies; the [NASA catalog](https://data.nasa.gov/) provides discovery across repositories. Download a tabular CSV and open **Data workspace → Import CSV**. Review the preview, provide the original HTTPS NASA URL and study identifier, and label units before saving. This is a user-supplied file import, not a live NASA API connection or proof of NASA authorship. Raw imaging and omics archives need preprocessing outside this application.

Limits: 1 MB file, 500 rows, 30 columns, 500 characters per cell. CSV quoted fields, embedded newlines, escaped quotes, CRLF and a UTF-8 BOM are supported. Values remain text, preserving identifiers, missing values and source precision. No unit conversions or clinical interpretations are inferred.

NASA tables are immutable references. Manual tables support additional fields, rows and saved revisions. Source metadata, notes, units, creation time and a SHA-256 content checksum are persisted in SQLite's existing operation-record store. Updates use a revision precondition and retain earlier records for audit. **Export saved JSON** exports the last saved version, including its matching checksum; save draft changes first to include them. Reference data is never injected into live crew telemetry. Existing migrations suffice.

## Body view and alerts

Risk monitoring includes the existing 1024 × 1536 illustration with corrected dimensions and hotspot alignment, plus a scalable, rotatable 3D mesh schematic. It is a navigation aid, not medical anatomy. Region buttons support keyboard access. Available measurements include cardiopulmonary readings, saved blood-pressure reports, laboratory results and bone-density reports; unavailable data stays explicitly unavailable.

The alert indicator pulses at 2 Hz (500 ms per cycle). The full-screen background and evidence stay steady. Stop flashing and the operating system's reduced-motion preference disable animation. Flash frequency alone is not an accessibility certification.
