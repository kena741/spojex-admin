"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Search, X } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch, deleteAdmin, patchAdmin, postAdmin, uploadAdmin } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { cn, formatDate } from "@/lib/utils";

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
};

type MemberRow = {
  id: string;
  name: string;
  phone: string;
  plan_id: string | null;
  plan_name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: "active" | "expired" | string;
  user_id: string | null;
  user_name: string;
  gym_id: string | null;
  gym_name: string;
  note: string;
  screenshot_url: string;
};

type UserHit = {
  id: string;
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
};

type GymHit = {
  id: string;
  name?: string | null;
};

const fieldClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[13px] font-medium text-text-secondary">{children}</label>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-hint">{children}</p>
  );
}

export default function AppMembershipsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [actionError, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [memberStatus, setMemberStatus] = useState("active");
  const [note, setNote] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userHits, setUserHits] = useState<UserHit[]>([]);
  const [gymId, setGymId] = useState<string | null>(null);
  const [gymLabel, setGymLabel] = useState("");
  const [gymQuery, setGymQuery] = useState("");
  const [gymHits, setGymHits] = useState<GymHit[]>([]);
  const userSeq = useRef(0);
  const gymSeq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: plansData } = useAdminQuery<{ data?: PlanRow[] }>({
    key: adminCacheKey(["app-membership-plans"]),
    fetcher: async () => {
      const res = await adminFetch("/api/admin/app-membership-plans");
      const payload = (await res.json()) as { data?: PlanRow[]; error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to load plans");
      return payload;
    },
  });

  const plans = useMemo(
    () => (plansData?.data ?? []).filter((p) => p.is_active !== false),
    [plansData],
  );
  const planOptions = useMemo(
    () => plans.map((p) => ({ value: p.id, label: p.name })),
    [plans],
  );
  const statusOptions = useMemo(
    () => [
      { value: "active", label: "Active" },
      { value: "expired", label: "Expired" },
    ],
    [],
  );

  const {
    data,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<{ data?: MemberRow[]; total?: number; error?: string }>({
    key: adminCacheKey(["app-members", q, status]),
    fetcher: async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status !== "all") params.set("status", status);
      const res = await adminFetch(`/api/admin/app-members?${params}`);
      const payload = (await res.json()) as {
        data?: MemberRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load members");
      return payload;
    },
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? rows.length;
  const error = actionError ?? loadError;
  const activeCount = useMemo(
    () => rows.filter((r) => r.status === "active").length,
    [rows],
  );

  useEffect(() => {
    if (!open) return;
    const raw = userQuery.trim();
    if (raw.length < 2 || userId) {
      setUserHits([]);
      return;
    }
    const seq = ++userSeq.current;
    const t = window.setTimeout(() => {
      void adminFetch(`/api/admin/users?q=${encodeURIComponent(raw)}&limit=8`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as { data?: UserHit[] };
          if (seq !== userSeq.current) return;
          setUserHits(json.data ?? []);
        })
        .catch(() => {
          if (seq === userSeq.current) setUserHits([]);
        });
    }, 280);
    return () => window.clearTimeout(t);
  }, [open, userQuery, userId]);

  useEffect(() => {
    if (!open) return;
    const raw = gymQuery.trim();
    if (raw.length < 2 || gymId) {
      setGymHits([]);
      return;
    }
    const seq = ++gymSeq.current;
    const t = window.setTimeout(() => {
      void adminFetch(`/api/admin/gyms?q=${encodeURIComponent(raw)}&page_size=8`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            data?: GymHit[];
            items?: GymHit[];
          };
          if (seq !== gymSeq.current) return;
          setGymHits(json.data ?? json.items ?? []);
        })
        .catch(() => {
          if (seq === gymSeq.current) setGymHits([]);
        });
    }, 280);
    return () => window.clearTimeout(t);
  }, [open, gymQuery, gymId]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setPlanId(plans[0]?.id ?? "");
    setStartsOn(new Date().toISOString().slice(0, 10));
    setEndsOn("");
    setMemberStatus("active");
    setNote("");
    setScreenshot("");
    setUserId(null);
    setUserLabel("");
    setUserQuery("");
    setGymId(null);
    setGymLabel("");
    setGymQuery("");
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: MemberRow) => {
    setEditing(row);
    setName(row.name);
    setPhone(row.phone);
    setPlanId(row.plan_id ?? "");
    setStartsOn(row.starts_on?.slice(0, 10) ?? "");
    setEndsOn(row.ends_on?.slice(0, 10) ?? "");
    setMemberStatus(row.status === "expired" ? "expired" : "active");
    setNote(row.note || "");
    setScreenshot(row.screenshot_url || "");
    setUserId(row.user_id);
    setUserLabel(row.user_name || row.user_id || "");
    setUserQuery("");
    setGymId(row.gym_id);
    setGymLabel(row.gym_name || row.gym_id || "");
    setGymQuery("");
    setError(null);
    setOpen(true);
  };

  const uploadScreenshot = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const payload = await uploadAdmin("/api/admin/app-members/upload", file);
      const url = (payload as { url?: string }).url || "";
      if (!url) throw new Error("Upload failed");
      setScreenshot(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim(),
        plan_id: planId || null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        status: memberStatus,
        user_id: userId,
        gym_id: gymId,
        note: note.trim(),
        screenshot_url: screenshot.trim(),
      };
      if (editing) await patchAdmin(`/api/admin/app-members/${editing.id}`, body);
      else await postAdmin("/api/admin/app-members", body);
      setOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: MemberRow) => {
    if (!window.confirm(`Delete member “${row.name}”?`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/app-members/${row.id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="App memberships"
        description={
          loading && !data
            ? "Loading…"
            : `${total} member${total === 1 ? "" : "s"}${rows.length ? ` · ${activeCount} active on this page` : ""}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            <button
              type="button"
              onClick={openCreate}
              className="h-9 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Add member
            </button>
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminFilterPanel>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-hint" />
            <input
              className={cn(fieldClass, "pl-9")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, gym…"
            />
          </div>
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      <AdminTableShell>
        {loading && !data ? (
          <AdminLoadingRow label="Loading members…" />
        ) : rows.length === 0 ? (
          <AdminEmpty
            title="No members yet"
            description="Register someone with name, phone, plan dates, and an optional payment screenshot."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-3 py-3 font-medium">Plan</th>
                  <th className="px-3 py-3 font-medium">Period</th>
                  <th className="px-3 py-3 font-medium">Linked</th>
                  <th className="px-3 py-3 font-medium">Proof</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-muted/25">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">
                          {initials(row.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text-primary">{row.name}</p>
                          <p className="truncate text-xs text-text-secondary">{row.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.plan_name ? (
                        <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-text-primary">
                          {row.plan_name}
                        </span>
                      ) : (
                        <span className="text-text-hint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-text-secondary">
                      <div>{row.starts_on ? formatDate(row.starts_on) : "—"}</div>
                      <div className="text-text-hint">
                        to {row.ends_on ? formatDate(row.ends_on) : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-text-secondary">
                      {row.user_name || row.gym_name ? (
                        <div className="space-y-0.5">
                          {row.user_name ? <p>User · {row.user_name}</p> : null}
                          {row.gym_name ? <p>Gym · {row.gym_name}</p> : null}
                        </div>
                      ) : (
                        <span className="text-text-hint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.screenshot_url ? (
                        <a
                          href={row.screenshot_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-11 w-14 overflow-hidden rounded-md border border-border bg-muted transition hover:opacity-90"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={row.screenshot_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-text-hint">None</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>
                        {row.status === "active" ? "Active" : "Expired"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="mr-2 text-xs font-medium text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(row)}
                        className="text-xs font-medium text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      <AdminModal
        open={open}
        title={editing ? `Edit ${editing.name}` : "Add member"}
        onClose={() => setOpen(false)}
        className="max-w-xl"
        footer={
          <AdminModalFooter
            onCancel={() => setOpen(false)}
            onSave={() => void save()}
            saving={saving || uploading}
            saveLabel={editing ? "Save changes" : "Add member"}
          />
        }
      >
        <div className="grid gap-5">
          <section className="grid gap-3">
            <SectionTitle>Member</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Full name</FieldLabel>
                <input
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Abebe Kebede"
                />
              </div>
              <div>
                <FieldLabel>Phone</FieldLabel>
                <input
                  className={fieldClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09…"
                />
              </div>
            </div>
          </section>

          <section className="grid gap-3">
            <SectionTitle>Membership</SectionTitle>
            <div>
              <FieldLabel>Plan</FieldLabel>
              <SearchableSelect
                value={planId}
                onChange={setPlanId}
                options={planOptions}
                placeholder="No plan"
                searchPlaceholder="Search plans…"
                allowClear
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel>Start</FieldLabel>
                <input
                  type="date"
                  className={fieldClass}
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>End</FieldLabel>
                <input
                  type="date"
                  className={fieldClass}
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                <SearchableSelect
                  value={memberStatus}
                  onChange={setMemberStatus}
                  options={statusOptions}
                  placeholder="Status"
                  searchPlaceholder="Search…"
                  allowClear={false}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-3">
            <SectionTitle>Links (optional)</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>App user</FieldLabel>
                {userId ? (
                  <div className="flex h-10 items-center justify-between rounded-md border border-border bg-muted/30 px-3 text-sm">
                    <span className="truncate">{userLabel || userId}</span>
                    <button
                      type="button"
                      aria-label="Clear user"
                      className="rounded p-0.5 text-text-hint hover:bg-muted hover:text-text-primary"
                      onClick={() => {
                        setUserId(null);
                        setUserLabel("");
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className={fieldClass}
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Search by name or phone"
                    />
                    {userHits.length > 0 ? (
                      <ul className="mt-1 max-h-32 overflow-auto rounded-md border border-border bg-card text-sm shadow-sm">
                        {userHits.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left transition hover:bg-muted/50"
                              onClick={() => {
                                setUserId(u.id);
                                setUserLabel(
                                  u.display_name || u.username || u.phone || u.email || u.id,
                                );
                                setUserQuery("");
                                setUserHits([]);
                              }}
                            >
                              <span className="font-medium">
                                {u.display_name || u.username || "User"}
                              </span>{" "}
                              <span className="text-text-secondary">
                                {u.phone || u.email || ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
              <div>
                <FieldLabel>Gym</FieldLabel>
                {gymId ? (
                  <div className="flex h-10 items-center justify-between rounded-md border border-border bg-muted/30 px-3 text-sm">
                    <span className="truncate">{gymLabel || gymId}</span>
                    <button
                      type="button"
                      aria-label="Clear gym"
                      className="rounded p-0.5 text-text-hint hover:bg-muted hover:text-text-primary"
                      onClick={() => {
                        setGymId(null);
                        setGymLabel("");
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className={fieldClass}
                      value={gymQuery}
                      onChange={(e) => setGymQuery(e.target.value)}
                      placeholder="Search gym by name"
                    />
                    {gymHits.length > 0 ? (
                      <ul className="mt-1 max-h-32 overflow-auto rounded-md border border-border bg-card text-sm shadow-sm">
                        {gymHits.map((g) => (
                          <li key={g.id}>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left transition hover:bg-muted/50"
                              onClick={() => {
                                setGymId(g.id);
                                setGymLabel(g.name || g.id);
                                setGymQuery("");
                                setGymHits([]);
                              }}
                            >
                              {g.name || g.id}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-3">
            <SectionTitle>Proof & notes</SectionTitle>
            <div>
              <FieldLabel>Screenshot</FieldLabel>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadScreenshot(file);
                  e.target.value = "";
                }}
              />
              {screenshot ? (
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-3">
                  <a
                    href={screenshot}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-20 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={screenshot} alt="" className="h-full w-full object-cover" />
                  </a>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="truncate text-xs text-text-secondary">{screenshot}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                        className="h-8 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {uploading ? "Uploading…" : "Replace"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setScreenshot("")}
                        className="h-8 rounded-md px-2.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-muted/15 text-sm text-text-secondary transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                >
                  <ImagePlus className="h-5 w-5 text-text-hint" />
                  <span>{uploading ? "Uploading…" : "Upload screenshot"}</span>
                  <span className="text-[11px] text-text-hint">JPG, PNG, WebP · max 5 MB</span>
                </button>
              )}
            </div>
            <div>
              <FieldLabel>Note</FieldLabel>
              <textarea
                className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
              />
            </div>
          </section>
        </div>
      </AdminModal>
    </div>
  );
}
