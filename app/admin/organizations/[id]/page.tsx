"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { formatCoins, formatDate, locationLabel } from "@/lib/utils";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("organizations:write");
  const fileRef = useRef<HTMLInputElement>(null);
  const [org, setOrg] = useState<OrganizationRow | null>(null);
  const [members, setMembers] = useState<
    { user_id: string; member_role: string | null; status: string | null; users?: { id: string; display_name: string; email: string | null; role: string } | null }[]
  >([]);
  const [ownerCoinWallet, setOwnerCoinWallet] = useState<CoinWalletRow | null>(null);
  const [liveGiftsReceived, setLiveGiftsReceived] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const { data, error: loadError } = await getSpojexClient()
      .from("organizations")
      .select("*, users:user_id(id, display_name, email, role)")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    const next = data as OrganizationRow | null;
    setOrg(next);
    if (!next) {
      setOwnerCoinWallet(null);
      setLiveGiftsReceived(0);
      setMembers([]);
      return;
    }
    const [wallets, liveTotals, membersRes] = await Promise.all([
      loadCoinWalletsByUserIds([next.user_id]),
      loadOrgLiveGiftTotals([next.id]),
      getSpojexClient()
        .from("organization_members")
        .select("user_id, member_role, status, users:user_id(id, display_name, email, role)")
        .eq("organization_id", next.id)
        .limit(200),
    ]);
    setOwnerCoinWallet(wallets[next.user_id] ?? null);
    setLiveGiftsReceived(liveTotals[next.id] ?? 0);
    setMembers((membersRes.data ?? []) as typeof members);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    try {
      await patchAdmin(`/api/admin/organizations/${id}`, patch);
      await load();
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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

  const remove = async () => {
    if (!org || org.is_platform) return;
    const label = org.name?.trim() || org.public_id || "this organization";
    if (
      !window.confirm(
        `Delete “${label}”? Followers, org chat, and related links will be removed. This cannot be undone.`,
      )
    ) {
      return;
    }
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

  if (loading) return <AdminLoadingRow label="Loading organization…" />;
  if (!org) return <AdminErrorAlert message={error || "Organization not found"} />;

  return (
    <>
      <AdminPageHeader
        title={org.name || "Organization"}
        description={
          org.is_platform
            ? `${org.public_id} · Spojex platform org`
            : org.public_id
        }
        backHref="/admin/organizations"
        breadcrumbs={[
          { label: "Organizations", href: "/admin/organizations" },
          { label: org.name || org.public_id },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save({ verified: !org.verified })}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {org.verified ? "Unverify" : "Verify"}
            </button>
            {canWrite && !org.is_platform ? (
              <button
                type="button"
                disabled={deleting}
                onClick={() => void remove()}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-heading text-sm font-semibold">Logo & profile</h2>
          <div className="flex flex-col items-center gap-4">
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
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload logo"}
            </button>
            {org.logo_url?.trim() ? (
              <button
                type="button"
                className="text-xs text-text-secondary underline"
                onClick={() => void save({ logo_url: null })}
              >
                Remove logo
              </button>
            ) : null}
          </div>

          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Public ID</dt>
              <dd className="font-medium">{org.public_id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Status</dt>
              <dd>
                <StatusBadge tone={verifiedTone(org.verified)}>
                  {org.verified ? "Verified" : "Unverified"}
                </StatusBadge>
              </dd>
            </div>
            {org.is_platform ? (
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Platform</dt>
                <dd className="font-medium text-primary">Spojex brand</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Type</dt>
              <dd className="font-medium">{organizationTypeLabel(org.organization_type)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Location</dt>
              <dd className="font-medium">{locationLabel(org.city, org.country)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Owner user</dt>
              <dd>
                {org.users ? (
                  <Link href={`/admin/people/${org.users.id}`} className="font-medium text-primary">
                    {org.users.display_name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Owner ID</dt>
              <dd className="max-w-[140px] truncate font-mono text-xs" title={org.user_id}>
                {org.user_id}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Live gifts received</dt>
              <dd className="font-medium tabular-nums">{formatCoins(liveGiftsReceived)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Owner gifts (lifetime)</dt>
              <dd className="font-medium tabular-nums">
                {formatCoins(ownerCoinWallet?.lifetime_received ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Owner redeemable</dt>
              <dd className="font-medium tabular-nums">
                {formatCoins(ownerCoinWallet?.redeemable_balance ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Created</dt>
              <dd className="font-medium">{formatDate(org.created_at)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-text-secondary">
            Live events linked to this org send gifts to the owner user and are followable via that
            profile.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-heading text-sm font-semibold">Edit profile</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-text-secondary">Name</span>
              <input
                className={fieldClass}
                defaultValue={org.name}
                onBlur={(event) => {
                  if (event.target.value !== org.name) void save({ name: event.target.value });
                }}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Type</span>
              <select
                className={fieldClass}
                value={org.organization_type}
                onChange={(event) => void save({ organization_type: event.target.value })}
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
                defaultValue={org.currency}
                onBlur={(event) => {
                  if (event.target.value !== org.currency) void save({ currency: event.target.value });
                }}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">City</span>
              <input
                className={fieldClass}
                defaultValue={org.city}
                onBlur={(event) => {
                  if (event.target.value !== org.city) void save({ city: event.target.value });
                }}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Country</span>
              <input
                className={fieldClass}
                defaultValue={org.country}
                onBlur={(event) => {
                  if (event.target.value !== org.country) void save({ country: event.target.value });
                }}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-text-secondary">Website</span>
              <input
                className={fieldClass}
                defaultValue={org.website ?? ""}
                onBlur={(event) => {
                  if (event.target.value !== (org.website ?? "")) {
                    void save({ website: event.target.value || null });
                  }
                }}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-text-secondary">Description</span>
              <textarea
                defaultValue={org.description}
                onBlur={(event) => {
                  if (event.target.value !== org.description) {
                    void save({ description: event.target.value });
                  }
                }}
                rows={5}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-heading text-sm font-semibold">
          Linked people ({1 + members.length})
        </h2>
        <ul className="divide-y divide-border">
          {org.users ? (
            <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
              <div>
                <Link href={`/admin/people/${org.users.id}`} className="text-sm font-medium text-primary">
                  {org.users.display_name}
                </Link>
                <p className="text-xs text-text-secondary">{org.users.email || org.users.role}</p>
              </div>
              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                Owner
              </span>
            </li>
          ) : null}
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                {m.users ? (
                  <Link href={`/admin/people/${m.users.id}`} className="text-sm font-medium text-primary">
                    {m.users.display_name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{m.user_id}</span>
                )}
                <p className="text-xs text-text-secondary">
                  {[m.users?.role, m.status].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-text-secondary">
                {m.member_role || "Member"}
              </span>
            </li>
          ))}
          {!org.users && members.length === 0 ? (
            <li className="py-2 text-sm text-text-hint">No linked people recorded.</li>
          ) : null}
        </ul>
      </section>

      {canWrite ? (
        <section className="mt-6 rounded-xl border border-red-200 bg-red-50/40 p-5">
          <h2 className="font-heading text-sm font-semibold text-red-800">Danger zone</h2>
          {org.is_platform ? (
            <p className="mt-2 text-sm text-text-secondary">
              The Spojex platform organization cannot be deleted.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-text-secondary">
                Permanently delete this organization. Followers, org chat membership, and
                cascade-linked rows are removed. Linked gyms, news, or events that block
                deletion will return an error.
              </p>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void remove()}
                className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete organization"}
              </button>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
