import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  blockSelect,
  buildNetworkConnectionItems,
  connectionRequestSelect,
  connectionSelect,
  followSelect,
  networkCounts,
  type ConnectionDbRow,
  type ConnectionRequestDbRow,
} from "@/lib/network";
import type { BlockRow, FollowRow, NetworkUserBrief } from "@/lib/types";

async function hydrateUsers(
  client: {
    from: (table: string) => {
      select: (cols: string) => {
        in: (
          col: string,
          ids: string[],
        ) => Promise<{ data: NetworkUserBrief[] | null; error: { message: string } | null }>;
      };
    };
  },
  ids: string[],
): Promise<Map<string, NetworkUserBrief>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, NetworkUserBrief>();
  if (unique.length === 0) return map;
  // Batch in chunks of 100
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data } = await client
      .from("users")
      .select("id, display_name, username, avatar_url")
      .in("id", chunk);
    for (const row of data ?? []) {
      map.set(row.id, row);
    }
  }
  return map;
}

export async function GET() {
  const auth = await requireAdminPermission("network:read");
  if (!auth.ok) return auth.error;

  const client = auth.context.client;
  const [requestsRes, connectionsRes, followsRes, blocksRes] = await Promise.all([
    client
      .from("connection_requests")
      .select(connectionRequestSelect)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("connections")
      .select(connectionSelect)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("follows")
      .select(followSelect)
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("blocks")
      .select(blockSelect)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const error =
    requestsRes.error || connectionsRes.error || followsRes.error || blocksRes.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const items = buildNetworkConnectionItems(
    (requestsRes.data ?? []) as unknown as ConnectionRequestDbRow[],
    (connectionsRes.data ?? []) as unknown as ConnectionDbRow[],
  );
  let follows = (followsRes.data ?? []) as FollowRow[];
  let blocks = (blocksRes.data ?? []) as BlockRow[];

  const needIds: string[] = [];
  for (const row of items) {
    if (!row.from_user) needIds.push(row.from_user_id);
    if (!row.to_user) needIds.push(row.to_user_id);
  }
  for (const row of follows) {
    if (!row.follower) needIds.push(row.follower_id);
    if (!row.following) needIds.push(row.following_id);
  }
  for (const row of blocks) {
    if (!row.blocker) needIds.push(row.blocker_id);
    if (!row.blocked) needIds.push(row.blocked_id);
  }

  if (needIds.length > 0) {
    const users = await hydrateUsers(client as never, needIds);
    for (const row of items) {
      if (!row.from_user) row.from_user = users.get(row.from_user_id) ?? null;
      if (!row.to_user) row.to_user = users.get(row.to_user_id) ?? null;
    }
    follows = follows.map((row) => ({
      ...row,
      follower: row.follower ?? users.get(row.follower_id) ?? null,
      following: row.following ?? users.get(row.following_id) ?? null,
    }));
    blocks = blocks.map((row) => ({
      ...row,
      blocker: row.blocker ?? users.get(row.blocker_id) ?? null,
      blocked: row.blocked ?? users.get(row.blocked_id) ?? null,
    }));
  }

  return NextResponse.json({
    items,
    follows,
    blocks,
    counts: {
      ...networkCounts(items),
      follows: follows.length,
      blocks: blocks.length,
    },
    note: "Peer connection requests are between users - they are not waiting for admin approval.",
  });
}
