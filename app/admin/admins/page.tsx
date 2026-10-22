"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
  AdminRowMenu,
  AdminSearchInput,
  AdminSelect,
  AdminTableLoading,
  AdminTableShell,
  type AdminRowMenuItem,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { generateStadiumManagerPassword } from "@/lib/stadiums";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { AdminRoleRow, AdminRow } from "@/lib/admin-permissions";
import { formatDate, formatStatusLabel } from "@/lib/utils";

type CreateTab = "create" | "attach" | "invite";

type UserPick = {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
};

type Credentials = {
  email: string;
  password: string;
  role: string;
  name: string;
};

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export default function AdminsPage() {
  const { can, staff } = useAdminPermissions();
  const canWrite = can("admins:write") || can("admins:invite");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<CreateTab>("create");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [roleEdit, setRoleEdit] = useState<AdminRow | null>(null);
  const [nextRole, setNextRole] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);

  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    role: "viewer",
    password: generateStadiumManagerPassword(),
  });
  const [attachQuery, setAttachQuery] = useState("");
  const [attachOptions, setAttachOptions] = useState<UserPick[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachUser, setAttachUser] = useState<UserPick | null>(null);
  const [attachRole, setAttachRole] = useState("viewer");
  const [inviteForm, setInviteForm] = useState({
    full_name: "",
    email: "",
    role: "viewer",
  });

  const load = useCallback(async () => {
    const [adminsRes, rolesRes] = await Promise.all([
      fetch("/api/admin/admins"),
      fetch("/api/admin/roles"),
    ]);
    const adminsPayload = (await adminsRes.json()) as { data?: AdminRow[]; error?: string };
    const rolesPayload = (await rolesRes.json()) as { data?: AdminRoleRow[]; error?: string };
    if (!adminsRes.ok) throw new Error(adminsPayload.error || "Failed to load admins");
    setRows(adminsPayload.data ?? []);
    if (rolesRes.ok) {
      const list = rolesPayload.data ?? [];
      setRoles(list);
      const defaultRole = list.find((r) => r.slug === "viewer")?.slug || list[0]?.slug || "viewer";
      setCreateForm((prev) => ({
        ...prev,
        role: list.some((r) => r.slug === prev.role) ? prev.role : defaultRole,
      }));
      setAttachRole((prev) => (list.some((r) => r.slug === prev) ? prev : defaultRole));
      setInviteForm((prev) => ({
        ...prev,
        role: list.some((r) => r.slug === prev.role) ? prev.role : defaultRole,
      }));
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!createOpen || tab !== "attach") return;
    const q = attachQuery.trim();
    if (q.length < 2) {
      setAttachOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAttachLoading(true);
      void fetch(`/api/admin/admins?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            users?: UserPick[];
            error?: string;
          };
          if (cancelled) return;
          if (!res.ok) {
            setError(json.error || "User search failed");
            setAttachOptions([]);
          } else {
            setAttachOptions(json.users ?? []);
          }
        })
        .finally(() => {
          if (!cancelled) setAttachLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attachQuery, createOpen, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.full_name, row.email, row.role].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [query, rows]);

  const roleOptions = roles.length ? roles : [{ slug: "viewer", name: "Viewer" }];

  const openCreate = () => {
    setInviteToken(null);
    setCredentials(null);
    setError(null);
    setNotice(null);
    setTab("create");
    setCreateForm({
      full_name: "",
      email: "",
      role: roleOptions.find((r) => r.slug === "viewer")?.slug || roleOptions[0]?.slug || "viewer",
      password: generateStadiumManagerPassword(),
    });
    setAttachQuery("");
    setAttachUser(null);
    setAttachOptions([]);
    setAttachRole(roleOptions.find((r) => r.slug === "viewer")?.slug || roleOptions[0]?.slug || "viewer");
    setInviteForm({
      full_name: "",
      email: "",
      role: roleOptions.find((r) => r.slug === "viewer")?.slug || roleOptions[0]?.slug || "viewer",
    });
    setCreateOpen(true);
  };

  const createStaff = async () => {
    setSaving(true);
    setError(null);
    setCredentials(null);
    setInviteToken(null);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          full_name: createForm.full_name.trim(),
          email: createForm.email.trim(),
          role: createForm.role,
          password: createForm.password,
        }),
      });
      const payload = (await res.json()) as {
        data?: AdminRow;
        password?: string | null;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Create failed");
      if (payload.password) {
        setCredentials({
          email: createForm.email.trim().toLowerCase(),
          password: payload.password,
          role: createForm.role,
          name: createForm.full_name.trim(),
        });
      } else {
        setNotice(payload.message || "Staff access granted.");
        setCreateOpen(false);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const attachStaff = async () => {
    if (!attachUser) {
      setError("Select an existing user by email or username.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "attach",
          user_id: attachUser.id,
          email: attachUser.email || undefined,
          full_name: attachUser.display_name || attachUser.full_name || undefined,
          role: attachRole,
        }),
      });
      const payload = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(payload.error || "Attach failed");
      setNotice(payload.message || `Granted ${formatStatusLabel(attachRole)} to ${attachUser.email || attachUser.display_name}.`);
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attach failed");
    } finally {
      setSaving(false);
    }
  };

  const inviteStaff = async () => {
    setSaving(true);
    setError(null);
    setInviteToken(null);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inviteForm, mode: "invite" }),
      });
      const payload = (await res.json()) as {
        data?: { token?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Invite failed");
      if (payload.data?.token) setInviteToken(payload.data.token);
      await refresh();
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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setRoleSaving(false);
    }
  };

  const toggleActive = async (row: AdminRow) => {
    try {
      await patchAdmin(`/api/admin/admins/${row.id}`, { is_active: !row.is_active });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (row: AdminRow) => {
    try {
      await deleteAdmin(`/api/admin/admins/${row.id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = `SpoJex Admin login\nEmail: ${credentials.email}\nPassword: ${credentials.password}\nRole: ${formatStatusLabel(credentials.role)}\nURL: ${typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Email and password copied.");
    } catch {
      setError("Could not copy — select and copy manually.");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Admins"
        description="Create staff with a role and password, or grant access to an existing SpoJex account."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton loading={loading} onClick={() => void refresh()} />
            {canWrite ? (
              <button
                type="button"
                onClick={openCreate}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Add staff
              </button>
            ) : null}
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <AdminFilterPanel>
        <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, email, role" />
      </AdminFilterPanel>
      <AdminTableShell>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-semibold">Admin</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Staff / user IDs</th>
                <th className="px-4 py-3 font-semibold">Added</th>
                {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <AdminTableLoading colSpan={canWrite ? 6 : 5} label="Loading admins…" />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="p-0">
                    <AdminEmpty
                      title="No admins"
                      description="Add staff with a role and password, or attach an existing user account."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const items: AdminRowMenuItem[] = [
                    {
                      id: "change-role",
                      label: "Change role",
                      onClick: () => {
                        setNextRole(row.role);
                        setRoleEdit(row);
                      },
                    },
                    {
                      id: "toggle-active",
                      label: row.is_active ? "Suspend" : "Re-enable",
                      onClick: () => {
                        const ok = window.confirm(
                          row.is_active
                            ? "Suspend this admin? Active sessions will be revoked."
                            : "Re-enable this admin? Previous revoked sessions stay invalid.",
                        );
                        if (ok) void toggleActive(row);
                      },
                    },
                  ];
                  if (staff?.id !== row.id) {
                    items.push({
                      id: "remove",
                      label: row.is_active ? "Suspend access" : "Delete staff row",
                      tone: "danger",
                      separatorBefore: true,
                      onClick: () => {
                        const ok = window.confirm(
                          row.is_active
                            ? "Suspend this admin? They lose access; the staff row stays for audit. Remove again later to delete the row."
                            : "Permanently delete this suspended staff row? Audit log entries are kept (admin link cleared).",
                        );
                        if (ok) void remove(row);
                      },
                    });
                  }
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.full_name || "Unnamed"}</p>
                        <p className="text-xs text-text-secondary">{row.email || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium">{formatStatusLabel(row.role)}</span>
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
                        <td className="px-4 py-3">
                          <AdminRowMenu
                            items={items}
                            aria-label={`Actions for ${row.full_name || row.email || "admin"}`}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
            <AdminSelect value={nextRole} onChange={setNextRole}>
              {roleOptions.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.name}
                </option>
              ))}
            </AdminSelect>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        open={createOpen}
        title={credentials ? "Staff credentials" : inviteToken ? "Invitation link" : "Add staff"}
        onClose={() => {
          if (saving) return;
          setCreateOpen(false);
          setInviteToken(null);
          setCredentials(null);
        }}
        sheet
        footer={
          credentials || inviteToken ? (
            <AdminModalFooter
              onCancel={() => {
                setCreateOpen(false);
                setInviteToken(null);
                setCredentials(null);
              }}
              onSave={() => {
                if (credentials) void copyCredentials();
                else {
                  setCreateOpen(false);
                  setInviteToken(null);
                }
              }}
              saving={false}
              saveLabel={credentials ? "Copy email & password" : "Done"}
            />
          ) : (
            <AdminModalFooter
              onCancel={() => setCreateOpen(false)}
              onSave={() => {
                if (tab === "create") void createStaff();
                else if (tab === "attach") void attachStaff();
                else void inviteStaff();
              }}
              saving={saving}
              saveLabel={
                tab === "create" ? "Create staff" : tab === "attach" ? "Grant access" : "Create invite"
              }
            />
          )
        }
      >
        {credentials ? (
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">
              Account created for <strong>{credentials.name}</strong>. Copy and send these
              credentials now — the password is not shown again.
            </p>
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">
              <p>
                <span className="text-text-secondary">Email: </span>
                {credentials.email}
              </p>
              <p>
                <span className="text-text-secondary">Password: </span>
                {credentials.password}
              </p>
              <p>
                <span className="text-text-secondary">Role: </span>
                {formatStatusLabel(credentials.role)}
              </p>
              <p>
                <span className="text-text-secondary">Login: </span>
                {typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyCredentials()}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Copy email & password
            </button>
          </div>
        ) : inviteToken ? (
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">
              Single-use invitation created. Share this link once — it expires in 72 hours.
            </p>
            <code className="block break-all rounded-lg border border-border bg-muted/50 p-3 text-xs">
              {typeof window !== "undefined"
                ? `${window.location.origin}/login?invite=${inviteToken}`
                : inviteToken}
            </code>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["create", "Create new"],
                  ["attach", "Existing user"],
                  ["invite", "Invite link"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    tab === id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "create" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void createStaff();
                }}
                className="grid gap-3"
              >
                <p className="text-xs text-text-secondary">
                  Creates a login they can use at Admin. Assign any staff role. Copy the password
                  after save.
                </p>
                <input
                  value={createForm.full_name}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, full_name: event.target.value }))
                  }
                  placeholder="Full name"
                  className={fieldClass}
                  required
                />
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="Email"
                  className={fieldClass}
                  required
                />
                <AdminSelect
                  value={createForm.role}
                  onChange={(value) => setCreateForm((current) => ({ ...current, role: value }))}
                >
                  {roleOptions.map((role) => (
                    <option key={role.slug} value={role.slug}>
                      {role.name}
                    </option>
                  ))}
                </AdminSelect>
                <div className="flex gap-2">
                  <input
                    value={createForm.password}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, password: event.target.value }))
                    }
                    placeholder="Password"
                    className={fieldClass}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCreateForm((current) => ({
                        ...current,
                        password: generateStadiumManagerPassword(),
                      }))
                    }
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                  >
                    Generate
                  </button>
                </div>
              </form>
            ) : null}

            {tab === "attach" ? (
              <div className="grid gap-3">
                <p className="text-xs text-text-secondary">
                  Find someone who already has a SpoJex account by email or username, then grant a
                  staff role. No new password is created.
                </p>
                <AdminSearchInput
                  value={attachQuery}
                  onChange={(value) => {
                    setAttachQuery(value);
                    setAttachUser(null);
                  }}
                  placeholder="Search email, username, or name"
                />
                {attachLoading ? (
                  <p className="text-xs text-text-hint">Searching…</p>
                ) : attachOptions.length > 0 ? (
                  <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {attachOptions.map((user) => {
                      const selected = attachUser?.id === user.id;
                      return (
                        <li key={user.id}>
                          <button
                            type="button"
                            onClick={() => setAttachUser(user)}
                            className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                              selected ? "bg-primary/10" : ""
                            }`}
                          >
                            <span className="font-medium">
                              {user.display_name || user.full_name || user.email || "User"}
                            </span>
                            <span className="text-xs text-text-secondary">
                              {[user.email, user.username ? `@${user.username}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : attachQuery.trim().length >= 2 ? (
                  <p className="text-xs text-text-hint">No matching users.</p>
                ) : null}
                {attachUser ? (
                  <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-text-secondary">
                    Selected:{" "}
                    <strong className="text-foreground">
                      {attachUser.display_name || attachUser.email}
                    </strong>
                  </p>
                ) : null}
                <AdminSelect value={attachRole} onChange={setAttachRole}>
                  {roleOptions.map((role) => (
                    <option key={role.slug} value={role.slug}>
                      {role.name}
                    </option>
                  ))}
                </AdminSelect>
              </div>
            ) : null}

            {tab === "invite" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void inviteStaff();
                }}
                className="grid gap-3"
              >
                <p className="text-xs text-text-secondary">
                  Optional: send a one-time invite link. Prefer Create new when you need to hand
                  them a password immediately.
                </p>
                <input
                  value={inviteForm.full_name}
                  onChange={(event) =>
                    setInviteForm((current) => ({ ...current, full_name: event.target.value }))
                  }
                  placeholder="Full name"
                  className={fieldClass}
                  required
                />
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(event) =>
                    setInviteForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="Email"
                  className={fieldClass}
                  required
                />
                <AdminSelect
                  value={inviteForm.role}
                  onChange={(value) => setInviteForm((current) => ({ ...current, role: value }))}
                >
                  {roleOptions.map((role) => (
                    <option key={role.slug} value={role.slug}>
                      {role.name}
                    </option>
                  ))}
                </AdminSelect>
              </form>
            ) : null}
          </div>
        )}
      </AdminModal>
    </>
  );
}
