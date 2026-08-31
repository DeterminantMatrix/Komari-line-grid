# Changelog

## v0.5.8

- Flatten runtime into canonical `src/index.html`, `src/style.css`, and `src/app.js`; `dist/` contains only the generated page.
- Remove the historical slim/runtime/refine/hardening patch chain after writing shipped behavior back into source.
- Remove metadata/config compatibility and `?api=` override; monitor data uses same-origin Lite `/api/rpc2`.
- Add 90-second lazy resource-history TTL and an explicit selected-city globe marker.
- Simplify CI and the minimal three-file package.

## v0.5.7

- Harden currency, GeoIP privacy, history failure handling, resource/finance semantics, footer freshness, and chart performance.
- Add compact status polling, lazy CPU/RAM/Disk history, Web/System fonts, and globe city pinning.

## v0.5.6

- Complete Lite-only migration; add truthful latency, traffic/resource/finance views, anomaly hints, hardware/mobile fixes, and minimal packaging.

## v0.4.3

- Add billing time-zone handling, reproducible builds, CI packaging, exchange-rate gating, and selectable GeoIP. Historical Komari line is frozen at `release/v0.4.3`.
