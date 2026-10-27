"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toBackendMediaUrl } from "@/lib/spojex-media";

const PRESETS: { id: string; label: string; aspect: number | undefined }[] = [
  { id: "original", label: "Original", aspect: undefined },
  { id: "9:16", label: "9:16", aspect: 9 / 16 },
  { id: "4:5", label: "4:5", aspect: 4 / 5 },
  { id: "1:1", label: "1:1", aspect: 1 },
  { id: "16:9", label: "16:9", aspect: 16 / 9 },
];

type ImageCropDialogProps = {
  imageUrl: string;
  open: boolean;
  onClose: () => void;
  onApply: (file: File) => void | Promise<void>;
};

function cropSourceUrl(imageUrl: string) {
  const abs = toBackendMediaUrl(imageUrl);
  if (!abs) return "";
  // Same-origin proxy avoids canvas tainted / CORS failures on GCS URLs.
  if (abs.startsWith("blob:") || abs.startsWith("data:")) return abs;
  return `/api/admin/news/media/source?url=${encodeURIComponent(abs)}`;
}

async function cropToFile(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not crop image.");

  const rotRad = (rotation * Math.PI) / 180;
  const { width: bBoxWidth, height: bBoxHeight } = rotatedSize(
    image.width,
    image.height,
    rotRad,
  );
  const scratch = document.createElement("canvas");
  scratch.width = bBoxWidth;
  scratch.height = bBoxHeight;
  const sctx = scratch.getContext("2d");
  if (!sctx) throw new Error("Could not crop image.");
  sctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  sctx.rotate(rotRad);
  sctx.drawImage(image, -image.width / 2, -image.height / 2);

  canvas.width = Math.max(1, Math.round(pixelCrop.width));
  canvas.height = Math.max(1, Math.round(pixelCrop.height));
  ctx.drawImage(
    scratch,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Crop failed"))),
      "image/jpeg",
      0.92,
    );
  });
  return new File([blob], `crop-${Date.now()}.jpg`, { type: "image/jpeg" });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for crop."));
    img.src = src;
  });
}

function rotatedSize(width: number, height: number, rotationRad: number) {
  return {
    width: Math.abs(Math.cos(rotationRad) * width) + Math.abs(Math.sin(rotationRad) * height),
    height: Math.abs(Math.sin(rotationRad) * width) + Math.abs(Math.cos(rotationRad) * height),
  };
}

export function ImageCropDialog({ imageUrl, open, onClose, onApply }: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [preset, setPreset] = useState("original");
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aspect = PRESETS.find((p) => p.id === preset)?.aspect;

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  if (!open) return null;

  const apply = async () => {
    if (!croppedArea) return;
    setSaving(true);
    setError(null);
    try {
      const file = await cropToFile(cropSourceUrl(imageUrl), croppedArea, rotation);
      await onApply(file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crop failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Edit image</h2>
          <button type="button" className="text-sm text-primary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="relative h-72 bg-black sm:h-80">
          <Cropper
            image={cropSourceUrl(imageUrl)}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            objectFit="contain"
            showGrid
          />
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPreset(item.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  preset === item.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-muted/40"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="block text-xs text-text-secondary">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-xs text-text-secondary">
            Rotate
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm"
              onClick={() => {
                setZoom(1);
                setRotation(0);
                setCrop({ x: 0, y: 0 });
                setPreset("original");
              }}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void apply()}
              className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Applying…" : "Apply crop"}
            </button>
          </div>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <p className="text-[11px] text-text-hint">
            Original stays available until you save. Use arrow keys after focusing the crop area to nudge.
          </p>
        </div>
      </div>
    </div>
  );
}
