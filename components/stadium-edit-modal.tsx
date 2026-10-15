"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminModal, AdminModalFooter } from "@/components/admin-layout";
import { StadiumLocationPicker } from "@/components/stadium-location-picker";
import { patchAdmin, postAdminResponse } from "@/lib/hooks";
import {
  normalizeStadiumFacility,
  normalizeStadiumSurface,
  stadiumCoverUrl,
  stadiumFacilityOptions,
  stadiumPhotoUrls,
  stadiumSizeTypes,
  stadiumStatuses,
  stadiumSurfaceOptions,
} from "@/lib/stadiums";
import type { StadiumRow } from "@/lib/types";

type StadiumDraft = {
  name: string;
  status: string;
  size_type: string;
  surface: string;
  location: string;
  address: string;
  capacity: number;
  image_url: string;
  photos: string[];
  contact_phone: string;
  contact_email: string;
  owner_name: string;
  description: string;
  latitude: string;
  longitude: string;
  facilities: string[];
};

function emptyDraft(): StadiumDraft {
  return {
    name: "",
    status: "pending",
    size_type: "medium",
    surface: "Artificial",
    location: "",
    address: "",
    capacity: 0,
    image_url: "",
    photos: [],
    contact_phone: "",
    contact_email: "",
    owner_name: "",
    description: "",
    latitude: "",
    longitude: "",
    facilities: [],
  };
}

function draftFromRow(row: StadiumRow): StadiumDraft {
  const photos = stadiumPhotoUrls(row.photos);
  const cover = stadiumCoverUrl(row);
  return {
    name: row.name ?? "",
    status: row.status ?? "pending",
    size_type: row.size_type ?? "medium",
    surface: normalizeStadiumSurface(row.surface),
    location: row.location ?? "",
    address: row.address ?? "",
    capacity: row.capacity ?? 0,
    image_url: cover,
    photos: cover && !photos.includes(cover) ? [cover, ...photos] : photos,
    contact_phone: row.contact_phone ?? "",
    contact_email: row.contact_email ?? "",
    owner_name: row.owner_name ?? "",
    description: row.description ?? "",
    latitude: row.latitude == null ? "" : String(row.latitude),
    longitude: row.longitude == null ? "" : String(row.longitude),
    facilities: Array.isArray(row.facilities)
      ? [
          ...new Set(
            row.facilities
              .map((item) => normalizeStadiumFacility(`${item ?? ""}`))
              .filter(Boolean),
          ),
        ]
      : [],
  };
}

async function uploadStadiumImage(stadiumId: string, file: File, kind: "cover" | "gallery") {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const response = await fetch(`/api/admin/stadiums/${stadiumId}/image`, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const payload = (await response.json()) as {
    error?: string;
    image_url?: string;
    photos?: string[];
    data?: StadiumRow;
  };
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  return payload;
}

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

export function StadiumEditModal({
  stadium,
  open,
  creating = false,
  onClose,
  onSaved,
}: {
  stadium: StadiumRow | null;
  open: boolean;
  creating?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<StadiumDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "gallery" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customFacility, setCustomFacility] = useState("");

  const isCreate = creating || !stadium;

  useEffect(() => {
    if (!open) return;
    setDraft(stadium ? draftFromRow(stadium) : emptyDraft());
    setCustomFacility("");
    setError(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }, [open, stadium]);

  const toggleFacility = (label: string) => {
    if (!draft) return;
    const key = normalizeStadiumFacility(label);
    if (!key) return;
    const next = draft.facilities.includes(key)
      ? draft.facilities.filter((item) => item !== key)
      : [...draft.facilities, key];
    setDraft({ ...draft, facilities: next });
  };

  const addCustomFacility = () => {
    if (!draft) return;
    const key = normalizeStadiumFacility(customFacility);
    if (!key) return;
    if (!draft.facilities.includes(key)) {
      setDraft({ ...draft, facilities: [...draft.facilities, key] });
    }
    setCustomFacility("");
  };

  const uploadImage = async (file: File, kind: "cover" | "gallery") => {
    if (!stadium) return;
    setUploading(kind);
    setError(null);
    try {
      const payload = await uploadStadiumImage(stadium.id, file, kind);
      const photos = payload.photos ?? payload.data?.photos;
      const urls = stadiumPhotoUrls(photos);
      const cover = payload.image_url || stadiumCoverUrl(payload.data ?? stadium);
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              image_url: kind === "cover" ? cover || prev.image_url : prev.image_url || cover,
              photos: urls.length > 0 ? urls : prev.photos,
            }
          : prev,
      );
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const removePhoto = async (url: string) => {
    if (!stadium || !draft) return;
    const photos = draft.photos.filter((item) => item !== url);
    const imageUrl = draft.image_url === url ? photos[0] ?? "" : draft.image_url;
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/stadiums/${stadium.id}`, {
        photos,
        image_url: imageUrl,
      });
      setDraft({ ...draft, photos, image_url: imageUrl });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo");
    } finally {
      setSaving(false);
    }
  };

  const payloadFromDraft = (current: StadiumDraft) => ({
    name: current.name.trim(),
    status: current.status,
    size_type: current.size_type,
    surface: normalizeStadiumSurface(current.surface),
    location: current.location.trim(),
    address: current.address.trim(),
    capacity: current.capacity,
    contact_phone: current.contact_phone.trim(),
    contact_email: current.contact_email.trim(),
    owner_name: current.owner_name.trim(),
    description: current.description.trim(),
    facilities: [
      ...new Set(
        current.facilities
          .map((item) => normalizeStadiumFacility(item))
          .filter(Boolean),
      ),
    ],
    latitude: current.latitude.trim() ? Number(current.latitude) : null,
    longitude: current.longitude.trim() ? Number(current.longitude) : null,
  });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isCreate) {
        const created = await postAdminResponse("/api/admin/stadiums", payloadFromDraft(draft));
        const row = created.data as StadiumRow | undefined;
        await onSaved();
        onClose();
        if (row?.id) router.push(`/admin/stadiums/${row.id}`);
        return;
      }
      if (!stadium) return;
      await patchAdmin(`/api/admin/stadiums/${stadium.id}`, payloadFromDraft(draft));
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const gallery = draft?.photos.filter((url) => url && url !== draft.image_url) ?? [];

  return (
    <AdminModal
      open={open && Boolean(draft)}
      title={isCreate ? "Add stadium" : "Edit stadium"}
      onClose={onClose}
      sheet
      className="sm:max-w-3xl"
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={save}
          saving={saving || Boolean(uploading)}
          saveLabel={uploading ? "Uploading…" : isCreate ? "Create stadium" : "Save"}
        />
      }
    >
      {draft ? (
        <div className="grid gap-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-text-secondary">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Status</span>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                className={fieldClass}
              >
                {stadiumStatuses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Size</span>
              <select
                value={draft.size_type}
                onChange={(e) => setDraft({ ...draft, size_type: e.target.value })}
                className={fieldClass}
              >
                {stadiumSizeTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Surface</span>
              <select
                value={draft.surface}
                onChange={(e) => setDraft({ ...draft, surface: e.target.value })}
                className={fieldClass}
              >
                {stadiumSurfaceOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Location</span>
              <input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Capacity</span>
              <input
                type="number"
                min={0}
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) || 0 })}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">Map pin</p>
            <StadiumLocationPicker
              address={draft.address || draft.location}
              latitude={draft.latitude.trim() ? Number(draft.latitude) : null}
              longitude={draft.longitude.trim() ? Number(draft.longitude) : null}
              disabled={saving}
              onChange={(pin) =>
                setDraft({
                  ...draft,
                  address: pin.address,
                  location: draft.location.trim() ? draft.location : pin.address,
                  latitude: pin.latitude == null ? "" : String(pin.latitude),
                  longitude: pin.longitude == null ? "" : String(pin.longitude),
                })
              }
            />
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-medium">Facilities</p>
            <div className="flex flex-wrap gap-2">
              {stadiumFacilityOptions.map((item) => {
                const selected = draft.facilities.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleFacility(item)}
                    className={
                      selected
                        ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                        : "rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-muted"
                    }
                  >
                    {item}
                  </button>
                );
              })}
              {draft.facilities
                .filter((item) => !stadiumFacilityOptions.includes(item))
                .map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleFacility(item)}
                    className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    title="Click to remove"
                  >
                    {item} ×
                  </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${fieldClass} max-w-xs`}
                value={customFacility}
                onChange={(e) => setCustomFacility(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomFacility();
                  }
                }}
                placeholder="Add custom facility"
                disabled={saving}
              />
              <button
                type="button"
                onClick={addCustomFacility}
                disabled={saving || !normalizeStadiumFacility(customFacility)}
                className="h-10 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {isCreate ? (
            <p className="text-sm text-text-secondary">
              Save the stadium first, then open it to upload a cover and gallery photos.
            </p>
          ) : (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                {draft.image_url.trim() ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.image_url.trim()}
                      alt=""
                      className="h-40 w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(draft.image_url)}
                      className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-card text-sm text-text-secondary">
                    No cover yet
                  </div>
                )}
                <div className="flex flex-col justify-center gap-2">
                  <p className="text-sm font-medium text-text-primary">Cover image</p>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={Boolean(uploading) || saving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file, "cover");
                    }}
                    className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Gallery</p>
                <label className="cursor-pointer text-sm font-medium text-primary">
                  {uploading === "gallery" ? "Uploading…" : "Add photos"}
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    disabled={Boolean(uploading) || saving}
                    className="hidden"
                    onChange={async (event) => {
                      const files = Array.from(event.target.files ?? []);
                      for (const file of files) await uploadImage(file, "gallery");
                    }}
                  />
                </label>
              </div>
              {gallery.length === 0 ? (
                <p className="text-sm text-text-secondary">No extra photos yet.</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2">
                  {gallery.map((url) => (
                    <li key={url} className="relative overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-20 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(url)}
                        className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Contact phone</span>
              <input
                value={draft.contact_phone}
                onChange={(e) => setDraft({ ...draft, contact_phone: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-text-secondary">Contact email</span>
              <input
                value={draft.contact_email}
                onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-text-secondary">Owner name</span>
              <input
                value={draft.owner_name}
                onChange={(e) => setDraft({ ...draft, owner_name: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-text-secondary">Description</span>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
      ) : null}
    </AdminModal>
  );
}
