# Changelog

## v0.2.4

- Keep Komari node ordering aligned with ascending `weight`.
- Fix Latency `3线合并` so merged mode is preserved and multiple Ping Task series render together.
- Spread country-only globe nodes deterministically while preserving explicit longitude/latitude metadata.
- Prefer `traffic.up/down` Metric history, then fall back to `common:getRecords` network history reconstructed from `net_total_up/down`.
- Keep live cumulative traffic when available history does not cover the full billing period; never invent missing historical days.

<!-- v0.3.0 source-bundle CI trigger; replaced during materialization -->
