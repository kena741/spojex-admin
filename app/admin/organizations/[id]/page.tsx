"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, verifiedTone } from "@/components/status-badge";
import { organizationTypeLabel, organizationTypes } from "@/lib/catalog";
import { loadCoinWalletsByUserIds, loadOrgLiveGiftTotals } from "@/lib/coin-wallets";
import { adminFetch, deleteAdmin, patchAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { CoinWalletRow, OrganizationRow } from "@/lib/types";
import { cn, formatCoins, formatDate, locationLabel } from "@/lib/utils";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type MemberRow = {
  user_id: string;
  member_role: string | null;
  status: string | null;
  joined_at?: string | null;
  users?: {
    id: string;
    display_name: string;
    email: string | null;
    role: string;
    avatar_url?: string | null;
  } | null;
};

type InviteRow = {
  id: string;
  user_id: string;
  status: string;
  kind: string;
  message?: string | null;
  created_at?: string | null;
  users?: { id: string; display_name: string; email: string | null } | null;
};

type LinkedGym = {
  id: string;
  name: string;
  verification_status?: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  summary: string;
  created_at: string;
  admin_email?: string | null;
  admin_name?: string | null;
};

type Tab = "overview" | "people" | "activity" | "settings";

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "overview";
  const { can } = useAdminPermissions();
  const canWrite = can("organizations:write");
  const canVerify = can("organizations:verify");
  const canFinance = can("finance:read") || can("coins:read") || can("wallets:read");
  const fileRef = useRef<HTMLInputElement>(null);

  const [org, setOrg] = useState<OrganizationRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [ownerCoinWallet, setOwnerCoinWallet] = useState<CoinWalletRow | null>(null);
  const [liveGiftsReceived, setLiveGiftsReceived] = useState(0);
  const [linkedGyms, setLinkedGyms] = useState<LinkedGym[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [newsCount, setNewsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignQuery, setReassignQuery] = useState("");
  const [reassignOptions, setReassignOptions] = useState<
    { id: string; display_name: string; email: string | null; role: string }[]
  >([]);
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    name_am: "",
    organization_type: "club",
    city: "",
    country: "",
    currency: "ETB",
    website: "",
    description: "",
  });
  const [deps, setDeps] = useState<Record<string, number | null> | null>(null);

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const load = async () => {
    const { data, error: loadError } = await getSpojexClient()
      .from("organizations")
      .select("*, users:user_id(id, display_name, email, role, avatar_url)")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    const next = data as OrganizationRow | null;
    setOrg(next);
    if (!next) {
      setOwnerCoinWallet(null);
      setLiveGiftsReceived(0);
      setMembers([]);
      setLinkedGyms([]);
      return;
    }
    setDraft({
      name: next.name || "",
      name_am: next.name_am || "",
      organization_type: next.organization_type || "club",
      city: next.city || "",
      country: next.country || "",
      currency: next.currency || "ETB",
      website: next.website || "",
      description: next.description || "",
    });
    const client = getSpojexClient();
    const [wallets, liveTotals, membersRes, gymsRes, invitesRes, newsRes, auditRes] =
      await Promise.all([
        loadCoinWalletsByUserIds([next.user_id]),
        loadOrgLiveGiftTotals([next.id]),
        client
          .from("organization_members")
          .select(
            "user_id, member_role, status, joined_at, users:user_id(id, display_name, email, role, avatar_url)",
          )
          .eq("organization_id", next.id)
          .limit(500),
        client
          .from("gyms")
          .select("id, name, verification_status")
          .eq("organization_id", next.id)
          .limit(50),
        client
          .from("organization_chat_join_requests")
          .select(
            "id, user_id, status, kind, message, created_at, users:user_id(id, display_name, email)",
          )
          .eq("organization_id", next.id)
          .eq("status", "pending")
          .limit(100),
        client
          .from("sport_news")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", next.id),
        client
          .from("admin_activity_log")
          .select("id, action, summary, created_at, admin_email, admin_name")
          .eq("resource_type", "organization")
          .eq("resource_id", next.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
    setOwnerCoinWallet(wallets[next.user_id] ?? null);
    setLiveGiftsReceived(liveTotals[next.id] ?? 0);
    setMembers((membersRes.data ?? []) as MemberRow[]);
    setLinkedGyms((gymsRes.data ?? []) as LinkedGym[]);
    setInvites((invitesRes.data ?? []) as InviteRow[]);
    setNewsCount(newsRes.count ?? 0);
    setAuditLogs((auditRes.data ?? []) as AuditRow[]);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const people = useMemo(() => {
    if (!org) return { active: [] as MemberRow[], former: [] as MemberRow[] };
    const byUser = new Map<string, MemberRow & { isOwner?: boolean }>();
    // Owner first
    if (org.users) {
      byUser.set(org.user_id, {
        user_id: org.user_id,
        member_role: "owner",
        status: "active",
        users: org.users,
        isOwner: true,
      });
    }
    for (const m of members) {
      const existing = byUser.get(m.user_id);
      if (existing) {
        // Keep owner badge; refresh membership fields
        byUser.set(m.user_id, {
          ...existing,
          member_role: existing.isOwner ? "owner" : m.member_role,
          status: m.status,
          joined_at: m.joined_at,
          users: m.users ?? existing.users,
        });
      } else {
        byUser.set(m.user_id, { ...m, isOwner: false });
      }
    }
    const all = [...byUser.values()];
    return {
      active: all.filter((m) => String(m.status || "active").toLowerCase() === "active"),
      former: all.filter((m) => ["left", "banned"].includes(String(m.status || "").toLowerCase())),
    };
  }, [members, org]);

  const dirty = useMemo(() => {
    if (!org || !editing) return false;
    return (
      draft.name !== (org.name || "") ||
      draft.name_am !== (org.name_am || "") ||
      draft.organization_type !== (org.organization_type || "club") ||
      draft.city !== (org.city || "") ||
      draft.country !== (org.country || "") ||
      draft.currency !== (org.currency || "ETB") ||
      draft.website !== (org.website || "") ||
      draft.description !== (org.description || "")
    );
  }, [draft, editing, org]);

  useEffect(() => {
    if (!reassignOpen) return;
    const q = reassignQuery.trim().replace(/[%(),]/g, " ");
    if (q.length < 2) {
      setReassignOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=12`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            data?: { id: string; display_name: string; email: string | null; role: string }[];
          };
          if (!cancelled) setReassignOptions(json.data ?? []);
        })
        .catch(() => {
          if (!cancelled) setReassignOptions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reassignOpen, reassignQuery]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const saveProfile = async () => {
    if (!org || !canWrite) return;
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (draft.currency.trim() && !/^[A-Za-z]{3}$/.test(draft.currency.trim())) {
      setError("Currency must be a 3-letter code (e.g. ETB).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/organizations/${id}`, {
        name: draft.name.trim(),
        name_am: draft.name_am.trim() || null,
        organization_type: draft.organization_type,
        city: draft.city.trim(),
        country: draft.country.trim(),
        currency: draft.currency.trim().toUpperCase() || "ETB",
        website: draft.website.trim() || null,
        description: draft.description.trim(),
        expected_updated_at: org.updated_at,
      });
      setEditing(false);
      setNotice("Profile saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleVerified = async () => {
    if (!org || !canVerify) return;
    let reason: string | undefined;
    if (!org.verified) {
      reason = window.prompt("Verification reason (required):") || undefined;
      if (!reason?.trim()) return;
    }
    setError(null);
    try {
      await patchAdmin(`/api/admin/organizations/${id}`, {
        verified: !org.verified,
        reason,
      });
      setNotice(org.verified ? "Unverified." : "Marked verified.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification update failed");
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await adminFetch(`/api/admin/organizations/${id}/image`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      await load();
      setNotice("Logo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const loadDeps = async () => {
    const dry = await adminFetch(`/api/admin/organizations/${id}?dry_run=1`, {
      method: "DELETE",
    });
    const payload = (await dry.json()) as {
      dependencies?: Record<string, number | null>;
      can_delete?: boolean;
      blocking?: Record<string, number>;
      error?: string;
    };
    setDeps(payload.dependencies ?? null);
    return payload;
  };

  const remove = async () => {
    if (!org || org.is_platform) return;
    const summary = await loadDeps();
    const hard = Object.entries(summary.blocking ?? {}).filter(
      ([, n]) => typeof n === "number" && n > 0,
    );
    if (hard.length || summary.can_delete === false) {
      setError(
        `Cannot delete while linked products/content exist: ${
          hard.map(([k, n]) => `${k}=${n}`).join(", ") ||
          Object.entries(summary.dependencies ?? {})
            .filter(([k, n]) => ["gyms", "live_events", "sport_news"].includes(k) && Number(n) > 0)
            .map(([k, n]) => `${k}=${n}`)
            .join(", ")
        }. Unlink first.`,
      );
      return;
    }
    const label = org.name?.trim() || org.public_id || "this organization";
    if (!window.confirm(`Delete “${label}”? Memberships will be removed. This cannot be undone.`))
      return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/organizations/${id}`);
      router.replace("/admin/organizations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  const submitReassign = async () => {
    if (!org || !canWrite || org.is_platform) return;
    if (!reassignUserId.trim() || !reassignReason.trim()) {
      setError("Select a new owner and provide a reason.");
      return;
    }
    setReassignBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/reassign-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_owner_user_id: reassignUserId.trim(),
          reason: reassignReason.trim(),
        }),
      });
      const payload = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) throw new Error(payload.error || "Reassign failed");
      setNotice(payload.note || "Owner reassigned. Personal wallets were not moved.");
      setReassignOpen(false);
      setReassignQuery("");
      setReassignUserId("");
      setReassignReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reassign failed");
    } finally {
      setReassignBusy(false);
    }
  };

  const archiveOrg = async () => {
    if (!org || !canWrite || org.is_platform) return;
    const reason = window.prompt("Archive reason (optional):") ?? "";
    if (!window.confirm(`Archive “${org.name}”? Prefer this over delete when history exists.`))
      return;
    setArchiving(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Archive failed");
      setNotice("Organization archived.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) return <AdminLoadingRow label="Loading organization…" />;
  if (!org) return <AdminErrorAlert message={error || "Organization not found"} />;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "people", label: `People (${people.active.length})` },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={org.name || "Organization"}
        description={
          org.is_platform
            ? `${organizationTypeLabel(org.organization_type)} · Spojex platform org`
            : organizationTypeLabel(org.organization_type)
        }
        backHref="/admin/organizations"
        breadcrumbs={[
          { label: "Organizations", href: "/admin/organizations" },
          { label: org.name || org.public_id },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canVerify && !org.is_platform ? (
              <button
                type="button"
                onClick={() => void toggleVerified()}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {org.verified ? "Unverify" : "Mark verified"}
              </button>
            ) : null}
            <Link
              href="/admin/verifications"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Verification Center
            </Link>
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (dirty && !window.confirm("Discard unsaved profile changes?")) return;
              if (dirty) setEditing(false);
              setTab(t.id);
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-28 w-28 overflow-hidden rounded-2xl border border-border bg-muted">
                {org.logo_url?.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-secondary">
                    {(org.name || "O").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <StatusBadge tone={verifiedTone(org.verified)}>
                {org.verified ? "Verified" : "Unverified"}
              </StatusBadge>
              {org.archived_at ? (
                <span className="text-xs font-medium text-amber-700">Archived</span>
              ) : null}
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              {org.name_am ? <Row label="Amharic name">{org.name_am}</Row> : null}
              <Row label="Location">{locationLabel(org.city, org.country)}</Row>
              <Row label="Owner">
                {org.users ? (
                  <Link href={`/admin/people/${org.users.id}`} className="text-primary hover:underline">
                    {org.users.display_name}
                  </Link>
                ) : (
                  "-"
                )}
              </Row>
              <Row label="Public ID">
                <button
                  type="button"
                  className="font-mono text-xs hover:underline"
                  title="Copy"
                  onClick={() => void navigator.clipboard.writeText(org.public_id)}
                >
                  {org.public_id}
                </button>
              </Row>
              <Row label="Updated">{formatDate(org.updated_at || org.created_at)}</Row>
            </dl>
            <p className="mt-3 text-[11px] text-text-hint">
              Org verification is a separate boolean scope from gym verification and from identity
              Verification Center requests.
            </p>
          </section>

          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-sm font-semibold">About</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                {org.description?.trim() || "No description."}
              </p>
              {org.website ? (
                <a
                  href={org.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm text-primary hover:underline"
                >
                  {org.website}
                </a>
              ) : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-sm font-semibold">Org-attributable activity</h2>
              <p className="mt-1 text-xs text-text-hint">
                Live gifts for events hosted by this organization. Personal owner wallet totals are
                not organization balances.
              </p>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {formatCoins(liveGiftsReceived)}
              </p>
              <p className="text-xs text-text-secondary">Live gifts received (coins)</p>
              {canFinance && liveGiftsReceived > 0 ? (
                <Link
                  href={`/admin/finance/transactions?q=${encodeURIComponent(org.id)}`}
                  className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
                >
                  Open Finance history
                </Link>
              ) : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-sm font-semibold">Linked products</h2>
              <p className="mt-1 text-xs text-text-hint">
                Links use explicit foreign keys - not name matching. Gym verification is a separate
                scope from organization verification.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <span className="text-text-hint">Gyms: </span>
                  {linkedGyms.length === 0
                    ? "None"
                    : linkedGyms.map((g) => (
                        <span key={g.id} className="mr-3 inline-flex items-center gap-1">
                          <Link href={`/admin/gyms/${g.id}`} className="text-primary hover:underline">
                            {g.name}
                          </Link>
                          {g.verification_status ? (
                            <span className="text-[10px] text-text-hint">
                              (gym: {g.verification_status})
                            </span>
                          ) : null}
                        </span>
                      ))}
                </li>
                <li>
                  <Link
                    href={`/admin/news/new?organization_id=${encodeURIComponent(org.id)}`}
                    className="text-primary hover:underline"
                  >
                    Sport News ({newsCount})
                  </Link>
                </li>
                <li>
                  <Link href="/admin/streams" className="text-primary hover:underline">
                    Streams / radio
                  </Link>
                </li>
                <li>
                  <span className="text-text-hint">Organization chat: </span>
                  membership + owner roles drive chat access
                </li>
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "people" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold">
                Active members ({people.active.length} unique)
              </h2>
              {canWrite && !org.is_platform ? (
                <button
                  type="button"
                  onClick={() => setReassignOpen(true)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium"
                >
                  Reassign owner…
                </button>
              ) : null}
            </div>
            <ul className="divide-y divide-border">
              {people.active.map((m) => {
                const isOwner = m.user_id === org.user_id || m.member_role === "owner";
                return (
                  <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold">
                        {m.users?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.users.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (m.users?.display_name || "?").slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        {m.users ? (
                          <Link
                            href={`/admin/people/${m.users.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {m.users.display_name}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">{m.user_id.slice(0, 8)}</span>
                        )}
                        <p className="text-xs text-text-secondary">
                          Profile role: {m.users?.role ? formatRole(m.users.role) : "-"} · Org
                          access: {isOwner ? "owner" : m.member_role || "member"} ·{" "}
                          {m.status || "active"}
                          {m.joined_at ? ` · Joined ${formatDate(m.joined_at)}` : ""}
                        </p>
                      </div>
                    </div>
                    {isOwner ? (
                      <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                        Owner
                      </span>
                    ) : (
                      <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-text-secondary">
                        {m.member_role || "Member"}
                      </span>
                    )}
                  </li>
                );
              })}
              {people.active.length === 0 ? (
                <li className="py-2 text-sm text-text-hint">No active members.</li>
              ) : null}
            </ul>
          </section>

          {invites.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">
                Pending invitations / join requests ({invites.length})
              </h2>
              <ul className="divide-y divide-border">
                {invites.map((inv) => (
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

          {people.former.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 font-heading text-sm font-semibold">
                Former members ({people.former.length})
              </h2>
              <ul className="divide-y divide-border">
                {people.former.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">
                        {m.users?.display_name || m.user_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {m.status}
                        {m.joined_at ? ` · Joined ${formatDate(m.joined_at)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h2 className="font-heading text-sm font-semibold">Publishing & gifts</h2>
            <p className="text-sm text-text-secondary">
              Sport news attributed to this org: <strong>{newsCount}</strong>
            </p>
            <p className="text-sm text-text-secondary">
              Live gifts received by events hosted under this org:{" "}
              <strong className="tabular-nums">{formatCoins(liveGiftsReceived)}</strong> coins.
            </p>
            {canFinance ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">Owner personal wallet (not org balance)</p>
                <p className="mt-1">
                  Lifetime gifts received by owner user:{" "}
                  {formatCoins(ownerCoinWallet?.lifetime_received ?? 0)} · Redeemable:{" "}
                  {formatCoins(ownerCoinWallet?.redeemable_balance ?? 0)}
                </p>
                <p className="mt-1">
                  Live gifts currently credit the owner user account. Do not sum this wallet across
                  multiple organizations.
                </p>
                {org.users ? (
                  <Link
                    href={`/admin/people/${org.users.id}`}
                    className="mt-2 inline-block font-medium text-primary hover:underline"
                  >
                    Open owner profile
                  </Link>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-text-hint">
                Personal owner wallet totals require finance/coins permission.
              </p>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-sm font-semibold">Administrative audit</h2>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-text-hint">No admin audit events for this organization yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {auditLogs.map((log) => (
                  <li key={log.id} className="py-2.5">
                    <p className="font-medium">{log.summary || log.action}</p>
                    <p className="text-xs text-text-secondary">
                      {log.admin_name || log.admin_email || "Admin"} · {formatDate(log.created_at)} ·{" "}
                      {log.action}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold">Profile</h2>
              {canWrite ? (
                editing ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEditing(false);
                        setDraft({
                          name: org.name || "",
                          name_am: org.name_am || "",
                          organization_type: org.organization_type || "club",
                          city: org.city || "",
                          country: org.country || "",
                          currency: org.currency || "ETB",
                          website: org.website || "",
                          description: org.description || "",
                        });
                      }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saving || !dirty}
                      onClick={() => void saveProfile()}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    Edit profile
                  </button>
                )
              ) : null}
            </div>

            <div className="mb-4 flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
              />
              {canWrite ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : "Upload logo"}
                </button>
              ) : null}
            </div>

            <fieldset disabled={!editing || !canWrite} className="grid gap-3 sm:grid-cols-2 disabled:opacity-90">
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Name (English)</span>
                <input
                  className={fieldClass}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Name (Amharic)</span>
                <input
                  className={fieldClass}
                  value={draft.name_am}
                  onChange={(e) => setDraft((d) => ({ ...d, name_am: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Type</span>
                <select
                  className={fieldClass}
                  value={draft.organization_type}
                  onChange={(e) => setDraft((d) => ({ ...d, organization_type: e.target.value }))}
                >
                  {organizationTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Currency</span>
                <input
                  className={fieldClass}
                  value={draft.currency}
                  onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">City</span>
                <input
                  className={fieldClass}
                  value={draft.city}
                  onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-text-secondary">Country</span>
                <input
                  className={fieldClass}
                  value={draft.country}
                  onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-text-secondary">Website</span>
                <input
                  className={fieldClass}
                  value={draft.website}
                  onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-text-secondary">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={5}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>
            </fieldset>
            {dirty ? (
              <p className="mt-2 text-xs text-amber-700">You have unsaved changes.</p>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-sm font-semibold">Verification details</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Status: {org.verified ? "Verified" : "Unverified / pending review"}. Org verification
              is separate from gym listing verification and from identity Verification Center cases.
            </p>
            {canVerify ? (
              <button
                type="button"
                onClick={() => void toggleVerified()}
                className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
              >
                {org.verified ? "Unverify…" : "Mark verified…"}
              </button>
            ) : (
              <p className="mt-2 text-xs text-text-hint">
                Requires organizations:verify to change verification.
              </p>
            )}
          </section>

          {canWrite && !org.is_platform ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h2 className="font-heading text-sm font-semibold">Advanced</h2>
              <div>
                <p className="text-sm text-text-secondary">
                  Ownership transfer updates canonical owner and memberships only. Personal gift
                  wallets and historical transactions stay with the account holder.
                </p>
                <button
                  type="button"
                  onClick={() => setReassignOpen(true)}
                  className="mt-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Reassign owner…
                </button>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm text-text-secondary">
                  Prefer archive when historical relationships exist. Delete only when dependency
                  check shows no blocking linked products.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={archiving || Boolean(org.archived_at)}
                    onClick={() => void archiveOrg()}
                    className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {org.archived_at ? "Already archived" : archiving ? "Archiving…" : "Archive…"}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void remove()}
                    className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Delete…"}
                  </button>
                </div>
                {deps ? (
                  <ul className="mt-3 text-xs text-text-secondary">
                    {Object.entries(deps).map(([k, v]) => (
                      <li key={k}>
                        {k}: {v == null ? "Unavailable" : v}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ) : org.is_platform ? (
            <p className="text-sm text-text-secondary">
              The Spojex platform organization cannot be deleted, archived, or reassigned.
            </p>
          ) : null}
        </div>
      ) : null}

      {reassignOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="font-heading text-sm font-semibold">Reassign owner</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Current owner: {org.users?.display_name || org.user_id}. Wallets are not moved.
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-text-secondary">Search user</span>
              <input
                className={fieldClass}
                value={reassignQuery}
                onChange={(e) => {
                  setReassignQuery(e.target.value);
                  setReassignUserId("");
                }}
                placeholder="Name or email"
              />
            </label>
            {reassignOptions.length > 0 ? (
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                {reassignOptions.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setReassignUserId(u.id);
                        setReassignQuery(u.email || u.display_name);
                      }}
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                        reassignUserId === u.id ? "bg-primary/10" : "",
                      )}
                    >
                      <span className="font-medium">{u.display_name}</span>
                      <span className="text-xs text-text-secondary">
                        {[u.email, u.role].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-text-secondary">Reason (required)</span>
              <input
                className={fieldClass}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassignOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reassignBusy || !reassignUserId || !reassignReason.trim()}
                onClick={() => void submitReassign()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {reassignBusy ? "Saving…" : "Transfer ownership"}
              </button>
            </div>
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

function formatRole(role: string) {
  return role.replace(/_/g, " ");
}
