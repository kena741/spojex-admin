import { loadCoinWalletsByUserIds } from "@/lib/coin-wallets";
import type { FeedInterestDetail, PersonSnapshot } from "@/lib/people/types";
import { userProfileSelect } from "@/lib/query-embeds";
import { getSpojexClient } from "@/lib/spojex/client";
import { safeSelect } from "@/lib/table-helpers";
import {
  type AthleteProfile,
  type MediaProfile,
  type OrganizationRow,
  type ProfileMediaRow,
  type ProfessionalProfile,
  type ServiceRequestRow,
  type ServiceRow,
  type UserRow,
  type WalletRow,
  type WithdrawalRow,
} from "@/lib/types";

/**
 * The Spojex API does not expand PostgREST-style embeds, so role profile tables
 * are fetched explicitly instead of relying on `userProfileSelect` alone.
 */
export async function fetchPersonSnapshot(id: string): Promise<PersonSnapshot> {
  const [
    { data, error: userError },
    orgRes,
    serviceRes,
    verificationRes,
    mediaRes,
    athleteRes,
    professionalRes,
    mediaProfileRes,
    marketRes,
    coinMap,
    feedRes,
  ] = await Promise.all([
    getSpojexClient().from("users").select(userProfileSelect).eq("id", id).maybeSingle(),
    getSpojexClient().from("organizations").select("*").eq("user_id", id),
    safeSelect(() =>
      getSpojexClient()
        .from("services")
        .select(
          "id, title, published, category_id, created_at, cover_url, city, price_amount, currency, pricing_type",
        )
        .eq("provider_id", id),
    ),
    getSpojexClient()
      .from("identity_verification_requests")
      .select("id, status")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getSpojexClient()
      .from("profile_media")
      .select("*")
      .eq("user_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    safeSelect(() =>
      getSpojexClient().from("athlete_profiles").select("*").eq("user_id", id).maybeSingle(),
    ),
    safeSelect(() =>
      getSpojexClient().from("professional_profiles").select("*").eq("user_id", id).maybeSingle(),
    ),
    safeSelect(() =>
      getSpojexClient().from("media_profiles").select("*").eq("user_id", id).maybeSingle(),
    ),
    fetch(`/api/admin/users/${id}/marketplace`, { credentials: "same-origin" }),
    loadCoinWalletsByUserIds([id]),
    fetch(`/api/admin/users/${id}/feed-interests`, { credentials: "same-origin" }),
  ]);

  if (userError) throw new Error(userError.message);
  if (orgRes.error) throw new Error(orgRes.error.message);
  if (serviceRes.error) throw new Error(serviceRes.error);
  if (verificationRes.error && !/does not exist|schema cache/i.test(verificationRes.error.message)) {
    throw new Error(verificationRes.error.message);
  }
  if (mediaRes.error && !/does not exist|schema cache/i.test(mediaRes.error.message)) {
    throw new Error(mediaRes.error.message);
  }

  let services = (serviceRes.data ?? []) as ServiceRow[];
  let wallet: WalletRow | null = null;
  let withdrawals: WithdrawalRow[] = [];
  let bookings: ServiceRequestRow[] = [];

  if (marketRes.ok) {
    const market = (await marketRes.json()) as {
      services?: ServiceRow[];
      wallet?: WalletRow | null;
      withdrawals?: WithdrawalRow[];
      bookings?: ServiceRequestRow[];
    };
    if (Array.isArray(market.services)) services = market.services;
    wallet = market.wallet ?? null;
    withdrawals = market.withdrawals ?? [];
    bookings = market.bookings ?? [];
  }

  let feedInterest: FeedInterestDetail | null = null;
  if (feedRes.ok) {
    const feed = (await feedRes.json()) as FeedInterestDetail;
    feedInterest = {
      preferences: feed.preferences ?? null,
      topics: feed.topics ?? [],
      creators: feed.creators ?? [],
      feedback: feed.feedback ?? [],
    };
  }

  const baseUser = (data as UserRow | null) ?? null;
  const user = baseUser
    ? {
        ...baseUser,
        athlete_profiles: (athleteRes.data as AthleteProfile | null) ?? null,
        professional_profiles: (professionalRes.data as ProfessionalProfile | null) ?? null,
        media_profiles: (mediaProfileRes.data as MediaProfile | null) ?? null,
      }
    : null;

  return {
    user,
    orgs: (orgRes.data ?? []) as OrganizationRow[],
    mediaItems: (mediaRes.data ?? []) as ProfileMediaRow[],
    verificationId: verificationRes.data?.id ?? null,
    verificationStatus: verificationRes.data?.status ?? null,
    coinWallet: coinMap[id] ?? null,
    services,
    wallet,
    withdrawals,
    bookings,
    feedInterest,
  };
}
