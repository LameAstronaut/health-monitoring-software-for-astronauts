# Memento Mori — presentation screenshots

Ten lossless PNG screenshots, each **1920 × 1080 (16:9)**. They show the real app using an isolated, seeded demo database.

The images preserve the app layout, text, and simulation labels. Reduced motion is enabled for clean captures. No loading placeholders or invented readings are inserted.

## Suggested slide order and captions

| Image | Slide title | Suggested caption |
| --- | --- | --- |
| [01-mission-dashboard.png](01-mission-dashboard.png) | Mission dashboard | A shared mission overview brings crew status, current physiological readings, and the daily mood check-in together. |
| [02-live-telemetry.png](02-live-telemetry.png) | Live telemetry & ECG | Time-stamped telemetry trends and a separate continuous synthetic ECG support traceable observation. |
| [03-vehicle-radiation.png](03-vehicle-radiation.png) | Vehicle radiation monitoring | Cabin, airlock, and shelter sensors report environmental radiation for the vehicle, separate from personal health records. |
| [04-crew-body-map.png](04-crew-body-map.png) | Interactive crew body map | An anatomical view links body regions to the selected crew member’s latest available measurements. |
| [05-examination-review.png](05-examination-review.png) | Examination review workflow | A virtual instrument produces an event-based result for explicit review and saving. |
| [06-instrument-registry.png](06-instrument-registry.png) | Instrument registry | A shared registry shows virtual instrument capabilities, crew associations, and acquisition status. |
| [07-reaction-practice.png](07-reaction-practice.png) | Reaction practice | A completed 30-second browser practice test records response times for the selected crew member. |
| [08-mood-check-in.png](08-mood-check-in.png) | Daily mood check-in | Yellow-and-black mood faces provide a simple, crew-specific daily check-in. |
| [09-simulator-controls.png](09-simulator-controls.png) | Reproducible simulation | Playback, scenarios, sensor faults, and a fixed seed support repeatable demonstrations. |
| [10-red-alert.png](10-red-alert.png) | Red alert & response guidance | A simulated suit-pressure anomaly opens a red alert with triggering evidence, response guidance, and audio controls. |

Use the PNG files directly in widescreen slides with **Fit**, preserving the aspect ratio. The overview is a contact sheet for browsing, not a full-size application capture.

All physiological and radiation values are simulated fixtures. The reaction practice was driven by browser automation; its results are demonstration data, not a human performance assessment. The screenshots do not establish clinical validity or physical sensor integration.

## Recreate

After the normal project setup and simulator build, run from the repository root:

```sh
node scripts/capture-presentation.mjs
```

The script starts a disposable local stack on ports 15173/18000, captures real workflows, and shuts it down. Existing demo records are untouched. Chromium must be installed for Playwright.
