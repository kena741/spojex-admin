export type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export type AnalyticsSection = "overview" | "users" | "gyms" | "content";

export const ANALYTICS_TZ = "Africa/Addis_Ababa";

export type AnalyticsQuery = {
  range: RangeKey;
  start?: string;
  end?: string;
  timezone?: string;
  tab?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: number;
  page_size?: number;
  content_type?: string;
};

export function buildAnalyticsSearch(q: AnalyticsQuery): string {
  const params = new URLSearchParams();
  params.set("range", q.range || "30d");
  params.set("timezone", q.timezone || ANALYTICS_TZ);
  if (q.range === "custom") {
    if (q.start) params.set("start", q.start);
    if (q.end) params.set("end", q.end);
  }
  if (q.tab) params.set("tab", q.tab);
  if (q.q) params.set("q", q.q);
  if (q.sort) params.set("sort", q.sort);
  if (q.order) params.set("order", q.order);
  if (q.page) params.set("page", String(q.page));
  if (q.page_size) params.set("page_size", String(q.page_size));
  if (q.content_type) params.set("content_type", q.content_type);
  return params.toString();
}

export async function fetchAnalytics<T>(
  section: AnalyticsSection,
  query: AnalyticsQuery,
  signal?: AbortSignal,
): Promise<T> {
  const qs = buildAnalyticsSearch(query);
  const res = await fetch(`/api/admin/analytics/${section}?${qs}`, {
    signal,
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Failed to load analytics",
    );
  }
  return payload as T;
}

export async function fetchContentDetail(
  type: string,
  id: string,
  query: AnalyticsQuery,
  signal?: AbortSignal,
) {
  const qs = buildAnalyticsSearch(query);
  const res = await fetch(
    `/api/admin/analytics/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}?${qs}`,
    { signal, cache: "no-store" },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Failed to load content detail",
    );
  }
  return payload;
}

export function exportAnalyticsUrl(
  section: "users" | "gyms" | "content",
  query: AnalyticsQuery,
) {
  const qs = buildAnalyticsSearch(query);
  return `/api/admin/analytics/export?export_section=${section}&${qs}`;
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatChange(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export function parseRangeFromSearch(sp: URLSearchParams): AnalyticsQuery {
  const range = (sp.get("range") as RangeKey) || "30d";
  const valid: RangeKey[] = ["today", "7d", "30d", "90d", "custom"];
  return {
    range: valid.includes(range) ? range : "30d",
    start: sp.get("start") || undefined,
    end: sp.get("end") || undefined,
    timezone: sp.get("timezone") || ANALYTICS_TZ,
    tab: sp.get("tab") || undefined,
    q: sp.get("q") || undefined,
    sort: sp.get("sort") || undefined,
    order: sp.get("order") || undefined,
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
    content_type: sp.get("content_type") || undefined,
  };
}
