# Flight Deck

The interface uses midnight navy backgrounds, cool instrument panels, cyan
controls, and bright telemetry colors. All interface color definitions live in the
`:root` palette in `frontend/src/styles.css`; components and SVG charts reference
those CSS variables.

| Role | Color | Usage |
| --- | --- | --- |
| Canvas | `#070d18` | Workspace background |
| Panel | `#111d2e` | Cards, dialogs, fields |
| Navigation | `#060c15` | Navigation and browser chrome |
| Cyan | `#63d9f5` | Actions, selection, heart-rate chart |
| Ice | `#8ee7ff` | Brand details and keyboard focus |
| Success | `#69e1b0` | Valid, saved, live states |
| Information | `#8ccaff` | Simulated, planned, review states |
| Red | `#ff6b6b` | All alert levels, warnings, errors, overdue reminders |
| Violet | `#d0b8ff` | Acknowledged states |
| Mood face | `#ffd43b` / `#000000` | Yellow faces with black features |

Each semantic color has matching dark surface and border tokens. Pale text and
strong control borders maintain readability on navy panels. Filled cyan buttons
use a dark foreground; filled alert badges use dedicated darker severity colors
with light text. Focus, selection, and hover states share the cyan family. Native
controls use the dark browser color scheme.

The eight metric/chart colors remain distinct, using cyan, blue, mint, lilac,
coral, amber, violet, and turquoise. ECG grids, body-region overlays, the 3D
schematic, calendars, tables, and dialog backdrops also use the shared palette.
Chart colors identify measurements; status labels separately communicate
freshness and alert severity. Every mood face is yellow with black eyes, mouth,
and outline. Expression and labels distinguish unhappy, neutral, and happy;
the unrecorded state retains its dashed outline.

Alert attention alternates between dark severity surfaces with light text.
Existing reduced-motion behavior is retained. Both alert priorities, early
warnings, telemetry failures, and examination reminders use the same red family.
Priority labels and cue patterns distinguish severity; amber remains a chart
color. Disconnected device badges and the connection indicator are red too.

Navigation, alert, task, and empty-state icons use the shared 24-unit SVG icon
set in `frontend/src/components/Icon.tsx`. Subtle panel gradients, inset edges,
selection accents, and indicator glows stay within existing component bounds.
Page grids, navigation destinations, and section order are unchanged.

## Alert audio

The app synthesizes short sine tones with the browser Web Audio API, with no
network requests or audio assets. Priority two uses two tones; priority one uses
three. Cues play when a full-screen review opens and repeat every 12 seconds
while it remains open. Polling the same alert does not restart the cue. Minimize,
successful acknowledgment, mute, alert replacement, and unmount stop its tones
and timer. Minimizing preserves the alert without continued audio.

Sound is enabled by default after a user gesture unlocks browser playback.
Before activation, use **Enable alert sounds** in the review toolbar; controls
also appear in the existing minimized-alert banner. **Mute alert sounds** saves
the preference in local storage. Muting does not acknowledge or dismiss alerts.
Unsupported browsers disable the audio control and retain all visual alerts;
blocked playback can be retried using the enable control.

Validation included browser inspection of the eleven main screens, text contrast
checks on their rendered states and alert dialogs, and overflow checks at 1366,
1024, and 390 pixels. The text scan checks 4.5:1 for normal text and 3:1 for large
text; it is a targeted review rather than a full accessibility audit. Browser
checks also verified yellow fill and black features at all three mood slider steps.

Representative previews are stored in `artifacts/screenshots/theme-dashboard.png`,
`theme-risk-monitoring.png`, `theme-warning-alert.png`, and `theme-critical-alert.png`.
Mood previews are in `mood-dashboard.png` and `mood-dialog.png` in the same directory.
