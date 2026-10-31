"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminModal,
  AdminSearchInput,
  AdminSelect,
} from "@/components/admin-layout";
import { StatusBadge, verifiedTone } from "@/components/status-badge";
import { organizationTypeLabel, organizationTypes } from "@/lib/catalog";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { loadOrgLiveGiftTotals } from "@/lib/coin-wallets";
import { adminFetch, deleteAdmin, postAdminResponse, useIdentityCatalog } from "@/lib/hooks";
import { generateStadiumManagerPassword } from "@/lib/stadiums";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import type { OrganizationRow, UserRow } from "@/lib/types";
import { formatCoins, formatDate, locationLabel } from "@/lib/utils";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type OwnerOption = Pick<UserRow, "id" | "display_name" | "email" | "role" | "city">;

type OrganizationsSummary = {
  total: number;
  verified: number;
  unverified: number;
  by_type: Record<string, number>;
  missing_owner: number;
  trashed?: number;
};

type OrganizationsListData = {
  rows: OrganizationRow[];
  total: number;
  memberCounts: Record<string, number>;
  liveGiftTotals: Record<string, number>;
  summary: OrganizationsSummary | null;
};

const createTypeOptions = [
  ...organizationTypes.filter((item) => item.id === "club" || item.id === "academy"),
  ...organizationTypes.filter((item) => item.id !== "club" && item.id !== "academy"),
];

/* ─── Main Page ─── */

export default function OrganizationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const canWrite = can("organizations:write");
  const canVerify = can("organizations:verify");
  const [actionError, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("q") || "");
  const [debouncedCity, setDebouncedCity] = useState(searchParams.get("city") || "");
  const [debouncedCountry, setDebouncedCountry] = useState(searchParams.get("country") || "");
  const [type, setType] = useState(searchParams.get("type") || "all");
  const [verified, setVerified] = useState(searchParams.get("verified") || "all");
  const [city, setCity] = useState(searchParams.get("city") || "");
  const [country, setCountry] = useState(searchParams.get("country") || "");
  const [trash, setTrash] = useState(searchParams.get("trash") === "yes" ? "yes" : "");
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get("page") || 1) || 1));
  const pageSize = 40;
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingPlatform, setCreatingPlatform] = useState(false);
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() => crypto.randomUUID());
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
    website: "",
    description: "",
    owner_user_id: "",
    owner_email: "",
    verified: false,
    verification_reason: "",
  });

  const {
    data: listData,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<OrganizationsListData>({
    key: adminCacheKey([
      "organizations",
      "list",
      page,
      debouncedQuery.trim(),
      type,
      verified,
      debouncedCity.trim(),
      debouncedCountry.trim(),
      trash,
    ]),
    fetcher: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        sort: "updated_at",
        order: "desc",
      });
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (type !== "all") params.set("type", type);
      if (verified !== "all") params.set("verified", verified);
      if (debouncedCity.trim()) params.set("city", debouncedCity.trim());
      if (debouncedCountry.trim()) params.set("country", debouncedCountry.trim());
      if (trash === "yes") params.set("trash", "yes");
      const response = await adminFetch(`/api/admin/organizations?${params}`);
      const payload = (await response.json()) as {
        data?: OrganizationRow[];
        total?: number;
        member_counts?: Record<string, number>;
        live_gift_totals?: Record<string, number>;
        summary?: OrganizationsSummary;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to load organizations");
      const orgs = payload.data ?? [];
      return {
        rows: orgs,
        total: payload.total ?? orgs.length,
        memberCounts: payload.member_counts ?? {},
        liveGiftTotals:
          payload.live_gift_totals ?? (await loadOrgLiveGiftTotals(orgs.map((o) => o.id))),
        summary: payload.summary ?? null,
      };
    },
  });

  const rows = useMemo(() => listData?.rows ?? [], [listData]);
  const total = listData?.total ?? 0;
  const memberCounts = listData?.memberCounts ?? {};
  const liveGiftTotals = listData?.liveGiftTotals ?? {};
  const listSummary = listData?.summary ?? null;
  const error = actionError ?? loadError;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setDebouncedCity(city);
      setDebouncedCountry(country);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, city, country]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (type !== "all") params.set("type", type);
    if (verified !== "all") params.set("verified", verified);
    if (city.trim()) params.set("city", city.trim());
    if (country.trim()) params.set("country", country.trim());
    if (trash === "yes") params.set("trash", "yes");
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedQuery, type, verified, city, country, trash, page, pathname, router]);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
      website: "",
      description: "",
      owner_user_id: "",
      owner_email: "",
      verified: false,
      verification_reason: "",
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
      if (form.verified && canVerify && !form.verification_reason.trim()) {
        throw new Error("Verification reason is required when marking verified.");
      }
      const payload = await postAdminResponse("/api/admin/organizations", {
        name: form.name,
        organization_type: form.organization_type,
        city: form.city,
        country: form.country,
        website: form.website || undefined,
        description: form.description,
        owner_user_id: form.owner_user_id || undefined,
        owner_email: form.owner_user_id ? undefined : ownerEmail,
        verified: Boolean(form.verified && canVerify),
        verification_reason:
          form.verified && canVerify ? form.verification_reason.trim() : undefined,
        idempotency_key: createIdempotencyKey,
      });
      const created = payload.data as OrganizationRow | undefined;
      setCreateOpen(false);
      resetCreateForm();
      setCreateIdempotencyKey(crypto.randomUUID());
      if (created?.id) {
        router.push(`/admin/organizations/${created.id}`);
        return;
      }
      await refresh();
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
      await refresh();
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
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const trashOrg = async (row: OrganizationRow) => {
    if (!canWrite || row.is_platform) return;
    if (!window.confirm(`Move “${row.name || "organization"}” to Trash? Linked content is preserved.`)) {
      return;
    }
    setRowBusyId(row.id);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/organizations/${row.id}`);
      invalidateAdminCache(adminCacheKey(["organizations"]));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move to Trash failed");
    } finally {
      setRowBusyId(null);
    }
  };

  const restoreOrgRow = async (row: OrganizationRow) => {
    if (!canWrite || row.is_platform) return;
    if (!window.confirm(`Restore “${row.name || "organization"}” from Trash?`)) return;
    setRowBusyId(row.id);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${row.id}/restore`, { method: "POST" });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Restore failed");
      invalidateAdminCache(adminCacheKey(["organizations"]));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Organizations"
        description={`${total} total · page ${page} of ${totalPages}`}
        stackOnSmall
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            {canWrite ? (
              <>
              {!loading ? (
                <button
                  type="button"
                  disabled={creatingPlatform}
                  onClick={() => void createSpojexPlatform()}
                  className="h-9 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-60"
                >
                  {creatingPlatform
                    ? "Working…"
                    : platformOrg
                      ? "Open Spojex org"
                      : "Create Spojex org"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => openCreate()}
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                Add organization
              </button>
              </>
            ) : null}
          </div>
        }
      />

      {listSummary ? (
        <div className="mb-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total", value: listSummary.total },
              { label: "Verified", value: listSummary.verified },
              { label: "Pending verification", value: listSummary.unverified },
              { label: "Trash", value: listSummary.trashed ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <p className="text-xs text-text-secondary">{item.label}</p>
                <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>
          {listSummary.by_type && Object.keys(listSummary.by_type).length > 0 ? (
            <p className="text-xs text-text-secondary">
              By type:{" "}
              {Object.entries(listSummary.by_type)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([t, n]) => `${organizationTypeLabel(t)} ${n}`)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <AdminFilterPanel>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTrash("");
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              trash !== "yes"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card hover:bg-muted"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => {
              setTrash("yes");
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              trash === "yes"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card hover:bg-muted"
            }`}
          >
            Trash{listSummary?.trashed != null ? ` (${listSummary.trashed})` : ""}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2">
            <AdminSearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Search name, public ID, city"
            />
          </div>
          <AdminSelect
            value={type}
            onChange={(value) => {
              setType(value);
              setPage(1);
            }}
          >
            <option value="all">All types</option>
            {organizationTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={verified}
            onChange={(value) => {
              setVerified(value);
              setPage(1);
            }}
          >
            <option value="all">All verification</option>
            <option value="yes">Verified</option>
            <option value="no">Unverified / pending</option>
          </AdminSelect>
          <input
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPage(1);
            }}
            placeholder="City"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
          <input
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setPage(1);
            }}
            placeholder="Country"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
        </div>
      </AdminFilterPanel>

      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {loading ? (
            <AdminLoadingRow label="Loading organizations…" compact className="py-10" />
          ) : rows.length === 0 ? (
            <AdminEmpty
              title={trash === "yes" ? "Trash is empty" : "No organizations"}
              description={
                trash === "yes"
                  ? "Soft-deleted organizations appear here with Restore and permanent delete."
                  : canWrite
                    ? "Add an organization, or wait for individuals to create them in the app."
                    : "Organizations created in admin or the superapp appear here."
              }
            />
          ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const liveGifts = liveGiftTotals[row.id] ?? row.live_gifts_received ?? 0;
              const members = memberCounts[row.id] ?? row.active_people_count ?? 1;
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
                        {row.deleted_at ? (
                          <StatusBadge tone="danger">Trash</StatusBadge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-text-secondary">
                        {trash === "yes"
                          ? [
                              row.deleted_at ? `Deleted ${formatDate(row.deleted_at)}` : null,
                              row.deleted_by_user?.display_name
                                ? `by ${row.deleted_by_user.display_name}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : locationLabel(row.city, row.country)}
                      </p>
                      {trash !== "yes" && row.users?.id ? (
                        <button
                          type="button"
                          className="mt-0.5 truncate text-left text-xs text-primary hover:underline"
                          title="Open owner user"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(`/admin/people/${row.users!.id}`);
                          }}
                        >
                          Owner (user): {row.users.display_name}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Copy public ID"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void navigator.clipboard.writeText(row.public_id);
                        }}
                        className="mt-0.5 truncate font-mono text-[10px] text-text-hint hover:text-text-secondary"
                      >
                        {row.public_id}
                      </button>
                    </div>
                    <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      <StatusBadge tone={verifiedTone(row.verified)}>
                        {row.verified ? "Verified" : "Unverified"}
                      </StatusBadge>
                      <span className="text-[10px] text-text-hint">{members} people</span>
                    </div>
                    <div className="hidden w-28 shrink-0 text-right text-xs text-text-secondary lg:block">
                      <span className="font-medium tabular-nums text-foreground">
                        {liveGifts > 0 ? formatCoins(liveGifts) : "-"}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-text-hint">
                        Live gifts received
                      </span>
                    </div>
                    <div className="hidden w-28 shrink-0 text-right text-[11px] text-text-hint xl:block">
                      <span className="block">Updated</span>
                      {formatDate(row.updated_at || row.created_at)}
                    </div>
                    {canWrite && !row.is_platform ? (
                      <button
                        type="button"
                        disabled={rowBusyId === row.id}
                        className={
                          trash === "yes"
                            ? "shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                            : "shrink-0 rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (trash === "yes") void restoreOrgRow(row);
                          else void trashOrg(row);
                        }}
                      >
                        {rowBusyId === row.id
                          ? "…"
                          : trash === "yes"
                            ? "Restore"
                            : "Delete"}
                      </button>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          )}
      </div>

      {!loading && totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-text-secondary">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
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
            <span className="text-text-secondary">Website</span>
            <input
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
              className={fieldClass}
              placeholder="https://"
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
          {canVerify ? (
            <div className="grid gap-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.verified}
                  onChange={(event) => setForm({ ...form, verified: event.target.checked })}
                />
                <span className="text-text-secondary">Mark as verified</span>
              </label>
              {form.verified ? (
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Verification reason (required)</span>
                  <input
                    required
                    value={form.verification_reason}
                    onChange={(event) =>
                      setForm({ ...form, verification_reason: event.target.value })
                    }
                    className={fieldClass}
                    placeholder="Evidence / reviewer notes"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
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
