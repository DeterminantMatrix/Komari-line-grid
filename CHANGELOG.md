# Changelog

## v0.6.0

- Match Ping task ordering to the Lite backend across node detail legends, latency selectors, Network view, and historical multi-series charts.
- Preserve the backend task order during live status refreshes instead of falling back to JavaScript object-key / numeric-ID order.
- Keep unknown or legacy task IDs stable at the end without disturbing known Lite task order.
- Add a regression test with intentionally conflicting backend, live-object, record, and numeric-ID orders.
- Includes the v0.5.13 Network time-axis/date fix, deep online/offline status colors, and guest renewal-price privacy fix.

## v0.5.13

- Fix network latency charts to preserve timestamps, show concrete time/date labels, and keep sparse history in its true position inside 1H / 6H / 24H / 7D windows.
- Use deep theme-consistent green/red colors for online/offline status on the node overview.
- Hide renewal price rows from unauthenticated node detail views.
- Clean the main-branch release history after the v0.5.12 preview staging churn.

## v0.5.12

- Replace the large full-resolution PNG preview with the approved 800×450 WebP theme card.
- Keep the dashboard screenshot in the foreground and add a dark warm background so the preview matches Lite theme-market cards better.
- Reduce the preview asset to about 28.3 KB while keeping it comfortably below the 500 KB target.
- Update README, theme manifest, release packaging and CI checks to use `preview.webp`.

## v0.5.11

- Use the full-resolution local PNG preview instead of the compressed JPEG preview.
- Keep README, theme manifest and release package on the same `preview.png` asset.
- Add CI guards so the preview cannot silently regress to a tiny or low-resolution image.

## v0.5.10

- Replace the default theme preview artwork with the new full dashboard screenshot.
- Add the preview image to README.

## v0.5.9

- Fix a v0.5.8 startup regression caused by a stale `base` export after removing legacy API-base compatibility.
- Add a runtime initialization smoke test so undeclared globals in the pre-app runtime fail CI.

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
