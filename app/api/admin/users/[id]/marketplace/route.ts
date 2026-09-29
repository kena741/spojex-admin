import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  bookingEmbedFallback,
  bookingEmbedSelect,
  isMissingRelation,
  listingEmbedSelect,
} from "@/lib/marketplace";

async function optionalRows<T>(
  run: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await run;
  if (error) {
    if (isMissingRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("users:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  try {
    const servicesRich = await auth.context.client
      .from("services")
      .select(listingEmbedSelect)
      .eq("provider_id", id)
      .order("created_at", { ascending: false });
    const services = servicesRich.error
      ? await optionalRows(
          auth.context.client
            .from("services")
            .select("*")
            .eq("provider_id", id)
            .order("created_at", { ascending: false }),
        )
      : (servicesRich.data ?? []);

    const wallets = await optionalRows(
      auth.context.client.from("wallets").select("*").eq("user_id", id).limit(1),
    );
    const withdrawals = await optionalRows(
      auth.context.client
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    );

    const bookingsRich = await auth.context.client
      .from("service_requests")
      .select(bookingEmbedSelect)
      .or(`requester_id.eq.${id},provider_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(80);
    const bookings = bookingsRich.error
      ? await optionalRows(
          auth.context.client
            .from("service_requests")
            .select(bookingEmbedFallback)
            .or(`requester_id.eq.${id},provider_id.eq.${id}`)
            .order("created_at", { ascending: false })
            .limit(80),
        )
      : (bookingsRich.data ?? []);

    return NextResponse.json({
      services,
      wallet: wallets[0] ?? null,
      withdrawals,
      bookings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load marketplace data" },
      { status: 400 },
    );
  }
}
