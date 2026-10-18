import { toBackendMediaUrl } from "@/lib/spojex-media";
import type { ServiceRow } from "@/lib/types";

/** Normalize services.images / cover_url for <img src> in admin. */
export function serviceImageUrls(row: Pick<ServiceRow, "images" | "cover_url"> | null | undefined): string[] {
  if (!row) return [];
  let raw: unknown = row.images;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = [];
    }
  }
  const urls: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) {
        const url = toBackendMediaUrl(item.trim());
        if (url) urls.push(url);
        continue;
      }
      if (item && typeof item === "object") {
        const nested = `${(item as { url?: unknown; publicUrl?: unknown; src?: unknown }).url ?? (item as { publicUrl?: unknown }).publicUrl ?? (item as { src?: unknown }).src ?? ""}`.trim();
        const url = toBackendMediaUrl(nested);
        if (url) urls.push(url);
      }
    }
  }
  const cover = toBackendMediaUrl(row.cover_url);
  if (cover && !urls.includes(cover)) urls.unshift(cover);
  return urls;
}

export function serviceCoverUrl(row: Pick<ServiceRow, "images" | "cover_url"> | null | undefined): string {
  return serviceImageUrls(row)[0] ?? "";
}

/** Rewrite cover_url + images on a service row for API responses. */
export function withServiceMediaUrls<T extends Record<string, unknown>>(row: T): T {
  const urls = serviceImageUrls({
    images: row.images,
    cover_url: typeof row.cover_url === "string" ? row.cover_url : null,
  });
  return {
    ...row,
    cover_url: urls[0] ?? row.cover_url ?? null,
    images: urls,
  };
}
