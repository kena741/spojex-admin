"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  Aperture,
  Captions,
  Clapperboard,
  Gauge,
  Layers,
  Mic2,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Sticker,
  Timer,
  Type,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import { cn } from "@/lib/utils";

type TrimResult = {
  publicUrl: string;
  durationSeconds: number | null;
};

export type VideoClipEditorProps = {
  videoUrl: string;
  articleId?: string | null;
  disabled?: boolean;
  onTrimmed: (result: TrimResult) => void | Promise<void>;
  onOpenSound?: () => void;
  onFocusCaption?: (field: "title" | "body") => void;
  soundtrackUrl?: string;
  soundtrackLabel?: string;
};

type ToolId =
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
  | "voice"
  | "speed"
  | "timer"
  | "beautify"
  | "more";

type ToolDef = {
  id: ToolId;
  label: string;
  icon: LucideIcon;
  kind: "live" | "preview" | "soon";
};

const TOOLS: ToolDef[] = [
  { id: "edit", label: "Edit", icon: Scissors, kind: "live" },
  { id: "sound", label: "Sound", icon: Music2, kind: "live" },
  { id: "text", label: "Text", icon: Type, kind: "preview" },
  { id: "effect", label: "Effect", icon: Clapperboard, kind: "preview" },
  { id: "magic", label: "Magic", icon: Wand2, kind: "preview" },
  { id: "caption", label: "Captions", icon: Captions, kind: "live" },
  { id: "overlay", label: "Overlay", icon: Layers, kind: "preview" },
  { id: "stickers", label: "Stickers", icon: Sticker, kind: "preview" },
  { id: "filters", label: "Filters", icon: Aperture, kind: "preview" },
  { id: "adjust", label: "Adjust", icon: SlidersHorizontal, kind: "preview" },
  { id: "voice", label: "Voice", icon: Mic2, kind: "preview" },
  { id: "speed", label: "Speed", icon: Gauge, kind: "preview" },
  { id: "timer", label: "Timer", icon: Timer, kind: "preview" },
  { id: "beautify", label: "Beautify", icon: Sparkles, kind: "preview" },
  { id: "more", label: "More", icon: MoreHorizontal, kind: "preview" },
];

const FILTERS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "Original", css: "none" },
  { id: "vivid", label: "Vivid", css: "saturate(1.45) contrast(1.08)" },
  { id: "warm", label: "Warm", css: "sepia(0.25) saturate(1.2) brightness(1.05)" },
  { id: "cool", label: "Cool", css: "hue-rotate(18deg) saturate(1.1) brightness(1.02)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.1)" },
  { id: "fade", label: "Fade", css: "contrast(0.9) brightness(1.08) saturate(0.85)" },
  { id: "cinema", label: "Cinema", css: "contrast(1.2) saturate(0.9) brightness(0.95)" },
  { id: "pop", label: "Pop", css: "saturate(1.6) contrast(1.15)" },
];

const EFFECTS: {
  id: string;
  label: string;
  filter: string;
  mirror?: boolean;
  anim?: "zoom" | "flash" | "shake";
  wash?: string;
}[] = [
  { id: "none", label: "None", filter: "" },
  { id: "vignette", label: "Vignette", filter: "", wash: "radial-gradient(circle, transparent 42%, rgba(0,0,0,0.72) 100%)" },
  { id: "dream", label: "Dream", filter: "blur(1.1px) brightness(1.06) saturate(1.15)" },
  { id: "zoom", label: "Zoom", filter: "", anim: "zoom" },
  { id: "flash", label: "Flash", filter: "", anim: "flash" },
  { id: "shake", label: "Shake", filter: "", anim: "shake" },
  { id: "mirror", label: "Mirror", filter: "", mirror: true },
  { id: "noir", label: "Noir", filter: "grayscale(1) contrast(1.25) brightness(0.92)", wash: "radial-gradient(circle, transparent 50%, rgba(0,0,0,0.55) 100%)" },
];

const OVERLAY_WASHES: { id: string; label: string; css: string }[] = [
  { id: "none", label: "None", css: "transparent" },
  { id: "pink", label: "Pink", css: "rgba(254, 44, 85, 0.28)" },
  { id: "teal", label: "Teal", css: "rgba(37, 244, 238, 0.22)" },
  { id: "gold", label: "Gold", css: "rgba(255, 214, 10, 0.22)" },
  { id: "night", label: "Night", css: "rgba(10, 20, 60, 0.35)" },
  { id: "warm", label: "Warm", css: "rgba(255, 120, 40, 0.22)" },
];

const BEAUTIFY_LEVELS: { id: string; label: string; strength: number }[] = [
  { id: "off", label: "Off", strength: 0 },
  { id: "soft", label: "Soft", strength: 1 },
  { id: "glow", label: "Glow", strength: 2 },
  { id: "max", label: "Max", strength: 3 },
];

const STICKERS = ["⚽", "🔥", "✨", "💪", "🏆", "❤️", "😂", "👏", "🎯", "⚡", "🌟", "🙌"];
const MAX_TEXT_LAYERS = 8;
const TEXT_SIZE_MIN = 12;
const TEXT_SIZE_MAX = 56;
const TEXT_COLORS = [
  "#FFFFFF",
  "#000000",
  "#FE2C55",
  "#25F4EE",
  "#FFD60A",
  "#FF9F0A",
  "#30D158",
  "#5E5CE6",
  "#FF375F",
  "#64D2FF",
] as const;

const BG_PRESETS = [
  { id: "none", label: "None", bg: "transparent", bgOpacity: 0 },
  { id: "dark", label: "Dark", bg: "#000000", bgOpacity: 55 },
  { id: "light", label: "Light", bg: "#FFFFFF", bgOpacity: 85 },
  { id: "pink", label: "Pink", bg: "#FE2C55", bgOpacity: 90 },
  { id: "teal", label: "Teal", bg: "#25F4EE", bgOpacity: 85 },
] as const;

type TextStyleTab = "fill" | "bg" | "stroke";

type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  bg: string;
  bgOpacity: number;
  stroke: string;
  strokeWidth: number;
};

function newTextLayer(
  partial: Pick<TextLayer, "id" | "text" | "y"> & Partial<TextLayer>,
): TextLayer {
  return {
    x: 50,
    size: 18,
    color: "#FFFFFF",
    bg: "#000000",
    bgOpacity: 55,
    stroke: "transparent",
    strokeWidth: 0,
    ...partial,
  };
}

function hexToRgba(hex: string, opacityPct: number) {
  if (!hex || hex === "transparent") return "transparent";
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => `${c}${c}`)
          .join("")
      : raw;
  if (full.length !== 6) return hex;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, opacityPct / 100))})`;
}

function textLayerStyle(layer: TextLayer): CSSProperties {
  const strokeOn = layer.strokeWidth > 0 && layer.stroke !== "transparent";
  return {
    color: layer.color,
    fontSize: `${layer.size}px`,
    backgroundColor: hexToRgba(layer.bg, layer.bgOpacity),
    WebkitTextStroke: strokeOn ? `${layer.strokeWidth}px ${layer.stroke}` : "0 transparent",
    paintOrder: strokeOn ? "stroke fill" : undefined,
    textShadow:
      !strokeOn && layer.color === "#000000"
        ? "0 1px 2px rgba(255,255,255,0.35)"
        : !strokeOn
          ? "0 1px 3px rgba(0,0,0,0.55)"
          : "none",
  };
}

function ColorSwatches({
  value,
  onChange,
  allowNone,
  noneLabel = "None",
}: {
  value: string;
  onChange: (color: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const isNone = value === "transparent";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone ? (
        <button
          type="button"
          title={noneLabel}
          aria-label={noneLabel}
          onClick={() => onChange("transparent")}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full border-2 text-[9px] font-bold text-white/70",
            isNone ? "border-[#25F4EE] bg-white/20" : "border-white/25 bg-white/5 hover:border-white/45",
          )}
        >
          Ø
        </button>
      ) : null}
      {TEXT_COLORS.map((swatch) => (
        <button
          key={swatch}
          type="button"
          title={swatch}
          aria-label={`Color ${swatch}`}
          onClick={() => onChange(swatch)}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition",
            value === swatch ? "scale-110 border-[#25F4EE]" : "border-white/20 hover:border-white/50",
          )}
          style={{ backgroundColor: swatch }}
        />
      ))}
      <label
        className="relative grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/30"
        title="Custom color"
      >
        <span className="sr-only">Custom color</span>
        <span
          className="absolute inset-1 rounded-full"
          style={{
            background:
              isNone || !value
                ? "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)"
                : value,
          }}
        />
        <input
          type="color"
          value={isNone || !value.startsWith("#") ? "#ffffff" : value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

async function applyServerTrim(
  articleId: string | null | undefined,
  videoUrl: string,
  start: number,
  end: number,
): Promise<TrimResult> {
  const endpoint = articleId
    ? `/api/admin/news/${articleId}/media`
    : "/api/admin/news/media";
  const body = new FormData();
  body.set("action", "trim");
  body.set("source_url", videoUrl);
  body.set("start_seconds", String(start));
  body.set("end_seconds", String(end));
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as {
        error?: string;
        publicUrl?: string;
        durationSeconds?: number | null;
      })
    : {};
  if (!response.ok) throw new Error(payload.error || "Trim failed");
  if (!payload.publicUrl) throw new Error("Trim failed. No URL returned.");
  return {
    publicUrl: toBackendMediaUrl(payload.publicUrl),
    durationSeconds:
      typeof payload.durationSeconds === "number"
        ? payload.durationSeconds
        : Math.max(0, Math.round(end - start)),
  };
}

export function VideoClipEditor({
  videoUrl,
  articleId = null,
  disabled,
  onTrimmed,
  onOpenSound,
  onFocusCaption,
  soundtrackUrl = "",
  soundtrackLabel = "",
}: VideoClipEditorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const soundtrackRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [drag, setDrag] = useState<"start" | "end" | "playhead" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const hasSoundtrack = Boolean(soundtrackUrl.trim());
  const soundtrackSrc = useMemo(
    () => (hasSoundtrack ? toBackendMediaUrl(soundtrackUrl) : ""),
    [hasSoundtrack, soundtrackUrl],
  );
  const [tool, setTool] = useState<ToolId>("edit");
  const [filterId, setFilterId] = useState("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [textDraggingId, setTextDraggingId] = useState<string | null>(null);
  const [textResizingId, setTextResizingId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [textStyleTab, setTextStyleTab] = useState<TextStyleTab>("fill");
  const [sticker, setSticker] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [effectId, setEffectId] = useState("none");
  const [overlayWashId, setOverlayWashId] = useState("none");
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlayImageUrl, setOverlayImageUrl] = useState("");
  const [beautifyId, setBeautifyId] = useState("off");
  const [keepOriginalVoice, setKeepOriginalVoice] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(100);
  const [musicVolume, setMusicVolume] = useState(100);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [magicApplied, setMagicApplied] = useState(false);
  const textResizeStartRef = useRef<{ size: number; x: number } | null>(null);
  const overlayFileRef = useRef<HTMLInputElement | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const src = useMemo(() => toBackendMediaUrl(videoUrl), [videoUrl]);
  const activeEffect = EFFECTS.find((e) => e.id === effectId) || EFFECTS[0];
  const beautifyStrength =
    BEAUTIFY_LEVELS.find((b) => b.id === beautifyId)?.strength ?? 0;
  const filterCss = useMemo(() => {
    const base = FILTERS.find((f) => f.id === filterId)?.css || "none";
    const adjust = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturate / 100})`;
    const effectFilter = activeEffect.filter;
    const beautify =
      beautifyStrength <= 0
        ? ""
        : beautifyStrength === 1
          ? "blur(0.35px) brightness(1.04) saturate(1.08)"
          : beautifyStrength === 2
            ? "blur(0.7px) brightness(1.07) saturate(1.12) contrast(1.04)"
            : "blur(1.1px) brightness(1.1) saturate(1.18) contrast(1.06)";
    return [base === "none" ? "" : base, adjust, effectFilter, beautify]
      .filter(Boolean)
      .join(" ");
  }, [activeEffect.filter, beautifyStrength, brightness, contrast, filterId, saturate]);

  useEffect(() => {
    setStart(0);
    setEnd(0);
    setDuration(0);
    setCurrent(0);
    setError(null);
    setPlaying(false);
  }, [videoUrl]);

  useEffect(() => {
    if (duration > 0 && end <= 0) setEnd(duration);
  }, [duration, end]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const bed = soundtrackRef.current;
    if (!bed || !soundtrackSrc) return;
    bed.pause();
    bed.currentTime = 0;
    if (playing && videoRef.current && !videoRef.current.paused) {
      void bed.play().catch(() => undefined);
    }
  }, [playing, soundtrackSrc]);

  useEffect(() => {
    const video = videoRef.current;
    const bed = soundtrackRef.current;
    if (!video) return;
    if (hasSoundtrack) {
      video.muted = muted || !keepOriginalVoice;
      video.volume = Math.min(1, Math.max(0, voiceVolume / 100));
      if (bed) {
        bed.muted = muted;
        bed.volume = Math.min(1, Math.max(0, musicVolume / 100));
      }
    } else {
      video.muted = muted;
      video.volume = Math.min(1, Math.max(0, voiceVolume / 100));
      bed?.pause();
    }
  }, [hasSoundtrack, keepOriginalVoice, muted, musicVolume, voiceVolume]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (overlayImageUrl.startsWith("blob:")) URL.revokeObjectURL(overlayImageUrl);
    };
  }, [overlayImageUrl]);

  const syncSoundtrack = useCallback(
    (action: "play" | "pause" | "seek", time?: number) => {
      const bed = soundtrackRef.current;
      if (!bed || !hasSoundtrack) return;
      if (typeof time === "number" && Number.isFinite(time)) {
        try {
          bed.currentTime = Math.max(0, time - start);
        } catch {
          /* ignore seek race */
        }
      }
      if (action === "play") void bed.play().catch(() => undefined);
      if (action === "pause") bed.pause();
    },
    [hasSoundtrack, start],
  );

  const clipLength = Math.max(0, end - start);
  const canTrim =
    !disabled &&
    !saving &&
    duration > 0 &&
    end > start + 0.25 &&
    (start > 0.05 || end < duration - 0.05);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const t = timeFromClientX(event.clientX);
      if (drag === "start") {
        const next = Math.min(t, end - 0.25);
        setStart(Math.max(0, next));
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, next);
      } else if (drag === "end") {
        const next = Math.max(t, start + 0.25);
        setEnd(Math.min(duration, next));
        if (videoRef.current) videoRef.current.currentTime = Math.min(duration, next);
      } else {
        setCurrent(t);
        if (videoRef.current) videoRef.current.currentTime = t;
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, duration, end, start, timeFromClientX]);

  const startPlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    void el.play().then(() => syncSoundtrack("play", el.currentTime));
  }, [syncSoundtrack]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      syncSoundtrack("pause");
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setCountdown(null);
      return;
    }
    if (timerSeconds > 0 && countdown == null) {
      let left = timerSeconds;
      setCountdown(left);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCountdown(null);
          startPlayback();
          return;
        }
        setCountdown(left);
      }, 1000);
      return;
    }
    startPlayback();
  };

  const seekBy = (delta: number) => {
    const el = videoRef.current;
    if (!el || duration <= 0) return;
    const next = Math.min(duration, Math.max(0, el.currentTime + delta));
    el.currentTime = next;
    setCurrent(next);
    syncSoundtrack(el.paused ? "seek" : "play", next);
  };

  const previewSelection = () => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = start;
    syncSoundtrack("seek", start);
    void el.play().then(() => syncSoundtrack("play", start));
    const stopAt = end;
    const onTime = () => {
      if (el.currentTime >= stopAt) {
        el.pause();
        syncSoundtrack("pause");
        el.removeEventListener("timeupdate", onTime);
      }
    };
    el.addEventListener("timeupdate", onTime);
  };

  const applyTrim = async () => {
    if (!canTrim) return;
    setSaving(true);
    setError(null);
    try {
      const result = await applyServerTrim(articleId, videoUrl, start, end);
      await onTrimmed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trim failed");
    } finally {
      setSaving(false);
    }
  };

  const resetLook = () => {
    setFilterId("none");
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setTextLayers([]);
    setSelectedTextId(null);
    setTextDraft("");
    setSticker(null);
    setSpeed(1);
    setEffectId("none");
    setOverlayWashId("none");
    setOverlayOpacity(100);
    if (overlayImageUrl.startsWith("blob:")) URL.revokeObjectURL(overlayImageUrl);
    setOverlayImageUrl("");
    setBeautifyId("off");
    setKeepOriginalVoice(false);
    setVoiceVolume(100);
    setMusicVolume(100);
    setTimerSeconds(0);
    setCountdown(null);
    setMagicApplied(false);
  };

  const applyMagic = () => {
    setBrightness(108);
    setContrast(112);
    setSaturate(118);
    setFilterId("vivid");
    setBeautifyId("soft");
    setEffectId("vignette");
    setMagicApplied(true);
    setTool("magic");
  };

  const addTextLayer = () => {
    if (textLayers.length >= MAX_TEXT_LAYERS) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const text = textDraft.trim() || "Text";
    const layer = newTextLayer({
      id,
      text: text.slice(0, 80),
      y: Math.min(78, 22 + textLayers.length * 10),
    });
    setTextLayers((prev) => [...prev, layer]);
    setSelectedTextId(id);
    setTextDraft("");
    setTool("text");
  };

  const patchSelectedText = (patch: Partial<TextLayer>) => {
    if (!selectedTextId) return;
    setTextLayers((prev) =>
      prev.map((layer) =>
        layer.id === selectedTextId ? { ...layer, ...patch } : layer,
      ),
    );
  };

  const updateSelectedText = (value: string) => {
    patchSelectedText({ text: value.slice(0, 80) });
  };

  const removeSelectedText = () => {
    if (!selectedTextId) return;
    setTextLayers((prev) => prev.filter((layer) => layer.id !== selectedTextId));
    setSelectedTextId(null);
  };

  const selectedText = textLayers.find((l) => l.id === selectedTextId) ?? null;

  useEffect(() => {
    if (!textDraggingId || textResizingId) return;
    const onMove = (event: PointerEvent) => {
      const box = stageBoxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(92, Math.max(8, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(90, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100));
      setTextLayers((prev) =>
        prev.map((layer) =>
          layer.id === textDraggingId ? { ...layer, x, y } : layer,
        ),
      );
    };
    const onUp = () => setTextDraggingId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [textDraggingId, textResizingId]);

  useEffect(() => {
    if (!textResizingId) return;
    const onMove = (event: PointerEvent) => {
      const start = textResizeStartRef.current;
      if (!start) return;
      const delta = event.clientX - start.x;
      const next = Math.min(
        TEXT_SIZE_MAX,
        Math.max(TEXT_SIZE_MIN, Math.round(start.size + delta * 0.35)),
      );
      setTextLayers((prev) =>
        prev.map((layer) =>
          layer.id === textResizingId ? { ...layer, size: next } : layer,
        ),
      );
    };
    const onUp = () => {
      setTextResizingId(null);
      textResizeStartRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [textResizingId]);

  const selectTool = (id: ToolId) => {
    setTool(id);
    if (id === "sound") onOpenSound?.();
    if (id === "caption") onFocusCaption?.("body");
  };

  const active = TOOLS.find((t) => t.id === tool) || TOOLS[0];
  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (end / duration) * 100 : 100;
  const playPct = duration > 0 ? (current / duration) * 100 : 0;

  const iconBtn =
    "inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold tracking-wide">Studio</p>
          <p className="text-[11px] text-white/50">
            9:16 ·{" "}
            {duration > 0
              ? `${formatTime(clipLength)} keep · ${formatTime(duration)} full`
              : "loading…"}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={resetLook}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/15"
        >
          <RotateCcw className="h-3 w-3" />
          Reset look
        </button>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_56px]">
        <div className="space-y-3">
          <div className="flex justify-center rounded-xl bg-black p-2">
            <div
              ref={stageBoxRef}
              className="relative w-full max-w-65 overflow-hidden rounded-xl bg-zinc-900 shadow-inner"
              style={{ aspectRatio: "9 / 16" }}
            >
              <style>{`
                @keyframes spojex-zoom { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
                @keyframes spojex-flash { 0%,100%{opacity:1} 40%{opacity:0.55} 55%{opacity:1} }
                @keyframes spojex-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-2px)} 75%{transform:translateX(2px)} }
              `}</style>
              <video
                ref={videoRef}
                key={src}
                src={src}
                playsInline
                muted={hasSoundtrack ? muted || !keepOriginalVoice : muted}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  filter: filterCss || undefined,
                  transform: activeEffect.mirror ? "scaleX(-1)" : undefined,
                  animation:
                    activeEffect.anim === "zoom"
                      ? "spojex-zoom 2.6s ease-in-out infinite"
                      : activeEffect.anim === "flash"
                        ? "spojex-flash 1.4s ease-in-out infinite"
                        : activeEffect.anim === "shake"
                          ? "spojex-shake 0.35s linear infinite"
                          : undefined,
                }}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (!Number.isFinite(d) || d <= 0) return;
                  setDuration(d);
                  setEnd((prev) => (prev > 0 && prev <= d ? prev : d));
                }}
                onTimeUpdate={(e) => {
                  setCurrent(e.currentTarget.currentTime);
                  const bed = soundtrackRef.current;
                  if (bed && hasSoundtrack && !bed.paused) {
                    const expected = Math.max(0, e.currentTarget.currentTime - start);
                    if (Math.abs(bed.currentTime - expected) > 0.35) {
                      try {
                        bed.currentTime = expected;
                      } catch {
                        /* ignore */
                      }
                    }
                  }
                }}
                onPlay={() => {
                  setPlaying(true);
                  syncSoundtrack("play", videoRef.current?.currentTime);
                }}
                onPause={() => {
                  setPlaying(false);
                  syncSoundtrack("pause");
                }}
              />
              {soundtrackSrc ? (
                <audio
                  ref={soundtrackRef}
                  key={soundtrackSrc}
                  src={soundtrackSrc}
                  preload="auto"
                  muted={muted}
                />
              ) : null}

              {hasSoundtrack ? (
                <button
                  type="button"
                  onClick={onOpenSound}
                  className="absolute left-2 top-2 z-20 inline-flex max-w-[85%] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
                >
                  <Music2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {soundtrackLabel.trim() || "Soundtrack on"}
                  </span>
                </button>
              ) : null}

              {textLayers.map((layer) => {
                const selected = selectedTextId === layer.id && tool === "text";
                return (
                  <div
                    key={layer.id}
                    className={cn(
                      "absolute z-30 max-w-[80%] -translate-x-1/2 -translate-y-1/2 touch-none",
                      selected ? "z-40" : "",
                    )}
                    style={{ left: `${layer.x}%`, top: `${layer.y}%` }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "cursor-grab rounded-xl px-3 py-1.5 text-left font-bold leading-snug shadow-lg backdrop-blur-[2px] active:cursor-grabbing",
                        selected
                          ? "ring-2 ring-[#25F4EE] ring-offset-1 ring-offset-transparent"
                          : "",
                      )}
                      style={textLayerStyle(layer)}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setTool("text");
                        setSelectedTextId(layer.id);
                        setTextDraggingId(layer.id);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setTool("text");
                        setSelectedTextId(layer.id);
                      }}
                    >
                      {layer.text || "Text"}
                    </button>
                    {selected ? (
                      <button
                        type="button"
                        aria-label="Resize text"
                        title="Drag to resize"
                        className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-zinc-950 bg-[#25F4EE] shadow"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setTextDraggingId(null);
                          setSelectedTextId(layer.id);
                          textResizeStartRef.current = {
                            size: layer.size,
                            x: event.clientX,
                          };
                          setTextResizingId(layer.id);
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}

              {sticker ? (
                <div className="pointer-events-none absolute bottom-[22%] right-3 z-10 text-4xl drop-shadow-lg">
                  {sticker}
                </div>
              ) : null}

              {activeEffect.wash ? (
                <div
                  className="pointer-events-none absolute inset-0 z-5"
                  style={{ background: activeEffect.wash }}
                />
              ) : null}

              {overlayWashId !== "none" ? (
                <div
                  className="pointer-events-none absolute inset-0 z-6"
                  style={{
                    backgroundColor:
                      OVERLAY_WASHES.find((w) => w.id === overlayWashId)?.css ||
                      "transparent",
                    opacity: overlayOpacity / 100,
                  }}
                />
              ) : null}

              {overlayImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={overlayImageUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 z-7 h-full w-full object-cover"
                  style={{ opacity: (overlayOpacity / 100) * 0.55 }}
                />
              ) : null}

              {countdown != null ? (
                <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/45">
                  <span className="text-6xl font-black tabular-nums text-white drop-shadow-lg">
                    {countdown}
                  </span>
                </div>
              ) : null}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/70 via-black/20 to-transparent px-3 pb-3 pt-10">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/60">
                  {active.label}
                  {active.kind === "preview" ? " · preview" : ""}
                </p>
              </div>

              {tool !== "text" ? (
                <button
                  type="button"
                  disabled={disabled || saving || duration <= 0}
                  onClick={togglePlay}
                  className="absolute left-1/2 top-1/2 z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 pl-0.5" />}
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={disabled || saving || duration <= 0}
              onClick={() => seekBy(-2)}
              className={iconBtn}
              aria-label="Back 2 seconds"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || saving || duration <= 0}
              onClick={togglePlay}
              className={cn(iconBtn, "h-12 w-12 bg-white text-zinc-950 hover:bg-white/90")}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 pl-0.5" />}
            </button>
            <button
              type="button"
              disabled={disabled || saving || duration <= 0}
              onClick={() => seekBy(2)}
              className={iconBtn}
              aria-label="Forward 2 seconds"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => {
                setMuted((v) => !v);
              }}
              className={iconBtn}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div
          role="toolbar"
          aria-label="TikTok-style edit tools"
          className="flex max-h-105 flex-row gap-1 overflow-x-auto pb-1 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:pb-0"
        >
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const selected = tool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled || saving}
                title={item.label}
                aria-label={item.label}
                aria-pressed={selected}
                onClick={() => selectTool(item.id)}
                className={cn(
                  "relative flex w-12 shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                  selected ? "bg-white/15" : "hover:bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full",
                    selected ? "bg-white text-zinc-950" : "bg-white/10 text-white",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[9px] font-medium leading-none text-white/75">{item.label}</span>
                {item.kind === "soon" ? (
                  <span className="absolute right-0 top-0 rounded-full bg-amber-400 px-0.5 text-[7px] font-bold uppercase text-zinc-950">
                    Soon
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3">
        {tool === "edit" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || saving || duration <= 0}
                onClick={() => {
                  const t = Math.min(current, end - 0.25);
                  setStart(Math.max(0, t));
                }}
                className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
              >
                Set in
              </button>
              <button
                type="button"
                disabled={disabled || saving || duration <= 0}
                onClick={() => {
                  const t = Math.max(current, start + 0.25);
                  setEnd(Math.min(duration, t));
                }}
                className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
              >
                Set out
              </button>
              <button
                type="button"
                disabled={disabled || saving || duration <= 0 || end <= start}
                onClick={previewSelection}
                className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
              >
                Preview keep
              </button>
              <button
                type="button"
                disabled={!canTrim}
                onClick={() => void applyTrim()}
                className="ml-auto rounded-full bg-[#FE2C55] px-4 py-2 text-xs font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Apply trim"}
              </button>
            </div>

            <div className="space-y-1.5">
              <div
                ref={trackRef}
                className="relative h-12 cursor-pointer rounded-xl bg-white/10"
                onPointerDown={(event) => {
                  if (disabled || saving || duration <= 0) return;
                  const t = timeFromClientX(event.clientX);
                  setCurrent(t);
                  if (videoRef.current) videoRef.current.currentTime = t;
                  setDrag("playhead");
                }}
              >
                <div
                  className="absolute inset-y-1 rounded-lg bg-[#25F4EE]/35"
                  style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 z-10 w-0.5 bg-white"
                  style={{ left: `${playPct}%` }}
                />
                <button
                  type="button"
                  aria-label="Trim start"
                  className="absolute top-0 bottom-0 z-20 w-3.5 -translate-x-1/2 cursor-ew-resize rounded-md bg-[#25F4EE]"
                  style={{ left: `${startPct}%` }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (disabled || saving) return;
                    setDrag("start");
                  }}
                />
                <button
                  type="button"
                  aria-label="Trim end"
                  className="absolute top-0 bottom-0 z-20 w-3.5 -translate-x-1/2 cursor-ew-resize rounded-md bg-[#25F4EE]"
                  style={{ left: `${endPct}%` }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (disabled || saving) return;
                    setDrag("end");
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/55">
                <span>In {formatTime(start)}</span>
                <span>{formatTime(current)}</span>
                <span>Out {formatTime(end)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {tool === "filters" ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterId(f.id)}
                className={cn(
                  "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                  filterId === f.id
                    ? "border-white bg-white text-zinc-950"
                    : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}

        {tool === "adjust" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Brightness", brightness, setBrightness],
                ["Contrast", contrast, setContrast],
                ["Saturation", saturate, setSaturate],
              ] as const
            ).map(([label, value, setValue]) => (
              <label key={label} className="block text-[11px] text-white/70">
                <span className="mb-1 flex justify-between">
                  {label}
                  <span className="tabular-nums text-white/50">{value}%</span>
                </span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="w-full accent-[#FE2C55]"
                />
              </label>
            ))}
          </div>
        ) : null}

        {tool === "text" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={selectedText ? selectedText.text : textDraft}
                onChange={(e) => {
                  const value = e.target.value.slice(0, 80);
                  if (selectedTextId) updateSelectedText(value);
                  else setTextDraft(value);
                }}
                placeholder={selectedTextId ? "Edit selected text…" : "Type text, then Add"}
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !selectedTextId) {
                    e.preventDefault();
                    addTextLayer();
                  }
                }}
              />
              {selectedTextId ? (
                <button
                  type="button"
                  onClick={removeSelectedText}
                  className="rounded-xl bg-white/10 px-3 text-xs font-semibold text-rose-200 hover:bg-white/15"
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  disabled={textLayers.length >= MAX_TEXT_LAYERS}
                  onClick={addTextLayer}
                  className="rounded-xl bg-[#FE2C55] px-3 text-xs font-bold text-white hover:brightness-110 disabled:opacity-40"
                >
                  Add
                </button>
              )}
            </div>

            {selectedText ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/4 p-3">
                <div className="flex gap-1 rounded-xl bg-black/35 p-1">
                  {(
                    [
                      ["fill", "Fill"],
                      ["bg", "Background"],
                      ["stroke", "Stroke"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTextStyleTab(id)}
                      className={cn(
                        "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition",
                        textStyleTab === id
                          ? "bg-white text-zinc-950"
                          : "text-white/60 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="block text-[11px] text-white/70">
                  <span className="mb-1 flex justify-between">
                    Size
                    <span className="tabular-nums text-white/45">{selectedText.size}px</span>
                  </span>
                  <input
                    type="range"
                    min={TEXT_SIZE_MIN}
                    max={TEXT_SIZE_MAX}
                    value={selectedText.size}
                    onChange={(e) =>
                      patchSelectedText({ size: Number(e.target.value) })
                    }
                    className="w-full accent-[#25F4EE]"
                  />
                </label>

                {textStyleTab === "fill" ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-white/70">Text color</p>
                    <ColorSwatches
                      value={selectedText.color}
                      onChange={(color) => patchSelectedText({ color })}
                    />
                  </div>
                ) : null}

                {textStyleTab === "bg" ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {BG_PRESETS.map((preset) => {
                        const active =
                          selectedText.bg === preset.bg &&
                          (preset.bg === "transparent"
                            ? selectedText.bgOpacity === 0
                            : Math.abs(selectedText.bgOpacity - preset.bgOpacity) <= 5);
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              patchSelectedText({
                                bg: preset.bg,
                                bgOpacity: preset.bgOpacity,
                              })
                            }
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              active
                                ? "bg-white text-zinc-950"
                                : "bg-white/10 text-white/75 hover:bg-white/15",
                            )}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-white/70">Background color</p>
                      <ColorSwatches
                        value={selectedText.bg}
                        allowNone
                        noneLabel="No background"
                        onChange={(bg) =>
                          patchSelectedText({
                            bg,
                            bgOpacity: bg === "transparent" ? 0 : Math.max(selectedText.bgOpacity, 55),
                          })
                        }
                      />
                    </div>
                    {selectedText.bg !== "transparent" ? (
                      <label className="block text-[11px] text-white/70">
                        <span className="mb-1 flex justify-between">
                          Opacity
                          <span className="tabular-nums text-white/45">
                            {selectedText.bgOpacity}%
                          </span>
                        </span>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={selectedText.bgOpacity}
                          onChange={(e) =>
                            patchSelectedText({ bgOpacity: Number(e.target.value) })
                          }
                          className="w-full accent-[#25F4EE]"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {textStyleTab === "stroke" ? (
                  <div className="space-y-2.5">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-white/70">Stroke color</p>
                      <ColorSwatches
                        value={selectedText.stroke}
                        allowNone
                        noneLabel="No stroke"
                        onChange={(stroke) =>
                          patchSelectedText({
                            stroke,
                            strokeWidth:
                              stroke === "transparent"
                                ? 0
                                : Math.max(selectedText.strokeWidth, 2),
                          })
                        }
                      />
                    </div>
                    {selectedText.stroke !== "transparent" ? (
                      <label className="block text-[11px] text-white/70">
                        <span className="mb-1 flex justify-between">
                          Thickness
                          <span className="tabular-nums text-white/45">
                            {selectedText.strokeWidth}px
                          </span>
                        </span>
                        <input
                          type="range"
                          min={1}
                          max={6}
                          value={Math.max(1, selectedText.strokeWidth)}
                          onChange={(e) =>
                            patchSelectedText({ strokeWidth: Number(e.target.value) })
                          }
                          className="w-full accent-[#25F4EE]"
                        />
                      </label>
                    ) : (
                      <p className="text-[11px] text-white/45">
                        Pick a stroke color for outline text.
                      </p>
                    )}
                  </div>
                ) : null}

                <div
                  className="rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-3 text-center"
                  aria-hidden
                >
                  <span
                    className="inline-block rounded-xl px-3 py-1.5 font-bold leading-snug"
                    style={textLayerStyle(selectedText)}
                  >
                    {selectedText.text || "Preview"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-[11px] text-white/45">
                Add text, then select it to style fill, background, and stroke.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={textLayers.length >= MAX_TEXT_LAYERS}
                onClick={() => {
                  const id =
                    typeof crypto !== "undefined" && "randomUUID" in crypto
                      ? crypto.randomUUID()
                      : `t-${Date.now()}`;
                  setTextLayers((prev) => [
                    ...prev,
                    newTextLayer({
                      id,
                      text: "Text",
                      y: Math.min(78, 22 + prev.length * 10),
                    }),
                  ]);
                  setSelectedTextId(id);
                  setTextDraft("");
                  setTextStyleTab("fill");
                }}
                className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/15 disabled:opacity-40"
              >
                + Another text
              </button>
              <span className="text-[11px] text-white/45">
                {textLayers.length}/{MAX_TEXT_LAYERS} · drag · corner resize · preview only
              </span>
            </div>
          </div>
        ) : null}

        {tool === "stickers" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {STICKERS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSticker((prev) => (prev === emoji ? null : emoji))}
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-xl text-xl transition",
                    sticker === emoji ? "bg-white/25 ring-2 ring-white" : "bg-white/10 hover:bg-white/15",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/45">Preview sticker. Tap again to remove.</p>
          </div>
        ) : null}

        {tool === "speed" ? (
          <div className="flex flex-wrap gap-2">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setSpeed(rate)}
                className={cn(
                  "rounded-full px-3 py-2 text-xs font-semibold",
                  speed === rate ? "bg-white text-zinc-950" : "bg-white/10 text-white/80 hover:bg-white/15",
                )}
              >
                {rate}x
              </button>
            ))}
          </div>
        ) : null}

        {tool === "sound" ? (
          <div className="space-y-2 text-xs text-white/70">
            <p>
              {hasSoundtrack
                ? "Track applied — play the clip to hear it (original video audio is muted)."
                : "Pick a track in the side panel. Panel stays open until Done."}
            </p>
            <button
              type="button"
              onClick={onOpenSound}
              className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15"
            >
              {hasSoundtrack ? "Change sound" : "Open library"}
            </button>
          </div>
        ) : null}

        {tool === "caption" ? (
          <p className="text-xs text-white/60">
            Jump to the post caption field below to write what appears on the feed.
          </p>
        ) : null}

        {tool === "effect" ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {EFFECTS.map((fx) => (
              <button
                key={fx.id}
                type="button"
                onClick={() => setEffectId(fx.id)}
                className={cn(
                  "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                  effectId === fx.id
                    ? "border-white bg-white text-zinc-950"
                    : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10",
                )}
              >
                {fx.label}
              </button>
            ))}
          </div>
        ) : null}

        {tool === "magic" ? (
          <div className="space-y-2">
            <p className="text-xs text-white/65">
              One-tap enhance: vivid look, soft beautify, and vignette.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyMagic}
                className="rounded-full bg-[#FE2C55] px-4 py-2 text-xs font-bold text-white hover:brightness-110"
              >
                {magicApplied ? "Apply magic again" : "Apply magic"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterId("none");
                  setBrightness(100);
                  setContrast(100);
                  setSaturate(100);
                  setBeautifyId("off");
                  setEffectId("none");
                  setMagicApplied(false);
                }}
                className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15"
              >
                Undo magic
              </button>
            </div>
          </div>
        ) : null}

        {tool === "overlay" ? (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {OVERLAY_WASHES.map((wash) => (
                <button
                  key={wash.id}
                  type="button"
                  onClick={() => setOverlayWashId(wash.id)}
                  className={cn(
                    "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold",
                    overlayWashId === wash.id
                      ? "border-white bg-white text-zinc-950"
                      : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10",
                  )}
                >
                  {wash.label}
                </button>
              ))}
            </div>
            <label className="block text-[11px] text-white/70">
              <span className="mb-1 flex justify-between">
                Strength
                <span className="tabular-nums text-white/45">{overlayOpacity}%</span>
              </span>
              <input
                type="range"
                min={20}
                max={100}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-full accent-[#25F4EE]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                ref={overlayFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (overlayImageUrl.startsWith("blob:")) {
                    URL.revokeObjectURL(overlayImageUrl);
                  }
                  setOverlayImageUrl(URL.createObjectURL(file));
                }}
              />
              <button
                type="button"
                onClick={() => overlayFileRef.current?.click()}
                className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15"
              >
                {overlayImageUrl ? "Replace image overlay" : "Add image overlay"}
              </button>
              {overlayImageUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    if (overlayImageUrl.startsWith("blob:")) {
                      URL.revokeObjectURL(overlayImageUrl);
                    }
                    setOverlayImageUrl("");
                  }}
                  className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-white/15"
                >
                  Clear image
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {tool === "voice" ? (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/80">
              <span>Keep original video audio</span>
              <input
                type="checkbox"
                checked={keepOriginalVoice}
                disabled={!hasSoundtrack}
                onChange={(e) => setKeepOriginalVoice(e.target.checked)}
                className="h-4 w-4 accent-[#FE2C55] disabled:opacity-40"
              />
            </label>
            {!hasSoundtrack ? (
              <p className="text-[11px] text-white/45">
                Add a soundtrack to mix original voice with music.
              </p>
            ) : null}
            <label className="block text-[11px] text-white/70">
              <span className="mb-1 flex justify-between">
                Original volume
                <span className="tabular-nums text-white/45">{voiceVolume}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={voiceVolume}
                disabled={hasSoundtrack && !keepOriginalVoice}
                onChange={(e) => setVoiceVolume(Number(e.target.value))}
                className="w-full accent-[#25F4EE] disabled:opacity-40"
              />
            </label>
            <label className="block text-[11px] text-white/70">
              <span className="mb-1 flex justify-between">
                Music volume
                <span className="tabular-nums text-white/45">{musicVolume}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={musicVolume}
                disabled={!hasSoundtrack}
                onChange={(e) => setMusicVolume(Number(e.target.value))}
                className="w-full accent-[#FE2C55] disabled:opacity-40"
              />
            </label>
          </div>
        ) : null}

        {tool === "timer" ? (
          <div className="space-y-2">
            <p className="text-xs text-white/65">Countdown before play starts.</p>
            <div className="flex flex-wrap gap-2">
              {[0, 3, 5, 10].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setTimerSeconds(sec);
                    setCountdown(null);
                  }}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-semibold",
                    timerSeconds === sec
                      ? "bg-white text-zinc-950"
                      : "bg-white/10 text-white/80 hover:bg-white/15",
                  )}
                >
                  {sec === 0 ? "Off" : `${sec}s`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tool === "beautify" ? (
          <div className="flex flex-wrap gap-2">
            {BEAUTIFY_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => setBeautifyId(level.id)}
                className={cn(
                  "rounded-full px-3 py-2 text-xs font-semibold",
                  beautifyId === level.id
                    ? "bg-white text-zinc-950"
                    : "bg-white/10 text-white/80 hover:bg-white/15",
                )}
              >
                {level.label}
              </button>
            ))}
          </div>
        ) : null}

        {tool === "more" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["filters", "Filters"],
                ["adjust", "Adjust"],
                ["effect", "Effects"],
                ["overlay", "Overlay"],
                ["text", "Text"],
                ["stickers", "Stickers"],
                ["voice", "Voice"],
                ["speed", "Speed"],
                ["timer", "Timer"],
                ["beautify", "Beautify"],
                ["magic", "Magic"],
                ["sound", "Sound"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTool(id);
                  if (id === "sound") onOpenSound?.();
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs font-semibold text-white/85 hover:bg-white/10"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
