"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { StatusBadge, requestTone } from "@/components/status-badge";
import { patchAdmin } from "@/lib/hooks";
import { canModerateRadioChat } from "@/lib/admin-permissions";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { RadioChatMessageRow, RadioChatReportRow } from "@/lib/types";
import { formatDateTime, formatStatusLabel } from "@/lib/utils";

function RadioChatPage() {
  const search = useSearchParams();
  const streamFilter = search.get("stream") ?? "";
  const { can } = useAdminPermissions();
  const canModerate = canModerateRadioChat(can);
  const [tab, setTab] = useState<"messages" | "reports">(streamFilter ? "messages" : "reports");
  const [messages, setMessages] = useState<RadioChatMessageRow[]>([]);
  const [reports, setReports] = useState<RadioChatReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = async () => {
    const path = streamFilter
      ? `/api/admin/radio-chat?stream=${encodeURIComponent(streamFilter)}`
      : "/api/admin/radio-chat";
    const response = await fetch(path, { credentials: "same-origin" });
    const payload = (await response.json()) as {
      messages?: RadioChatMessageRow[];
      reports?: RadioChatReportRow[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load radio chat");
    setMessages(payload.messages ?? []);
    setReports(payload.reports ?? []);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamFilter]);

  const filteredMessages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      const hay = `${row.message} ${row.users?.display_name ?? ""} ${row.radio_streams?.name ?? ""}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [messages, query, status]);

  const hide = async (id: string) => {
    setError(null);
    try {
      await patchAdmin(`/api/admin/radio-chat/${id}`, { action: "hide" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hide failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Radio chat"
        description="Live station chat, reports, and moderation"
      />
      {loading ? <AdminLoadingRow label="Loading radio chat…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("reports")}
          className={
            tab === "reports"
              ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              : "rounded-full border border-border bg-card px-3 py-1.5 text-sm"
          }
        >
          Reports ({reports.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("messages")}
          className={
            tab === "messages"
              ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              : "rounded-full border border-border bg-card px-3 py-1.5 text-sm"
          }
        >
          Messages ({messages.length})
        </button>
      </div>

      {tab === "messages" ? (
        <>
          <AdminFilterPanel>
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <AdminSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search message, user, or station"
              />
              <AdminSelect value={status} onChange={setStatus}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="hidden">Hidden</option>
              </AdminSelect>
            </div>
          </AdminFilterPanel>
          <AdminTableShell>
            {filteredMessages.length === 0 && !loading ? (
              <AdminEmpty
                title="No chat messages"
                description="Messages sent during a live radio session appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Message</th>
                      <th className="px-4 py-3 font-semibold">User</th>
                      <th className="px-4 py-3 font-semibold">Station</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Sent</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMessages.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="max-w-md px-4 py-3">{row.message}</td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/users/${row.user_id}`} className="text-primary">
                            {row.users?.display_name || row.users?.username || row.user_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/streams/${row.stream_id}`} className="text-primary">
                            {row.radio_streams?.name || row.stream_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={requestTone(row.status)}>
                            {formatStatusLabel(row.status)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{formatDateTime(row.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          {canModerate && row.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => hide(row.id)}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Hide
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminTableShell>
        </>
      ) : (
        <AdminTableShell>
          {reports.length === 0 && !loading ? (
            <AdminEmpty
              title="No radio chat reports"
              description="User reports from live radio chat appear here for moderation."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Message</th>
                    <th className="px-4 py-3 font-semibold">Target</th>
                    <th className="px-4 py-3 font-semibold">Station</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {reports.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{row.reason}</td>
                      <td className="max-w-sm px-4 py-3 text-text-secondary">
                        {row.radio_chat_messages?.message || row.details || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.target_user_id ? (
                          <Link href={`/admin/users/${row.target_user_id}`} className="text-primary">
                            {row.target?.display_name || row.target_user_id.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/streams/${row.stream_id}`} className="text-primary">
                          {row.radio_streams?.name || row.stream_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDateTime(row.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {canModerate && row.message_id && row.radio_chat_messages?.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => hide(row.message_id!)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Hide
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminTableShell>
      )}
    </>
  );
}

export default function RadioChatPageBoundary() {
  return (
    <Suspense>
      <RadioChatPage />
    </Suspense>
  );
}
