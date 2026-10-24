"use client";

import type { LucideIcon } from "lucide-react";
import {
  Aperture,
  Captions,
  Clapperboard,
  Layers,
  MoreHorizontal,
  Music2,
  Scissors,
  SlidersHorizontal,
  Sticker,
  Type,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaEditToolId =
  | "edit"
  | "sound"
  | "text"
  | "effect"
  | "magic"
  | "caption"
  | "overlay"
  | "stickers"
  | "filters"
  | "adjust"
  | "more";

type ToolDef = {
  id: MediaEditToolId;
  label: string;
  icon: LucideIcon;
  live: boolean;
};

const TOOLS: ToolDef[] = [
  { id: "edit", label: "Edit", icon: Scissors, live: true },
  { id: "sound", label: "Sound", icon: Music2, live: true },
  { id: "text", label: "Text", icon: Type, live: true },
  { id: "effect", label: "Effect", icon: Clapperboard, live: false },
  { id: "magic", label: "Magic", icon: Wand2, live: false },
  { id: "caption", label: "Caption", icon: Captions, live: true },
  { id: "overlay", label: "Overlay", icon: Layers, live: false },
  { id: "stickers", label: "Stickers", icon: Sticker, live: false },
  { id: "filters", label: "Filters", icon: Aperture, live: false },
  { id: "adjust", label: "Adjust", icon: SlidersHorizontal, live: false },
  { id: "more", label: "More", icon: MoreHorizontal, live: false },
];

const SOON_COPY: Partial<Record<MediaEditToolId, string>> = {
  effect: "Video effects are coming soon.",
  magic: "AI magic edits are coming soon.",
  overlay: "Image overlays are coming soon.",
  stickers: "Stickers are coming soon.",
  filters: "Color filters are coming soon.",
  adjust: "Brightness and color adjust are coming soon.",
  more: "More creator tools are on the way.",
};

type MediaEditTrayProps = {
  disabled?: boolean;
  activeTool?: MediaEditToolId | null;
  soonTool?: MediaEditToolId | null;
  onTool: (id: MediaEditToolId) => void;
  onDismissSoon?: () => void;
  className?: string;
};

export function MediaEditTray({
  disabled,
  activeTool,
  soonTool,
  onTool,
  onDismissSoon,
  className,
}: MediaEditTrayProps) {
  const soonMessage =
    soonTool && !TOOLS.find((t) => t.id === soonTool)?.live
      ? SOON_COPY[soonTool] || "Coming soon."
      : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="overflow-x-auto [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden">
        <div
          role="toolbar"
          aria-label="Media edit tools"
          className="flex min-w-min items-end gap-1 rounded-2xl border border-border bg-zinc-950 px-2 py-2.5 text-white"
        >
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                disabled={disabled}
                title={tool.live ? tool.label : `${tool.label} · Coming soon`}
                aria-label={tool.live ? tool.label : `${tool.label}, coming soon`}
                aria-pressed={isActive}
                onClick={() => onTool(tool.id)}
                className={cn(
                  "group relative flex w-14 shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                  "disabled:opacity-40",
                  isActive ? "bg-white/15" : "hover:bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full",
                    tool.live ? "bg-white/10" : "bg-white/5",
                  )}
                >
                  <Icon className={cn("h-4 w-4", tool.live ? "text-white" : "text-white/55")} />
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none",
                    tool.live ? "text-white/90" : "text-white/45",
                  )}
                >
                  {tool.label}
                </span>
                {!tool.live ? (
                  <span className="absolute -right-0.5 -top-0.5 rounded-full bg-amber-400 px-1 text-[8px] font-bold uppercase tracking-wide text-zinc-950">
                    Soon
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {soonMessage ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
        >
          <p>{soonMessage}</p>
          {onDismissSoon ? (
            <button
              type="button"
              className="shrink-0 font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
              onClick={onDismissSoon}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function isLiveMediaEditTool(id: MediaEditToolId) {
  return TOOLS.some((t) => t.id === id && t.live);
}
