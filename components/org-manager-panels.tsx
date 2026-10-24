"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/hooks";
import { cn, formatDate } from "@/lib/utils";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type SearchUser = {
  id: string;
  display_name: string;
  email: string | null;
  username?: string | null;
  role?: string;
  avatar_url?: string | null;
};

type MemberHint = {
  user_id: string;
  member_role: string | null;
  status: string | null;
};

type ContentItem = {
  id: string;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  image_url?: string | null;
  cover_url?: string | null;
  video_url?: string | null;
  like_count?: number | null;
  comment_count?: number | null;
  save_count?: number | null;
  created_at?: string | null;
  published_at?: string | null;
  content_type?: string;
  duration_seconds?: number | null;
  gym_name?: string | null;
};

type ConversationRow = {
  id: string;
  title?: string | null;
  org_thread_kind?: string | null;
  type?: string | null;
  state?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  member_count?: number | null;
};

export function AssignManagerModal({
  open,
  orgId,
  orgName,
  ownerUserId,
  members,
  canWrite,
  onClose,
  onAssigned,
}: {
  open: boolean;
  orgId: string;
  orgName: string;
  ownerUserId: string;
  members: MemberHint[];
  canWrite: boolean;
  onClose: () => void;
  onAssigned: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setOptions([]);
      setSelected(null);
      setError(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raw = query.trim().replace(/^@+/, "");
    if (raw.length < 2) {
      setOptions([]);
      setSearching(false);
      return;
    }
    const seq = ++reqSeq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void adminFetch(`/api/admin/users?q=${encodeURIComponent(raw)}&limit=12`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            data?: SearchUser[];
            error?: string;
          };
          if (seq !== reqSeq.current) return;
          if (!res.ok) {
            setOptions([]);
            setError(json.error || "Search failed");
            return;
          }
          setError(null);
          setOptions(json.data ?? []);
        })
        .catch(() => {
          if (seq !== reqSeq.current) return;
          setOptions([]);
          setError("Search failed");
        })
        .finally(() => {
          if (seq === reqSeq.current) setSearching(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const membershipById = useMemo(() => {
    const map = new Map<string, MemberHint>();
    for (const m of members) map.set(m.user_id, m);
    return map;
  }, [members]);

  const roleLabel = (userId: string) => {
    if (userId === ownerUserId) return "Owner";
    const m = membershipById.get(userId);
    if (!m) return null;
    if (m.member_role === "admin") return "Manager";
    if (m.member_role === "owner") return "Owner";
    if (m.member_role === "moderator") return "Moderator";
    return m.member_role || "Member";
  };

  const submit = async () => {
    if (!canWrite || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${orgId}/managers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selected.id }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Assign manager failed");
      await onAssigned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign manager failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="font-heading text-sm font-semibold">Assign manager</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Organization: <span className="font-medium text-text-primary">{orgName}</span>
        </p>
        <p className="mt-2 text-xs text-text-secondary">
          Managers get operational access: edit profile/logo, publish and manage org content,
          comment as the organization, moderate comments, and manage org chats. This does{" "}
          <strong>not</strong> transfer ownership, platform verification, or finance permissions.
        </p>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-text-secondary">Search by email, @username, or name</span>
          <input
            className={fieldClass}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="@username, email, or display name"
          />
        </label>

        {searching ? (
          <p className="mt-2 text-xs text-text-hint">Searching…</p>
        ) : null}
        {!searching && query.trim().length >= 2 && options.length === 0 ? (
          <p className="mt-2 text-xs text-text-hint">No users found. Try another email or username.</p>
        ) : null}

        {options.length > 0 ? (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
            {options.map((u) => {
              const label = roleLabel(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={u.id === ownerUserId || label === "Manager" || label === "Owner"}
                    onClick={() => {
                      setSelected(u);
                      setQuery(
                        [u.display_name, u.username ? `@${u.username}` : null, u.email]
                          .filter(Boolean)
                          .join(" · "),
                      );
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50",
                      selected?.id === u.id ? "bg-primary/10" : "",
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (u.display_name || "?").slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{u.display_name}</p>
                      <p className="truncate text-xs text-text-secondary">
                        {[u.username ? `@${u.username}` : null, u.email, u.role]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {label ? (
                        <p className="mt-0.5 text-[10px] font-semibold uppercase text-text-hint">
                          Already {label}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {selected ? (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <p className="font-medium text-text-primary">Confirm assignment</p>
            <p className="mt-1 text-text-secondary">
              {selected.display_name}
              {selected.username ? ` (@${selected.username})` : ""}
              {selected.email ? ` · ${selected.email}` : ""}
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-hint">ID: {selected.id}</p>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !selected || !canWrite}
            onClick={() => void submit()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Assign manager"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrgContentPanel({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [gymVideos, setGymVideos] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [listView, setListView] = useState(false);
  const [selected, setSelected] = useState<ContentItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      params.set("sort", sort);
      params.set("limit", "36");
      const res = await adminFetch(
        `/api/admin/organizations/${orgId}/content?${params.toString()}`,
      );
      const payload = (await res.json().catch(() => ({}))) as {
        items?: ContentItem[];
        gym_videos?: ContentItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load content");
      setItems(payload.items ?? []);
      setGymVideos(payload.gym_videos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [orgId, status, q, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = [...items, ...gymVideos];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-semibold">Content library</h2>
            <p className="mt-1 text-xs text-text-secondary">
              Organization-attributed sport news and linked gym videos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="h-9 rounded-lg border border-border px-3 text-sm"
              placeholder="Search captions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="h-9 rounded-lg border border-border px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
              <option value="hidden">Hidden</option>
              <option value="processing">Processing</option>
            </select>
            <select
              className="h-9 rounded-lg border border-border px-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="views">Views / likes</option>
              <option value="engagement">Engagement</option>
            </select>
            <button
              type="button"
              onClick={() => setListView((v) => !v)}
              className="h-9 rounded-lg border border-border px-3 text-xs font-medium"
            >
              {listView ? "Grid" : "List"}
            </button>
            <Link
              href={`/admin/news/new?organization_id=${encodeURIComponent(orgId)}`}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"
            >
              New post
            </Link>
          </div>
        </div>

        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-text-hint">Loading content…</p>
        ) : all.length === 0 ? (
          <p className="text-sm text-text-hint">No attributed content yet.</p>
        ) : listView ? (
          <ul className="divide-y divide-border">
            {all.map((item) => (
              <li key={`${item.content_type}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40"
                >
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                    {(item.cover_url || item.image_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover_url || item.image_url || ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title || "Untitled"}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {item.content_type === "gym_video" ? "Gym video" : "Sport news"}
                      {item.status ? ` · ${item.status}` : ""}
                      {item.created_at ? ` · ${formatDate(item.created_at)}` : ""}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-text-hint">
                    ♥ {item.like_count ?? 0} · 💬 {item.comment_count ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {all.map((item) => (
              <button
                key={`${item.content_type}-${item.id}`}
                type="button"
                onClick={() => setSelected(item)}
                className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-muted text-left"
              >
                {(item.cover_url || item.image_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.cover_url || item.image_url || ""}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-text-hint">
                    No thumb
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="line-clamp-2 text-[11px] font-medium text-white">
                    {item.title || item.summary || "Untitled"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/80">
                    {item.status || "—"} · ♥ {item.like_count ?? 0}
                  </p>
                </div>
                {item.content_type === "gym_video" ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                    Gym
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="font-heading text-sm font-semibold">
                {selected.title || "Content detail"}
              </h3>
              <button type="button" onClick={() => setSelected(null)} className="text-sm">
                Close
              </button>
            </div>
            {(selected.cover_url || selected.image_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.cover_url || selected.image_url || ""}
                alt=""
                className="mb-3 aspect-[9/16] max-h-80 w-full rounded-lg object-cover"
              />
            ) : null}
            <dl className="space-y-2 text-sm">
              <Row label="Type">{selected.content_type === "gym_video" ? "Gym video" : "Sport news"}</Row>
              <Row label="Status">{selected.status || "—"}</Row>
              <Row label="Published">{selected.published_at ? formatDate(selected.published_at) : "—"}</Row>
              <Row label="Likes">{selected.like_count ?? 0}</Row>
              <Row label="Comments">{selected.comment_count ?? 0}</Row>
              <Row label="Saves">{selected.save_count ?? 0}</Row>
              {selected.gym_name ? <Row label="Gym">{selected.gym_name}</Row> : null}
            </dl>
            {selected.summary ? (
              <p className="mt-3 text-sm text-text-secondary">{selected.summary}</p>
            ) : null}
            {selected.content_type !== "gym_video" ? (
              <Link
                href={`/admin/news/${selected.id}`}
                className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
              >
                Open in News admin
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function OrgChatsPanel({ orgId }: { orgId: string }) {
  const [groups, setGroups] = useState<ConversationRow[]>([]);
  const [privateChats, setPrivateChats] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void adminFetch(`/api/admin/organizations/${orgId}/conversations`)
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as {
          groups?: ConversationRow[];
          private?: ConversationRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(payload.error || "Failed to load chats");
        setGroups(payload.groups ?? []);
        setPrivateChats(payload.private ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load chats");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const renderList = (rows: ConversationRow[], empty: string) =>
    rows.length === 0 ? (
      <p className="text-sm text-text-hint">{empty}</p>
    ) : (
      <ul className="divide-y divide-border">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.title || "Conversation"}</p>
              <p className="truncate text-xs text-text-secondary">
                {c.org_thread_kind === "dm" ? "Private" : "Group"}
                {c.state ? ` · ${c.state}` : ""}
                {typeof c.member_count === "number" ? ` · ${c.member_count} members` : ""}
                {c.last_message_at ? ` · ${formatDate(c.last_message_at)}` : ""}
              </p>
              {c.last_message_preview ? (
                <p className="mt-0.5 truncate text-xs text-text-hint">{c.last_message_preview}</p>
              ) : null}
            </div>
            <Link
              href={`/admin/messages?conversation=${encodeURIComponent(c.id)}`}
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">
          Group chats ({groups.length})
        </h2>
        {loading ? <p className="text-sm text-text-hint">Loading…</p> : renderList(groups, "No group chats.")}
      </section>
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-heading text-sm font-semibold">
          Private organization conversations ({privateChats.length})
        </h2>
        {loading
          ? <p className="text-sm text-text-hint">Loading…</p>
          : renderList(privateChats, "No private org inbox threads.")}
      </section>
    </div>
  );
}
