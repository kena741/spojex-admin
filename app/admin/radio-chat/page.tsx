"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { adminFetch, postAdminResponse } from "@/lib/hooks";
import {
  canModerateRadioChat,
  canReadRadioChat,
} from "@/lib/admin-permissions";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import {
  REPORT_QUEUE_STATUSES,
  initials,
  renderMessageSegments,
  type MessagesResponse,
  type RadioChatMessage,
  type RadioChatReportDetail,
  type RadioChatReportGroup,
  type RadioChatStation,
  type ReportsResponse,
} from "@/lib/radio-chat";
import { formatDateTime, formatStatusLabel } from "@/lib/utils";

type Tab = "messages" | "reports";
type ConnState = "idle" | "live" | "polling" | "paused" | "error";

function MessageBody({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" dir="auto">
      {renderMessageSegments(text).map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </p>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover bg-muted"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-text-secondary">
      {initials(name)}
    </div>
  );
}

function RadioChatPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, loading: permLoading } = useAdminPermissions();
  const canRead = canReadRadioChat(can);
  const canModerate = canModerateRadioChat(can);
  const canWriteStreams = can("streams:write");

  const tabParam = searchParams.get("tab");
  const tab: Tab =
    tabParam === "stations"
      ? "messages"
      : tabParam === "reports"
        ? "reports"
        : "messages";

  const streamId = searchParams.get("stream") || searchParams.get("stream_id") || "";
  const q = searchParams.get("q") || "";
  const msgStatus = searchParams.get("status") || "all";
  const reported = searchParams.get("reported") || "";
  const dateFrom = searchParams.get("from") || searchParams.get("date_from") || "";
  const dateTo = searchParams.get("to") || searchParams.get("date_to") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const focusMessage = searchParams.get("message") || "";
  const reportStatus =
    searchParams.get("report_status") ||
    (tab === "reports" ? searchParams.get("status") || "unresolved" : "unresolved");
  const openReport = searchParams.get("report") || "";

  const [stations, setStations] = useState<RadioChatStation[]>([]);
  const [messagesPayload, setMessagesPayload] = useState<MessagesResponse | null>(null);
  const [reportsPayload, setReportsPayload] = useState<ReportsResponse | null>(null);
  const [contextMessages, setContextMessages] = useState<RadioChatMessage[] | null>(null);
  const [detail, setDetail] = useState<RadioChatReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<ConnState>("idle");
  const [pendingNew, setPendingNew] = useState<RadioChatMessage[]>([]);
  const [stationPanelOpen, setStationPanelOpen] = useState(false);
  const [stationQuery, setStationQuery] = useState("");
  const [reasonPrompt, setReasonPrompt] = useState<{
    title: string;
    confirmLabel: string;
    onConfirm: (reason: string) => Promise<void>;
  } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const readingOlderRef = useRef(false);
  const newestCursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const visibleRef = useRef(true);

  const writeParams = useCallback(
    (patch: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      // Normalize away legacy stations tab
      if (next.get("tab") === "stations") next.set("tab", "messages");
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      if (opts?.resetPage !== false && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selectedStation = useMemo(
    () => stations.find((s) => s.id === streamId) ?? null,
    [stations, streamId],
  );

  const isHistoricalSearch = Boolean(
    q || reported || dateFrom || dateTo || (msgStatus && msgStatus !== "all") || focusMessage,
  );

  const loadStations = useCallback(async () => {
    const res = await adminFetch("/api/admin/radio-chat/stations");
    const data = (await res.json()) as { stations?: RadioChatStation[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to load stations");
    setStations(data.stations ?? []);
  }, []);

  const loadMessages = useCallback(async () => {
    const params = new URLSearchParams();
    if (streamId) params.set("stream_id", streamId);
    if (q) params.set("q", q);
    if (msgStatus && msgStatus !== "all") params.set("status", msgStatus);
    if (reported === "1") params.set("reported", "1");
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("page", String(page));
    params.set("page_size", "40");
    const res = await adminFetch(`/api/admin/radio-chat/messages?${params}`);
    const data = (await res.json()) as MessagesResponse;
    if (!res.ok) {
      setMessagesPayload(null);
      throw new Error(data.error || "Failed to load messages");
    }
    setMessagesPayload(data);
    const first = data.messages[0];
    if (first?.created_at) {
      newestCursorRef.current = { created_at: first.created_at, id: first.id };
    }
    setPendingNew([]);
  }, [streamId, q, msgStatus, reported, dateFrom, dateTo, page]);

  const loadReports = useCallback(async () => {
    const params = new URLSearchParams();
    if (streamId) params.set("stream_id", streamId);
    if (q) params.set("q", q);
    params.set("status", reportStatus || "unresolved");
    params.set("page", String(page));
    params.set("page_size", "40");
    const res = await adminFetch(`/api/admin/radio-chat/reports?${params}`);
    const data = (await res.json()) as ReportsResponse;
    if (!res.ok) {
      setReportsPayload(null);
      throw new Error(data.error || "Failed to load reports");
    }
    setReportsPayload(data);
  }, [streamId, q, reportStatus, page]);

  const loadContext = useCallback(async (messageId: string) => {
    const res = await adminFetch(
      `/api/admin/radio-chat/messages/${messageId}/context?before=20&after=20`,
    );
    const data = (await res.json()) as {
      messages?: RadioChatMessage[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Failed to load conversation");
    setContextMessages(data.messages ?? []);
  }, []);

  const loadDetail = useCallback(async (opts: { messageId?: string; reportId?: string }) => {
    const params = new URLSearchParams();
    if (opts.messageId) params.set("message_id", opts.messageId);
    if (opts.reportId) params.set("report_id", opts.reportId);
    const res = await adminFetch(`/api/admin/radio-chat/reports/detail?${params}`);
    const data = (await res.json()) as RadioChatReportDetail & { error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to load report");
    setDetail(data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadStations();
      if (tab === "messages") {
        if (focusMessage) await loadContext(focusMessage);
        else {
          setContextMessages(null);
          await loadMessages();
        }
      } else {
        await loadReports();
        if (openReport) {
          await loadDetail({ reportId: openReport });
        } else if (focusMessage) {
          await loadDetail({ messageId: focusMessage });
        }
      }
      setConn(isHistoricalSearch ? "idle" : "live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setConn("error");
    } finally {
      setLoading(false);
    }
  }, [
    loadStations,
    loadMessages,
    loadReports,
    loadContext,
    loadDetail,
    tab,
    focusMessage,
    openReport,
    isHistoricalSearch,
  ]);

  useEffect(() => {
    if (permLoading) return;
    if (!canRead) {
      setLoading(false);
      setError("Insufficient permission to view Radio Chat.");
      return;
    }
    void refresh();
  }, [permLoading, canRead, refresh]);

  // Visibility: pause polling when hidden
  useEffect(() => {
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
      if (!visibleRef.current) setConn((c) => (c === "live" || c === "polling" ? "paused" : c));
      else if (!isHistoricalSearch) setConn("live");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isHistoricalSearch]);

  // Controlled polling for live conversation mode
  useEffect(() => {
    if (tab !== "messages" || isHistoricalSearch || focusMessage || !streamId) return;
    if (!visibleRef.current) return;
    const timer = setInterval(async () => {
      if (!visibleRef.current || readingOlderRef.current) return;
      const cursor = newestCursorRef.current;
      if (!cursor) return;
      try {
        setConn("polling");
        const params = new URLSearchParams({
          stream_id: streamId,
          after_created_at: cursor.created_at,
          after_id: cursor.id,
          page_size: "40",
        });
        const res = await adminFetch(`/api/admin/radio-chat/messages?${params}`);
        const data = (await res.json()) as MessagesResponse;
        if (!res.ok) {
          setConn("error");
          return;
        }
        const incoming = (data.messages || []).filter(
          (m) => !pendingNew.some((p) => p.id === m.id),
        );
        if (incoming.length) {
          const atBottom =
            listRef.current &&
            listRef.current.scrollHeight - listRef.current.scrollTop - listRef.current.clientHeight <
              80;
          if (atBottom && !readingOlderRef.current) {
            setMessagesPayload((prev) => {
              if (!prev) return prev;
              const seen = new Set(prev.messages.map((m) => m.id));
              const merged = [...incoming.filter((m) => !seen.has(m.id)), ...prev.messages];
              return { ...prev, messages: merged };
            });
            const top = incoming[0];
            if (top.created_at) newestCursorRef.current = { created_at: top.created_at, id: top.id };
          } else {
            setPendingNew((prev) => {
              const seen = new Set(prev.map((p) => p.id));
              return [...incoming.filter((m) => !seen.has(m.id)), ...prev];
            });
          }
        }
        setConn("live");
      } catch {
        setConn("error");
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [tab, isHistoricalSearch, focusMessage, streamId, pendingNew]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    readingOlderRef.current = fromBottom > 120;
  };

  const applyPending = () => {
    if (!pendingNew.length) return;
    setMessagesPayload((prev) => {
      if (!prev) return prev;
      const seen = new Set(prev.messages.map((m) => m.id));
      const merged = [...pendingNew.filter((m) => !seen.has(m.id)), ...prev.messages];
      return { ...prev, messages: merged };
    });
    const top = pendingNew[0];
    if (top?.created_at) newestCursorRef.current = { created_at: top.created_at, id: top.id };
    setPendingNew([]);
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const askReason = (
    title: string,
    confirmLabel: string,
    onConfirm: (reason: string) => Promise<void>,
  ) => {
    setReasonText("");
    setReasonPrompt({ title, confirmLabel, onConfirm });
  };

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const hideMessage = (id: string) =>
    askReason("Hide message", "Hide", async (reason) => {
      await runAction(async () => {
        await postAdminResponse(`/api/admin/radio-chat/messages/${id}/actions`, {
          action: "hide",
          reason,
        });
      });
    });

  const restoreMessage = (id: string) =>
    askReason("Restore message", "Restore", async (reason) => {
      await runAction(async () => {
        await postAdminResponse(`/api/admin/radio-chat/messages/${id}/actions`, {
          action: "restore",
          reason,
        });
      });
    });

  const muteUser = (sid: string, uid: string) =>
    askReason("Mute user on this station (60 min)", "Mute", async (reason) => {
      await runAction(async () => {
        await postAdminResponse(`/api/admin/radio-chat/stations/${sid}/restrictions`, {
          action: "mute",
          user_id: uid,
          reason,
          duration_minutes: 60,
        });
      });
    });

  const banUser = (sid: string, uid: string) =>
    askReason("Ban user from this station chat", "Ban", async (reason) => {
      await runAction(async () => {
        await postAdminResponse(`/api/admin/radio-chat/stations/${sid}/restrictions`, {
          action: "ban",
          user_id: uid,
          reason,
        });
      });
    });

  const messageMenu = (row: RadioChatMessage): AdminRowMenuItem[] => {
    if (!canModerate) return [];
    const items: AdminRowMenuItem[] = [];
    if (row.status === "active") {
      items.push({
        id: "hide",
        label: "Hide message",
        onClick: () => hideMessage(row.id),
        tone: "danger",
      });
    } else {
      items.push({
        id: "restore",
        label: "Restore message",
        onClick: () => restoreMessage(row.id),
      });
    }
    items.push({
      id: "mute",
      label: "Mute on station (1h)",
      onClick: () => muteUser(row.stream_id, row.user_id),
    });
    items.push({
      id: "ban",
      label: "Ban from station chat",
      onClick: () => banUser(row.stream_id, row.user_id),
      tone: "danger",
    });
    items.push({
      id: "reports",
      label: "Open reports",
      onClick: () =>
        writeParams({
          tab: "reports",
          message: row.id,
          stream: row.stream_id,
          report_status: "unresolved",
        }),
    });
    return items;
  };

  const displayMessages = contextMessages ?? messagesPayload?.messages ?? [];
  const unresolvedBadge =
    reportsPayload?.counts?.unresolved_reports ??
    messagesPayload?.counts?.unresolved_reports ??
    selectedStation?.unresolved_report_count ??
    null;

  const filteredStations = useMemo(() => {
    const needle = stationQuery.trim().toLowerCase();
    if (!needle) return stations;
    return stations.filter((s) =>
      [s.name, s.genre, s.city, s.slug].join(" ").toLowerCase().includes(needle),
    );
  }, [stations, stationQuery]);

  if (!permLoading && !canRead) {
    return (
      <>
        <AdminPageHeader
          title="Radio Chat"
          description="Listener conversation moderation"
          breadcrumbs={[
            { label: "Content", href: "/admin/content" },
            { label: "Radio Chat" },
          ]}
        />
        <AdminErrorAlert message="Insufficient permission to view Radio Chat." />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Radio Chat"
        description="Moderate listener conversations and reports. Station configuration stays under Streams."
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Radio Chat" },
        ]}
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => writeParams({ tab: "messages", report: null, report_status: null })}
            className={
              tab === "messages"
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            }
          >
            Messages
            {messagesPayload && !error
              ? ` (${messagesPayload.counts.messages_matching})`
              : ""}
          </button>
          <button
            type="button"
            onClick={() =>
              writeParams({
                tab: "reports",
                status: null,
                report_status: "unresolved",
                message: null,
              })
            }
            className={
              tab === "reports"
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            }
          >
            Reports
            {unresolvedBadge != null && !error ? (
              <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-700">
                {unresolvedBadge}
              </span>
            ) : null}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-text-secondary">
            {conn === "live" || conn === "polling"
              ? "Connected · polling"
              : conn === "paused"
                ? "Paused (tab hidden)"
                : conn === "error"
                  ? "Connection interrupted"
                  : isHistoricalSearch
                    ? "Historical search"
                    : "Idle"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-primary hover:underline"
            disabled={loading || busy}
          >
            Refresh
          </button>
          <Link href="/admin/streams?tab=radio" className="text-primary hover:underline">
            Manage stations in Streams
          </Link>
        </div>
      </div>

      {/* Station context */}
      <div className="mb-4 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setStationPanelOpen((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {stationPanelOpen ? "Hide stations" : "Stations"}
          </button>
          {selectedStation ? (
            <>
              <Avatar name={selectedStation.name} url={selectedStation.image_url} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{selectedStation.name}</div>
                <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                  <span>
                    Activation: {formatStatusLabel(selectedStation.activation_status)}
                  </span>
                  <span>·</span>
                  <span>
                    Chat:{" "}
                    {selectedStation.chat_paused
                      ? "Paused"
                      : selectedStation.chat_available
                        ? "Available"
                        : "Unavailable"}
                  </span>
                  {selectedStation.health_status &&
                  selectedStation.health_status !== "unknown" ? (
                    <>
                      <span>·</span>
                      <span>Stream: {selectedStation.health_status}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <Link
                href={selectedStation.manage_url}
                className="text-sm text-primary hover:underline"
              >
                Manage in Streams
              </Link>
              {canWriteStreams ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-sm text-primary hover:underline"
                    onClick={() =>
                      askReason(
                        selectedStation.chat_paused
                          ? "Resume station chat"
                          : "Pause station chat (playback continues)",
                        selectedStation.chat_paused ? "Resume" : "Pause",
                        async (reason) => {
                          await runAction(async () => {
                            await postAdminResponse(
                              `/api/admin/radio-chat/stations/${selectedStation.id}/controls`,
                              {
                                action: selectedStation.chat_paused
                                  ? "resume_chat"
                                  : "pause_chat",
                                reason: reason || "toggled",
                              },
                            );
                          });
                        },
                      )
                    }
                  >
                    {selectedStation.chat_paused ? "Resume chat" : "Pause chat"}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => writeParams({ stream: null, stream_id: null })}
                className="text-sm text-text-secondary hover:underline"
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-sm text-text-secondary">
              All stations
              {stations.length ? ` · ${stations.length} configured` : ""}
            </span>
          )}
        </div>
        {stationPanelOpen ? (
          <div className="border-t border-border px-4 py-3">
            <AdminSearchInput
              value={stationQuery}
              onChange={setStationQuery}
              placeholder="Search stations"
            />
            <div className="mt-3 max-h-56 overflow-y-auto divide-y divide-border">
              {filteredStations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    writeParams({ stream: s.id, tab });
                    setStationPanelOpen(false);
                  }}
                  className="flex w-full items-center gap-3 py-2 text-left hover:bg-muted/40"
                >
                  <Avatar name={s.name} url={s.image_url} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-text-secondary">
                      {formatStatusLabel(s.status)}
                      {s.chat_paused ? " · chat paused" : ""}
                      {s.unresolved_report_count
                        ? ` · ${s.unresolved_report_count} open reports`
                        : ""}
                    </div>
                  </div>
                </button>
              ))}
              {filteredStations.length === 0 ? (
                <p className="py-4 text-sm text-text-secondary">No stations match.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <AdminLoadingRow label="Loading Radio Chat…" /> : null}

      {tab === "messages" ? (
        <>
          <AdminFilterPanel>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="xl:col-span-2">
                <AdminSearchInput
                  value={q}
                  onChange={(v) => writeParams({ q: v || null })}
                  placeholder="Search message, user, or station"
                />
              </div>
              <AdminSelect
                value={msgStatus}
                onChange={(v) => writeParams({ status: v === "all" ? null : v })}
              >
                <option value="all">Visible &amp; hidden</option>
                <option value="active">Visible</option>
                <option value="hidden">Hidden</option>
              </AdminSelect>
              <AdminSelect
                value={reported === "1" ? "1" : "all"}
                onChange={(v) => writeParams({ reported: v === "1" ? "1" : null })}
              >
                <option value="all">All messages</option>
                <option value="1">Reported only</option>
              </AdminSelect>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => writeParams({ from: e.target.value || null })}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => writeParams({ to: e.target.value || null })}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() =>
                  writeParams({
                    q: null,
                    status: null,
                    reported: null,
                    from: null,
                    to: null,
                    message: null,
                    page: null,
                  })
                }
              >
                Clear filters
              </button>
              {focusMessage ? (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => writeParams({ message: null })}
                >
                  Exit conversation context
                </button>
              ) : null}
              <span className="text-text-secondary">
                {isHistoricalSearch || focusMessage
                  ? "Mode: historical / context"
                  : streamId
                    ? "Mode: live conversation (station)"
                    : "Mode: directory (select a station for live updates)"}
              </span>
            </div>
          </AdminFilterPanel>

          {pendingNew.length > 0 ? (
            <button
              type="button"
              onClick={applyPending}
              className="mb-3 w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
            >
              {pendingNew.length} new message{pendingNew.length === 1 ? "" : "s"} - jump to latest
            </button>
          ) : null}

          <div
            ref={listRef}
            onScroll={onListScroll}
            className="max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card"
          >
            {!loading && displayMessages.length === 0 ? (
              <AdminEmpty
                title={
                  q || reported || dateFrom || dateTo || msgStatus !== "all"
                    ? "No results for these filters"
                    : "No messages yet"
                }
                description={
                  q || reported || dateFrom || dateTo || msgStatus !== "all"
                    ? "Try clearing filters or choosing another station."
                    : stations.length
                      ? "Messages appear here after listeners chat in the app. Station activation does not mean chat traffic exists."
                      : "Add radio stations under Streams → Radio first."
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {displayMessages.map((row) => (
                  <li
                    key={row.id}
                    id={`msg-${row.id}`}
                    className={`flex gap-3 px-4 py-3 ${
                      row.is_anchor || row.id === focusMessage ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <Avatar name={row.user.display_name} url={row.user.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <Link
                          href={`/admin/users/${row.user_id}`}
                          className="text-sm font-medium text-primary"
                        >
                          {row.user.display_name}
                        </Link>
                        <span className="text-xs text-text-secondary">
                          {row.station.name}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {row.created_at ? formatDateTime(row.created_at) : ""}
                        </span>
                        <StatusBadge tone={requestTone(row.status)}>
                          {row.status === "active" ? "Visible" : formatStatusLabel(row.status)}
                        </StatusBadge>
                        {row.report_count > 0 || row.has_reports ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            Reported
                            {row.report_count ? ` · ${row.report_count}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1">
                        <MessageBody text={row.message} />
                      </div>
                    </div>
                    {canModerate ? (
                      <AdminRowMenu items={messageMenu(row)} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!focusMessage && messagesPayload && messagesPayload.total > messagesPayload.page_size ? (
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page <= 1}
                className="text-primary disabled:opacity-40"
                onClick={() => writeParams({ page: String(page - 1) }, { resetPage: false })}
              >
                Previous
              </button>
              <span className="text-text-secondary">
                Page {page} · {messagesPayload.total} matching
                {messagesPayload.counts.unresolved_reports_scope
                  ? ` · unresolved reports (${messagesPayload.counts.unresolved_reports_scope}): ${messagesPayload.counts.unresolved_reports ?? "-"}`
                  : ""}
              </span>
              <button
                type="button"
                disabled={!messagesPayload.has_more}
                className="text-primary disabled:opacity-40"
                onClick={() => writeParams({ page: String(page + 1) }, { resetPage: false })}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "reports" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <AdminFilterPanel>
              <div className="grid gap-3 md:grid-cols-[1fr_200px]">
                <AdminSearchInput
                  value={q}
                  onChange={(v) => writeParams({ q: v || null })}
                  placeholder="Search reason, message, station"
                />
                <AdminSelect
                  value={reportStatus}
                  onChange={(v) => writeParams({ report_status: v, status: null })}
                >
                  {REPORT_QUEUE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </AdminSelect>
              </div>
              <p className="mt-2 text-xs text-text-secondary">
                Badge count = unresolved reports
                {streamId ? " for this station" : " (global)"}: open, pending, or in review.
              </p>
            </AdminFilterPanel>

            <div className="rounded-xl border border-border bg-card">
              {!loading && (reportsPayload?.groups.length ?? 0) === 0 ? (
                <AdminEmpty
                  title={
                    reportStatus === "unresolved" || reportStatus === "open"
                      ? "No unresolved reports"
                      : "No reports for this filter"
                  }
                  description="Listener reports from radio chat appear here grouped by message."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {(reportsPayload?.groups ?? []).map((g: RadioChatReportGroup) => (
                    <li key={g.group_key}>
                      <button
                        type="button"
                        onClick={() =>
                          writeParams({
                            message: g.message_id,
                            report: g.latest_report_id,
                            stream: g.stream_id,
                          })
                        }
                        className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/40"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={requestTone(g.status)}>
                            {formatStatusLabel(g.status === "open" ? "new" : g.status)}
                          </StatusBadge>
                          <span className="text-xs text-text-secondary">{g.station.name}</span>
                          <span className="text-xs text-text-secondary">
                            {g.report_count} report{g.report_count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm" dir="auto">
                          {g.message_excerpt}
                        </p>
                        <div className="text-xs text-text-secondary">
                          {g.primary_reason || g.reasons[0] || "Reported"}
                          {g.latest_reported_at
                            ? ` · latest ${formatDateTime(g.latest_reported_at)}`
                            : ""}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="rounded-xl border border-border bg-card p-4">
            {!detail ? (
              <p className="text-sm text-text-secondary">
                Select a report group to review message context, reasons, and actions.
              </p>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-xs uppercase text-text-secondary">Case status</div>
                  <StatusBadge tone={requestTone(detail.queue_status)}>
                    {formatStatusLabel(detail.queue_status)}
                  </StatusBadge>
                </div>
                {detail.message ? (
                  <div>
                    <div className="text-xs uppercase text-text-secondary">Message</div>
                    {"missing" in detail.message && detail.message.missing ? (
                      <p className="text-text-secondary">Message unavailable or deleted.</p>
                    ) : (
                      <MessageBody
                        text={"message" in detail.message ? detail.message.message : ""}
                      />
                    )}
                    {"status" in detail.message ? (
                      <div className="mt-1">
                        <StatusBadge tone={requestTone(String(detail.message.status))}>
                          {formatStatusLabel(String(detail.message.status))}
                        </StatusBadge>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {detail.context?.messages?.length ? (
                  <div>
                    <div className="mb-1 text-xs uppercase text-text-secondary">
                      Surrounding context
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                      {detail.context.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`text-xs ${m.is_anchor ? "rounded bg-amber-500/10 p-1" : ""}`}
                        >
                          <span className="font-medium">{m.user.display_name}: </span>
                          <span dir="auto">{m.message}</span>
                        </div>
                      ))}
                    </div>
                    {detail.message && "id" in detail.message ? (
                      <button
                        type="button"
                        className="mt-2 text-primary hover:underline"
                        onClick={() =>
                          writeParams({
                            tab: "messages",
                            message: String(detail.message && "id" in detail.message ? detail.message.id : ""),
                            stream: detail.stream_id,
                          })
                        }
                      >
                        Open in Messages
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <div className="mb-1 text-xs uppercase text-text-secondary">
                    Reports ({detail.report_count})
                  </div>
                  <ul className="space-y-2">
                    {detail.reports.map((r) => (
                      <li key={r.id} className="rounded-lg border border-border p-2">
                        <div className="font-medium">{r.reason}</div>
                        {r.details ? (
                          <p className="text-text-secondary" dir="auto">
                            {r.details}
                          </p>
                        ) : null}
                        <div className="mt-1 text-xs text-text-secondary">
                          {r.reporter.display_name}
                          {r.created_at ? ` · ${formatDateTime(r.created_at)}` : ""}
                          {" · "}
                          {formatStatusLabel(r.status)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {detail.history.length ? (
                  <div>
                    <div className="mb-1 text-xs uppercase text-text-secondary">
                      Decision history
                    </div>
                    <ul className="space-y-1 text-xs text-text-secondary">
                      {detail.history.map((h) => (
                        <li key={h.id}>
                          {h.created_at ? formatDateTime(h.created_at) : ""} - {h.action}
                          {h.reason ? `: ${h.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {canModerate ? (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() =>
                        askReason("Start review", "Start review", async (reason) => {
                          await runAction(async () => {
                            await postAdminResponse("/api/admin/radio-chat/reports/actions", {
                              action: "start_review",
                              message_id: detail.message && "id" in detail.message ? detail.message.id : null,
                              report_id: detail.reports[0]?.id,
                              reason: reason || "in review",
                            });
                          });
                        })
                      }
                    >
                      Mark in review
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() =>
                        askReason(
                          "Resolve reports (optionally hide message)",
                          "Resolve",
                          async (reason) => {
                            const alsoHide = window.confirm(
                              "Also hide the message?\n\nOK = resolve + hide\nCancel = resolve only",
                            );
                            await runAction(async () => {
                              await postAdminResponse("/api/admin/radio-chat/reports/actions", {
                                action: "resolve",
                                message_id:
                                  detail.message && "id" in detail.message
                                    ? detail.message.id
                                    : null,
                                report_id: detail.reports[0]?.id,
                                reason,
                                also_hide: alsoHide,
                              });
                            });
                          },
                        )
                      }
                    >
                      Resolve…
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() =>
                        askReason("Dismiss reports", "Dismiss", async (reason) => {
                          await runAction(async () => {
                            await postAdminResponse("/api/admin/radio-chat/reports/actions", {
                              action: "dismiss",
                              message_id:
                                detail.message && "id" in detail.message
                                  ? detail.message.id
                                  : null,
                              report_id: detail.reports[0]?.id,
                              reason,
                            });
                          });
                        })
                      }
                    >
                      Dismiss
                    </button>
                    {detail.message &&
                    "id" in detail.message &&
                    "status" in detail.message &&
                    detail.message.status === "active" ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-lg border border-red-200 px-3 py-2 text-left text-red-700 hover:bg-red-50"
                        onClick={() => hideMessage(String(detail.message && "id" in detail.message ? detail.message.id : ""))}
                      >
                        Hide message only
                      </button>
                    ) : null}
                    {detail.message &&
                    "user_id" in detail.message &&
                    detail.message.user_id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                          onClick={() =>
                            muteUser(detail.stream_id, String(detail.message && "user_id" in detail.message ? detail.message.user_id : ""))
                          }
                        >
                          Mute author (station, 1h)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40"
                          onClick={() =>
                            banUser(detail.stream_id, String(detail.message && "user_id" in detail.message ? detail.message.user_id : ""))
                          }
                        >
                          Ban author (station chat)
                        </button>
                      </>
                    ) : null}
                    <p className="text-xs text-text-secondary">
                      Hiding a message and resolving a report are separate unless you choose both
                      on Resolve. App-wide account suspension is under Users.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {reasonPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-lg">
            <h3 className="font-medium">{reasonPrompt.title}</h3>
            <p className="mt-1 text-xs text-text-secondary">
              A short reason is required and stored in the moderation audit trail.
            </p>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Reason"
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm"
                onClick={() => setReasonPrompt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !reasonText.trim()}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                onClick={async () => {
                  const fn = reasonPrompt.onConfirm;
                  const reason = reasonText.trim();
                  setReasonPrompt(null);
                  await fn(reason);
                }}
              >
                {reasonPrompt.confirmLabel}
              </button>
            </div>
          </div>
        </div>
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
