# Reporting & moderation

End-to-end path: Flutter → Python REST → Admin Network → Reports.

## Root cause (admin empty state)

The old Admin Reports page queried `/api/v1/data/reports` with the staff user’s JWT. Postgres RLS on `reports` only allows `select` where the current user is the **reporter**, so the admin queue always looked empty. The UI incorrectly labeled that as a missing API session.

**Fix:** Admin queue uses Python `/api/v1/admin/reports` (server DB, permission-gated) via BFF `/api/admin/reports`. Distinct UI states for 401 / 403 / 5xx / genuine empty / filtered empty.

## Coverage matrix (mobile)

| Surface | Report UI | API | Admin queue | Notes |
|---------|-----------|-----|-------------|-------|
| User profile | Shared sheet | `POST /api/v1/reports` `target_type=user` | Yes | Block offered after submit (separate) |
| Organization profile | Shared sheet (same entry as profile) | `organization` when org id used | Yes | Prefer org id when reporting org entity |
| Service listing | Shared sheet | `service` | Yes | Compatible with prior service reports |
| Chat message | Shared sheet | `message` (membership checked) | Yes | Replaces missing `report_chat_message` RPC |
| Conversation | API ready | `conversation` | Yes | UI entry not wired on all chat types yet |
| Sport News / For You video | **Gap** | `news` supported server-side | Yes when submitted | No overflow Report action yet |
| Gym post / video | **Gap** | `gym_post` / `gym_video` best-effort | Partial | Depends on table presence |
| Radio chat | Specialized Radio Chat UI | Radio chat APIs | Radio Chat tab | Keep separate workflow |

## REST (user)

- `GET /api/v1/report-reasons?target_type=`
- `POST /api/v1/reports` + `Idempotency-Key`
- `GET /api/v1/reports/mine`
- `GET /api/v1/reports/{id}` (own only)

Reporter identity always from auth. Never trust client-supplied reporter/status/moderator fields.

## REST (admin)

- `GET /api/v1/admin/reports`
- `GET /api/v1/admin/reports/{id}`
- `POST /api/v1/admin/reports/{id}/claim`
- `POST /api/v1/admin/reports/{id}/decisions`
- `GET /api/v1/admin/reports/{id}/activity`

Permissions: `reports:read` / `reports:write`.

## Migration

- Backend Alembic `a1spojex000068_moderation_reports`
- Admin SQL mirror `migrations/135_moderation_reports.sql`

Adds `target_type`, `target_id`, `status`, assignment, evidence, idempotency, `report_activity`.

## Remaining gaps

1. Sport News / gym video Report menu entry in Flutter.
2. App version/platform on report metadata.
3. Account restriction action from the reports case (still via People admin).
4. Historical retention policy tooling for evidence JSON.
5. Automated e2e fixtures against non-prod.
6. Org-admin scoped aggregate views (platform staff only today).
