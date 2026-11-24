import { loadCoinWalletsByUserIds } from "@/lib/coin-wallets";
import type { CatalogProfileDocument } from "@/lib/people/catalog-profile";
import type { FeedInterestDetail, PersonSnapshot } from "@/lib/people/types";
import { getSpojexClient } from "@/lib/spojex/client";
import { safeSelect } from "@/lib/table-helpers";
import {
  type OrganizationRow,
  type ProfileMediaRow,
  type ServiceRequestRow,
  type ServiceRow,
  type UserRow,
  type WalletRow,
  type WithdrawalRow,
} from "@/lib/types";

const userSelect =
  "id, user_id, display_name, full_name, username, email, phone, role, avatar_url, cover_url, verified, city, country, headline, bio, currency, website, created_at, updated_at, deleted_at";

/**
 * Person detail snapshot. Role extras come from GET /api/v1/profiles/{id}
 * (catalog), not legacy athlete/professional/media_profiles tables.
 */
export async function fetchPersonSnapshot(id: string): Promise<PersonSnapshot> {
  const client = getSpojexClient();
  const [
    { data, error: userError },
    orgRes,
    serviceRes,
    verificationRes,
    mediaRes,
    catalogProfile,
    marketRes,
    coinMap,
    feedRes,
  ] = await Promise.all([
    client.from("users").select(userSelect).eq("id", id).maybeSingle(),
    client.from("organizations").select("*").eq("user_id", id),
    safeSelect(() =>
      client
        .from("services")
        .select(
          "id, title, published, category_id, created_at, cover_url, city, price_amount, currency, pricing_type",
        )
        .eq("provider_id", id),
    ),
    client
      .from("identity_verification_requests")
      .select("id, status")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("profile_media")
      .select("*")
      .eq("user_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    fetchCatalogProfile(client, id),
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

  return {
    user: (data as UserRow | null) ?? null,
    catalogProfile,
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

async function fetchCatalogProfile(
  client: ReturnType<typeof getSpojexClient>,
  id: string,
): Promise<CatalogProfileDocument | null> {
  try {
    const raw = await client.http.get(`/api/v1/profiles/${id}`);
    if (!raw || typeof raw !== "object") return null;
    return raw as CatalogProfileDocument;
  } catch {
    return null;
  }
}
