"use client";

import {
  Suspense,
  useCallback,
  useEffect,
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
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { UserAvatar } from "@/components/user-avatar";
import { cn, formatDateTime } from "@/lib/utils";

type Participant = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  label?: string;
  unavailable?: boolean;
  member_role?: string;
};

type ConversationItem = {
  id: string;
  type: string;
  title?: string;
  display_title: string;
  state?: string;
  organization_id?: string | null;
  organization_name?: string | null;
  member_count?: number;
  participants?: Participant[];
  last_message_at?: string | null;
  preview?: string;
  preview_kind?: string;
};

type MessageItem = {
  id: string;
  sender_id?: string | null;
  sender?: Participant | null;
  type: string;
  display_body: string;
  preview_kind?: string;
  media_path?: string;
  created_at?: string | null;
  deleted_at?: string | null;
  structured?: Record<string, string | null | undefined>;
};

type DetailPayload = ConversationItem & {
  members?: Participant[];
  messages?: MessageItem[];
  note?: string;
  error?: string;
};

function isGroup(type: string) {
  return type === "group" || type === "organization" || type === "team";
}

function MessagesPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const typeFilter = searchParams.get("type") || "all";
  const q = searchParams.get("q") || "";
  const selectedId = searchParams.get("id") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);

  const [items, setItems] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);
  const [showMembers, setShowMembers] = useState(false);

  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (typeFilter !== "all") qs.set("type", typeFilter);
      if (q) qs.set("q", q);
      qs.set("page", String(page));
      qs.set("page_size", "40");
      const res = await fetch(`/api/admin/messages?${qs}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await res.json()) as {
        items?: ConversationItem[];
        total?: number;
        has_more?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Couldn't load messages.");
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
      setHasMore(Boolean(body.has_more));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load messages.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, q, page]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await res.json()) as DetailPayload;
      if (!res.ok) throw new Error(body.error || "Couldn't load conversation.");
      setDetail(body);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Couldn't load conversation.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Messages"
        description="Read-only directory of direct and group conversations. Inspection does not mark messages read."
        breadcrumbs={[
          { label: "Network", href: "/admin/network" },
          { label: "Messages" },
        ]}
      />

      {loading ? <AdminLoadingRow label="Loading conversations…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminFilterPanel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-text-hint">Type</label>
            <AdminSelect
              value={typeFilter}
              onChange={(v) => writeParams({ type: v === "all" ? null : v, page: null })}
            >
              <option value="all">All</option>
              <option value="direct">Direct</option>
              <option value="group">Groups</option>
            </AdminSelect>
          </div>
          <div className="flex min-w-[220px] flex-1 gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-text-hint">Search</label>
              <AdminSearchInput
                value={searchDraft}
                onChange={setSearchDraft}
                placeholder="Title, organization, or conversation id"
              />
            </div>
            <button
              type="button"
              className="h-10 self-end rounded-lg border border-border px-3 text-xs font-medium"
              onClick={() => writeParams({ q: searchDraft.trim() || null, page: null })}
            >
              Search
            </button>
          </div>
        </div>
      </AdminFilterPanel>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <AdminTableShell>
          {!loading && items.length === 0 ? (
            <AdminEmpty
              title="No conversations"
              description="Conversations appear here once users message each other."
            />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {items.map((session) => {
                const selected = selectedId === session.id;
                const avatar = session.participants?.[0];
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => writeParams({ id: selected ? null : session.id })}
                      className={cn(
                        "block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60",
                        selected && "bg-muted/80",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <UserAvatar
                          name={avatar?.label || session.display_title}
                          src={avatar?.avatar_url}
                          size={36}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{session.display_title}</p>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-text-secondary">
                              {isGroup(session.type) ? "Group" : "Direct"}
                            </span>
                          </div>
                          {session.organization_name ? (
                            <p className="truncate text-[11px] text-text-hint">
                              {session.organization_name}
                              {session.member_count != null
                                ? ` · ${session.member_count} members`
                                : ""}
                            </p>
                          ) : null}
                          <p className="mt-0.5 truncate text-xs text-text-secondary">
                            {session.preview || "—"}
                          </p>
                          <p className="mt-1 text-[11px] text-text-hint">
                            {session.last_message_at
                              ? formatDateTime(session.last_message_at)
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {total > 40 ? (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
              <span className="text-text-secondary">
                Page {page} · {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => writeParams({ page: String(page - 1) })}
                  className="rounded border border-border px-2 py-1 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!hasMore}
                  onClick={() => writeParams({ page: String(page + 1) })}
                  className="rounded border border-border px-2 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </AdminTableShell>

        <AdminTableShell>
          {!selectedId ? (
            <div className="grid place-items-center px-6 py-16 text-center text-sm text-text-secondary">
              Select a conversation to inspect messages.
            </div>
          ) : detailLoading ? (
            <AdminLoadingRow label="Loading conversation…" />
          ) : detail ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{detail.display_title}</p>
                  <p className="text-xs text-text-secondary">
                    {isGroup(detail.type) ? "Group" : "Direct"}
                    {detail.organization_name ? ` · ${detail.organization_name}` : ""}
                    {detail.member_count != null ? ` · ${detail.member_count} members` : ""}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-text-hint">{detail.id}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMembers((v) => !v)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {showMembers ? "Hide members" : "Members"}
                  </button>
                  <button
                    type="button"
                    onClick={() => writeParams({ id: null })}
                    className="text-xs text-text-secondary hover:underline"
                  >
                    Close
                  </button>
                </div>
              </div>
              {showMembers ? (
                <ul className="max-h-40 divide-y divide-border overflow-y-auto border-b border-border bg-muted/30">
                  {(detail.members ?? []).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                      <UserAvatar name={m.label} src={m.avatar_url} size={24} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/users/${m.id}`} className="font-medium text-primary">
                          {m.label || "Profile unavailable"}
                        </Link>
                        {m.member_role ? (
                          <span className="ml-2 text-text-hint">{m.member_role}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                {(detail.messages ?? []).map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <p className="text-xs text-text-hint">
                      <span className="font-medium text-text-secondary">
                        {row.sender?.label || "System"}
                      </span>{" "}
                      · {row.created_at ? formatDateTime(row.created_at) : "—"}
                      {row.deleted_at ? " · hidden/deleted" : ""}
                    </p>
                    <div className="mt-1">
                      {row.preview_kind === "coin_gift" ? (
                        <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                          <p className="font-medium">{row.display_body}</p>
                          {row.structured?.transfer_id ? (
                            <Link
                              href={`/admin/finance/transactions?q=${encodeURIComponent(row.structured.transfer_id)}`}
                              className="mt-1 inline-block font-mono text-[10px] text-primary hover:underline"
                            >
                              Open Finance · {row.structured.transfer_id}
                            </Link>
                          ) : (
                            <p className="mt-1 text-[11px] text-text-hint">
                              Marker is not proof of settlement — verify the transfer in Finance.
                            </p>
                          )}
                        </div>
                      ) : row.preview_kind === "news_share" ? (
                        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                          <p className="font-medium">{row.display_body}</p>
                          {row.structured?.article_id ? (
                            <Link
                              href={`/admin/news/${row.structured.article_id}`}
                              className="mt-1 inline-block text-xs text-primary hover:underline"
                            >
                              Open article
                            </Link>
                          ) : null}
                        </div>
                      ) : row.preview_kind === "organization_invitation" ? (
                        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                          <p className="font-medium">{row.display_body}</p>
                          <p className="mt-1 text-[11px] text-text-hint">
                            Viewing does not accept or reject the invitation.
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-text-primary">{row.display_body}</p>
                      )}
                      {row.media_path ? (
                        <p className="mt-1 text-[11px] text-text-hint">Media attached</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {detail.note ? (
                <p className="border-t border-border px-4 py-2 text-[11px] text-text-hint">
                  {detail.note}
                </p>
              ) : null}
            </>
          ) : (
            <AdminEmpty title="Conversation unavailable" description="It may have been removed." />
          )}
        </AdminTableShell>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<AdminLoadingRow label="Loading messages…" />}>
      <MessagesPageInner />
    </Suspense>
  );
}
