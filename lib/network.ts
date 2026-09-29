import type { NetworkConnectionItem, NetworkUserBrief } from "@/lib/types";

export const networkUserSelect = "id, display_name, username, avatar_url";

export const connectionRequestSelect = [
  "id",
  "requester_id",
  "addressee_id",
  "status",
  "created_at",
  "responded_at",
  `requester:requester_id(${networkUserSelect})`,
  `addressee:addressee_id(${networkUserSelect})`,
].join(", ");

export const connectionSelect = [
  "id",
  "user_a",
  "user_b",
  "created_at",
  `user_a_profile:user_a(${networkUserSelect})`,
  `user_b_profile:user_b(${networkUserSelect})`,
].join(", ");

export const followSelect = [
  "follower_id",
  "following_id",
  "created_at",
  `follower:follower_id(${networkUserSelect})`,
  `following:following_id(${networkUserSelect})`,
].join(", ");

export const blockSelect = [
  "blocker_id",
  "blocked_id",
  "created_at",
  `blocker:blocker_id(${networkUserSelect})`,
  `blocked:blocked_id(${networkUserSelect})`,
].join(", ");

export type ConnectionRequestDbRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  responded_at?: string | null;
  requester?: NetworkUserBrief | null;
  addressee?: NetworkUserBrief | null;
};

export type ConnectionDbRow = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  user_a_profile?: NetworkUserBrief | null;
  user_b_profile?: NetworkUserBrief | null;
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const REQUEST_STATUSES = new Set(["pending", "accepted", "declined", "cancelled"]);

export function buildNetworkConnectionItems(
  requests: ConnectionRequestDbRow[],
  connections: ConnectionDbRow[],
): NetworkConnectionItem[] {
  const connectionByPair = new Map<string, ConnectionDbRow>();
  for (const row of connections) {
    connectionByPair.set(pairKey(row.user_a, row.user_b), row);
  }

  const coveredPairs = new Set<string>();
  const items: NetworkConnectionItem[] = [];

  for (const row of requests) {
    if (!REQUEST_STATUSES.has(row.status)) continue;
    const key = pairKey(row.requester_id, row.addressee_id);
    const connected = connectionByPair.get(key);
    if (row.status === "accepted" || connected) {
      coveredPairs.add(key);
    }
    items.push({
      id: row.id,
      status: row.status as NetworkConnectionItem["status"],
      from_user_id: row.requester_id,
      to_user_id: row.addressee_id,
      from_user: row.requester ?? null,
      to_user: row.addressee ?? null,
      created_at: row.created_at,
      responded_at: row.responded_at ?? null,
      request_id: row.id,
      connection_id: connected?.id ?? null,
      source: "request",
    });
  }

  for (const row of connections) {
    const key = pairKey(row.user_a, row.user_b);
    if (coveredPairs.has(key)) continue;
    items.push({
      id: row.id,
      status: "accepted",
      from_user_id: row.user_a,
      to_user_id: row.user_b,
      from_user: row.user_a_profile ?? null,
      to_user: row.user_b_profile ?? null,
      created_at: row.created_at,
      responded_at: null,
      request_id: null,
      connection_id: row.id,
      source: "connection",
    });
  }

  items.sort((a, b) => {
    const statusRank = (status: string) => {
      if (status === "pending") return 0;
      if (status === "accepted") return 1;
      return 2;
    };
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    return b.created_at.localeCompare(a.created_at);
  });

  return items;
}

export function networkCounts(items: NetworkConnectionItem[]) {
  return {
    pending: items.filter((item) => item.status === "pending").length,
    accepted: items.filter((item) => item.status === "accepted").length,
    declined: items.filter((item) => item.status === "declined" || item.status === "cancelled").length,
    total: items.length,
  };
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
