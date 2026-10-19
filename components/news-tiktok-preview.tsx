"use client";

import type { NewsStoryMedia } from "@/lib/news-media";
import { toBackendMediaUrl } from "@/lib/spojex-media";

type NewsTikTokPreviewProps = {
  title?: string;
  body?: string;
  /** Publishing organization shown as the bold poster line. */
  organizationName?: string;
  /** Optional credit under the org — hidden when empty. */
  source?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  mediaKind?: NewsStoryMedia;
  likeCount?: number;
  commentCount?: number;
  saveCount?: number;
  shareCount?: number;
  className?: string;
};

function formatCount(value: number) {
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}K`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function RailButton({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-white">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-lg shadow-sm">
        {icon}
      </div>
      <span className="text-[10px] font-semibold drop-shadow">{label}</span>
    </div>
  );
}

/**
 * Phone-shaped TikTok / Sport Shorts preview for admin news.
 * ~9:16 frame so editors see how the story fills a phone screen.
 */
export function NewsTikTokPreview({
  title = "",
  body = "",
  organizationName = "",
  source = "",
  imageUrl = "",
  videoUrl = "",
  audioUrl = "",
  mediaKind = "none",
  likeCount = 0,
  commentCount = 0,
  saveCount = 0,
  shareCount = 0,
  className = "",
}: NewsTikTokPreviewProps) {
  const image = toBackendMediaUrl(imageUrl);
  const video = toBackendMediaUrl(videoUrl);
  const audio = toBackendMediaUrl(audioUrl);
  const org =
    organizationName.trim() || source.trim() || "SpoJex";
  const sourceLine = (() => {
    const s = source.trim();
    if (!s) return "";
    if (s.toLowerCase() === org.toLowerCase()) return "";
    return s;
  })();
  const caption = [title.trim(), body.trim()].filter(Boolean).join(" — ");
  const shortCaption =
    caption.length > 110 ? `${caption.slice(0, 108).trimEnd()}… more` : caption;
  const hasVideo = mediaKind === "video" && Boolean(video);
  const hasAudio = Boolean(audio) && (mediaKind === "audio" || Boolean(image));

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="mb-2 flex w-full max-w-[280px] items-center justify-between px-1">
        <p className="text-xs font-medium text-text-secondary">Phone preview</p>
        <p className="text-[10px] text-text-hint">9:16 · Sport Shorts</p>
      </div>

      {/* Device chrome */}
      <div className="relative w-[280px] shrink-0 rounded-[2rem] border-[10px] border-zinc-900 bg-zinc-900 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        {/* Notch */}
        <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />

        {/* Screen */}
        <div className="relative aspect-[9/16] overflow-hidden rounded-[1.35rem] bg-black">
          {hasVideo ? (
            <video
              src={video}
              poster={image || undefined}
              controls
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 px-6 text-center text-sm text-zinc-400">
              Add an image or video to preview
            </div>
          )}

          {/* Bottom fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

          {/* Caption */}
          <div className="absolute bottom-14 left-3 right-16 z-10 text-white">
            <p className="text-[13px] font-bold leading-tight drop-shadow">{org}</p>
            {shortCaption ? (
              <p className="mt-1 text-[12px] leading-snug text-white/95 drop-shadow">
                {shortCaption.includes("… more") ? (
                  <>
                    {shortCaption.replace(/… more$/, "… ")}
                    <span className="font-extrabold">more</span>
                  </>
                ) : (
                  shortCaption
                )}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-white/60">No caption yet</p>
            )}
            {sourceLine ? (
              <p className="mt-1 text-[10px] font-medium leading-tight text-white/75 drop-shadow">
                {sourceLine}
              </p>
            ) : null}
            {hasAudio && !hasVideo ? (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-white/80">
                <span aria-hidden>♪</span>
                <span className="truncate">Soundtrack playing</span>
              </p>
            ) : null}
          </div>

          {/* Action rail */}
          <div className="absolute bottom-16 right-2 z-10 flex flex-col items-center gap-3">
            <div className="mb-1 h-10 w-10 overflow-hidden rounded-full border-2 border-white bg-zinc-700">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <RailButton
              label={formatCount(likeCount)}
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                  <path d="M12 21s-7-4.6-9.5-9A5.5 5.5 0 0 1 12 6.2 5.5 5.5 0 0 1 21.5 12C19 16.4 12 21 12 21z" />
                </svg>
              }
            />
            <RailButton
              label={formatCount(commentCount)}
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                  <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                </svg>
              }
            />
            <RailButton
              label={formatCount(saveCount)}
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
                </svg>
              }
            />
            <RailButton
              label={formatCount(shareCount)}
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" aria-hidden>
                  <path d="M7 12l10-7v14L7 12z" />
                </svg>
              }
            />
          </div>

          {/* Home indicator */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-white/50" />
        </div>
      </div>

      {mediaKind === "audio" && audio && !image ? (
        <audio src={audio} controls className="mt-3 w-full max-w-[280px]" />
      ) : null}
      {hasAudio && image && !hasVideo ? (
        <audio src={audio} controls className="mt-3 w-full max-w-[280px]" />
      ) : null}
    </div>
  );
}

/** @deprecated Prefer NewsTikTokPreview — kept for call-site compatibility. */
export function NewsMediaPreview({
  imageUrl,
  videoUrl,
  audioUrl,
  mediaKind,
  title,
  body,
  source,
  likeCount,
  commentCount,
  saveCount,
  shareCount,
}: {
  imageUrl: string;
  videoUrl: string;
  audioUrl: string;
  mediaKind: NewsStoryMedia;
  title?: string;
  body?: string;
  source?: string;
  likeCount?: number;
  commentCount?: number;
  saveCount?: number;
  shareCount?: number;
}) {
  return (
    <NewsTikTokPreview
      imageUrl={imageUrl}
      videoUrl={videoUrl}
      audioUrl={audioUrl}
      mediaKind={mediaKind}
      title={title}
      body={body}
      source={source}
      likeCount={likeCount}
      commentCount={commentCount}
      saveCount={saveCount}
      shareCount={shareCount}
      className="mb-4"
    />
  );
}
