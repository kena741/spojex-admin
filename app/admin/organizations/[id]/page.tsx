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
  const [linkedGyms, setLinkedGyms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
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
      organization_type: next.organization_type || "club",
      city: next.city || "",
      country: next.country || "",
      currency: next.currency || "ETB",
      website: next.website || "",
      description: next.description || "",
    });
    const [wallets, liveTotals, membersRes, gymsRes] = await Promise.all([
      loadCoinWalletsByUserIds([next.user_id]),
      loadOrgLiveGiftTotals([next.id]),
      getSpojexClient()
        .from("organization_members")
        .select("user_id, member_role, status, joined_at, users:user_id(id, display_name, email, role, avatar_url)")
        .eq("organization_id", next.id)
        .limit(500),
      getSpojexClient()
        .from("gyms")
        .select("id, name")
        .eq("organization_id", next.id)
        .limit(50),
    ]);
    setOwnerCoinWallet(wallets[next.user_id] ?? null);
    setLiveGiftsReceived(liveTotals[next.id] ?? 0);
    setMembers((membersRes.data ?? []) as MemberRow[]);
    setLinkedGyms((gymsRes.data ?? []) as { id: string; name: string }[]);
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
      draft.organization_type !== (org.organization_type || "club") ||
      draft.city !== (org.city || "") ||
      draft.country !== (org.country || "") ||
      draft.currency !== (org.currency || "ETB") ||
      draft.website !== (org.website || "") ||
      draft.description !== (org.description || "")
    );
  }, [draft, editing, org]);

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
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/organizations/${id}`, {
        name: draft.name.trim(),
        organization_type: draft.organization_type,
        city: draft.city.trim(),
        country: draft.country.trim(),
        currency: draft.currency.trim() || "ETB",
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
    if (!org) return;
    if (!canVerify && !canWrite) return;
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

  const reassignOwner = async () => {
    if (!org || !canWrite || org.is_platform) return;
    const proposed = window.prompt("New owner user ID (UUID):");
    if (!proposed?.trim()) return;
    const reason = window.prompt("Reason for ownership transfer (required):");
    if (!reason?.trim()) return;
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/reassign-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_owner_user_id: proposed.trim(),
          reason: reason.trim(),
        }),
      });
      const payload = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) throw new Error(payload.error || "Reassign failed");
      setNotice(payload.note || "Owner reassigned. Personal wallets were not moved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reassign failed");
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
            {(canVerify || canWrite) && !org.is_platform ? (
              <button
                type="button"
                onClick={() => void toggleVerified()}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {org.verified ? "Unverify" : "Mark verified"}
              </button>
            ) : null}
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
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <Row label="Location">{locationLabel(org.city, org.country)}</Row>
              <Row label="Owner">
                {org.users ? (
                  <Link href={`/admin/people/${org.users.id}`} className="text-primary hover:underline">
                    {org.users.display_name}
                  </Link>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Public ID">
                <span className="font-mono text-xs">{org.public_id}</span>
              </Row>
              <Row label="Updated">{formatDate(org.updated_at || org.created_at)}</Row>
            </dl>
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
              {canFinance ? (
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
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <span className="text-text-hint">Gyms: </span>
                  {linkedGyms.length === 0
                    ? "None"
                    : linkedGyms.map((g) => (
                        <Link
                          key={g.id}
                          href={`/admin/gyms/${g.id}`}
                          className="mr-2 text-primary hover:underline"
                        >
                          {g.name}
                        </Link>
                      ))}
                </li>
                <li>
                  <Link href="/admin/news" className="text-primary hover:underline">
                    Sport News publishing
                  </Link>
                </li>
                <li>
                  <Link href="/admin/streams" className="text-primary hover:underline">
                    Streams / radio
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "people" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-sm font-semibold">
              Active members ({people.active.length} unique)
            </h2>
            <ul className="divide-y divide-border">
              {people.active.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
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
                      Profile role: {m.users?.role ? formatRole(m.users.role) : "—"} · Org access:{" "}
                      {m.member_role || "member"}
                    </p>
                  </div>
                  {m.member_role === "owner" || m.user_id === org.user_id ? (
                    <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                      Owner
                    </span>
                  ) : (
                    <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-text-secondary">
                      {m.member_role || "Member"}
                    </span>
                  )}
                </li>
              ))}
              {people.active.length === 0 ? (
                <li className="py-2 text-sm text-text-hint">No active members.</li>
              ) : null}
            </ul>
          </section>

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
                      <p className="text-xs text-text-secondary">{m.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "activity" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-heading text-sm font-semibold">Activity</h2>
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
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-text-secondary">Name</span>
                <input
                  className={fieldClass}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
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
                  onClick={() => void reassignOwner()}
                  className="mt-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Reassign owner…
                </button>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm text-text-secondary">
                  Prefer unlinking products over deletion. A dependency check runs first; memberships
                  and follows are cleaned when safe.
                </p>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void remove()}
                  className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete organization…"}
                </button>
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
              The Spojex platform organization cannot be deleted or reassigned.
            </p>
          ) : null}
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
