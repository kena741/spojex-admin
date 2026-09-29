"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import type { MessageRow } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function MessagesPage() {
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/messages", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: MessageRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Failed to load messages");
        setRows(payload.data ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <AdminPageHeader title="Messages" description="Direct messages" />
      {loading ? <AdminLoadingRow label="Loading messages…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminTableShell>
        {rows.length === 0 && !loading ? (
          <AdminEmpty
            title="No messages visible"
            description="Messages are limited to conversation participants unless a service role key is set."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Conversation</th>
                  <th className="px-4 py-3 font-semibold">Sender</th>
                  <th className="px-4 py-3 font-semibold">Body</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{row.conversation_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.sender_id.slice(0, 8)}</td>
                    <td className="max-w-md truncate px-4 py-3">{row.body || (row.media_path || row.image_url ? "[media]" : "—")}</td>
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
