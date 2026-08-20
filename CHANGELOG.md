# Changelog

## v0.4.3

- Add a configurable billing time zone with `Asia/Shanghai` as the default.
- Apply the billing time zone consistently to billing-window boundaries, daily Metric Store grouping, fallback traffic reconstruction and reset countdowns.
- Replace the stale release inliner with a reproducible `src/index.html` -> `dist/index.html` build pipeline that also inlines local image assets.
- Add CI validation and versioned theme-package artifacts.
- Load exchange-rate data only after login state is known and finance data can actually be shown.
- Add a selectable primary GeoIP provider and an opt-in fallback switch; the default now contacts only `ip.sb`.
- Version the per-node traffic reset editor URL with the theme release to avoid stale iframe caches.
- Remove the historical `source-bundle.b64.part-*` transport files from the intended repository layout.

## v0.4.2

- Add a fixed three-level globe quality setting: Low, Medium and High.
- Keep globe rendering quality stable while running to avoid visual flicker.
- Update the self-contained release assets and manifest to v0.4.2.

## v0.4.0

- Separate current billing-period traffic from lifetime network counters.
- Add node search, anomaly filtering, traffic-exhaustion forecasts and Last Seen status.
- Replace full-list refreshes with node-level incremental updates and bound Ping history cache growth.
- Improve globe label correctness, drag performance and idle/offscreen behavior.
- Add a reproducible self-contained release page and per-node traffic reset editor.

## v0.2.4

- Keep Komari node ordering aligned with ascending `weight`.
- Fix Latency `3线合并` so merged mode is preserved and multiple Ping Task series render together.
- Spread country-only globe nodes deterministically while preserving explicit longitude/latitude metadata.
- Prefer `traffic.up/down` Metric history, then fall back to `common:getRecords` network history reconstructed from `net_total_up/down`.
- Keep live cumulative traffic when available history does not cover the full billing period; never invent missing historical days.
