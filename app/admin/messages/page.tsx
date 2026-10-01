"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import type { MessageRow } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type SessionFilter = "all" | "group" | "direct";

type Session = {
  conversationId: string;
  type: string;
  title: string;
  state: string;
  lastMessage: MessageRow;
  count: number;
  messages: MessageRow[];
};

function isGroupType(type: string) {
  return type === "group" || type === "organization" || type === "team";
}

export default function MessagesPage() {
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const sessions = useMemo(() => {
    const map = new Map<string, Session>();
    for (const row of rows) {
      const type = row.conversation?.type ?? "direct";
      const existing = map.get(row.conversation_id);
      if (existing) {
        existing.count += 1;
        existing.messages.push(row);
      } else {
        map.set(row.conversation_id, {
          conversationId: row.conversation_id,
          type,
          title: row.conversation?.title?.trim() || "",
          state: row.conversation?.state ?? "active",
          lastMessage: row,
          count: 1,
          messages: [row],
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime(),
    );
  }, [rows]);

  const filteredSessions = useMemo(() => {
    if (filter === "group") return sessions.filter((session) => isGroupType(session.type));
    if (filter === "direct") return sessions.filter((session) => !isGroupType(session.type));
    return sessions;
  }, [filter, sessions]);

  const selected = sessions.find((session) => session.conversationId === selectedId) ?? null;

  return (
    <>
      <AdminPageHeader title="Messages" description="Direct and group conversations" />
      {loading ? <AdminLoadingRow label="Loading messages…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <AdminTableShell>
          <div className="flex gap-1 border-b border-border p-2">
            {(
              [
                { id: "all", label: "All" },
                { id: "group", label: "Groups" },
                { id: "direct", label: "Person" },
              ] as { id: SessionFilter; label: string }[]
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  filter === option.id
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-muted"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {filteredSessions.length === 0 && !loading ? (
            <AdminEmpty
              title="No conversations"
              description="Messages are limited to conversation participants unless a service role key is set."
            />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {filteredSessions.map((session) => (
                <li key={session.conversationId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(session.conversationId)}
                    className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                      selectedId === session.conversationId ? "bg-muted/80" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {session.title ||
                          (isGroupType(session.type) ? "Group chat" : "Person chat")}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          isGroupType(session.type)
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-text-secondary"
                        }`}
                      >
                        {isGroupType(session.type) ? "Group" : "Person"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {session.lastMessage.body ||
                        (session.lastMessage.media_path || session.lastMessage.image_url ? "[media]" : "—")}
                    </p>
                    <p className="mt-1 text-[11px] text-text-hint">
                      {session.count} messages · {formatDateTime(session.lastMessage.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </AdminTableShell>

        <AdminTableShell>
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-sm text-text-secondary hover:text-text-primary lg:hidden"
                >
                  ← Back
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {selected.title ||
                      (isGroupType(selected.type) ? "Group chat" : "Person chat")}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {isGroupType(selected.type) ? "Group" : "Person"} · {selected.count} messages
                  </p>
                </div>
              </div>
              <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                {[...selected.messages]
                  .sort(
                    (a, b) =>
                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                  )
                  .map((row) => (
                    <li key={row.id} className="px-4 py-3">
                      <p className="text-xs text-text-hint">
                        <span className="font-mono">{row.sender_id.slice(0, 8)}</span> ·{" "}
                        {formatDateTime(row.created_at)}
                      </p>
                      <p className="mt-1 text-sm text-text-primary">
                        {row.body || (row.media_path || row.image_url ? "[media]" : "—")}
                      </p>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <div className="grid place-items-center px-6 py-16 text-center">
              <p className="text-sm text-text-secondary">
                Select a conversation to view its messages.
              </p>
            </div>
          )}
        </AdminTableShell>
      </div>
    </>
  );
}
