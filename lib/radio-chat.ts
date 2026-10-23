/** Radio Chat moderation workspace types + helpers (Python admin API). */

export type RadioChatStation = {
  id: string;
  name: string;
  slug: string | null;
  tagline: string;
  image_url: string;
  genre: string;
  city: string;
  status: string;
  activation_status: string;
  health_status: string;
  health_checked_at: string | null;
  chat_paused: boolean;
  chat_slow_mode_seconds: number;
  chat_available: boolean;
  active_message_count: number;
  unresolved_report_count: number;
  manage_url: string;
};

export type RadioChatMessage = {
  id: string;
  stream_id: string;
  user_id: string;
  message: string;
  created_at: string | null;
  status: string;
  deleted_at: string | null;
  client_id?: string | null;
  station: {
    id: string;
    name: string;
    image_url?: string;
    status?: string;
  };
  user: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string;
  };
  report_count: number;
  unresolved_report_count?: number;
  has_reports?: boolean;
  is_anchor?: boolean;
};

export type RadioChatReportGroup = {
  group_key: string;
  message_id: string | null;
  message_missing: boolean;
  message_excerpt: string;
  message_status: string | null;
  stream_id: string;
  station: { id: string; name: string; image_url: string };
  reasons: string[];
  primary_reason: string;
  report_count: number;
  first_reported_at: string | null;
  latest_reported_at: string | null;
  status: string;
  assigned_admin_id: string | null;
  target_user: {
    id: string | null;
    display_name: string;
    avatar_url: string;
  } | null;
  latest_report_id: string | null;
};

export type RadioChatReportDetail = {
  message: RadioChatMessage | { id: string; message: string; status: string; missing?: boolean } | null;
  context: { messages: RadioChatMessage[]; stream_id: string; anchor: RadioChatMessage } | null;
  reports: Array<{
    id: string;
    reason: string;
    details: string;
    created_at: string | null;
    status: string;
    reviewed_at: string | null;
    resolution_note: string;
    assigned_admin_id: string | null;
    reporter: { id: string | null; display_name: string };
  }>;
  report_count: number;
  queue_status: string;
  stream_id: string;
  history: Array<{
    id: string;
    created_at: string | null;
    action: string;
    reason: string;
    actor_admin_id: string | null;
  }>;
  actions_available: string[];
};

export type MessagesResponse = {
  messages: RadioChatMessage[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  counts: {
    messages_matching: number;
    unresolved_reports: number | null;
    unresolved_reports_scope: string;
  };
  mode: string;
  error?: string;
};

export type ReportsResponse = {
  groups: RadioChatReportGroup[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  counts: {
    groups_matching: number;
    unresolved_reports: number | null;
    unresolved_reports_scope: string;
    unresolved_definition?: string;
  };
  error?: string;
};

export const REPORT_QUEUE_STATUSES = [
  { value: "unresolved", label: "Unresolved" },
  { value: "open", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
] as const;

/** Linkify http(s) URLs; leave the rest as text (safe for emoji). */
export function renderMessageSegments(text: string): Array<{ type: "text" | "link"; value: string }> {
  const parts: Array<{ type: "text" | "link"; value: string }> = [];
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "link", value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  if (parts.length === 0) parts.push({ type: "text", value: text });
  return parts;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
