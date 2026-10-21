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
} from "@/components/admin-layout";
import { StatusBadge, verifiedTone } from "@/components/status-badge";
import { organizationTypeLabel, organizationTypes } from "@/lib/catalog";
import { loadCoinWalletsByUserIds, loadOrgLiveGiftTotals } from "@/lib/coin-wallets";
import { adminFetch, postAdminResponse, useIdentityCatalog } from "@/lib/hooks";
import { generateStadiumManagerPassword } from "@/lib/stadiums";
import { getSpojexClient } from "@/lib/spojex/client";
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
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
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
  const [ownerCreateOpen, setOwnerCreateOpen] = useState(false);
  const [ownerCreating, setOwnerCreating] = useState(false);
  const [ownerCreateError, setOwnerCreateError] = useState<string | null>(null);
  const [ownerPassword, setOwnerPassword] = useState<string | null>(null);
  const [ownerNotice, setOwnerNotice] = useState<string | null>(null);
  const [attachedOwner, setAttachedOwner] = useState<OwnerOption | null>(null);
  const [ownerDraft, setOwnerDraft] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "administrator",
    city: "",
    country: "Ethiopia",
    password: "",
  });
  const { roleOptions } = useIdentityCatalog();
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
    const { data, error: loadError } = await getSpojexClient()
      .from("organizations")
      .select("*, users:user_id(id, display_name, email, role)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (loadError) throw loadError;
    const orgs = (data ?? []) as OrganizationRow[];
    setRows(orgs);
    const orgIds = orgs.map((o) => o.id);
    const [wallets, liveTotals, membersRes] = await Promise.all([
      loadCoinWalletsByUserIds(orgs.map((o) => o.user_id)),
      loadOrgLiveGiftTotals(orgIds),
      orgIds.length
        ? getSpojexClient()
            .from("organization_members")
            .select("organization_id")
            .in("organization_id", orgIds)
            .limit(5000)
        : Promise.resolve({ data: [] as { organization_id: string }[] }),
    ]);
    setOwnerCoins(wallets);
    setLiveGiftTotals(liveTotals);
    const counts: Record<string, number> = {};
    for (const id of orgIds) counts[id] = 1; // owner always counted
    for (const m of membersRes.data ?? []) {
      const oid = String(m.organization_id);
      counts[oid] = (counts[oid] ?? 1) + 1;
    }
    setMemberCounts(counts);
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
      void adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=12`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            data?: OwnerOption[];
            error?: string;
          };
          if (cancelled) return;
          if (!res.ok) {
            setError(json.error || "Failed to search users");
            setOwnerOptions([]);
          } else {
            setOwnerOptions(json.data ?? []);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to search users");
          setOwnerOptions([]);
        })
        .finally(() => {
          if (!cancelled) setOwnerLoading(false);
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

  const selectedOwner =
    attachedOwner && attachedOwner.id === form.owner_user_id
      ? attachedOwner
      : ownerOptions.find((item) => item.id === form.owner_user_id);

  const ownerRoleGroups = useMemo(() => {
    const groups = new Map<string, { id: string; label: string }[]>();
    for (const option of roleOptions) {
      if (!option.id) continue;
      const group = option.group || "Role";
      const list = groups.get(group) ?? [];
      list.push({ id: option.id, label: option.label });
      groups.set(group, list);
    }
    return [...groups.entries()];
  }, [roleOptions]);

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
    setAttachedOwner(null);
    setOwnerPassword(null);
    setOwnerNotice(null);
    setOwnerCreateOpen(false);
    setOwnerCreateError(null);
  };

  const openOwnerCreate = () => {
    setOwnerCreateError(null);
    setOwnerDraft({
      full_name: "",
      email: ownerQuery.includes("@") ? ownerQuery.trim() : "",
      phone: "",
      role: "administrator",
      city: form.city,
      country: form.country || "Ethiopia",
      password: generateStadiumManagerPassword(),
    });
    setOwnerCreateOpen(true);
  };

  const createOwner = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setOwnerCreating(true);
    setOwnerCreateError(null);
    try {
      const payload = await postAdminResponse("/api/admin/users", {
        full_name: ownerDraft.full_name,
        email: ownerDraft.email,
        phone: ownerDraft.phone,
        role: ownerDraft.role,
        city: ownerDraft.city,
        country: ownerDraft.country,
        password: ownerDraft.password,
      });
      const created = payload.data as OwnerOption | undefined;
      if (!created?.id) throw new Error("User was not created");
      setForm((prev) => ({
        ...prev,
        owner_user_id: created.id,
        owner_email: created.email ?? ownerDraft.email,
      }));
      setAttachedOwner(created);
      setOwnerOptions([created]);
      setOwnerQuery(created.email || created.display_name);
      const attachedExisting = Boolean(
        (payload as { attached_existing?: boolean }).attached_existing,
      );
      setOwnerPassword(typeof payload.password === "string" ? payload.password : null);
      setOwnerNotice(
        attachedExisting ? "Existing account attached as owner. Their current role was kept." : null,
      );
      setOwnerCreateOpen(false);
    } catch (err) {
      setOwnerCreateError(err instanceof Error ? err.message : "Failed to create owner");
    } finally {
      setOwnerCreating(false);
    }
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
        description={`${filtered.length} of ${rows.length} · clubs, academies, and linked people`}
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

      {!loading && filtered.length === 0 ? (
        <AdminEmpty
          title="No organizations"
          description={
            canWrite
              ? "Add a club or academy, or wait for individuals to create them in the app."
              : "Organizations created in admin or the superapp appear here."
          }
        />
      ) : null}

      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {filtered.map((row) => {
              const liveGifts = liveGiftTotals[row.id] ?? 0;
              const ownerReceived = ownerCoins[row.user_id]?.lifetime_received ?? 0;
              const shown = liveGifts > 0 ? liveGifts : ownerReceived;
              const members = memberCounts[row.id] ?? 1;
              return (
                <li key={row.id}>
                  <Link
                    href={`/admin/organizations/${row.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-sm font-semibold text-text-secondary">
                      {row.logo_url?.trim() ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (row.name || "O").slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">{row.name || "Unnamed"}</p>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          {organizationTypeLabel(row.organization_type)}
                        </span>
                        {row.is_platform ? (
                          <span className="text-[10px] font-medium text-primary">Platform</span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-text-secondary">
                        {[row.public_id, locationLabel(row.city, row.country)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      <StatusBadge tone={verifiedTone(row.verified)}>
                        {row.verified ? "Verified" : "Unverified"}
                      </StatusBadge>
                      <span className="text-[10px] text-text-hint">{members} people</span>
                    </div>
                    <div className="hidden w-28 shrink-0 text-right text-xs text-text-secondary lg:block">
                      <span className="font-medium tabular-nums text-foreground">{formatCoins(shown)}</span>
                      <span className="mt-0.5 block text-[10px] text-text-hint">
                        {liveGifts > 0 ? "Live gifts" : "Activity"}
                      </span>
                    </div>
                    <div className="hidden w-24 shrink-0 text-right text-[11px] text-text-hint xl:block">
                      {formatDate(row.created_at)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
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
          <div className="grid gap-1 text-sm sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="org-owner-search" className="text-text-secondary">
                Owner (required)
              </label>
              <button
                type="button"
                onClick={openOwnerCreate}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-primary hover:bg-muted"
              >
                Create owner
              </button>
            </div>
            <input
              id="org-owner-search"
              value={ownerQuery}
              onChange={(event) => {
                setOwnerQuery(event.target.value);
                setAttachedOwner(null);
                setOwnerPassword(null);
                setOwnerNotice(null);
                setForm((prev) => ({ ...prev, owner_user_id: "", owner_email: event.target.value }));
              }}
              className={fieldClass}
              placeholder="Search by name or email"
            />
            {selectedOwner ? (
              <p className="text-xs text-text-secondary">
                Owner: {selectedOwner.display_name}
                {selectedOwner.email ? ` · ${selectedOwner.email}` : ""}
                {selectedOwner.role ? ` · ${selectedOwner.role}` : ""}
              </p>
            ) : (
              <p className="text-xs text-text-secondary">
                Search an existing user, or create one with phone, email, and role. They are attached as owner immediately.
              </p>
            )}
            {ownerPassword ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                New login created. Password: <span className="font-mono">{ownerPassword}</span>
              </p>
            ) : null}
            {ownerNotice ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-text-secondary">
                {ownerNotice}
              </p>
            ) : null}
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
                        setAttachedOwner(owner);
                        setOwnerPassword(null);
                        setOwnerNotice(null);
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
          </div>
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

      <AdminModal
        open={ownerCreateOpen}
        stacked
        title="Create owner"
        onClose={() => {
          if (ownerCreating) return;
          setOwnerCreateOpen(false);
        }}
        className="max-w-lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOwnerCreateOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-owner-form"
              disabled={ownerCreating}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {ownerCreating ? "Creating…" : "Create and attach"}
            </button>
          </div>
        }
      >
        <form id="create-owner-form" onSubmit={createOwner} className="grid gap-3 sm:grid-cols-2">
          {ownerCreateError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
              {ownerCreateError}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Full name</span>
            <input
              required
              value={ownerDraft.full_name}
              onChange={(event) => setOwnerDraft({ ...ownerDraft, full_name: event.target.value })}
              className={fieldClass}
              placeholder="Owner name"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Email</span>
            <input
              required
              type="email"
              value={ownerDraft.email}
              onChange={(event) => setOwnerDraft({ ...ownerDraft, email: event.target.value })}
              className={fieldClass}
              placeholder="owner@example.com"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Phone</span>
            <input
              value={ownerDraft.phone}
              onChange={(event) => setOwnerDraft({ ...ownerDraft, phone: event.target.value })}
              className={fieldClass}
              placeholder="+251…"
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Role</span>
            <select
              required
              value={ownerDraft.role}
              onChange={(event) => setOwnerDraft({ ...ownerDraft, role: event.target.value })}
              className={fieldClass}
            >
              {ownerRoleGroups.length > 0 ? (
                ownerRoleGroups.map(([group, options]) => (
                  <optgroup key={group} label={group}>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))
              ) : (
                <option value="administrator">Administrator</option>
              )}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">City</span>
            <input
              value={ownerDraft.city}
              onChange={(event) => setOwnerDraft({ ...ownerDraft, city: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-text-secondary">Country</span>
            <input
              value={ownerDraft.country}
              onChange={(event) => setOwnerDraft({ ...ownerDraft, country: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">Password</span>
            <div className="flex gap-2">
              <input
                required
                value={ownerDraft.password}
                onChange={(event) => setOwnerDraft({ ...ownerDraft, password: event.target.value })}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() =>
                  setOwnerDraft({ ...ownerDraft, password: generateStadiumManagerPassword() })
                }
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              >
                Generate
              </button>
            </div>
          </label>
        </form>
      </AdminModal>
    </>
  );
}
