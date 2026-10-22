/** Shared types for Feed Insights (Python-backed reporting). */

export type MetricValue = {
  value: number | null;
  unit: string;
  definition: string;
  available: boolean;
  unavailable_reason?: string | null;
  previous?: number | null;
  delta_pct?: number | null;
  p95_ms?: number | null;
  sample_size?: number | null;
};

export type GapItem = { code: string; message: string };

export type PerformanceReport = {
  generated_at?: string;
  timezone?: string;
  ranking_version?: string;
  period?: {
    preset?: string;
    days?: number;
    start?: string;
    end?: string;
    previous_start?: string;
    previous_end?: string;
    note?: string;
  };
  surface?: string;
  metrics?: Record<string, MetricValue>;
  trends?: {
    day: string;
    viewers: number;
    qualified_views: number;
    watch_ms: number;
  }[];
  content?: {
    content_id: string;
    content_key?: string;
    title: string;
    thumbnail_url?: string;
    organization_name?: string | null;
    organization_id?: string | null;
    media_type: string;
    exposures: number;
    qualified_views: number;
    watch_ms: number;
    low_exposure: boolean;
    href: string;
    evidence_note?: string | null;
  }[];
  gaps?: GapItem[];
};

export type AffinityItem = {
  raw?: string;
  label?: string;
  note?: string;
  score: number;
  recent_score?: number;
  excludes_content?: boolean;
  creator_key?: string;
  updated_at?: string | null;
};

export type PersonalizationUser = {
  user_id: string;
  user: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
  has_preference_row: boolean;
  explicit_interests: string[];
  explicit_interests_label?: string | null;
  preferred_languages: string[];
  languages_label?: string | null;
  positive_topics: AffinityItem[];
  reduced_topics: AffinityItem[];
  positive_creators: AffinityItem[];
  reduced_creators: AffinityItem[];
  topic_count: number;
  creator_count: number;
  feedback: Record<string, number>;
  feedback_total: number;
  last_signal_at: string | null;
  detail_href?: string;
  profile_href?: string;
};

export type PersonalizationReport = {
  snapshot_kind?: string;
  snapshot_note?: string;
  summary?: Record<string, MetricValue>;
  users?: PersonalizationUser[];
  total?: number;
  page?: number;
  page_size?: number;
  has_more?: boolean;
  taxonomy_note?: Record<string, string>;
  score_policy?: {
    negative_affinity_excludes?: boolean;
    hard_exclusion?: string;
    ranking_version?: string;
  };
  error?: string;
};

export type UserFeedDetail = {
  user?: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
  snapshot?: PersonalizationUser | null;
  snapshot_kind?: string;
  events?: {
    event_id: string;
    event_type: string;
    content_key?: string;
    occurred_at?: string | null;
    received_at?: string | null;
    active_watch_ms_total?: number | null;
    position_ms?: number | null;
    playback_id?: string | null;
    session_id?: string | null;
  }[];
  feedback?: {
    id: string;
    action: string;
    content_key?: string;
    created_at?: string | null;
  }[];
  sessions?: {
    id: string;
    created_at?: string | null;
    last_active_at?: string | null;
    ranking_version?: string | null;
  }[];
  state?: {
    no_explicit_preferences?: boolean;
    no_preference_record?: boolean;
    no_behavioral_history?: boolean;
    affinities_present?: boolean;
    why_this_appeared_supported?: boolean;
    why_this_appeared_note?: string;
    diagnostic_preview?: { available?: boolean; note?: string };
  };
  profile_href?: string;
  error?: string;
};

export type DeliveryHealth = {
  generated_at?: string;
  ranking_version?: string;
  outbox?: {
    pending?: number | null;
    failed?: number | null;
    oldest_pending_at?: string | null;
    last_processed_at?: string | null;
    available?: boolean;
    note?: string;
  };
  processing_delay?: MetricValue;
  empty_sessions_24h?: MetricValue;
  request_metrics?: Record<string, MetricValue>;
  guest_vs_authenticated?: {
    note?: string;
    authenticated_instrumented?: boolean;
    guest_instrumented?: boolean;
  };
  gaps?: GapItem[];
  stale_warning?: string | null;
  error?: string;
};

export const RANGE_PRESETS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom" },
] as const;

export const SURFACE_OPTIONS = [
  { value: "for_you", label: "For You" },
  { value: "all", label: "All surfaces" },
] as const;

export function formatMetric(m: MetricValue | undefined | null): string {
  if (!m) return "—";
  if (!m.available || m.value == null) return "Unavailable";
  if (m.unit === "ratio") {
    return `${(Number(m.value) * 100).toFixed(1)}%`;
  }
  if (m.unit === "milliseconds") {
    const ms = Number(m.value);
    if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.round(ms)} ms`;
  }
  return Number(m.value).toLocaleString("en-US");
}

export function formatDelta(m: MetricValue | undefined | null): string | null {
  if (!m?.available || m.delta_pct == null) return null;
  const sign = m.delta_pct > 0 ? "+" : "";
  return `${sign}${m.delta_pct}% vs prior`;
}
