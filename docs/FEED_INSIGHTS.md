# Feed Insights (admin)

Read-only observability for For You feed performance, personalization evidence, and delivery health. Ranking weights and serving logic are **not** changed by this workspace.

Timezone for report windows: **Africa/Addis_Ababa**. APIs: Python `/api/v1/admin/feed-insights/*` via admin BFF `/api/admin/feed-insights/*`.

## Tabs

| Tab | Data kind | Date range |
|-----|-----------|------------|
| Performance | Events/exposures **in the selected period** | Yes (7 / 30 / 90 / custom) |
| Personalization | **Current** preference & affinity snapshots | No (snapshots are not historical) |
| Delivery health | Outbox / processing / operational gaps | Rolling 24h where applicable |

## Metric definitions (Performance)

| Metric | Unit | Definition |
|--------|------|------------|
| Unique feed viewers | distinct users | Users with `feed_exposures.visible_at` in period. Prefetch / returned-only do **not** count. |
| Impressions | visible exposures | Rows with `visible_at` (client ≥50% on screen ~1s). API-delivered / thumbnail load ≠ impression. |
| Qualified views | viewed exposures | Rows with `viewed_at` (active playback started). |
| Watch time | ms | Sum of `active_watch_ms` on viewed exposures (high-water per playback; retries do not inflate). |
| Avg watch / qualified view | ms | Watch time ÷ qualified views. PiP tracked separately as `pip_watch` events — not mixed into this average. |
| Video completion rate | ratio | `watch_complete` events ÷ qualified views on **video** posts only. Image/audio excluded from denominator. |
| Likes / comments / saves / shares (period) | — | **Unavailable** — not emitted as period `feed_events`; denormalized counters are lifetime only. |
| Not interested | feedback records | `feed_feedback.action = not_interested` in period. |
| Not interested rate | ratio | Not interested ÷ unique viewers. |

Previous-period deltas are shown only when prior-window aggregates exist.

## Personalization

- Summary cards state units explicitly (distinct users vs affinity/feedback **records**).
- Positive vs reduced-interest topics/creators are separate columns. Negative scores mean **reduced ranking weight**, not hard exclusion.
- Hard exclusion uses `feed_feedback` + exposure suppression windows (see `FOR_YOU_FEED.md`).
- Topic key `general` (and some aliases) map to football **at serve time**; affinity rows may still store `general`. Ranking was not retuned for this feature.
- User row opens a feed diagnostic panel (not only the account profile). No “why this appeared” reconstruction from current scores.

## Delivery health

- Outbox pending/failed and last processed time from `feed_outbox`.
- Event processing delay: avg/p95 `received_at − occurred_at` (24h).
- Empty sessions (24h): sessions with no exposures — may be intentional empty inventory.
- HTTP success rate, latency, pagination failures, in-session duplicates: **Unavailable** in Postgres (use APM / ops logs).
- Existence of `feed_events` does **not** imply a healthy worker.

## Instrumentation gaps (honest Unavailable)

1. Period likes / comments / saves / shares as feed events.
2. App version / platform filters on exposure aggregates.
3. Feed HTTP success rate, latency, pagination failure counters in DB.
4. Pre-aggregated duplicate-in-session metrics.
5. Guest feed delivery instrumentation (report covers authenticated sessions).
6. Per-impression serving reasons (“why this appeared”).
7. Historical affinity snapshots for a selected date range.
8. PiP / background watch rolled into primary watch-time denominator (intentionally separate).

## Access

Requires `news:read` or `users:read` (performance/delivery also accept `analytics:read`). User-level behavioral detail is admin-only via these permissions. Page is read-only; no reset-signals / retune-weights actions.
