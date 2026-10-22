# Network admin (Connections, Reports, Messages, Notifications)

## Scope

Four destinations under Network:

| Page | Permission | Backend |
|------|------------|---------|
| Connections | `network:read` / `network:write` | Admin BFF → Postgres (connections, requests, follows, blocks) |
| Reports | `reports:read` / `reports:write` | Python `GET /api/v1/admin/reports` |
| Messages | `messages:read` | Python `GET /api/v1/admin/messages/conversations` |
| Notifications | `notifications:read` / `notifications:write` | Python `GET /api/v1/push/admin/notifications` |

Radio Chat reports stay under Radio Chat; Reports links across without duplicating rows.

## Identity

- Batch user hydration on Connections (embed aliases + `users` fallback).
- Messages/Notifications resolve recipients server-side with Deleted account / Profile unavailable fallbacks.
- Full IDs remain in detail / monospace rows; list UIs show names and usernames.

## Connections

- Default status filter: **All** (URL `?status=` / `?tab=` / `?q=` persisted).
- Peer connection requests are not an admin approval queue; support actions live in an overflow menu.
- Missing `responded_at` displays **Not recorded** (never invented).
- Follows and blocks show direction; personal blocks are labeled separately from platform restrictions.

## Messages

- Read-only inspection; does not mark messages read or emit presence.
- Previews suppress `[spojex:…]` markers (news share, org invite, coin gift).
- Coin gift cards link to Finance when a transfer id is present; markers alone are not settlement proof.

## Notifications

- Default view is **platform history** (all recipients), not the admin personal inbox.
- Broadcast composer is behind **Create notification**; All users requires explicit confirmation.
- Delivery state distinguishes inbox creation from push provider acceptance.

## Verification (non-production)

Do not remove live relationships, override blocks, send messages, resolve reports, or broadcast during checks.

- [ ] Connections show names; pending not forced when empty
- [ ] Reports empty vs 401/403 distinguished while admin session is valid
- [ ] Direct chats titled with participants; previews are human summaries
- [ ] Notification history shows recipient + kind_label; declined joins not labeled Group Removed
- [ ] Composer hidden until Create notification
