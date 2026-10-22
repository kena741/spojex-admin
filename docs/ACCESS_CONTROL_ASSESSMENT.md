# Access control assessment - Activity Logs, Admins, Roles & Finance

**Status:** control hardening delivered; **not** a compliance or certification claim.

## Scope assessed

- Admin frontend: Activity Logs, Admins, Roles & Permissions
- Backend: `admin_rbac.py`, `/api/v1/admin/*`, push admin, coins domain CRUD, legacy `/api/v1/data/*`
- Money paths: coin settings/redemptions, wallet withdrawal resolve (BFF + SQL RPC), finance read/export

## Endpoint → permission matrix (high-risk)

| Surface | Permission(s) | Money / sensitive | Audit |
|---------|---------------|-------------------|-------|
| `GET/PATCH /admin/coins/settings` | `coins:read` / `coins:rates:*` or `coins:write` | Rate config | `coins.settings.update` |
| `POST /admin/coins/redemptions/{id}/resolve` | `coins:redemptions:execute` or `coins:write` | Payout of coins→ETB | `coins.redemption.resolve`; self-subject denied |
| Admin BFF `PATCH /api/admin/coin-redemptions/[id]` | same | proxies backend | BFF + backend audit |
| Admin BFF `PATCH /api/admin/withdrawals/[id]` | `withdrawals:execute\|approve\|write` | ETB payout | `withdrawals.resolve` |
| `GET/POST /push/admin/broadcast` | `notifications:write` | Mass notify | `broadcast` |
| `GET /push/admin/notifications` | `notifications:read` | - | - |
| `POST /admin/invitations` | `admins:invite` or `admins:write` | Staff access | invite audit |
| `PATCH/DELETE /admin/staff/{id}` | `admins:write` | Staff access | suspend/update; session revoke |
| `GET /admin/activity-logs` / export | `logs:read` / `logs:export` | Audit | - |
| Generic `/coins/{wallets,coin_wallets,…}` writes | **disabled** | Ledger | N/A (403/405 via read-only CRUD) |
| `/admin/data/admin_activity_log` writes | **disabled** | Audit integrity | Append via `write_audit` only |
| Legacy `/data/{ledger tables}` writes | **disabled** | Ledger | - |

Full catalog: `PERMISSION_CATALOG` in `app/core/services/admin_rbac.py` (mirrored in `spojex_admin/lib/admin-permissions.ts`).

## Role grants - before / after

| Role | Before | After |
|------|--------|-------|
| `operations_admin` | Nearly all non-admin keys including finance writes | Same modules **without** money-movement / export / private messages |
| `finance_admin` | Broad wallets/coins/payments write | Kept as **legacy combined**; prefer split roles |
| *(new)* `finance_viewer` | - | Summaries + ledger read |
| *(new)* `finance_operator` | - | Prepare / propose only |
| *(new)* `finance_approver` | - | Approve / execute eligible |
| `viewer` | All `:read` including messages | Excludes `messages:read`, `finance:sensitive:read` |

System roles re-sync from `DEFAULT_ROLES` on `ensure_default_roles()`. **Custom roles are not auto-granted new keys.**

Migration impact: existing `operations_admin` staff lose finance write on next role sync. Re-assign `finance_*` roles where needed. Existing `finance_admin` staff retain combined grants.

## Financial approval / integrity (current)

| Control | State |
|---------|-------|
| Granular finance permissions | **Implemented** (+ legacy expand map) |
| Self-approval on coin redemption (admin = wallet owner) | **Implemented** |
| Full draft→approve→execute workflow with revision binding | **Not fully implemented** - no durable approval entity yet |
| Wallet adjust via balanced ledger service | **No adjust API**; generic balance overwrite paths **blocked** |
| Withdrawal resolve dual-control | **Partial** - permission tightened + audit; still single-step SQL RPC |
| Provider timeout Unknown vs Failed | Unchanged; document as gap |
| Super Admin bypass of SoD | **Denied** for self-subject; no silent finance bypass helper |

## Audit coverage

| Area | Coverage |
|------|----------|
| Staff invite / suspend / role change | Yes (backend) |
| Coin settings / redemption resolve | Yes (added) |
| Withdrawal resolve (BFF) | Yes (added) |
| Broadcast push | Yes (added) |
| Network actions | Partial (existing writers) |
| Generic table CRUD | No automatic audit |
| Outcome column | Written by `write_audit` / BFF `logAdminActivity`; UI shows Outcome |
| Filter registry | `AUDIT_ACTION_REGISTRY` / `AUDIT_RESOURCE_REGISTRY` |

Append-only: ordinary admin CRUD cannot update/delete `admin_activity_log`. This is **not** tamper-evident storage; independent retention/WORM is an infrastructure gap.

## Automated verification

```bash
cd spojex_backend && pytest tests/test_admin_rbac.py -q
```

Evidence classes covered: deny-by-default, legacy expand, ops without money movement, viewer exclusions, last super admin, self-suspend, self-approval, audit registries, redaction.

**Not run against production.** Do not invite staff, alter live roles, move money, or rotate credentials during verification.

## Explicit unresolved gaps

1. Durable dual-control approval objects (revision hash, expiry, concurrency lock) for withdrawals and wallet adjust.
2. Python-owned withdrawal resolve (still SQL RPC via BFF).
3. Access JWT blacklist / shorter access TTL after suspend (refresh already revoked).
4. MFA enforcement for finance/security roles (IdP-dependent).
5. Org/resource scope beyond staff role.
6. Complete audit of every legacy `/admin/data/{table}` mutation.
7. Independent append-only audit store / hash chain with separate privileges.
8. Matching active+disabled admin rows: investigate by `admin.id` + `user_id` (UI now shows both); do not merge by email alone.

## Staged rollout

1. Deploy backend (permission catalog + enforcement + read-only ledgers).
2. Deploy admin UI (filters, outcome, role dialog, BFF permission fixes).
3. Review staff with `operations_admin` who need finance → assign `finance_operator` / `finance_approver`.
4. Prefer new finance split roles for new invites; keep `finance_admin` only where SoD is accepted as legacy risk.
5. Confirm activity log Outcome column and registry filters in staging before production announcement.
