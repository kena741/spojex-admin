"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { deleteAdmin, patchAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { streamGenres, streamPlaybackUrl, streamStatusLabel, streamStatuses } from "@/lib/streams";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type { OrganizationRow, RadioStreamRow } from "@/lib/types";

export default function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const canWrite = can("streams:write");
  const [station, setStation] = useState<RadioStreamRow | null>(null);
  const [orgs, setOrgs] = useState<Pick<OrganizationRow, "id" | "name" | "public_id">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const streamRes = await getSpojexClient()
      .from("radio_streams")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (streamRes.error) throw streamRes.error;
    const row = streamRes.data as RadioStreamRow | null;
    setStation(row);

    const orgRes = await getSpojexClient()
      .from("organizations")
      .select("id, name, public_id")
      .order("name")
      .limit(500);
    if (!orgRes.error) {
      setOrgs((orgRes.data ?? []) as Pick<OrganizationRow, "id" | "name" | "public_id">[]);
    }

    const hostUserId = row?.host_user_id?.trim();
    if (hostUserId) {
      const userRes = await getSpojexClient()
        .from("users")
        .select("id, display_name, email, role")
        .eq("id", hostUserId)
        .maybeSingle();
      if (!userRes.error && userRes.data && row) {
        setStation({ ...row, users: userRes.data as RadioStreamRow["users"] });
      }
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/streams/${id}`, patch);
      await load();
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${station?.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/streams/${id}`);
      router.replace("/admin/streams?tab=radio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading station…" />;
  if (!station) return <AdminErrorAlert message={error || "Station not found"} />;

  return (
    <>
      <AdminPageHeader
        title={station.name}
        description={`${station.genre} · ${station.city}`}
        backHref="/admin/streams?tab=radio"
        breadcrumbs={[
          { label: "Streams", href: "/admin/streams?tab=radio" },
          { label: station.name },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/radio-chat?stream=${station.id}`}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Live chat
            </Link>
            {canWrite ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    save({ status: station.status === "active" ? "inactive" : "active" })
                  }
                  className={
                    station.status === "active"
                      ? "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                      : "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  }
                >
                  {station.status === "active" ? "Turn off air" : "Turn on air"}
                </button>
                <button
                  type="button"
                  onClick={() => save({ is_featured: !station.is_featured })}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  {station.is_featured ? "Unfeature" : "Feature"}
                </button>
                <button
                  type="button"
                  onClick={remove}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Preview</h2>
            <StatusBadge tone={requestTone(station.status)}>
              {streamStatusLabel(station.status)}
            </StatusBadge>
          </div>
          {station.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={station.image_url} alt="" className="mb-4 h-40 w-full rounded-lg object-cover" />
          ) : null}
          <p className="text-sm text-text-secondary">{station.tagline}</p>
          <p className="mt-3 break-all text-xs text-text-secondary">{streamPlaybackUrl(station) || "—"}</p>
        </section>

        {canWrite ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Edit station</h2>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                save({
                  name: String(data.get("name") ?? "").trim(),
                  tagline: String(data.get("tagline") ?? "").trim(),
                  stream_url: String(data.get("stream_url") ?? "").trim(),
                  website_url: "",
                  image_url: String(data.get("image_url") ?? "").trim(),
                  genre: String(data.get("genre") ?? "Live radio"),
                  city: String(data.get("city") ?? "Addis Ababa"),
                  status: String(data.get("status") ?? "inactive"),
                  sort_order: Number(data.get("sort_order") ?? 0),
                  host_org_id: String(data.get("host_org_id") ?? "").trim() || null,
                });
              }}
            >
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Managing organization</span>
                <select
                  name="host_org_id"
                  defaultValue={station.host_org_id ?? ""}
                  className="h-10 rounded-lg border border-border px-3"
                >
                  <option value="">No org (gifts locked)</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.public_id})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-text-secondary">
                  Owner of this org receives coin gifts (same as live events).
                  {station.users?.display_name
                    ? ` Current host: ${station.users.display_name}.`
                    : ""}
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Name</span>
                <input
                  name="name"
                  defaultValue={station.name}
                  required
                  className="h-10 rounded-lg border border-border px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Tagline</span>
                <textarea
                  name="tagline"
                  defaultValue={station.tagline}
                  rows={2}
                  className="rounded-lg border border-border px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-text-secondary">Stream URL</span>
                <input
                  name="stream_url"
                  defaultValue={streamPlaybackUrl(station)}
                  required
                  placeholder="https://example.com/live.mp3"
                  className="h-10 rounded-lg border border-border px-3"
                />
                <span className="text-xs text-text-secondary">
                  Direct audio link (MP3, AAC, Icecast, or HLS). Required before going on air.
                </span>
              </label>
              <input type="hidden" name="image_url" defaultValue={station.image_url} />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Genre</span>
                  <select
                    name="genre"
                    defaultValue={station.genre}
                    className="h-10 rounded-lg border border-border px-3"
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
                    name="city"
                    defaultValue={station.city}
                    className="h-10 rounded-lg border border-border px-3"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-text-secondary">Status</span>
                  <select
                    name="status"
                    defaultValue={station.status}
                    className="h-10 rounded-lg border border-border px-3"
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
                    name="sort_order"
                    type="number"
                    defaultValue={station.sort_order}
                    className="h-10 rounded-lg border border-border px-3"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Save changes
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </>
  );
}
