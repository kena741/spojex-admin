import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

type TaxRow = {
  id?: number;
  country?: string;
  name?: string;
  value?: number | string;
  type?: "percentage" | "fixed";
  active?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireAdminPermission("settings:write");
  if (!auth.ok) return auth.error;
  const client = auth.context.client;
  try {
    const body = (await request.json()) as {
      rows?: TaxRow[];
      deletedIds?: number[];
    };
    const deletedIds = body.deletedIds ?? [];
    if (deletedIds.length) {
      const { error } = await client.from("country_tax").delete().in("id", deletedIds);
      if (error) throw new Error(error.message);
    }
    for (const row of body.rows ?? []) {
      const name = String(row.name ?? "").trim();
      if (!name) continue;
      const value = Number(row.value);
      const type = row.type === "fixed" ? "fixed" : "percentage";
      const payload = {
        country: String(row.country ?? "Ethiopia").trim() || "Ethiopia",
        name,
        value: Number.isFinite(value) ? value : 0,
        type,
        is_fix: type === "fixed",
        active: Boolean(row.active),
      };
      if (row.id) {
        const { error } = await client.from("country_tax").update(payload).eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await client.from("country_tax").insert(payload);
        if (error) throw new Error(error.message);
      }
    }
    const { data, error } = await client
      .from("country_tax")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    const hint = missingServiceRoleMessage();
    const message = error instanceof Error ? error.message : "Save failed";
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }
}
