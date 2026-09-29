"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { NotificationRow } from "@/lib/types";
import { formatDateTime, formatStatusLabel } from "@/lib/utils";

type BroadcastResult = {
  ok: boolean;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
  errors?: string[];
};

export default function NotificationsPage() {
  const { can } = useAdminPermissions();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [route, setRoute] = useState("/notifications");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  useEffect(() => {
    fetch("/api/admin/notifications", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: NotificationRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Failed to load notifications");
        setRows(payload.data ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const sendBroadcast = async () => {
    if (!title.trim() || !body.trim()) return;
    const confirmed = window.confirm(
      "Send this push notification to every user with a device token?",
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
        description="In-app inbox and Firebase push delivery"
      />
      {can("notifications:write") ? (
        <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-1 font-heading text-sm font-semibold">Broadcast push</h3>
          <p className="mb-4 text-sm text-text-secondary">
            Sends to every signed-in device with an FCM token and notifications enabled. Also
            writes an in-app inbox row.
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
              <span className="text-text-secondary">Deep link route</span>
              <input
                value={route}
                onChange={(event) => setRoute(event.target.value)}
                placeholder="/notifications"
                maxLength={200}
                disabled={sending}
                className="rounded-md border border-border bg-background px-3 py-2"
              />
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
          </div>
          {result ? (
            <div
              className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
                result.ok && result.failed === 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {result.ok && result.failed === 0
                ? `Attempted ${result.attempted}. Sent ${result.sent}. Skipped ${result.skipped}. Failed ${result.failed}.`
                : [
                    `Attempted ${result.attempted}. Sent ${result.sent}. Skipped ${result.skipped}. Failed ${result.failed}.`,
                    result.error,
                    ...(result.errors ?? []).slice(1),
                  ]
                    .filter(Boolean)
                    .join(" ")}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void sendBroadcast()}
            disabled={sending || !title.trim() || !body.trim()}
            className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send broadcast"}
          </button>
        </section>
      ) : null}
      {loading ? <AdminLoadingRow label="Loading notifications…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {rows.length === 0 && !loading ? (
          <AdminEmpty
            title="No notifications visible"
            description="In-app notifications from the superapp. Set SUPABASE_SERVICE_ROLE_KEY if this stays empty."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Kind</th>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Body</th>
                  <th className="px-4 py-3 font-semibold">Read</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{formatStatusLabel(row.kind)}</td>
                    <td className="px-4 py-3 font-medium">{row.title}</td>
                    <td className="max-w-sm truncate px-4 py-3 text-text-secondary">{row.body}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={row.read_at ? "success" : "warning"}>
                        {row.read_at ? "Read" : "Unread"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
