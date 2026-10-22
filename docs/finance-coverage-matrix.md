# Spojex Finance coverage matrix

Last updated with the Finance workspace unification. Source of truth for integration state also ships from `GET /api/v1/admin/finance/coverage` and the Reconciliation page.

## Legend

| State | Meaning |
|-------|---------|
| **live** | Verified payment path with domain records in unified Finance |
| **partial** | Records exist; settlement, commission snapshot, or recipient wallet incomplete |
| **config_only** | Settings UI only - no charge path |
| **unimplemented** | No payment records / no checkout |

## Modules

| Module | Flows with records | Integration | Unified Finance | Notes / gaps |
|--------|--------------------|-------------|-----------------|--------------|
| Services | Booking pay, provider earning, refund/clawback, featured pay | live | Yes | Commission snapshotted; wallet earn on complete |
| Gyms | Membership pay | partial | Yes | Commission stored; **no** owner wallet settlement |
| Stadiums | Hourly, pass/sub, cash confirm | partial | Yes | **No** commission columns on payments; no owner wallet |
| Events | Ticket checkout | partial | Yes | `service_fee` as commission in read model; no organizer payout |
| Donations | ETB Chapa + coin gift | partial | Yes | Raised totals update; **disbursement not implemented** |
| Coins | Purchase, gift, redemption | live | Yes | Bonus coins issued on purchase ledger; redemptions manual |
| Gifts | Peer, radio, live, campaign | live | Yes | Filter `module=gifts`; not buried only under Coins |
| Opportunities | Application fee | partial | Yes | Chapa initialize/confirm + mobile checkout wired |
| Mini apps | Partner payments | live | Yes | Confirm verifies via Chapa |
| Featured | Service feature request fee | live | Yes | Confirm requires Chapa verify (unsafe RPC removed) |
| Wallet / withdrawals | Earnings, refunds, withdrawals | live | Yes | Manual Mark paid - not bank transfer |
| Telebirr | - | config_only | Settings only | No processor |
| Campaign disbursements | - | unimplemented | - | Explicit product gap |
| Gym/stadium/event owner payouts | - | unimplemented | Display attribution only | |

## Double-counting rules

- Customer collections = verified rows in domain payment tables only
- Wallet credits / payouts are **not** sales
- Coin issuance after ETB purchase is **not** a second cash sale
- Gift sender debit ≠ recipient credit as two purchases
- Donation contribution + related coin_tx are linked; COIN vs ETB stay separate

## Historical gaps (do not backfill from today’s rates)

1. Stadium payments lack commission snapshots
2. No dedicated `payment_attempts` table - retries share `provider_ref`
3. Gym/event/donation ETB recipient wallets not automated
4. Admin-marked payouts lack PSP settlement confirmation

## Validation checklist (sandbox)

- [ ] Service book → Chapa → complete → wallet earning once
- [ ] Featured + mini_app + opportunity confirm via webhook/return
- [ ] Gift debit/credit pair appears under `module=gifts`
- [ ] Overview KPI drill-downs match Transactions filters
- [ ] Reconciliation dry-run lists stale pendings without mutating balances
- [ ] Concurrent payout approve/reject remains single-settlement
