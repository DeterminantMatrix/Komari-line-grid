# Changelog

## v0.6.7

- Make node-list latency sparklines fill their flexible chart column so wide layouts no longer leave a blank block on the right.
- Trim trailing empty Metric Store buckets when the current Ping is valid, so overview sparklines reach the right edge while genuine current loss remains a visible gap.
- Show compact machine capacity beneath CPU, memory and disk usage across list, grid and column views: logical/vCPU count, total memory and total disk.
- Include resource capacities in the live display signature so Lite metadata reconciliation updates changed machine specifications in place.

## v0.6.6

- Reconcile Lite static node metadata every two minutes and immediately after returning to a visible tab, so node add/remove, names, limits, reset days, prices, expiry and public settings update without a browser refresh.
- Recompute Asia/Shanghai traffic billing windows when the calendar day changes, preventing stale billing-period/reset countdown values across midnight or reset-day boundaries.
- Refresh traffic history every five minutes so 7-day bars, daily averages, peaks, forecasts and monthly pulse stay aligned with current counters.
- Add range-aware visible Ping-series TTL refresh (1H 60s, 6H 2m, 24H 5m, 7D 10m) for node Overview/Latency and Network charts, with in-flight request deduplication.
- Preserve live Ping, traffic history, GeoIP enrichment and unchanged native Billing values across static reconciliation; changed billing inputs safely fall back to current node pricing until the next native billing hydration.

## v0.6.5

- Restore traffic billing-period dates and reset countdown after the RPC Batch bootstrap path by applying Lite reset-day display windows to `fetchBootstrap()` results.
- Patch high-frequency live DOM updates in place for fleet summary, keyed node rows/cards/slabs, footer, node-detail navigation/body, and Network/Resource refreshes instead of replacing whole subtrees.
- Preserve keyed node elements while live sorting/reordering, and use display-level live signatures so unchanged online nodes are not rebuilt just because raw timestamps or counters advanced.
- Keep chart SVGs stable during the 2-second compact status stream, while allowing minute Metric-Ping and user-driven renders to refresh changed charts normally.
- Replace the always-running Globe idle `requestAnimationFrame` loop with an adaptive timer that advances only while the globe is visible, unpinned, unobscured, and motion is allowed; actual paints remain RAF-synchronized.
- Gate periodic Globe status repaints by viewport visibility and reset the idle clock after relevant render, positioning, drag, visibility, route, and resize changes.

## v0.6.4

- Batch the initial Lite bootstrap RPCs (`getNodes`, latest status, public info, browser login state, and Ping task definitions) into one `/api/rpc2` request, with an individual-RPC compatibility fallback.
- Batch the paired Ping Metric Store queries and multi-page Billing fetches where possible, while keeping the existing native/legacy fallbacks.
- Merge startup rendering: render once after bootstrap/access is known, hydrate GeoIP/Billing/Ping/Traffic concurrently, then commit one full hydration render instead of rendering after each response.
- Defer boot until `DOMContentLoaded` so the native-data adapter is installed before the first network request; remove the duplicate node-detail render from the full-render path.
- Move the primary Ping data path to Lite's native Metric Store interfaces: `public:getPingMetricStats`, `public:queryMetrics`, and `public:getPublicPingTasks`, while retaining the legacy record query only as a compatibility fallback.
- Keep two-second live status polling on `common:getNodesLatestStatus` compact mode and refresh Ping statistics from Metric Store once per minute instead of invoking the legacy Ping aggregation path.
- Move node Ping history for 1H / 6H / 24H / 7D charts to `ping.latency_ms` Metric Store queries while preserving Lite backend task order, true timestamps, sparse windows, and the existing UI.
- Move System CPU / RAM / Disk history to `cpu.usage`, `memory.used`, and `disk.used` via `public:queryMetrics`; fall back to the legacy load-record response only when native history is unavailable.
- Prefer `admin:getBillingServers` for logged-in finance conversion data and use external FX only for currencies missing from Lite Billing or when Billing is unavailable.
- Fold the v0.6.2 data-correctness guards into the native data adapter, including natural-month traffic coverage, browser-user `public:getMe`, and live-over-history Ping precedence; remove the temporary standalone correctness layer.
- Preserve all existing views, filters, charts, GeoIP controls, finance displays, and legacy fallbacks while reducing unnecessary legacy data reconstruction.

## v0.6.2

- Make the all-node one-hour Ping overview lossless by disabling the legacy global `maxCount` downsampling that can discard per-node samples in larger fleets.
- Keep newer live Ping `current_ms` / loss state authoritative when one-hour history arrives later, preventing stale history from replacing fresher live values.
- Load enough Lite Metric Store traffic history to cover the complete current Shanghai calendar month so the monthly pulse no longer renders earlier dates as false zeros.
- Use Lite `public:getMe` for browser-user access checks instead of treating every `common:getMe` authenticated principal (including API keys / agents) as an administrator.
- Add an isolated correctness layer ahead of the planned native Metric/Billing data-layer refactor while preserving the current UI and feature set.

## v0.6.1

- Give each Ping series a distinct palette color by task order instead of forcing carrier-name colors that could collapse several lines into the same yellow.
- Keep Ping colors consistent across multi-series charts and single-task views using the same six-color theme palette.
- When sorting the node list by latency, always place nodes with missing latency at the end in both descending and ascending modes.
- Retain the v0.6.0 Lite backend Ping task ordering behavior.

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

- Add billing time-zone handling, reproducible builds, CI packaging, and selectable GeoIP. Historical Komari line is frozen at `release/v0.4.3`.
