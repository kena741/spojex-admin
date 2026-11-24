"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminLoadingRow,
  AdminReloadButton,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import {
  clearIdentityCatalogCache,
  fetchIdentityCatalog,
  type IdentityCatalog,
  type IdentityRole,
  type IdentityRoleKind,
} from "@/lib/identity-catalog";
import { slugifyIdentity } from "@/lib/identity-catalog-seeds";
import { deleteAdmin, patchAdmin, postAdmin } from "@/lib/hooks";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

type RoleDraft = {
  group_id: string;
  label: string;
  blurb: string;
  sort_order: number;
  is_active: boolean;
  kind: IdentityRoleKind | string;
  profile_title: string;
  description: string;
  license_label: string;
  default_service_category_slug: string;
  icon: string;
};

const inputClass = "h-10 rounded-lg border border-border px-3 text-sm";
const KIND_OPTIONS: { value: IdentityRoleKind; label: string }[] = [
  { value: "account_role", label: "Account role (fan / athlete / professional)" },
  { value: "profession", label: "Profession (coach, journalist, …)" },
  { value: "legacy", label: "Legacy (hidden from new signups)" },
];

function kindTone(kind: string | undefined) {
  if (kind === "account_role") return "success" as const;
  if (kind === "profession") return "info" as const;
  return "neutral" as const;
}

export default function CategoriesPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("profiles:write");
  const [actionError, setError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [blurb, setBlurb] = useState("");
  const [icon, setIcon] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [licenseLabel, setLicenseLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    data: catalog,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<IdentityCatalog>({
    key: adminCacheKey(["people", "settings", "identity-catalog"]),
    fetcher: fetchIdentityCatalog,
  });
  const error = actionError ?? loadError;

  useEffect(() => {
    if (!groupId && catalog?.groups[0]) setGroupId(catalog.groups[0].id);
  }, [catalog, groupId]);

  /** Force a fresh catalog (module-level identity cache is bypassed after edits / reload). */
  const load = async () => {
    clearIdentityCatalogCache();
    await refresh();
  };

  const groupedRoles = useMemo(() => {
    if (!catalog) return [];
    return catalog.groups.map((group) => ({
      group,
      roles: catalog.roles
        .filter((role) => role.group_id === group.id)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [catalog]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupId) return;
    setError(null);
    try {
      await postAdmin("/api/admin/identity-roles", {
        group_id: groupId,
        label: label.trim(),
        slug: slug.trim() || slugifyIdentity(label),
        blurb: blurb.trim(),
        profile_title: profileTitle.trim() || label.trim(),
        license_label: licenseLabel.trim(),
        icon: icon.trim(),
        sort_order: (catalog?.roles.length ?? 0) + 1,
      });
      setLabel("");
      setSlug("");
      setBlurb("");
      setIcon("");
      setProfileTitle("");
      setLicenseLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const startEdit = (role: IdentityRole) => {
    setEditingId(role.id);
    setDraft({
      group_id: role.group_id,
      label: role.label,
      blurb: role.blurb,
      sort_order: role.sort_order,
      is_active: role.is_active,
      kind: role.kind || "profession",
      profile_title: role.profile_title || role.label,
      description: role.description || "",
      license_label: role.license_label || "",
      default_service_category_slug: role.default_service_category_slug || "",
      icon: role.icon || "",
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      await patchAdmin("/api/admin/identity-roles", {
        id: editingId,
        group_id: draft.group_id,
        label: draft.label.trim(),
        blurb: draft.blurb.trim(),
        sort_order: draft.sort_order,
        is_active: draft.is_active,
        kind: draft.kind,
        profile_title: draft.profile_title.trim(),
        description: draft.description.trim(),
        license_label: draft.license_label.trim(),
        default_service_category_slug: draft.default_service_category_slug.trim(),
        icon: draft.icon.trim(),
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: IdentityRole) => {
    const warning = role.is_system
      ? `"${role.label}" is a core signup role. Delete only if no users have it. Continue?`
      : `Delete "${role.label}"? This cannot be undone. Prefer Hide (inactive) when users may still hold it.`;
    if (!window.confirm(warning)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/identity-roles?id=${encodeURIComponent(role.id)}`);
      if (editingId === role.id) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Identity roles"
        backHref="/admin/people"
        breadcrumbs={[
          { label: "People", href: "/admin/people" },
          { label: "Identity roles" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/profile-config"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
            >
              Profile fields
            </Link>
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => {
                setError(null);
                void load();
              }}
            />
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}

      {canWrite && catalog?.fromDatabase ? (
        <form
          onSubmit={create}
          className="mb-6 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Add role</p>
          <div className="grid gap-3 md:grid-cols-[180px_1fr_160px]">
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className={inputClass}
              required
            >
              {catalog.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
            <input
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (!slug) setSlug(slugifyIdentity(event.target.value));
              }}
              placeholder="Role label (Coach)"
              className={inputClass}
              required
            />
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="slug (coach)"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={profileTitle}
              onChange={(event) => setProfileTitle(event.target.value)}
              placeholder="Profile title (optional — defaults to label)"
              className={inputClass}
            />
            <input
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              placeholder="Icon name (e.g. sports, badge, camera)"
              className={inputClass}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={blurb}
              onChange={(event) => setBlurb(event.target.value)}
              placeholder="Short blurb shown during signup / picker"
              className={inputClass}
            />
            <input
              value={licenseLabel}
              onChange={(event) => setLicenseLabel(event.target.value)}
              placeholder="License label (professions)"
              className={inputClass}
            />
          </div>
          <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Add role
          </button>
        </form>
      ) : null}

      <AdminTableShell>
        {loading && !catalog ? (
          <AdminLoadingRow label="Loading identity roles…" compact className="py-10" />
        ) : !catalog || groupedRoles.every((item) => item.roles.length === 0) ? (
          <AdminEmpty
            title="No identity roles"
            description="Add roles so users can select who they are. Then configure fields under Profile fields."
          />
        ) : (
          <div className="divide-y divide-border">
            {groupedRoles.map(({ group, roles }) => (
              <section key={group.id} className="p-5">
                <h2 className="mb-3 font-heading text-sm font-semibold">{group.label}</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Role</th>
                        <th className="px-4 py-3 font-semibold">Kind</th>
                        <th className="px-4 py-3 font-semibold">Icon</th>
                        <th className="px-4 py-3 font-semibold">Blurb</th>
                        <th className="px-4 py-3 font-semibold">Order</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        {canWrite && catalog.fromDatabase ? (
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {roles.map((role) => {
                        const isEditing = editingId === role.id && draft;
                        return (
                          <tr key={role.id} className="border-b border-border last:border-0 align-top">
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <div className="space-y-2 min-w-[200px]">
                                  <input
                                    value={draft.label}
                                    onChange={(event) =>
                                      setDraft({ ...draft, label: event.target.value })
                                    }
                                    className="h-9 w-full rounded-lg border border-border px-2 text-sm"
                                  />
                                  <input
                                    value={draft.profile_title}
                                    onChange={(event) =>
                                      setDraft({ ...draft, profile_title: event.target.value })
                                    }
                                    placeholder="Profile title"
                                    className="h-9 w-full rounded-lg border border-border px-2 text-sm"
                                  />
                                  <select
                                    value={draft.group_id}
                                    onChange={(event) =>
                                      setDraft({ ...draft, group_id: event.target.value })
                                    }
                                    className="h-9 w-full rounded-lg border border-border px-2 text-sm"
                                  >
                                    {catalog.groups.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.label}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={draft.kind}
                                    onChange={(event) =>
                                      setDraft({ ...draft, kind: event.target.value })
                                    }
                                    className="h-9 w-full rounded-lg border border-border px-2 text-sm"
                                  >
                                    {KIND_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    value={draft.license_label}
                                    onChange={(event) =>
                                      setDraft({ ...draft, license_label: event.target.value })
                                    }
                                    placeholder="License label"
                                    className="h-9 w-full rounded-lg border border-border px-2 text-sm"
                                  />
                                  <input
                                    value={draft.default_service_category_slug}
                                    onChange={(event) =>
                                      setDraft({
                                        ...draft,
                                        default_service_category_slug: event.target.value,
                                      })
                                    }
                                    placeholder="Default service category slug"
                                    className="h-9 w-full rounded-lg border border-border px-2 font-mono text-sm"
                                  />
                                  <textarea
                                    value={draft.description}
                                    onChange={(event) =>
                                      setDraft({ ...draft, description: event.target.value })
                                    }
                                    rows={2}
                                    placeholder="Longer description"
                                    className="w-full rounded-lg border border-border px-2 py-1 text-sm"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <div className="font-medium">
                                    {role.label}
                                    {role.is_system ? (
                                      <span className="ml-2 text-xs font-normal text-text-hint">system</span>
                                    ) : null}
                                  </div>
                                  <div className="font-mono text-xs text-text-secondary">{role.slug}</div>
                                  {role.profile_title && role.profile_title !== role.label ? (
                                    <div className="text-xs text-text-hint">{role.profile_title}</div>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge tone={kindTone(role.kind)}>
                                {role.kind || "unset"}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                              {isEditing ? (
                                <input
                                  value={draft.icon}
                                  onChange={(event) =>
                                    setDraft({ ...draft, icon: event.target.value })
                                  }
                                  placeholder="icon"
                                  className="h-9 w-28 rounded-lg border border-border px-2 font-mono text-sm"
                                />
                              ) : (
                                role.icon || "—"
                              )}
                            </td>
                            <td className="max-w-sm px-4 py-3 text-text-secondary">
                              {isEditing ? (
                                <textarea
                                  value={draft.blurb}
                                  onChange={(event) =>
                                    setDraft({ ...draft, blurb: event.target.value })
                                  }
                                  rows={2}
                                  className="w-full min-w-[200px] rounded-lg border border-border px-2 py-1 text-sm"
                                />
                              ) : (
                                role.blurb || "-"
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={draft.sort_order}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      sort_order: Number(event.target.value) || 0,
                                    })
                                  }
                                  className="h-9 w-20 rounded-lg border border-border px-2 text-sm"
                                />
                              ) : (
                                role.sort_order
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={draft.is_active}
                                    onChange={(event) =>
                                      setDraft({ ...draft, is_active: event.target.checked })
                                    }
                                  />
                                  Active
                                </label>
                              ) : (
                                <StatusBadge tone={role.is_active ? "success" : "neutral"}>
                                  {role.is_active ? "Active" : "Hidden"}
                                </StatusBadge>
                              )}
                            </td>
                            {canWrite && catalog.fromDatabase ? (
                              <td className="px-4 py-3">
                                {isEditing ? (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={saveEdit}
                                      className="text-sm font-medium text-primary hover:underline"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="text-sm text-text-secondary hover:underline"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-3">
                                    <button
                                      type="button"
                                      onClick={() => startEdit(role)}
                                      className="text-sm text-primary hover:underline"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => remove(role)}
                                      className="text-sm text-red-600 hover:underline"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
