import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";

type JsonObject = Record<string, unknown>;

type LanguageRow = {
  id?: string;
  code: string;
  name: string;
  active: boolean;
};

type StatusOption = { flag: string; name: string };

type SettingsPayload = {
  appSettings?: JsonObject;
  generalSettings?: JsonObject;
  policySettings?: JsonObject;
  contactUs?: JsonObject;
  adminCommission?: JsonObject;
  statusOptions?: StatusOption[];
  constants?: JsonObject;
  paymentSettings?: JsonObject;
  /** 1 Birr = N coins (stored as coin_settings.etb_per_coin = 1/N). */
  coins_per_birr?: number;
  languageSettings?: LanguageRow[];
  languageDeletedIds?: string[];
};

function parseObject(value: unknown): JsonObject {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as JsonObject;
      return parsed ?? {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

async function upsertSection(
  client: { from: (table: string) => any },
  id: string,
  patch: JsonObject | unknown[],
  replace = false,
) {
  if (replace) {
    const { error } = await client
      .from("app_settings")
      .upsert(
        { id, data: patch, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return;
  }
  const { data: existing } = await client
    .from("app_settings")
    .select("id, data")
    .eq("id", id)
    .maybeSingle();
  const merged = { ...parseObject(existing?.data), ...(patch as JsonObject) };
  const { error } = await client
    .from("app_settings")
    .upsert(
      { id, data: merged, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

export async function GET() {
  const auth = await requireAnyAdminPermission(["settings:read", "settings:write"]);
  if (!auth.ok) return auth.error;
  const client = auth.context.client;
  const [settingsRes, languagesRes, taxRes, coinRes] = await Promise.all([
    client.from("app_settings").select("id, data"),
    client.from("languages").select("id, code, name, active").order("name"),
    client.from("country_tax").select("*").order("created_at", { ascending: true }),
    client.from("coin_settings").select("etb_per_coin").eq("id", 1).maybeSingle(),
  ]);
  if (settingsRes.error) {
    return NextResponse.json(
      { error: settingsRes.error.message },
      { status: 400 },
    );
  }
  const etbPerCoin = Number(coinRes.data?.etb_per_coin);
  const coinsPerBirr =
    Number.isFinite(etbPerCoin) && etbPerCoin > 0 ? 1 / etbPerCoin : 10;
  return NextResponse.json({
    appRows: settingsRes.data ?? [],
    languageRows: languagesRes.data ?? [],
    taxRows: taxRes.data ?? [],
    languagesError: languagesRes.error?.message ?? null,
    taxError: taxRes.error?.message ?? null,
    coinSettings: {
      etb_per_coin: Number.isFinite(etbPerCoin) && etbPerCoin > 0 ? etbPerCoin : 0.1,
      coins_per_birr: coinsPerBirr,
    },
    coinSettingsError: coinRes.error?.message ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("settings:write");
  if (!auth.ok) return auth.error;
  const client = auth.context.client;
  try {
    const payload = (await request.json()) as SettingsPayload;

    if (payload.appSettings) {
      await upsertSection(client, "settings", payload.appSettings);
    }
    if (payload.generalSettings) {
      await upsertSection(client, "settings", payload.generalSettings);
    }
    if (payload.policySettings) {
      await upsertSection(client, "settings", payload.policySettings);
      await upsertSection(client, "policy", payload.policySettings);
    }
    if (payload.contactUs) {
      await upsertSection(client, "contact_us", payload.contactUs, true);
    }
    if (payload.adminCommission) {
      await upsertSection(client, "admin_commission", payload.adminCommission, true);
    }
    if (payload.statusOptions) {
      const cleaned = payload.statusOptions.filter((s) => s.flag?.trim());
      await upsertSection(client, "status", cleaned, true);
    }
    if (payload.constants) {
      await upsertSection(client, "constant", payload.constants);
    }
    if (payload.paymentSettings) {
      await upsertSection(client, "payment", payload.paymentSettings);
      const chapa = parseObject(payload.paymentSettings.chapa);
      const secret = String(chapa.secretKey ?? "").trim();
      if (secret) {
        const { error: secretError } = await client.rpc(
          "admin_set_chapa_secret",
          { p_secret: secret },
        );
        if (secretError) {
          // Still saved in app_settings; _chapa_secret() reads that as fallback.
          console.warn("admin_set_chapa_secret:", secretError.message);
        }
      }
    }

    if (payload.coins_per_birr != null) {
      const perBirr = Number(payload.coins_per_birr);
      if (!Number.isFinite(perBirr) || perBirr <= 0) {
        throw new Error("coins_per_birr must be greater than 0");
      }
      const etbPerCoin = 1 / perBirr;
      const { error: coinError } = await client.from("coin_settings").upsert(
        {
          id: 1,
          etb_per_coin: etbPerCoin,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (coinError) throw new Error(coinError.message);
    }

    if (payload.languageDeletedIds?.length) {
      const { error } = await client
        .from("languages")
        .delete()
        .in("id", payload.languageDeletedIds);
      if (error) throw new Error(error.message);
    }
    if (payload.languageSettings?.length) {
      for (const language of payload.languageSettings) {
        const code = language.code.trim();
        const name = language.name.trim();
        if (!code || !name) continue;
        if (language.id) {
          const { error } = await client
            .from("languages")
            .update({ code, name, active: Boolean(language.active) })
            .eq("id", language.id);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await client.from("languages").insert({
            code,
            name,
            active: Boolean(language.active),
          });
          if (error) throw new Error(error.message);
        }
      }
    }

    const sections: string[] = [];
    if (payload.appSettings || payload.generalSettings) sections.push("settings");
    if (payload.policySettings) sections.push("policy");
    if (payload.contactUs) sections.push("contact_us");
    if (payload.adminCommission) sections.push("admin_commission");
    if (payload.statusOptions) sections.push("status");
    if (payload.constants) sections.push("constant");
    if (payload.paymentSettings) sections.push("payment");
    if (payload.coins_per_birr != null) sections.push("coin_settings");
    if (payload.languageSettings || payload.languageDeletedIds?.length) {
      sections.push("languages");
    }

    await logAdminActivity({
      context: auth.context,
      request,
      action: "update",
      resource_type: payload.paymentSettings ? "payment" : "settings",
      resource_id: payload.paymentSettings ? "payment" : "settings",
      summary: payload.paymentSettings
        ? "Updated payment settings"
        : `Updated global settings (${sections.join(", ") || "general"})`,
      metadata: {
        sections,
        ...(payload.paymentSettings
          ? {
              changes: [
                {
                  field: "chapa.enable",
                  after: parseObject(payload.paymentSettings.chapa).enable,
                },
                {
                  field: "chapa.isActive",
                  after: parseObject(payload.paymentSettings.chapa).isActive,
                },
                {
                  field: "chapa.isSandbox",
                  after: parseObject(payload.paymentSettings.chapa).isSandbox,
                },
                {
                  field: "chapa.publicKey",
                  after: String(
                    parseObject(payload.paymentSettings.chapa).publicKey ?? "",
                  ).trim()
                    ? "[set]"
                    : "",
                },
                {
                  field: "chapa.secretKey",
                  after: String(
                    parseObject(payload.paymentSettings.chapa).secretKey ?? "",
                  ).trim()
                    ? "[changed]"
                    : "",
                },
              ].filter((c) => c.after !== undefined && c.after !== ""),
            }
          : {}),
      },
    });

    const [settingsRes, languagesRes] = await Promise.all([
      client.from("app_settings").select("id, data"),
      client.from("languages").select("id, code, name, active").order("name"),
    ]);
    return NextResponse.json({
      appRows: settingsRes.data ?? [],
      languageRows: languagesRes.data ?? [],
    });
  } catch (error) {
    const hint = missingServiceRoleMessage();
    const message = error instanceof Error ? error.message : "Save failed";
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }
}
