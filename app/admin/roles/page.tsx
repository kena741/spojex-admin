"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminTableShell,
} from "@/components/admin-layout";
import { deleteAdmin, postAdmin } from "@/lib/hooks";
import {
  groupPermissionsByCategory,
  PERMISSION_DEFINITIONS,
  type AdminRoleRow,
} from "@/lib/admin-permissions";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

export default function RolesPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("roles:write");
  const [rows, setRows] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const grouped = useMemo(() => groupPermissionsByCategory(PERMISSION_DEFINITIONS), []);

  const load = async () => {
    const response = await fetch("/api/admin/roles");
    const payload = (await response.json()) as { data?: AdminRoleRow[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to load roles");
    setRows(payload.data ?? []);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const togglePermission = (key: string) => {
    setPermissions((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await postAdmin("/api/admin/roles", { name, slug, description, permissions });
      setName("");
      setSlug("");
      setDescription("");
      setPermissions([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const savePermissions = async (role: AdminRoleRow, next: string[]) => {
    try {
      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: role.id, permissions: next }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Update failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAdmin(`/api/admin/roles?id=${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader title="Roles" description="Permission sets assigned to admin staff" />
      {error ? <AdminErrorAlert message={error} /> : null}

      {canWrite ? (
        <form onSubmit={create} className="mb-6 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slug) setSlug(event.target.value.toLowerCase().replace(/\s+/g, "_"));
              }}
              placeholder="Role name"
              className="h-10 rounded-lg border border-border px-3 text-sm"
              required
            />
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="slug"
              className="h-10 rounded-lg border border-border px-3 text-sm"
              required
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
              className="h-10 rounded-lg border border-border px-3 text-sm"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(grouped).map(([group, items]) => (
              <fieldset key={group} className="rounded-lg border border-border p-3">
                <legend className="px-1 text-xs font-semibold uppercase text-text-hint">{group}</legend>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={permissions.includes(item.key)}
                        onChange={() => togglePermission(item.key)}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Create role
          </button>
        </form>
      ) : null}

      {loading ? <AdminLoadingRow label="Loading roles…" /> : null}
      <AdminTableShell>
        {rows.length === 0 && !loading ? (
          <AdminEmpty title="No roles" description="Run 016_admins.sql to seed Super Admin, Operations, Identity, Marketplace, Support, and Viewer." />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((role) => (
              <div key={role.id} className="p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-sm font-semibold">{role.name}</h2>
                    <p className="text-xs text-text-secondary">
                      {role.slug} {role.is_system ? "· system" : ""}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{role.description}</p>
                  </div>
                  {canWrite && !role.is_system ? (
                    <button
                      type="button"
                      onClick={() => remove(role.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-text-hint">
                  {role.permissions.includes("*")
                    ? "All permissions"
                    : `${role.permissions.length} permissions`}
                </p>
                {canWrite && !role.permissions.includes("*") ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PERMISSION_DEFINITIONS.map((item) => {
                      const checked = role.permissions.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() =>
                            savePermissions(
                              role,
                              checked
                                ? role.permissions.filter((key) => key !== item.key)
                                : [...role.permissions, item.key],
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            checked
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-muted text-text-secondary"
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
