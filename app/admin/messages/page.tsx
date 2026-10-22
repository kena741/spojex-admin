"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
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
  hidden?: boolean;
};

type OrgBrief = {
  id: string;
  name?: string | null;
  logo_url?: string | null;
};

type ConversationItem = {
  id: string;
  type: string;
  chat_kind?: string;
  chat_kind_label?: string;
  title?: string;
  display_title: string;
  state?: string;
  organization_id?: string | null;
  organization_name?: string | null;
  organization_logo?: string | null;
  member_count?: number;
  posting_mode?: string | null;
  group_visibility?: string | null;
  participants?: Participant[];
  last_message_at?: string | null;
  preview?: string;
  preview_kind?: string;
};

type MessageStructured = {
  article_id?: string;
  content_kind?: string;
  thumbnail_url?: string;
  title?: string;
  note?: string;
  organization_id?: string;
  organization_name?: string;
  organization_logo?: string;
  invitation_type?: string;
  transfer_id?: string;
  amount?: string;
  gift_id?: string;
  gift_emoji?: string;
  gift_name?: string;
  accompanying_text?: string;
  verified?: boolean;
  verification_note?: string;
};

type MessageItem = {
  id: string;
  sender_id?: string | null;
  sender?: Participant | null;
  actor_kind?: string;
  sender_organization?: OrgBrief | null;
  sent_as_organization?: boolean;
  type: string;
  body?: string | null;
  display_body: string;
  preview_kind?: string;
  media_path?: string;
  media_mime?: string;
  created_at?: string | null;
  deleted_at?: string | null;
  structured?: MessageStructured;
};

type DetailPayload = ConversationItem & {
  members?: Participant[];
  messages?: MessageItem[];
  has_more?: boolean;
  note?: string;
  error?: string;
};

function chatKindLabel(item: ConversationItem) {
  return item.chat_kind_label || item.chat_kind || item.type || "Chat";
}

function listAvatar(item: ConversationItem): { name: string; src?: string | null } {
  if (item.chat_kind === "organization_group" || item.chat_kind === "group") {
    return {
      name: item.organization_name || item.display_title,
      src: item.organization_logo,
    };
  }
  if (item.chat_kind === "organization_dm") {
    const peer = item.participants?.[0];
    return {
      name: peer?.label || item.organization_name || item.display_title,
      src: peer?.avatar_url || item.organization_logo,
    };
  }
  const peer = item.participants?.[0];
  return { name: peer?.label || item.display_title, src: peer?.avatar_url };
}

function dayKey(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toDateString();
}

function senderLabel(message: MessageItem) {
  if (message.sent_as_organization && message.sender_organization?.name) {
    return message.sender_organization.name;
  }
  return message.sender?.label || "Deleted account";
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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);
  const [showDetails, setShowDetails] = useState(false);

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

  const loadDetail = useCallback(async (id: string, before?: string | null) => {
    if (before) setLoadingOlder(true);
    else setDetailLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (before) qs.set("before", before);
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(id)}?${qs}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await res.json()) as DetailPayload;
      if (!res.ok) throw new Error(body.error || "Couldn't load conversation.");
      if (before) {
        setDetail((prev) => {
          if (!prev || prev.id !== id) return body;
          const seen = new Set(prev.messages?.map((m) => m.id));
          const older = (body.messages ?? []).filter((m) => !seen.has(m.id));
          return {
            ...prev,
            ...body,
            messages: [...older, ...(prev.messages ?? [])],
          };
        });
      } else {
        setDetail(body);
      }
    } catch (err) {
      if (!before) {
        setDetail(null);
        setError(err instanceof Error ? err.message : "Couldn't load conversation.");
      }
    } finally {
      setDetailLoading(false);
      setLoadingOlder(false);
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

  const timeline = useMemo(() => {
    const messages = detail?.messages ?? [];
    const blocks: Array<{ type: "day"; key: string; label: string } | { type: "msg"; key: string; message: MessageItem }> =
      [];
    let lastDay = "";
    for (const message of messages) {
      const day = dayKey(message.created_at);
      if (day && day !== lastDay) {
        blocks.push({
          type: "day",
          key: `day-${day}`,
          label: new Date(message.created_at || "").toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        });
        lastDay = day;
      }
      blocks.push({ type: "msg", key: message.id, message });
    }
    return blocks;
  }, [detail?.messages]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Messages"
        description="Read-only observer of private and organization conversations. Viewing never marks messages read."
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
              <option value="direct">Private chats</option>
              <option value="organization_dm">Organization private</option>
              <option value="organization_group">Organization groups</option>
            </AdminSelect>
          </div>
          <div className="flex min-w-[220px] flex-1 gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-text-hint">Search</label>
              <AdminSearchInput
                value={searchDraft}
                onChange={setSearchDraft}
                placeholder="Name, organization, or conversation id"
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

      <div
        className={cn(
          "grid gap-4",
          selectedId && showDetails
            ? "xl:grid-cols-[300px_1fr_280px]"
            : "lg:grid-cols-[320px_1fr]",
        )}
      >
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
                const avatar = listAvatar(session);
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
                        <UserAvatar name={avatar.name} src={avatar.src} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{session.display_title}</p>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                              {chatKindLabel(session)}
                            </span>
                          </div>
                          {session.organization_name && session.chat_kind === "organization_group" ? (
                            <p className="truncate text-[11px] text-text-hint">
                              {session.organization_name}
                              {session.member_count != null ? ` · ${session.member_count} members` : ""}
                              {session.posting_mode === "admins_only" ? " · Admins only" : ""}
                            </p>
                          ) : null}
                          <p className="mt-0.5 truncate text-xs text-text-secondary">
                            {session.preview || "-"}
                          </p>
                          <p className="mt-1 text-[11px] text-text-hint">
                            {session.last_message_at
                              ? formatDateTime(session.last_message_at)
                              : "-"}
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
            <AdminLoadingRow label="Loading conversation…" fill />
          ) : detail ? (
            <div className="flex h-[70vh] flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{detail.display_title}</p>
                  <p className="text-xs text-text-secondary">
                    {chatKindLabel(detail)}
                    {detail.organization_name ? ` · ${detail.organization_name}` : ""}
                    {detail.member_count != null ? ` · ${detail.member_count} members` : ""}
                    {detail.posting_mode === "admins_only" ? " · Admins only posting" : ""}
                    {detail.group_visibility ? ` · ${detail.group_visibility}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {showDetails ? "Hide details" : "Details"}
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

              {detail.has_more ? (
                <div className="border-b border-border px-4 py-2 text-center">
                  <button
                    type="button"
                    disabled={loadingOlder}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    onClick={() => {
                      const oldest = detail.messages?.[0]?.created_at;
                      if (oldest) void loadDetail(detail.id, oldest);
                    }}
                  >
                    {loadingOlder ? "Loading…" : "Load older messages"}
                  </button>
                </div>
              ) : null}

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4">
                {timeline.map((block) => {
                  if (block.type === "day") {
                    return (
                      <div key={block.key} className="flex justify-center">
                        <span className="rounded-full bg-card px-3 py-1 text-[11px] text-text-hint shadow-sm">
                          {block.label}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <MessageBubble key={block.key} message={block.message} />
                  );
                })}
                {(detail.messages?.length ?? 0) === 0 ? (
                  <p className="py-10 text-center text-sm text-text-secondary">
                    No messages in this conversation yet.
                  </p>
                ) : null}
              </div>

              {detail.note ? (
                <p className="border-t border-border px-4 py-2 text-[11px] text-text-hint">
                  {detail.note}
                </p>
              ) : null}
            </div>
          ) : (
            <AdminEmpty title="Conversation unavailable" description="It may have been removed." />
          )}
        </AdminTableShell>

        {selectedId && showDetails && detail ? (
          <AdminTableShell>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase text-text-hint">Details</h3>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-text-hint">Type</dt>
                  <dd className="font-medium">{chatKindLabel(detail)}</dd>
                </div>
                {detail.organization_id ? (
                  <div>
                    <dt className="text-text-hint">Organization</dt>
                    <dd>
                      <Link
                        href={`/admin/organizations/${detail.organization_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {detail.organization_name || detail.organization_id}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {detail.posting_mode ? (
                  <div>
                    <dt className="text-text-hint">Posting</dt>
                    <dd className="font-medium">
                      {detail.posting_mode === "admins_only"
                        ? "Organization admins only"
                        : "Members may post"}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-text-hint">Conversation id</dt>
                  <dd className="break-all font-mono text-[10px]">{detail.id}</dd>
                </div>
              </dl>

              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase text-text-hint">
                Participants
              </h3>
              <ul className="divide-y divide-border">
                {(detail.members ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-2 text-xs">
                    <UserAvatar name={m.label} src={m.avatar_url} size={28} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/users/${m.id}`} className="font-medium text-primary">
                        {m.label || "Profile unavailable"}
                      </Link>
                      {m.username ? (
                        <p className="text-[11px] text-text-hint">@{m.username}</p>
                      ) : null}
                      {m.member_role ? (
                        <p className="text-[11px] text-text-hint">{m.member_role}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </AdminTableShell>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageItem }) {
  const name = senderLabel(message);
  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const structured = message.structured || {};
  const isSystem = message.type === "system" || message.preview_kind === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <p className="max-w-md rounded-full bg-card px-3 py-1 text-center text-[11px] text-text-secondary shadow-sm">
          {message.display_body}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <UserAvatar
        name={name}
        src={
          message.sent_as_organization
            ? message.sender_organization?.logo_url
            : message.sender?.avatar_url
        }
        size={32}
      />
      <div className="min-w-0 max-w-[min(100%,36rem)] flex-1">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-semibold text-text-primary">{name}</span>
          {message.sent_as_organization ? (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
              As organization
            </span>
          ) : null}
          {message.sender && !message.sent_as_organization && message.sender.username ? (
            <span className="text-[11px] text-text-hint">@{message.sender.username}</span>
          ) : null}
          <span className="text-[11px] text-text-hint">{time}</span>
          {message.deleted_at ? (
            <span className="text-[11px] text-amber-700">Hidden / deleted</span>
          ) : null}
        </div>

        {message.preview_kind === "coin_gift" ? (
          <GiftCard message={message} />
        ) : message.preview_kind === "news_share" ? (
          <NewsCard message={message} />
        ) : message.preview_kind === "organization_invitation" ? (
          <InviteCard message={message} />
        ) : (
          <div className="rounded-2xl rounded-tl-md border border-border bg-card px-3 py-2 text-sm shadow-sm">
            {message.body || message.display_body}
            {message.media_path ? (
              <p className="mt-1 text-[11px] text-text-hint">
                Media · {message.media_mime || message.type || "attachment"}
              </p>
            ) : null}
          </div>
        )}

        {structured.accompanying_text &&
        (message.preview_kind === "coin_gift" ||
          message.preview_kind === "news_share" ||
          message.preview_kind === "organization_invitation") ? (
          <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-sm text-text-secondary">
            {structured.accompanying_text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GiftCard({ message }: { message: MessageItem }) {
  const s = message.structured || {};
  const giftLabel = [s.gift_emoji, s.gift_name].filter(Boolean).join(" ").trim();
  const amount = s.amount ? `${s.amount} coins` : "coins";
  return (
    <div className="rounded-2xl border border-amber-300/70 bg-amber-50/60 px-3 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/80">
        Coin gift
      </p>
      <p className="mt-1 font-medium text-text-primary">
        {senderLabel(message)} sent {giftLabel || "a gift"} · {amount}
      </p>
      {s.verified === false || s.verification_note ? (
        <p className="mt-1 text-[11px] text-amber-800">{s.verification_note}</p>
      ) : (
        <p className="mt-1 text-[11px] text-text-hint">Verified gift record</p>
      )}
      {s.transfer_id ? (
        <Link
          href={`/admin/finance/transactions?q=${encodeURIComponent(s.transfer_id)}`}
          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
        >
          Open Finance · {s.transfer_id}
        </Link>
      ) : null}
    </div>
  );
}

function NewsCard({ message }: { message: MessageItem }) {
  const s = message.structured || {};
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card text-sm shadow-sm">
      {s.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.thumbnail_url} alt="" className="h-32 w-full object-cover bg-muted" />
      ) : null}
      <div className="px-3 py-2">
        <p className="text-[11px] font-semibold uppercase text-text-hint">
          Shared {s.content_kind || "news"}
        </p>
        <p className="mt-0.5 font-medium">{s.title || message.display_body}</p>
        {s.note ? <p className="mt-1 text-xs text-text-secondary">{s.note}</p> : null}
        {s.article_id ? (
          <Link
            href={`/admin/news/${s.article_id}`}
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            Open article
          </Link>
        ) : (
          <p className="mt-1 text-[11px] text-text-hint">Content unavailable</p>
        )}
      </div>
    </div>
  );
}

function InviteCard({ message }: { message: MessageItem }) {
  const s = message.structured || {};
  const orgName = s.organization_name || "Organization";
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3 text-sm shadow-sm">
      <div className="flex items-start gap-3">
        <UserAvatar name={orgName} src={s.organization_logo} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase text-text-hint">
            Organization invitation
          </p>
          <p className="mt-0.5 font-medium">
            {senderLabel(message)} shared an invitation to {orgName}
          </p>
          <p className="mt-1 text-[11px] text-text-hint">
            Viewing does not join, accept, or submit a request.
          </p>
          {s.organization_id ? (
            <Link
              href={`/admin/organizations/${s.organization_id}`}
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              View organization
            </Link>
          ) : null}
        </div>
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
