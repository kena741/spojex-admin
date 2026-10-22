"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { AdminRoleRow, AdminRow } from "@/lib/admin-permissions";
import { formatDate, formatStatusLabel } from "@/lib/utils";

const emptyForm = {
  email: "",
  full_name: "",
  role: "viewer",
};

export default function AdminsPage() {
  const { can, staff } = useAdminPermissions();
  const canWrite = can("admins:write") || can("admins:invite");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [roleEdit, setRoleEdit] = useState<AdminRow | null>(null);
  const [nextRole, setNextRole] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);

  const load = async () => {
    const [adminsRes, rolesRes] = await Promise.all([
      fetch("/api/admin/admins"),
      fetch("/api/admin/roles"),
    ]);
    const adminsPayload = (await adminsRes.json()) as { data?: AdminRow[]; error?: string };
    const rolesPayload = (await rolesRes.json()) as { data?: AdminRoleRow[]; error?: string };
    if (!adminsRes.ok) throw new Error(adminsPayload.error || "Failed to load admins");
    setRows(adminsPayload.data ?? []);
    if (rolesRes.ok) setRoles(rolesPayload.data ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.full_name, row.email, row.role].some((value) => String(value ?? "").toLowerCase().includes(q)),
    );
  }, [query, rows]);

  const create = async () => {
    setSaving(true);
    setError(null);
    setInviteToken(null);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mode: "invite" }),
      });
      const payload = (await res.json()) as {
        data?: { token?: string; email?: string; expires_at?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Invite failed");
      if (payload.data?.token) setInviteToken(payload.data.token);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSaving(false);
    }
  };

  const saveRoleChange = async () => {
    if (!roleEdit || !nextRole || nextRole === roleEdit.role) {
      setRoleEdit(null);
      return;
    }
    setRoleSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/admins/${roleEdit.id}`, { role: nextRole });
      setRoleEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setRoleSaving(false);
    }
  };

  const toggleActive = async (row: AdminRow) => {
    try {
      await patchAdmin(`/api/admin/admins/${row.id}`, { is_active: !row.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAdmin(`/api/admin/admins/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Admins"
        description="Staff who can sign in to SpoJex Admin"
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => {
                setInviteToken(null);
                setForm(emptyForm);
                setCreateOpen(true);
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Invite staff
            </button>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminFilterPanel>
        <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, email, role" />
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading admins…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No admins"
            description="Invite staff with an explicit role. Access is invitation-based."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Admin</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Staff / user IDs</th>
                  <th className="px-4 py-3 font-semibold">Added</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold" /> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.full_name || "Unnamed"}</p>
                      <p className="text-xs text-text-secondary">{row.email || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{formatStatusLabel(row.role)}</span>
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => {
                              setNextRole(row.role);
                              setRoleEdit(row);
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            Change
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                        {row.is_active ? "Active" : "Suspended"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-text-hint">
                      <p title="Staff record id">{row.id}</p>
                      <p title="Linked users.id">{row.user_id}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const ok = window.confirm(
                              row.is_active
                                ? "Suspend this admin? Active sessions will be revoked."
                                : "Re-enable this admin? Previous revoked sessions stay invalid.",
                            );
                            if (ok) void toggleActive(row);
                          }}
                          className="mr-3 text-sm text-primary hover:underline"
                        >
                          {row.is_active ? "Suspend" : "Re-enable"}
                        </button>
                        {staff?.id !== row.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              const ok = window.confirm(
                                "Remove this staff membership? Audit history is retained.",
                              );
                              if (ok) void remove(row.id);
                            }}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      <AdminModal
        open={Boolean(roleEdit)}
        title="Change role"
        onClose={() => {
          if (roleSaving) return;
          setRoleEdit(null);
        }}
        footer={
          <AdminModalFooter
            onCancel={() => setRoleEdit(null)}
            onSave={() => void saveRoleChange()}
            saving={roleSaving}
            saveLabel="Save role"
          />
        }
      >
        {roleEdit ? (
          <div className="space-y-3 text-sm">
            <p>
              Changing access for <strong>{roleEdit.full_name || roleEdit.email}</strong>
            </p>
            <p className="text-xs text-text-secondary">
              Current: {formatStatusLabel(roleEdit.role)} → New role below. Save is required; the
              dropdown alone does not apply changes.
            </p>
            <AdminSelect value={nextRole} onChange={setNextRole}>
              {(roles.length
                ? roles
                : [{ slug: roleEdit.role, name: formatStatusLabel(roleEdit.role) }]
              ).map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.name}
                </option>
              ))}
            </AdminSelect>
            {nextRole && nextRole !== roleEdit.role ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Impact: effective permissions change from{" "}
                <strong>{formatStatusLabel(roleEdit.role)}</strong> to{" "}
                <strong>{formatStatusLabel(nextRole)}</strong>. Financial dual-control rules still
                apply regardless of Super Admin.
              </p>
            ) : null}
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        open={createOpen}
        title="Invite staff"
        onClose={() => {
          if (saving) return;
          setCreateOpen(false);
          setInviteToken(null);
        }}
        sheet
        footer={
          inviteToken ? (
            <AdminModalFooter
              onCancel={() => {
                setCreateOpen(false);
                setInviteToken(null);
              }}
              onSave={() => {
                setCreateOpen(false);
                setInviteToken(null);
              }}
              saving={false}
              saveLabel="Done"
            />
          ) : (
            <AdminModalFooter
              onCancel={() => setCreateOpen(false)}
              onSave={() => void create()}
              saving={saving}
              saveLabel="Send invitation"
            />
          )
        }
      >
        {inviteToken ? (
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">
              Single-use invitation created. Share this link once — it expires in 72 hours and cannot be reused.
            </p>
            <code className="block break-all rounded-lg border border-border bg-muted/50 p-3 text-xs">
              {typeof window !== "undefined"
                ? `${window.location.origin}/login?invite=${inviteToken}`
                : inviteToken}
            </code>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
            className="grid gap-3"
          >
            <p className="text-xs text-text-secondary">
              Role is required. Super Admin is never the default.
            </p>
            <input
              value={form.full_name}
              onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
              placeholder="Full name"
              className="h-10 rounded-lg border border-border px-3 text-sm"
              required
            />
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
              className="h-10 rounded-lg border border-border px-3 text-sm"
              required
            />
            <AdminSelect
              value={form.role}
              onChange={(value) => setForm((current) => ({ ...current, role: value }))}
            >
              {(roles.length ? roles : [{ slug: "viewer", name: "Viewer" }]).map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.name}
                </option>
              ))}
            </AdminSelect>
          </form>
        )}
      </AdminModal>
    </>
  );
}
