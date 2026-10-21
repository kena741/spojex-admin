/**
 * Organization vs personal gift attribution (current recipient model).
 *
 * Organization-attributable activity:
 *   Sum of `live_event_gifts.coins` for `live_events` where
 *   `host_org_id = organization.id`.
 *
 * Personal owner wallet (NOT an org balance):
 *   `coin_wallets` keyed by `organizations.user_id`. Live gifts currently
 *   credit this personal wallet. Lifetime received / redeemable belong to
 *   the user account holder.
 *
 * Rules for admin UI and ownership changes:
 * - Do not present owner lifetime gifts as organization activity.
 * - Do not sum the same owner wallet across multiple organizations.
 * - Owner reassignment must not move money, gift balances, or historical txs.
 * - Future org-wallet migration is out of scope until product defines a
 *   separate organization coin account.
 */

export const ORG_GIFT_RECIPIENT_MODEL = {
  orgAttributable: "live_event_gifts via live_events.host_org_id",
  personalWallet: "coin_wallets.user_id = organizations.user_id",
  ownershipTransferMovesFunds: false,
} as const;
