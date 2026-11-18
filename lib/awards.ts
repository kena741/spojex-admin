import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export type AwardEventStatus = "draft" | "upcoming" | "active" | "completed" | "cancelled";

export type AwardEventRow = {
  id: string;
  title: string;
  description?: string;
  cover_url?: string;
  banner_url?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  voting_starts_at?: string | null;
  voting_ends_at?: string | null;
  status: AwardEventStatus;
  admin_status?: AwardEventStatus;
  effective_status?: AwardEventStatus;
  is_published: boolean;
  is_featured?: boolean;
  leaderboard_public?: boolean;
  results_published?: boolean;
  max_votes_per_request?: number;
  rate_limit_per_minute?: number;
  category_count?: number;
  participant_count?: number;
  total_votes?: number;
};

export type AwardCategoryRow = {
  id: string;
  event_id: string;
  name: string;
  description: string;
  image_url: string;
  sort_order: number;
  voting_starts_at: string | null;
  voting_ends_at: string | null;
  free_votes_per_period: number;
  free_vote_period: "daily" | "weekly" | "event";
  paid_votes_enabled: boolean;
  leaderboard_public: boolean | null;
  is_active: boolean;
  nominee_count?: number;
  total_votes?: number;
  voting_state?: string;
};

export type AwardNominationRef = {
  nomination_id: string;
  category_id: string;
  status: string;
  total_votes: number;
};

export type AwardParticipantRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  name: string;
  photo_url: string;
  bio: string;
  organization: string;
  social_links: Record<string, string>;
  is_featured: boolean;
  total_votes: number;
  nominations: AwardNominationRef[];
};

export type AwardPackageRow = {
  id: string;
  event_id: string;
  category_id: string | null;
  name: string;
  votes: number;
  price_etb: number | string;
  min_quantity: number;
  max_quantity: number;
  is_active: boolean;
  sort_order: number;
};

export type AwardEventDetail = {
  event: AwardEventRow;
  categories: AwardCategoryRow[];
  participants: AwardParticipantRow[];
  packages: AwardPackageRow[];
};

export type AwardResultRow = {
  id: string;
  nomination_id: string;
  participant_id: string;
  participant_name: string;
  participant_photo?: string;
  organization?: string;
  rank: number;
  total_votes: number;
  free_votes: number;
  paid_votes: number;
  percentage: number;
  is_winner: boolean;
  prize: string;
  certificate_url: string;
  status: "computed" | "approved" | "published";
};

export type AwardResultGroup = {
  category_id: string;
  category_name: string;
  status: string;
  tally_hash: string;
  rows: AwardResultRow[];
};

export type AwardIntegrity = {
  category_id: string;
  category_name: string;
  stored_hash: string;
  ledger_hash: string;
  matches: boolean;
};

export type AwardLeaderboardRow = {
  nomination_id: string;
  participant_id: string;
  name: string;
  photo_url: string;
  rank: number;
  total_votes: number;
  free_votes?: number;
  paid_votes?: number;
  percentage: number;
  change: number;
};

export const EVENT_STATUSES: AwardEventStatus[] = [
  "draft",
  "upcoming",
  "active",
  "completed",
  "cancelled",
];

export const NOMINATION_STATUSES = ["nominated", "approved", "withdrawn", "disqualified"] as const;

export function statusTone(status: string | undefined) {
  switch (status) {
    case "active":
    case "approved":
    case "published":
      return "success" as const;
    case "upcoming":
    case "computed":
    case "nominated":
      return "info" as const;
    case "cancelled":
    case "disqualified":
      return "danger" as const;
    case "draft":
    case "withdrawn":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

/** ISO → value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO (or null when empty). */
export function fromLocalInput(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function formatNumber(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function errorMessage(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = (detail as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
}

/** Permission an admin needs for one proxied awards call (backend re-checks). */
export function awardsPermissionFor(method: string, path: string): string[] {
  if (method === "GET") return ["awards:read", "awards:write", "awards:results"];
  if (path.startsWith("results/") || path.includes("/results")) return ["awards:results"];
  return ["awards:write"];
}

/** Server-side: forward to /api/v1/admin/awards/… on Spojex REST. */
export async function proxyAwards(path: string, method: string, search: string, body?: unknown) {
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/awards/${path}${search}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: errorMessage(payload, "Awards request failed") },
      { status: res.status },
    );
  }
  return NextResponse.json({ data: payload });
}
