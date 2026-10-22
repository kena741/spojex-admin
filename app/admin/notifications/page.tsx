"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { formatDateTime } from "@/lib/utils";

type Recipient = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  label?: string;
  unavailable?: boolean;
};

type NotificationRow = {
  id: string;
  user_id: string;
  recipient?: Recipient | null;
  kind: string;
  kind_label?: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  channel?: string;
  delivery_state?: string;
  delivery_note?: string;
  read_at: string | null;
  created_at: string;
};

type ListPayload = {
  data?: NotificationRow[];
  scope?: string;
  scope_note?: string;
  error?: string;
};

type BroadcastResult = {
  ok: boolean;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
  errors?: string[];
};

function recipientLabel(row: NotificationRow): string {
  return row.recipient?.label || row.recipient?.display_name || "Profile unavailable";
}

export default function NotificationsPage() {
  const { can } = useAdminPermissions();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [scopeNote, setScopeNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [route, setRoute] = useState("/notifications");
  const [audienceConfirm, setAudienceConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/notifications", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json()) as ListPayload;
      if (!response.ok) throw new Error(payload.error || "Failed to load notifications");
      setRows(payload.data ?? []);
      setScopeNote(payload.scope_note ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const kindOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      set.add(row.kind_label || row.kind || "Notification");
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const label = row.kind_label || row.kind;
      if (kindFilter !== "all" && label !== kindFilter) return false;
      if (!q) return true;
      const hay = [
        row.title,
        row.body,
        label,
        recipientLabel(row),
        row.user_id,
        row.recipient?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, kindFilter]);

  const sendBroadcast = async () => {
    if (!title.trim() || !body.trim()) return;
    if (!audienceConfirm) {
      window.alert("Confirm All users audience before sending.");
      return;
    }
    const confirmed = window.confirm(
      "Final review: send this broadcast to All users with an eligible push token? In-app inbox rows are created separately from device delivery confirmation.",
    );
    if (!confirmed) return;

    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          route: route.trim() || undefined,
        }),
      });
      const data = (await response.json()) as BroadcastResult & { error?: string };
      if (!response.ok) {
        setResult({
          ok: false,
          attempted: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          error: data.error ?? "Could not send broadcast",
        });
        return;
      }
      setResult(data);
      setTitle("");
      setBody("");
      setAudienceConfirm(false);
      setComposerOpen(false);
      await load();
    } catch {
      setResult({
        ok: false,
        attempted: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        error: "Network error. Try again.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Notifications"
        description="Platform notification history and authorized broadcasts"
        breadcrumbs={[
          { label: "Network", href: "/admin/network" },
          { label: "Notifications" },
        ]}
        actions={
          can("notifications:write") ? (
            <button
              type="button"
              onClick={() => {
                setComposerOpen((v) => !v);
                setResult(null);
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              {composerOpen ? "Close composer" : "Create notification"}
            </button>
          ) : null
        }
      />

      {scopeNote ? <p className="mb-3 text-xs text-text-secondary">{scopeNote}</p> : null}

      {composerOpen && can("notifications:write") ? (
        <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-1 font-heading text-sm font-semibold">Broadcast composer</h3>
          <p className="mb-4 text-sm text-text-secondary">
            Creates in-app inbox rows and queues push to devices with FCM tokens. Provider
            acceptance is not the same as confirmed device delivery.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Announcement"
                maxLength={120}
                disabled={sending}
                className="rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Destination</span>
              <select
                value={route}
                onChange={(event) => setRoute(event.target.value)}
                disabled={sending}
                className="rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="/notifications">Notifications inbox</option>
                <option value="/home">Home</option>
                <option value="/explore">Explore</option>
                <option value="/news">News</option>
                <option value="/wallet">Wallet</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-text-secondary">Message</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                maxLength={500}
                disabled={sending}
                className="rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={audienceConfirm}
                onChange={(event) => setAudienceConfirm(event.target.checked)}
                disabled={sending}
                className="mt-1"
              />
              <span>
                Audience: <strong>All users</strong> (explicit). Eligible devices are those with a
                push token; users without a token still receive the in-app inbox row when the
                broadcast writes inbox copies.
              </span>
            </label>
          </div>
          {title.trim() || body.trim() ? (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm">
              <p className="text-[11px] font-semibold uppercase text-text-hint">Preview</p>
              <p className="mt-1 font-medium">{title.trim() || "Untitled"}</p>
              <p className="text-text-secondary">{body.trim() || "-"}</p>
              <p className="mt-2 text-xs text-text-hint">Opens: {route || "/notifications"}</p>
            </div>
          ) : null}
          {result ? (
            <div
              className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
                result.ok && result.failed === 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {`Push job: attempted ${result.attempted}, provider accepted ${result.sent}, skipped ${result.skipped}, failed ${result.failed}.`}
              {result.error ? ` ${result.error}` : ""}
              {(result.errors ?? []).slice(0, 2).map((e) => ` ${e}`).join("")}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void sendBroadcast()}
            disabled={sending || !title.trim() || !body.trim() || !audienceConfirm}
            className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Review & send broadcast"}
          </button>
        </section>
      ) : null}

      {loading ? <AdminLoadingRow label="Loading notification history…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminFilterPanel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-text-hint">Category</label>
            <AdminSelect value={kindFilter} onChange={setKindFilter}>
              <option value="all">All</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[11px] text-text-hint">Search</label>
            <AdminSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Recipient, title, body, or id"
            />
          </div>
        </div>
      </AdminFilterPanel>

      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title={rows.length === 0 ? "No notifications yet" : "No matching notifications"}
            description={
              rows.length === 0
                ? "Platform in-app notification rows will appear here when the app or broadcasts create them."
                : "Try another category or clear search."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Recipient</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Title / body</th>
                  <th className="px-4 py-3 font-semibold">Channel</th>
                  <th className="px-4 py-3 font-semibold">Delivery</th>
                  <th className="px-4 py-3 font-semibold">Opened</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const label = recipientLabel(row);
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${row.user_id}`}
                          className="flex min-w-0 items-center gap-2 text-primary"
                        >
                          <UserAvatar
                            name={label}
                            src={row.recipient?.avatar_url}
                            size={28}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{label}</span>
                            {row.recipient?.username ? (
                              <span className="block truncate text-[11px] text-text-secondary">
                                @{row.recipient.username}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium">
                          {row.kind_label || row.kind}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-medium">{row.title}</p>
                        <p className="truncate text-xs text-text-secondary">{row.body}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.channel || "in_app"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone="neutral">
                          {row.delivery_state === "inbox_created"
                            ? "Inbox created"
                            : row.delivery_state || "Unknown"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={row.read_at ? "success" : "warning"}>
                          {row.read_at ? "Read" : "Unread"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDateTime(row.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
