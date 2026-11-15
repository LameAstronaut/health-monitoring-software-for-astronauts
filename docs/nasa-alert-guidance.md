# NASA references for alert guidance

Reviewed 15 November 2026. Memento Mori displays rule-specific response guidance
in alert review and under “Response guidance” in alert history. Citation links,
source explanations, review dates and attribution labels are kept out of those
screens. The source registry in `frontend/src/alertGuidance.ts` and this document
retain the supporting publications and section identifiers.

Guidance is an application interpretation of public NASA requirements and
publications, not a NASA-issued emergency or treatment checklist. The simulator's
thresholds and baselines have not been validated by NASA.

| Official source | Sections | Use in the application |
| --- | --- | --- |
| [NASA-STD-3001 Vol. 1: Health and Medical Care](https://www.nasa.gov/reference/3-0-health-and-medical-care/) | §§3.1, 3.4–3.5; V1 3000, 3003, 3004 | Medical-team-led care, mission-specific treatment and individualized recovery targets. The escalation instruction is an application inference from this responsibility. |
| [NASA: Crew Systems](https://www.nasa.gov/reference/crew-systems/) | Medical Kit | Availability of vital-sign, ECG and oximetry diagnostics on Orion. This supports the equipment reference, not a universal diagnostic or treatment algorithm. |
| [NASA-STD-3001 Vol. 2: Natural and Induced Environments](https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/) | §§6.1–6.2; V2 6001, 6003, 6004 | Review environment and suit trends, including oxygen and carbon dioxide. Response actions are inferred from system monitoring/control requirements. No cabin pressure limit is applied to a suit. |
| [NASA-STD-3001 Vol. 2: Spacesuits](https://www.nasa.gov/reference/11-0-spacesuits-vol-2/) | §§11.1.4, 11.3.2–11.3.5; V2 11006, 11007, 11034–11036, 11039 | Approved suit set-points and combined pressure/O₂/CO₂ monitoring. Directs operators to their actual mission procedure; does not invent pressure adjustment rates, oxygen flow or emergency sequences. |
| [NASA: Risk of Cardiovascular Adaptations](https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/) | What can be done about it? | Exercise and nutrition as longer-term cardiovascular prevention, explicitly distinguished from acute pulse-alert treatment. |

Pulse-rise and pulse-decrease alerts request medical assessment with appropriate
available diagnostics. Breathing-rate and oxygen alerts add assessment of the
breathing environment. Suit-pressure alerts reference the suit's approved set-point
and off-nominal procedure, together with atmospheric monitoring.

These public standards do not establish a universal treatment that normalizes a
single abnormal telemetry reading. The implementation therefore does not prescribe
medication, oxygen doses, pressure settings, clinical diagnoses or treatment targets.
Unknown rules receive only the sourced medical-assessment fallback.

Product instructions for clearing simulator faults and entering Recovery remain
in the separately titled “What to do · simulation” section. Those controls are
Memento Mori behavior, not medical advice or NASA recommendations. Source links are available in this document rather than the alert interface.

## Hosting references (not NASA medical sources)

Caddy HTTPS quick-start
https://caddyserver.com/docs/quick-starts/https

Caddy automatic HTTPS
https://caddyserver.com/docs/automatic-https

Let's Encrypt IP address certificates
https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability
