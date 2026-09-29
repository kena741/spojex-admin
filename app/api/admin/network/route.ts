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

  return NextResponse.json({
    items,
    follows: followsRes.data ?? [],
    blocks: blocksRes.data ?? [],
    counts: {
      ...networkCounts(items),
      follows: followsRes.data?.length ?? 0,
      blocks: blocksRes.data?.length ?? 0,
    },
  });
}
