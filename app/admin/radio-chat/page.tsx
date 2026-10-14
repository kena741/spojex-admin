"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { RadioChatMessageRow, RadioChatReportRow, RadioStreamRow } from "@/lib/types";
import { formatDateTime, formatStatusLabel } from "@/lib/utils";

function RadioChatPage() {
  const router = useRouter();
  const search = useSearchParams();
  const streamFilter = search.get("stream") ?? "";
  const { can } = useAdminPermissions();
  const canModerate = canModerateRadioChat(can);
  const [tab, setTab] = useState<"stations" | "messages" | "reports">(
    streamFilter ? "messages" : "stations",
  );
  const [stations, setStations] = useState<RadioStreamRow[]>([]);
  const [messages, setMessages] = useState<RadioChatMessageRow[]>([]);
  const [reports, setReports] = useState<RadioChatReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = async () => {
    const stationRes = await getSpojexClient()
      .from("radio_streams")
      .select("*")
      .order("sort_order")
      .order("name")
      .limit(500);
    if (stationRes.error) throw stationRes.error;
    setStations((stationRes.data ?? []) as RadioStreamRow[]);

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

  const filteredStations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stations.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.name, row.slug, row.tagline, row.genre, row.city]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [stations, query, status]);

  const filteredMessages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      const hay = `${row.message} ${row.users?.display_name ?? ""} ${row.radio_streams?.name ?? ""}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [messages, query, status]);

  const selectedStation = useMemo(
    () => stations.find((row) => row.id === streamFilter) ?? null,
    [stations, streamFilter],
  );

  const hide = async (id: string) => {
    setError(null);
    try {
      await patchAdmin(`/api/admin/radio-chat/${id}`, { action: "hide" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hide failed");
    }
  };

  const setStreamFilter = (id: string) => {
    const next = id ? `/admin/radio-chat?stream=${encodeURIComponent(id)}` : "/admin/radio-chat";
    router.replace(next, { scroll: false });
    if (id) setTab("messages");
  };

  return (
    <>
      <AdminPageHeader
        title="Radio chat"
        description="Stations, live chat messages, and moderation reports"
      />
      {loading ? <AdminLoadingRow label="Loading radio chat…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("stations")}
            className={
              tab === "stations"
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            }
          >
            Stations ({stations.length})
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
        </div>
        <Link href="/admin/streams?tab=radio" className="text-sm text-primary hover:underline">
          Manage stations
        </Link>
      </div>

      {selectedStation ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-text-secondary">Filtered to</span>
          <strong>{selectedStation.name}</strong>
          <button
            type="button"
            onClick={() => setStreamFilter("")}
            className="text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      {tab === "stations" ? (
        <>
          <AdminFilterPanel>
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <AdminSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search station name, genre, or city"
              />
              <AdminSelect value={status} onChange={setStatus}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </AdminSelect>
            </div>
          </AdminFilterPanel>
          <AdminTableShell>
            {filteredStations.length === 0 && !loading ? (
              <AdminEmpty
                title="No radio stations"
                description="Import Ethiopian stations from Streams → Radio, or add one manually."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Station</th>
                      <th className="px-4 py-3 font-semibold">Genre</th>
                      <th className="px-4 py-3 font-semibold">City</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStations.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-text-secondary">{row.tagline || row.slug}</div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{row.genre || "—"}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.city || "—"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={requestTone(row.status)}>
                            {formatStatusLabel(row.status)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setStreamFilter(row.id)}
                              className="text-sm text-primary hover:underline"
                            >
                              Chat
                            </button>
                            <Link
                              href={`/admin/streams/${row.id}`}
                              className="text-sm text-primary hover:underline"
                            >
                              Edit
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminTableShell>
        </>
      ) : null}

      {tab === "messages" ? (
        <>
          <AdminFilterPanel>
            <div className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
              <AdminSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search message, user, or station"
              />
              <AdminSelect
                value={streamFilter}
                onChange={(value) => setStreamFilter(value)}
              >
                <option value="">All stations</option>
                {stations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </AdminSelect>
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
                description={
                  stations.length > 0
                    ? "Stations are live. Messages appear here after listeners chat in the app."
                    : "Add radio stations under Streams → Radio first."
                }
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
      ) : null}

      {tab === "reports" ? (
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
      ) : null}
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
