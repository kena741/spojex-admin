"use client";

import type { ReactNode } from "react";
import { Play } from "lucide-react";
import {
  careerEntryLabel,
  careerPeriodLabel,
  formatEntryType,
  parseAchievements,
  parseCareerHistory,
  type AchievementEntry,
  type CareerEntry,
} from "@/lib/profile-docs";
import type { ProfileMediaRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function CareerHistorySection({ value }: { value: unknown }) {
  const entries = parseCareerHistory(value);
  if (entries.length === 0) {
    return <p className="text-sm text-text-secondary">No career entries yet.</p>;
  }
  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <CareerEntryCard key={entry.id ?? index} entry={entry} />
      ))}
    </div>
  );
}

export function AchievementsSection({ value }: { value: unknown }) {
  const entries = parseAchievements(value);
  if (entries.length === 0) {
    return <p className="text-sm text-text-secondary">No achievements yet.</p>;
  }
  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <AchievementEntryCard key={entry.id ?? index} entry={entry} />
      ))}
    </div>
  );
}

function CareerEntryCard({ entry }: { entry: CareerEntry }) {
  const stats = entry.stats;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">{careerEntryLabel(entry)}</p>
          <p className="text-xs text-text-secondary">
            {formatEntryType(entry.entry_type)}
            {entry.role?.league_or_competition ? ` · ${entry.role.league_or_competition}` : ""}
          </p>
        </div>
        <p className="text-xs text-text-hint">{careerPeriodLabel(entry)}</p>
      </div>
      {(entry.location?.city || entry.location?.country) && (
        <p className="mt-2 text-xs text-text-secondary">
          {[entry.location?.city, entry.location?.country].filter(Boolean).join(", ")}
        </p>
      )}
      {stats && (stats.matches_played || stats.goals || stats.assists) ? (
        <p className="mt-2 text-xs text-text-secondary">
          {stats.matches_played ?? 0} matches · {stats.goals ?? 0} goals · {stats.assists ?? 0} assists
        </p>
      ) : null}
      {entry.honours && entry.honours.length > 0 ? (
        <p className="mt-2 text-xs text-text-secondary">Honours: {entry.honours.join(", ")}</p>
      ) : null}
      {entry.summary ? <p className="mt-2 text-sm text-text-secondary">{entry.summary}</p> : null}
    </div>
  );
}

function AchievementEntryCard({ entry }: { entry: AchievementEntry }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">{entry.title || "Untitled"}</p>
          <p className="text-xs text-text-secondary">
            {formatEntryType(entry.category || "other")}
            {entry.organization ? ` · ${entry.organization}` : ""}
          </p>
        </div>
        {entry.year ? <p className="text-xs text-text-hint">{entry.year}</p> : null}
      </div>
      {entry.summary ? <p className="mt-2 text-sm text-text-secondary">{entry.summary}</p> : null}
    </div>
  );
}

export function DocCountBadge({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
      {label}: {count}
    </span>
  );
}

export function formatDob(value?: string | null) {
  if (!value) return "—";
  return formatDate(value);
}

export function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-text-primary">{value || "—"}</p>
    </div>
  );
}

export function DetailGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      {title ? <h4 className="text-xs font-semibold uppercase tracking-wide text-text-hint">{title}</h4> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function isVideoMedia(item: ProfileMediaRow) {
  return item.kind === "highlight" || item.mime_type.toLowerCase().startsWith("video/");
}

function MediaThumb({
  item,
  className,
  showPlay,
}: {
  item: ProfileMediaRow;
  className?: string;
  showPlay?: boolean;
}) {
  const video = isVideoMedia(item);
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={`relative block overflow-hidden rounded-xl border border-border bg-muted ${className ?? ""}`}
    >
      {video ? (
        <video
          src={item.url}
          muted
          preload="metadata"
          className="h-full min-h-[7.5rem] w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.title || "Profile media"} className="h-full w-full object-cover" />
      )}
      {(showPlay || video) && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm sm:h-14 sm:w-14">
            <Play className="ml-0.5 h-5 w-5 fill-text-primary text-text-primary sm:h-6 sm:w-6" />
          </span>
        </span>
      )}
    </a>
  );
}

/** Mosaic matching the app Highlights layout: large video left, photo stack right. */
export function HighlightsGallery({ items }: { items: ProfileMediaRow[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-secondary">No photos or highlight clips yet.</p>;
  }

  const videos = items.filter(isVideoMedia);
  const photos = items.filter((item) => !isVideoMedia(item));
  const feature = videos[0] ?? photos[0];
  const sidePhotos = (videos[0] ? photos : photos.slice(1)).slice(0, 3);
  const rest = items.filter((item) => item.id !== feature?.id && !sidePhotos.some((p) => p.id === item.id));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[2fr_1fr] md:items-stretch">
        {feature ? (
          <MediaThumb item={feature} className="aspect-[16/10] min-h-[11rem] md:h-full md:min-h-[14rem]" showPlay={isVideoMedia(feature)} />
        ) : null}
        <div className="grid gap-3">
          {sidePhotos[0] ? <MediaThumb item={sidePhotos[0]} className="aspect-[16/10] min-h-[5.5rem]" /> : null}
          {(sidePhotos[1] || sidePhotos[2]) && (
            <div className="grid grid-cols-2 gap-3">
              {sidePhotos[1] ? <MediaThumb item={sidePhotos[1]} className="aspect-square min-h-[5rem]" /> : <div />}
              {sidePhotos[2] ? <MediaThumb item={sidePhotos[2]} className="aspect-square min-h-[5rem]" /> : <div />}
            </div>
          )}
          {sidePhotos.length === 0 ? (
            <p className="flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-sm text-text-secondary">
              No still photos in this profile yet.
            </p>
          ) : null}
        </div>
      </div>
      {rest.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rest.map((item) => (
            <MediaThumb key={item.id} item={item} className="aspect-square" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
