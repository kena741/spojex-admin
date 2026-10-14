import type { SpojexClient } from "@/lib/api/client";
import type { AdminActivityLog } from "@/lib/activity-log";

function formatPersonName(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();
}

function readNameFromRow(row: Record<string, unknown>): string {
  return formatPersonName(
    row.full_name as string | undefined,
    row.display_name as string | undefined,
    row.name as string | undefined,
    row.title as string | undefined,
    row.email as string | undefined,
    row.slug as string | undefined,
  );
}

async function fetchNameMap(
  admin: SpojexClient,
  table: string,
  ids: string[],
  select: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await admin.from(table).select(select).in("id", ids);
  if (error || !data) return map;

  for (const row of data as unknown as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const name = readNameFromRow(row);
    if (name) map.set(id, name);
  }

  return map;
}

async function fetchRoleNameMap(
  admin: SpojexClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await admin.from("admin_role").select("id, slug, name").in("id", ids);
  if (error || !data) {
    const bySlug = await admin.from("admin_role").select("slug, name").in("slug", ids);
    if (bySlug.data) {
      for (const row of bySlug.data as unknown as Record<string, unknown>[]) {
        const slug = typeof row.slug === "string" ? row.slug : "";
        const name =
          (row.name as string | undefined)?.trim() || slug;
        if (slug && name) map.set(slug, name);
      }
    }
    return map;
  }

  for (const row of data as unknown as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const name =
      (row.name as string | undefined)?.trim() ||
      (row.slug as string | undefined)?.trim();
    if (name) map.set(id, name);
  }

  return map;
}

async function fetchWithdrawalLabelMap(
  admin: SpojexClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await admin
    .from("withdrawal_requests")
    .select("id, amount, user_id, account_name")
    .in("id", ids);

  if (error || !data) return map;

  for (const row of data as unknown as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const account = (row.account_name as string | undefined)?.trim() || "Withdrawal";
    const amount = Number(row.amount ?? 0);
    const amountLabel = Number.isFinite(amount)
      ? `ETB ${amount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "ETB 0.00";
    map.set(id, `${account} (${amountLabel})`);
  }

  return map;
}

function groupIdsByResourceType(logs: AdminActivityLog[]): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const log of logs) {
    const resourceId = (log.resource_id ?? "").trim();
    if (!resourceId) continue;
    const type = log.resource_type.trim().toLowerCase();
    if (!grouped.has(type)) grouped.set(type, new Set());
    grouped.get(type)?.add(resourceId);
  }
  return grouped;
}

function buildDisplaySummary(
  summary: string,
  resourceId: string | null,
  resourceName: string | null,
): string {
  let result = summary;
  if (resourceId && resourceName && resourceId !== resourceName && summary.includes(resourceId)) {
    result = summary.split(resourceId).join(resourceName);
  }
  if (resourceName && !result.includes(resourceName)) {
    result = `${result} · ${resourceName}`;
  }
  return result;
}

export async function enrichActivityLogs(
  admin: SpojexClient,
  logs: AdminActivityLog[],
): Promise<AdminActivityLog[]> {
  if (logs.length === 0) return logs;

  const grouped = groupIdsByResourceType(logs);

  const adminActorIds = [
    ...new Set(
      logs
        .filter((log) => !log.admin_name?.trim() && log.admin_id)
        .map((log) => log.admin_id as string),
    ),
  ];

  const withdrawalIds = [
    ...new Set([
      ...(grouped.get("payout") ?? []),
      ...(grouped.get("withdrawal") ?? []),
    ]),
  ];

  const [
    adminActorNames,
    adminResourceNames,
    userNames,
    orgNames,
    serviceNames,
    requestNames,
    roleNames,
    stadiumNames,
    eventNames,
    liveEventNames,
    donationNames,
    withdrawalLabels,
  ] = await Promise.all([
    fetchNameMap(admin, "admin", adminActorIds, "id, full_name, email"),
    fetchNameMap(admin, "admin", [...(grouped.get("admin") ?? [])], "id, full_name, email"),
    fetchNameMap(
      admin,
      "users",
      [
        ...(grouped.get("user") ?? []),
        ...(grouped.get("customer") ?? []),
        ...(grouped.get("provider") ?? []),
      ],
      "id, display_name, email",
    ),
    fetchNameMap(
      admin,
      "organizations",
      [...(grouped.get("organization") ?? [])],
      "id, name",
    ),
    fetchNameMap(
      admin,
      "services",
      [...(grouped.get("service") ?? [])],
      "id, title, name",
    ),
    fetchNameMap(
      admin,
      "service_requests",
      [...(grouped.get("booking") ?? []), ...(grouped.get("request") ?? [])],
      "id, title, status",
    ),
    fetchRoleNameMap(admin, [...(grouped.get("role") ?? [])]),
    fetchNameMap(admin, "stadiums", [...(grouped.get("stadium") ?? [])], "id, name"),
    fetchNameMap(admin, "events", [...(grouped.get("event") ?? [])], "id, title, name"),
    fetchNameMap(
      admin,
      "live_events",
      [...(grouped.get("live_event") ?? [])],
      "id, title, name",
    ),
    fetchNameMap(
      admin,
      "donation_campaigns",
      [...(grouped.get("donation") ?? [])],
      "id, title, name",
    ),
    fetchWithdrawalLabelMap(admin, withdrawalIds),
  ]);

  function resolveResourceName(type: string, id: string | null): string | null {
    if (!id) return null;
    switch (type) {
      case "admin":
        return adminResourceNames.get(id) ?? null;
      case "user":
      case "customer":
      case "provider":
        return userNames.get(id) ?? null;
      case "organization":
        return orgNames.get(id) ?? null;
      case "service":
        return serviceNames.get(id) ?? null;
      case "booking":
      case "request":
        return requestNames.get(id) ?? null;
      case "role":
        return roleNames.get(id) ?? null;
      case "stadium":
        return stadiumNames.get(id) ?? null;
      case "event":
        return eventNames.get(id) ?? null;
      case "live_event":
        return liveEventNames.get(id) ?? null;
      case "donation":
        return donationNames.get(id) ?? null;
      case "payout":
      case "withdrawal":
        return withdrawalLabels.get(id) ?? null;
      case "settings":
      case "payment":
        return id;
      default:
        return null;
    }
  }

  return logs.map((log) => {
    const resourceType = log.resource_type.trim().toLowerCase();
    const resourceName = resolveResourceName(resourceType, log.resource_id);
    const adminName =
      log.admin_name?.trim() ||
      (log.admin_id ? adminActorNames.get(log.admin_id) : null) ||
      null;

    return {
      ...log,
      admin_name: adminName,
      resource_name: resourceName,
      display_summary: buildDisplaySummary(log.summary, log.resource_id, resourceName),
    };
  });
}
