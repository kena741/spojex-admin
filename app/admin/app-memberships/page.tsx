"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { StatusBadge } from "@/components/status-badge";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch, deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { formatDate } from "@/lib/utils";

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

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export default function AppMembershipsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [actionError, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [memberStatus, setMemberStatus] = useState("active");
  const [note, setNote] = useState("");
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

  const {
    data: plansData,
  } = useAdminQuery<{ data?: PlanRow[] }>({
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
  const error = actionError ?? loadError;

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

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPhone("");
    setPlanId(plans[0]?.id ?? "");
    setStartsOn(new Date().toISOString().slice(0, 10));
    setEndsOn("");
    setMemberStatus("active");
    setNote("");
    setUserId(null);
    setUserLabel("");
    setUserQuery("");
    setGymId(null);
    setGymLabel("");
    setGymQuery("");
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
    setUserId(row.user_id);
    setUserLabel(row.user_name || row.user_id || "");
    setUserQuery("");
    setGymId(row.gym_id);
    setGymLabel(row.gym_name || row.gym_id || "");
    setGymQuery("");
    setError(null);
    setOpen(true);
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
    <div className="space-y-4">
      <AdminPageHeader
        title="App memberships"
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
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Add member
            </button>
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminFilterPanel>
        <input
          className={fieldClass}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, gym…"
        />
        <AdminSelect value={status} onChange={setStatus}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
        </AdminSelect>
      </AdminFilterPanel>

      <AdminTableShell>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Dates</th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={6} className="px-3 py-6">
                  <AdminLoadingRow label="Loading members…" />
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6">
                  <AdminEmpty
                    title="No members"
                    description="Register someone with name, phone, and a membership plan."
                  />
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/70">
                <td className="px-3 py-3">
                  <p className="font-medium text-text-primary">{row.name}</p>
                  <p className="text-xs text-text-secondary">{row.phone}</p>
                </td>
                <td className="px-3 py-3 text-text-secondary">
                  {row.plan_name || "—"}
                </td>
                <td className="px-3 py-3 text-xs text-text-secondary">
                  {row.starts_on ? formatDate(row.starts_on) : "—"}
                  {" → "}
                  {row.ends_on ? formatDate(row.ends_on) : "—"}
                </td>
                <td className="px-3 py-3 text-xs text-text-secondary">
                  {row.user_name ? <p>User: {row.user_name}</p> : null}
                  {row.gym_name ? <p>Gym: {row.gym_name}</p> : null}
                  {!row.user_name && !row.gym_name ? "—" : null}
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
      </AdminTableShell>

      <AdminModal
        open={open}
        title={editing ? `Edit “${editing.name}”` : "Add member"}
        onClose={() => setOpen(false)}
        className="max-w-lg"
        footer={
          <AdminModalFooter
            onCancel={() => setOpen(false)}
            onSave={() => void save()}
            saving={saving}
            saveLabel="Save"
          />
        }
      >
        <div className="grid gap-3">
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
          <input
            className={fieldClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
          />
          <AdminSelect value={planId} onChange={setPlanId}>
            <option value="">No plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </AdminSelect>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-text-secondary">
              Start
              <input
                type="date"
                className={fieldClass}
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-text-secondary">
              End
              <input
                type="date"
                className={fieldClass}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </label>
          </div>
          <AdminSelect value={memberStatus} onChange={setMemberStatus}>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </AdminSelect>

          <div className="grid gap-1">
            <p className="text-xs text-text-secondary">Link app user (optional)</p>
            {userId ? (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>{userLabel || userId}</span>
                <button
                  type="button"
                  className="text-xs text-red-700"
                  onClick={() => {
                    setUserId(null);
                    setUserLabel("");
                  }}
                >
                  Clear
                </button>
              </div>
            ) : (
              <>
                <input
                  className={fieldClass}
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search user by name / phone"
                />
                {userHits.length > 0 ? (
                  <ul className="max-h-36 overflow-auto rounded-lg border border-border bg-card text-sm">
                    {userHits.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-muted/40"
                          onClick={() => {
                            setUserId(u.id);
                            setUserLabel(
                              u.display_name || u.username || u.phone || u.email || u.id,
                            );
                            setUserQuery("");
                            setUserHits([]);
                          }}
                        >
                          {u.display_name || u.username || "User"}{" "}
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

          <div className="grid gap-1">
            <p className="text-xs text-text-secondary">Link gym (optional)</p>
            {gymId ? (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>{gymLabel || gymId}</span>
                <button
                  type="button"
                  className="text-xs text-red-700"
                  onClick={() => {
                    setGymId(null);
                    setGymLabel("");
                  }}
                >
                  Clear
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
                  <ul className="max-h-36 overflow-auto rounded-lg border border-border bg-card text-sm">
                    {gymHits.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-muted/40"
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

          <textarea
            className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
          />
        </div>
      </AdminModal>
    </div>
  );
}
