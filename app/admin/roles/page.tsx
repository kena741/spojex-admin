"use client";

import { useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminReloadButton,
  AdminTableShell,
} from "@/components/admin-layout";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { deleteAdmin, postAdmin } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useAdminUiState } from "@/lib/use-admin-ui-state";
import {
  groupPermissionsByCategory,
  PERMISSION_DEFINITIONS,
  SENSITIVE_PERMISSION_KEYS,
  type AdminRoleRow,
} from "@/lib/admin-permissions";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

function sensitiveCount(perms: string[]) {
  if (perms.includes("*")) return SENSITIVE_PERMISSION_KEYS.size;
  return perms.filter((p) => SENSITIVE_PERMISSION_KEYS.has(p)).length;
}

export default function RolesPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("roles:write");
  const [actionError, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useAdminUiState<string | null>("roles:selected", null);
  const grouped = useMemo(() => groupPermissionsByCategory(PERMISSION_DEFINITIONS), []);
  const {
    data,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<AdminRoleRow[]>({
    key: adminCacheKey(["roles", "list"]),
    fetcher: async () => {
      const response = await fetch("/api/admin/roles");
      const payload = (await response.json()) as { data?: AdminRoleRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to load roles");
      return payload.data ?? [];
    },
  });
  const rows = useMemo(() => data ?? [], [data]);
  const error = actionError || loadError;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

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
      await refresh();
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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAdmin(`/api/admin/roles?id=${id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Roles & permissions"
        description="System and custom roles. Custom roles do not silently receive newly introduced permissions."
        actions={
          <AdminReloadButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void refresh()}
          />
        }
      />
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

      <AdminTableShell>
        {loading && rows.length === 0 ? (
          <AdminLoadingRow label="Loading roles…" compact className="py-10" />
        ) : rows.length === 0 ? (
          <AdminEmpty title="No roles" description="Run 016_admins.sql to seed Super Admin, Operations, Identity, Marketplace, Support, and Viewer." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <ul className="divide-y divide-border">
              {rows.map((role) => {
                const active = selectedId === role.id;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(active ? null : role.id)}
                      className={`block w-full px-4 py-3 text-left hover:bg-muted/50 ${
                        active ? "bg-muted/80" : ""
                      }`}
                    >
                      <p className="text-sm font-semibold">{role.name}</p>
                      <p className="text-[11px] text-text-hint">
                        {role.is_system ? "System" : "Custom"}
                        {typeof role.staff_count === "number"
                          ? ` · ${role.staff_count} staff`
                          : ""}
                        {" · "}
                        {role.permissions.includes("*")
                          ? "All permissions"
                          : `${role.permissions.length} grants`}
                        {" · "}
                        {sensitiveCount(role.permissions)} sensitive
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                        {role.description}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-l border-border p-4">
              {!selected ? (
                <p className="text-sm text-text-secondary">
                  Select a role to inspect grants grouped by module.
                </p>
              ) : (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-sm font-semibold">{selected.name}</h2>
                      <p className="text-xs text-text-secondary">
                        {selected.slug}
                        {selected.is_system ? " · system (synced from catalog)" : ""}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">{selected.description}</p>
                    </div>
                    {canWrite && !selected.is_system ? (
                      <button
                        type="button"
                        onClick={() => remove(selected.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                  {selected.permissions.includes("*") ? (
                    <p className="text-sm text-text-secondary">
                      Super Admin wildcard. Financial self-approval and last-admin protections still
                      apply on the server.
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(grouped).map(([group, items]) => (
                        <fieldset key={group} className="rounded-lg border border-border p-3">
                          <legend className="px-1 text-xs font-semibold uppercase text-text-hint">
                            {group}
                          </legend>
                          <div className="space-y-1.5">
                            {items.map((item) => {
                              const checked = selected.permissions.includes(item.key);
                              const sensitive = SENSITIVE_PERMISSION_KEYS.has(item.key);
                              return (
                                <label
                                  key={item.key}
                                  className="flex items-start gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={checked}
                                    disabled={!canWrite || selected.is_system}
                                    onChange={() => {
                                      if (!canWrite || selected.is_system) return;
                                      void savePermissions(
                                        selected,
                                        checked
                                          ? selected.permissions.filter((key) => key !== item.key)
                                          : [...selected.permissions, item.key],
                                      );
                                    }}
                                  />
                                  <span>
                                    <span className="block">
                                      {item.label}
                                      {sensitive ? (
                                        <span className="ml-1 text-[10px] font-semibold uppercase text-amber-700">
                                          sensitive
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="block font-mono text-[10px] text-text-hint">
                                      {item.key} · {checked ? "granted" : "not granted"}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
