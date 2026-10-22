"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminReloadButton,
  AdminTableLoading,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { deleteAdmin } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useAdminUiState } from "@/lib/use-admin-ui-state";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { ProfileMediaRow } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function isVideo(item: ProfileMediaRow) {
  return (
    item.kind === "highlight" ||
    item.mime_type.toLowerCase().startsWith("video/")
  );
}

export default function ProfileMediaPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("users:write");
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useAdminUiState("profile-media:query", "");
  const [kind, setKind] = useAdminUiState("profile-media:kind", "all");

  const {
    data,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<ProfileMediaRow[]>({
    key: adminCacheKey(["profile-media", "list"]),
    fetcher: async () => {
      const response = await fetch("/api/admin/profile-media", {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        data?: ProfileMediaRow[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Failed to load profile media");
      return payload.data ?? [];
    },
  });
  const rows = useMemo(() => data ?? [], [data]);
  const error = actionError || loadError;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind === "photo" && isVideo(row)) return false;
      if (kind === "highlight" && !isVideo(row)) return false;
      if (!needle) return true;
      const owner =
        row.users?.display_name || row.users?.username || row.user_id;
      return `${owner} ${row.title} ${row.kind}`.toLowerCase().includes(needle);
    });
  }, [kind, query, rows]);

  const remove = async (id: string) => {
    if (!window.confirm("Remove this photo or clip from the profile?")) return;
    setActionError(null);
    try {
      await deleteAdmin(`/api/admin/profile-media/${id}`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Photos & clips"
        description="Profile photos and highlight videos uploaded in the app"
        actions={
          <AdminReloadButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void refresh()}
          />
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name or title"
          />
          <AdminSelect value={kind} onChange={setKind}>
            <option value="all">All media</option>
            <option value="photo">Photos</option>
            <option value="highlight">Videos</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      <AdminTableShell>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-semibold">Preview</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <AdminTableLoading colSpan={5} label="Loading media…" />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    <AdminEmpty
                      title="No profile media"
                      description="Photos and highlight clips appear here after users upload them in the app."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-14 w-14 overflow-hidden rounded-lg bg-muted"
                      >
                        {isVideo(row) ? (
                          <video
                            src={row.url}
                            className="h-full w-full object-cover"
                            muted
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </a>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {isVideo(row) ? "Video" : "Photo"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${row.user_id}`}
                        className="text-primary"
                      >
                        {row.users?.display_name ||
                          row.users?.username ||
                          row.user_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => remove(row.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminTableShell>
    </>
  );
}
