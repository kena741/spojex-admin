"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminSearchInput,
  AdminSelect,
  AdminTableActions,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { deleteAdmin, patchAdmin, postAdmin, postAdminResponse } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import {
  slugifyStream,
  streamGenres,
  streamPlaybackUrl,
  streamStatusLabel,
  streamStatuses,
} from "@/lib/streams";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { OrganizationRow, RadioStreamRow } from "@/lib/types";

type StreamDraft = {
  name: string;
  tagline: string;
  stream_url: string;
  image_url: string;
  genre: string;
  city: string;
  status: string;
  sort_order: number;
  host_org_id: string;
};

function draftFromRow(row: RadioStreamRow): StreamDraft {
  return {
    name: row.name,
    tagline: row.tagline,
    stream_url: streamPlaybackUrl(row),
    image_url: row.image_url,
    genre: row.genre,
    city: row.city,
    status: row.status,
    sort_order: row.sort_order,
    host_org_id: row.host_org_id ?? "",
  };
}

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

/** Radio station list/CRUD used by the Streams hub Radio tab. */
export default function RadioStreamsPanel() {
  const { can } = useAdminPermissions();
  const canWrite = can("streams:write");
  const [rows, setRows] = useState<RadioStreamRow[]>([]);
  const [orgs, setOrgs] = useState<Pick<OrganizationRow, "id" | "name" | "public_id">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [name, setName] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StreamDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const streamRes = await getSpojexClient()
      .from("radio_streams")
      .select("*")
      .order("sort_order")
      .order("name")
      .limit(500);
    if (streamRes.error) throw streamRes.error;
    setRows((streamRes.data ?? []) as RadioStreamRow[]);

    const orgRes = await getSpojexClient()
      .from("organizations")
      .select("id, name, public_id")
      .order("name")
      .limit(500);
    if (!orgRes.error) {
      setOrgs((orgRes.data ?? []) as Pick<OrganizationRow, "id" | "name" | "public_id">[]);
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.name, row.slug, row.tagline, row.genre, row.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [query, rows, status]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setCreating(true);
    setError(null);
    try {
      await postAdmin("/api/admin/streams", {
        name: name.trim(),
        slug: slugifyStream(name),
        stream_url: streamUrl.trim(),
        website_url: "",
        status: "inactive",
      });
      setName("");
      setStreamUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const importEthiopianStations = async () => {
    if (!canWrite || importing) return;
    if (
      !window.confirm(
        "Import Ethiopian radio stations from the admin catalog? Matching is by station name only (no SQL ids). Existing names will be updated.",
      )
    ) {
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const result = await postAdminResponse<{
        created?: number;
        updated?: number;
        skipped?: number;
        errors?: { name: string; error: string }[];
      }>("/api/admin/streams/import-ethiopian", {});
      await load();
      const errCount = result.errors?.length ?? 0;
      window.alert(
        `Import done.\nCreated: ${result.created ?? 0}\nUpdated: ${result.updated ?? 0}\nSkipped: ${result.skipped ?? 0}\nErrors: ${errCount}`,
      );
      if (errCount > 0) {
        setError(result.errors!.map((e) => `${e.name}: ${e.error}`).slice(0, 5).join(" · "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const openEdit = (row: RadioStreamRow) => {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
    setEditOpen(true);
    setError(null);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const url = draft.stream_url.trim();
      await patchAdmin(`/api/admin/streams/${editingId}`, {
        name: draft.name.trim(),
        tagline: draft.tagline.trim(),
        stream_url: url,
        website_url: "",
        image_url: draft.image_url.trim(),
        genre: draft.genre,
        city: draft.city.trim(),
        status: draft.status,
        sort_order: draft.sort_order,
        host_org_id: draft.host_org_id.trim() || null,
      });
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: RadioStreamRow) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/streams/${row.id}`);
      if (editingId === row.id) closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      {error ? <AdminErrorAlert message={error} /> : null}
      {canWrite ? (
        <div className="mb-6 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-secondary">
              Add a station manually, or import the Ethiopian catalog by name.
            </p>
            <button
              type="button"
              disabled={importing}
              onClick={() => void importEthiopianStations()}
              className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-text-primary disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import Ethiopian stations"}
            </button>
          </div>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Station name"
              required
              className={fieldClass}
            />
            <input
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="Stream URL (https://…)"
              required
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={creating || !name.trim() || !streamUrl.trim()}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Add station
            </button>
          </form>
        </div>
      ) : null}
      <AdminFilterPanel>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name, genre, city" />
          <AdminSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            {streamStatuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterPanel>
      {loading ? <AdminLoadingRow label="Loading stations…" /> : null}
      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty title="No stations" description="Add a radio station with a stream URL." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Station</th>
                  <th className="px-4 py-3 font-semibold">Managing org</th>
                  <th className="px-4 py-3 font-semibold">Genre</th>
                  <th className="px-4 py-3 font-semibold">City</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Featured</th>
                  {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/streams/${row.id}`}
                        className="font-medium text-text-primary hover:text-primary"
                      >
                        {row.name}
                      </Link>
                      <p className="mt-0.5">
                        <Link href={`/admin/radio-chat?stream=${row.id}`} className="text-xs text-primary hover:underline">
                          Live chat
                        </Link>
                      </p>
                      {row.tagline ? (
                        <p className="mt-0.5 text-xs text-text-secondary">{row.tagline}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {(() => {
                        const orgName =
                          row.organizations?.name ??
                          orgs.find((org) => org.id === row.host_org_id)?.name;
                        if (orgName) return <span>{orgName}</span>;
                        // Column missing until migration 098 is applied.
                        if (row.host_org_id === undefined) {
                          return <span className="text-text-secondary">—</span>;
                        }
                        return <span className="text-amber-600">No org (gifts locked)</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.genre}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.city || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone(row.status)}>
                        {streamStatusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {row.is_featured ? (
                        <StatusBadge tone="success">Featured</StatusBadge>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <AdminTableActions
                          canWrite
                          onEdit={() => openEdit(row)}
                          onDelete={() => remove(row)}
                        />
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
        open={editOpen && Boolean(draft)}
        title="Edit station"
        onClose={closeEdit}
        footer={<AdminModalFooter onCancel={closeEdit} onSave={saveEdit} saving={saving} />}
      >
        {draft ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Managing organization</span>
              <select
                value={draft.host_org_id}
                onChange={(e) => setDraft({ ...draft, host_org_id: e.target.value })}
                className={fieldClass}
              >
                <option value="">No org (gifts locked)</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.public_id})
                  </option>
                ))}
              </select>
              <span className="text-xs text-text-secondary">
                Org owner receives coin gifts — same as live events.
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Tagline</span>
              <textarea
                value={draft.tagline}
                onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                rows={2}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Stream URL</span>
              <input
                value={draft.stream_url}
                onChange={(e) => setDraft({ ...draft, stream_url: e.target.value })}
                placeholder="https://example.com/live.mp3"
                className={fieldClass}
              />
              <span className="text-xs text-text-secondary">
                Direct audio link (MP3, AAC, Icecast, or HLS).
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Cover image URL</span>
              <input
                value={draft.image_url}
                onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
                className={fieldClass}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Genre</span>
                <select
                  value={draft.genre}
                  onChange={(e) => setDraft({ ...draft, genre: e.target.value })}
                  className={fieldClass}
                >
                  {streamGenres.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">City</span>
                <input
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Status</span>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  className={fieldClass}
                >
                  {streamStatuses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Sort order</span>
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                  }
                  className={fieldClass}
                />
              </label>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
