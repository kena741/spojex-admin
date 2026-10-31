"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { allRoles } from "@/lib/catalog";
import { adminFetch } from "@/lib/hooks";
import { cn, formatDate } from "@/lib/utils";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export type StaffUserOption = {
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

export function StaffAccessModal({
  open,
  orgId,
  orgName,
  ownerUserId,
  members,
  canWrite,
  preset,
  onClose,
  onAssigned,
}: {
  open: boolean;
  orgId: string;
  orgName: string;
  ownerUserId: string;
  members: MemberHint[];
  canWrite: boolean;
  /** Member row that opened the modal, so "Make staff…" lands pre-selected. */
  preset?: StaffUserOption | null;
  onClose: () => void;
  onAssigned: (result: { name: string; created: boolean }) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"link" | "create">("link");

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<StaffUserOption[]>([]);
  const [selected, setSelected] = useState<StaffUserOption | null>(null);
  const [searching, setSearching] = useState(false);
  const reqSeq = useRef(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("fan");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the account was created but granting staff failed, so retry skips re-creating it. */
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState<string | undefined>(undefined);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    password?: string;
    linkedExisting: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("link");
    setQuery("");
    setOptions([]);
    setSelected(preset ?? null);
    setSearching(false);
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("fan");
    setPassword("");
    setBusy(false);
    setError(null);
    setPendingUserId(null);
    setPendingPassword(undefined);
    setCreated(null);
    setCopied(false);
  }, [open, preset]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!open || mode !== "link") return;
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
            data?: StaffUserOption[];
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
  }, [open, mode, query]);

  const membershipById = useMemo(() => {
    const map = new Map<string, MemberHint>();
    for (const m of members) map.set(m.user_id, m);
    return map;
  }, [members]);

  const memberBadge = (userId: string) => {
    if (userId === ownerUserId) return "Owner";
    const m = membershipById.get(userId);
    if (!m) return null;
    if (m.member_role === "admin") return "Staff";
    if (m.member_role === "owner") return "Owner";
    if (m.member_role === "moderator") return "Moderator";
    return m.member_role || "Member";
  };

  const assign = async (userId: string) => {
    const res = await adminFetch(`/api/admin/organizations/${orgId}/managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(payload.error || "Add staff failed");
  };

  const submit = async () => {
    if (!canWrite || busy) return;
    setError(null);
    if (mode === "link" && !selected) return;

    setBusy(true);
    let accountReady = Boolean(pendingUserId);
    try {
      if (mode === "link" && selected) {
        await assign(selected.id);
        await onAssigned({ name: selected.display_name, created: false });
        onClose();
        return;
      }

      const name = fullName.trim();
      const address = email.trim().toLowerCase();
      if (!name) throw new Error("Full name is required.");
      if (!address.includes("@")) throw new Error("A valid email is required.");
      if (password.trim() && password.trim().length < 6) {
        throw new Error(
          "Password must be at least 6 characters, or leave it blank to auto-generate.",
        );
      }

      let userId = pendingUserId;
      let temporaryPassword = pendingPassword;
      let linkedExisting = false;

      if (!userId) {
        const res = await adminFetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: name,
            email: address,
            phone: phone.trim(),
            role,
            ...(password.trim() ? { password: password.trim() } : {}),
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          data?: { id?: string };
          password?: string;
          attached_existing?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(payload.error || "Could not create the account.");
        userId = payload.data?.id ?? null;
        if (!userId) throw new Error("The account was created but no user id came back.");
        temporaryPassword = payload.password;
        linkedExisting = Boolean(payload.attached_existing);
        accountReady = true;
        setPendingUserId(userId);
        setPendingPassword(temporaryPassword);
      }

      await assign(userId);
      await onAssigned({ name, created: !linkedExisting });

      setCreated({
        name,
        email: address,
        password: temporaryPassword,
        linkedExisting,
      });
      setPendingUserId(null);
      setPendingPassword(undefined);
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setRole("fan");
    } catch (err) {
      const base = err instanceof Error ? err.message : "Add staff failed";
      setError(
        accountReady && mode === "create"
          ? `${base} The account already exists — press “Create & add staff” again to retry staff access.`
          : base,
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-heading text-sm font-semibold">
            {created ? "Staff access granted" : "Add staff"}
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Organization: <span className="font-medium text-text-primary">{orgName}</span>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {created ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                <span className="font-medium text-text-primary">{created.name}</span>{" "}
                {created.linkedExisting
                  ? "already had a Spojex account, so it was linked as staff."
                  : "was created and added as staff."}
              </p>
              {created.password ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Temporary password
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-white/70 px-2 py-1 font-mono text-sm dark:bg-black/20">
                      {created.password}
                    </code>
                    <button
                      type="button"
                      aria-label="Copy temporary password"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(created.password ?? "");
                          setCopied(true);
                        } catch {
                          setCopied(false);
                        }
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                    Share it with {created.email} now — it is not shown again.
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-text-secondary">
                  {created.email} already had a Spojex login, so no new password was created.
                </p>
              )}
              <p className="text-xs text-text-secondary">
                They can now edit the organization profile, publish content, and manage chats — but
                cannot take ownership, delete the organization, or reach finance.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-text-secondary">
                Staff get the same day-to-day access as the owner. This does not transfer ownership,
                delete the organization, or grant finance access.
              </p>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "link", label: "Link existing user" },
                    { id: "create", label: "Create new person" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={mode === item.id}
                    onClick={() => {
                      setMode(item.id);
                      setError(null);
                    }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      mode === item.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-border hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {mode === "link" ? (
                <div className="space-y-3">
                  {selected ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {selected.display_name}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {[
                              selected.username ? `@${selected.username}` : null,
                              selected.email,
                              selected.role,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelected(null)}
                          className="shrink-0 text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                          Change
                        </button>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-text-hint">ID: {selected.id}</p>
                    </div>
                  ) : (
                    <>
                      <label className="block text-sm">
                        <span className="mb-1 block text-text-secondary">Username or email</span>
                        <input
                          className={fieldClass}
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setSelected(null);
                          }}
                          placeholder="@username or name@example.com"
                          autoComplete="off"
                        />
                      </label>

                      {searching ? <p className="text-xs text-text-hint">Searching…</p> : null}
                      {!searching && query.trim().length >= 2 && options.length === 0 ? (
                        <p className="text-xs text-text-hint">
                          No users found. Switch to “Create new person” to make an account.
                        </p>
                      ) : null}

                      {options.length > 0 ? (
                        <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">
                          {options.map((u) => {
                            const badge = memberBadge(u.id);
                            return (
                              <li key={u.id}>
                                <button
                                  type="button"
                                  disabled={
                                    u.id === ownerUserId || badge === "Staff" || badge === "Owner"
                                  }
                                  onClick={() => setSelected(u)}
                                  className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold">
                                    {u.avatar_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={u.avatar_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
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
                                    {badge ? (
                                      <p className="mt-0.5 text-[10px] font-semibold uppercase text-text-hint">
                                        Already {badge}
                                      </p>
                                    ) : null}
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Full name</span>
                    <input
                      className={fieldClass}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Sara Bekele"
                      autoComplete="off"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Email</span>
                    <input
                      className={fieldClass}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setPendingUserId(null);
                        setPendingPassword(undefined);
                      }}
                      placeholder="name@example.com"
                      autoComplete="off"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="text-text-secondary">Phone (optional)</span>
                      <input
                        className={fieldClass}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+251 …"
                        autoComplete="off"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-text-secondary">Platform role</span>
                      <select
                        className={fieldClass}
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        {allRoles
                          .filter((item) => item.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm">
                    <span className="text-text-secondary">Temporary password (optional)</span>
                    <input
                      className={fieldClass}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave blank to auto-generate"
                      autoComplete="new-password"
                    />
                  </label>
                  <p className="text-xs text-text-secondary">
                    If the email is new this creates a Spojex account and shows a one-time password.
                    If it already exists, that account is linked instead. Their platform role only
                    affects their profile — staff access is granted separately.
                  </p>
                </div>
              )}

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {created ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setCreated(null);
                  setMode("create");
                  setError(null);
                }}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                Add another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !canWrite || (mode === "link" && !selected)}
                onClick={() => void submit()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Saving…" : mode === "link" ? "Add staff" : "Create & add staff"}
              </button>
            </>
          )}
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

type GroupChatMember = {
  user_id: string;
  member_role?: string | null;
  joined_at?: string | null;
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  profile_role?: string | null;
};

export function OrgChatsPanel({
  orgId,
  pendingInvites = [],
}: {
  orgId: string;
  pendingInvites?: Array<{
    id: string;
    user_id: string;
    status: string;
    kind: string;
    message?: string | null;
    created_at?: string | null;
    users?: { id: string; display_name: string; email: string | null } | null;
  }>;
}) {
  const [groups, setGroups] = useState<ConversationRow[]>([]);
  const [privateChats, setPrivateChats] = useState<ConversationRow[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupChatMember[]>([]);
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
          group_members?: GroupChatMember[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(payload.error || "Failed to load chats");
        setGroups(payload.groups ?? []);
        setPrivateChats(payload.private ?? []);
        setGroupMembers(payload.group_members ?? []);
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
        <h2 className="mb-1 font-heading text-sm font-semibold">
          Group chat members ({groupMembers.length})
        </h2>
        <p className="mb-3 text-xs text-text-secondary">
          People in the organization group chat. Chat membership is separate from Staff access
          (managed under Settings).
        </p>
        {loading ? (
          <p className="text-sm text-text-hint">Loading…</p>
        ) : groupMembers.length === 0 ? (
          <p className="text-sm text-text-hint">No group chat members yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {groupMembers.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold">
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (m.display_name || "?").slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/admin/people/${m.user_id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {m.display_name || m.user_id.slice(0, 8)}
                      {m.username ? (
                        <span className="ml-1 font-normal text-text-secondary">@{m.username}</span>
                      ) : null}
                    </Link>
                    <p className="text-xs text-text-secondary">
                      {[m.email, m.member_role || "member"]
                        .filter(Boolean)
                        .join(" · ")}
                      {m.joined_at ? ` · Joined ${formatDate(m.joined_at)}` : ""}
                    </p>
                  </div>
                </div>
                <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-text-secondary">
                  {m.member_role || "member"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingInvites.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-heading text-sm font-semibold">
            Pending join requests ({pendingInvites.length})
          </h2>
          <ul className="divide-y divide-border">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {inv.users?.display_name || inv.user_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {inv.kind} · {inv.status}
                    {inv.created_at ? ` · ${formatDate(inv.created_at)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
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
