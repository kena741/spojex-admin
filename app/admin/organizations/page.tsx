"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, verifiedTone } from "@/components/status-badge";
import { organizationTypeLabel, organizationTypes } from "@/lib/catalog";
import { loadCoinWalletsByUserIds, loadOrgLiveGiftTotals } from "@/lib/coin-wallets";
import { postAdminResponse } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { CoinWalletRow, OrganizationRow, UserRow } from "@/lib/types";
import { formatCoins, formatDate, locationLabel } from "@/lib/utils";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type OwnerOption = Pick<UserRow, "id" | "display_name" | "email" | "role" | "city">;

const createTypeOptions = [
  ...organizationTypes.filter((item) => item.id === "club" || item.id === "academy"),
  ...organizationTypes.filter((item) => item.id !== "club" && item.id !== "academy"),
];

/* ─── Main Page ─── */

export default function OrganizationsPage() {
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("organizations:write");
  const [rows, setRows] = useState<OrganizationRow[]>([]);
  const [ownerCoins, setOwnerCoins] = useState<Record<string, CoinWalletRow>>({});
  const [liveGiftTotals, setLiveGiftTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [verified, setVerified] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingPlatform, setCreatingPlatform] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    organization_type: "club",
    city: "",
    country: "Ethiopia",
    description: "",
    owner_user_id: "",
    owner_email: "",
    verified: false,
  });

  const load = async () => {
    const { data, error: loadError } = await getSupabase()
      .from("organizations")
      .select("*, users:user_id(id, display_name, email, role)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (loadError) throw loadError;
    const orgs = (data ?? []) as OrganizationRow[];
    setRows(orgs);
    const [wallets, liveTotals] = await Promise.all([
      loadCoinWalletsByUserIds(orgs.map((o) => o.user_id)),
      loadOrgLiveGiftTotals(orgs.map((o) => o.id)),
    ]);
    setOwnerCoins(wallets);
    setLiveGiftTotals(liveTotals);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    const q = ownerQuery.trim().replace(/[%(),]/g, " ");
    if (q.length < 2) {
      setOwnerOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setOwnerLoading(true);
      getSupabase()
        .from("users")
        .select("id, display_name, email, role, city")
        .or(`display_name.ilike.%${q}%,email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .order("display_name")
        .limit(12)
        .then(({ data, error: searchError }) => {
          if (cancelled) return;
          if (searchError) {
            setError(searchError.message);
            setOwnerOptions([]);
          } else {
            setOwnerOptions((data ?? []) as OwnerOption[]);
          }
          setOwnerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [createOpen, ownerQuery]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (type !== "all" && row.organization_type !== type) return false;
      if (verified === "yes" && !row.verified) return false;
      if (verified === "no" && row.verified) return false;
      if (!q) return true;
      return [row.name, row.public_id, row.city, row.country, row.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [query, rows, type, verified]);

  const selectedOwner = ownerOptions.find((item) => item.id === form.owner_user_id);

  const resetCreateForm = () => {
    setForm({
      name: "",
      organization_type: type === "academy" ? "academy" : "club",
      city: "",
      country: "Ethiopia",
      description: "",
      owner_user_id: "",
      owner_email: "",
      verified: false,
    });
    setOwnerQuery("");
    setOwnerOptions([]);
  };

  const openCreate = (preferredType?: string) => {
    resetCreateForm();
    if (preferredType === "club" || preferredType === "academy") {
      setForm((prev) => ({ ...prev, organization_type: preferredType }));
    } else if (type === "club" || type === "academy") {
      setForm((prev) => ({ ...prev, organization_type: type }));
    }
    setCreateOpen(true);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    const ownerEmail = (form.owner_user_id ? "" : form.owner_email || ownerQuery).trim();
    if (!form.owner_user_id && !ownerEmail) {
      setError("Pick an owner or enter their SpoJex email.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const payload = await postAdminResponse("/api/admin/organizations", {
        name: form.name,
        organization_type: form.organization_type,
        city: form.city,
        country: form.country,
        description: form.description,
        owner_user_id: form.owner_user_id || undefined,
        owner_email: form.owner_user_id ? undefined : ownerEmail,
        verified: form.verified,
      });
      const created = payload.data as OrganizationRow | undefined;
      setCreateOpen(false);
      resetCreateForm();
      if (created?.id) {
        router.push(`/admin/organizations/${created.id}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const createSpojexPlatform = async () => {
    if (!canWrite) return;
    const existing = rows.find((row) => row.is_platform);
    if (existing?.id) {
      router.push(`/admin/organizations/${existing.id}`);
      return;
    }
    setCreatingPlatform(true);
    setError(null);
    try {
      const payload = await postAdminResponse("/api/admin/organizations/platform", {});
      const org = payload.data as OrganizationRow | undefined;
      await load();
      if (org?.id) {
        router.push(`/admin/organizations/${org.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Spojex org");
    } finally {
      setCreatingPlatform(false);
    }
  };

  const platformOrg = rows.find((row) => row.is_platform);

  return (
    <>
      <AdminPageHeader
        title="Organizations"
        description={`${filtered.length} of ${rows.length} · clubs, academies, and more`}
        stackOnSmall
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={creatingPlatform}
                onClick={() => void createSpojexPlatform()}
                className="h-9 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-60"
              >
                {creatingPlatform
                  ? "Creating…"
                  : platformOrg
                    ? "Open Spojex org"
                    : "Create Spojex org"}
              </button>
              <button
                type="button"
                onClick={() => openCreate("club")}
                className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
              >
                Add club
              </button>
              <button
                type="button"
                onClick={() => openCreate("academy")}
                className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
              >
                Add academy
              </button>
              <button
                type="button"
                onClick={() => openCreate()}
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                Add organization
              </button>
            </div>
          ) : null
        }
      />

      <AdminFilterPanel>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[1fr_200px_160px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, public ID, city" />
          <AdminSelect value={type} onChange={setType}>
            <option value="all">All types</option>
            {organizationTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect value={verified} onChange={setVerified}>
            <option value="all">All verification</option>
            <option value="yes">Verified</option>
            <option value="no">Unverified</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      {loading ? <AdminLoadingRow label="Loading organizations…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      {/* Table Layout */}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No organizations"
            description={
              canWrite
                ? "Add a club or academy, or wait for individuals to create them in the app."
                : "Organizations created in admin or the superapp appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Organization</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Gifts received</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Verified</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const liveGifts = liveGiftTotals[row.id] ?? 0;
                  const ownerReceived = ownerCoins[row.user_id]?.lifetime_received ?? 0;
                  const shown = liveGifts > 0 ? liveGifts : ownerReceived;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/organizations/${row.id}`} className="font-medium text-text-primary">
                          {row.name || "Unnamed"}
                        </Link>
                        <p className="text-xs text-text-secondary">
                          {row.public_id}
                          {row.is_platform ? " · Spojex platform" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{organizationTypeLabel(row.organization_type)}</td>
                      <td className="px-4 py-3">
                        {row.users ? (
                          <Link href={`/admin/users/${row.users.id}`} className="text-primary">
                            {row.users.display_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium tabular-nums text-text-primary">{formatCoins(shown)}</span>
                        {liveGifts > 0 ? (
                          <span className="mt-0.5 block text-[11px] text-text-secondary">Live gifts</span>
                        ) : ownerReceived > 0 ? (
                          <span className="mt-0.5 block text-[11px] text-text-secondary">Owner wallet</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{locationLabel(row.city, row.country)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={verifiedTone(row.verified)}>
                          {row.verified ? "Verified" : "Unverified"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      {/* Mobile Empty State */}
      {!loading && filtered.length === 0 ? (
        <div className="lg:hidden">
          <AdminEmpty
            title="No organizations"
            description={
              canWrite
                ? "Add a club or academy, or wait for individuals to create them in the app."
                : "Organizations created in admin or the superapp appear here."
            }
          />
        </div>
      ) : null}

      <AdminModal
        open={createOpen}
        title="Add organization"
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
        }}
        className="max-w-xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-organization-form"
              disabled={creating}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {creating ? "Saving…" : "Create organization"}
            </button>
          </div>
        }
      >
        <form id="create-organization-form" onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Name</span>
            <input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className={fieldClass}
              placeholder="e.g. Hawassa United Academy"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Type</span>
            <select
              value={form.organization_type}
              onChange={(event) => setForm({ ...form, organization_type: event.target.value })}
              className={fieldClass}
            >
              {createTypeOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">City</span>
            <input
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Country</span>
            <input
              value={form.country}
              onChange={(event) => setForm({ ...form, country: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Owner (required)</span>
            <input
              value={ownerQuery}
              onChange={(event) => {
                setOwnerQuery(event.target.value);
                setForm((prev) => ({ ...prev, owner_user_id: "", owner_email: event.target.value }));
              }}
              className={fieldClass}
              placeholder="Search by name or email"
            />
            {selectedOwner ? (
              <p className="text-xs text-text-secondary">
                Selected: {selectedOwner.display_name}
                {selectedOwner.email ? ` · ${selectedOwner.email}` : ""}
              </p>
            ) : (
              <p className="text-xs text-text-secondary">
                Selected user becomes the organization owner. Paste an email if they are not listed.
              </p>
            )}
            {ownerLoading ? <p className="text-xs text-text-hint">Searching…</p> : null}
            {ownerOptions.length > 0 ? (
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
                {ownerOptions.map((owner) => (
                  <li key={owner.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          owner_user_id: owner.id,
                          owner_email: owner.email ?? "",
                        }));
                        setOwnerQuery(owner.email || owner.display_name);
                      }}
                      className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted ${
                        form.owner_user_id === owner.id ? "bg-primary/10" : ""
                      }`}
                    >
                      <span className="font-medium">{owner.display_name}</span>
                      <span className="text-xs text-text-secondary">
                        {[owner.email, owner.role, owner.city].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.verified}
              onChange={(event) => setForm({ ...form, verified: event.target.checked })}
            />
            <span className="text-text-secondary">Mark as verified</span>
          </label>
        </form>
      </AdminModal>
    </>
  );
}
