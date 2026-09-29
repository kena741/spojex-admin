"use client";

import { useEffect, useMemo, useState } from "react";
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
import { StatusBadge } from "@/components/status-badge";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { AdminRoleRow, AdminRow } from "@/lib/admin-permissions";
import { formatDate, formatStatusLabel } from "@/lib/utils";

const emptyForm = {
  email: "",
  password: "",
  full_name: "",
  role: "viewer",
  is_active: true,
};

export default function AdminsPage() {
  const { can, staff } = useAdminPermissions();
  const canWrite = can("admins:write");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await postAdmin("/api/admin/admins", form);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (id: string, role: string) => {
    try {
      await patchAdmin(`/api/admin/admins/${id}`, { role });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
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
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <form
          onSubmit={create}
          className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-2 lg:grid-cols-5"
        >
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
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Password (optional)"
            className="h-10 rounded-lg border border-border px-3 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add admin"}
          </button>
        </form>
      ) : null}
      <AdminFilterPanel>
        <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, email, role" />
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading admins…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No admins" description="The first successful login becomes Super Admin." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Admin</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Added</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold" /> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.full_name || "Unnamed"}</p>
                      <p className="text-xs text-text-secondary">{row.email || row.user_id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <select
                          value={row.role}
                          onChange={(event) => updateRole(row.id, event.target.value)}
                          className="h-9 rounded-lg border border-border px-2 text-sm"
                        >
                          {(roles.length ? roles : [{ slug: row.role, name: formatStatusLabel(row.role) }]).map(
                            (role) => (
                              <option key={role.slug} value={role.slug}>
                                {role.name}
                              </option>
                            ),
                          )}
                        </select>
                      ) : (
                        formatStatusLabel(row.role)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                        {row.is_active ? "Active" : "Disabled"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleActive(row)}
                          className="mr-3 text-sm text-primary hover:underline"
                        >
                          {row.is_active ? "Disable" : "Enable"}
                        </button>
                        {staff?.id !== row.id ? (
                          <button
                            type="button"
                            onClick={() => remove(row.id)}
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
    </>
  );
}
