# Admin Messages (Network)

Read-only observer of Spojex conversations. Aligns with Flutter `ChatThread` / `ChatLine`.

## Chat kinds

| `chat_kind` | Source | List title |
|-------------|--------|------------|
| `direct` | `conversations.type = direct` | `Name A ↔ Name B` |
| `organization_dm` | `type = organization` + `org_thread_kind = dm` | `Org · User` |
| `organization_group` | org chat, not dm | Group / org name + member/posting context |

Posting mode (`admins_only` / `members`) comes from `organization_chat_settings` and does not change chat kind.

## Message cards

Legacy markers are parsed server-side and never shown raw:

- `[spojex:news_share:…]` → news card
- `[spojex:org_join_request:…]` → invitation card (view org only; never joins)
- `[spojex:coin_gift:…]` → gift card (Finance link when transfer id present)

## Observer rules

Viewing does not mark read, emit presence, accept invitations, join orgs, or move coins.

API: `GET /api/v1/admin/messages/conversations` and `.../{id}` (`messages:read`).
