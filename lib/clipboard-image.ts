const IMAGE_MIME = /^image\/(jpeg|png|webp|gif)$/i;
const MAX_BYTES = 5 * 1024 * 1024;

/** Pull the first JPG/PNG/WebP/GIF from a paste or drop DataTransfer. */
export function clipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  const items = data.items ? Array.from(data.items) : [];
  for (const item of items) {
    if (item.kind === "file" && IMAGE_MIME.test(item.type)) {
      const file = item.getAsFile();
      if (file) {
        const ext = item.type.includes("png")
          ? "png"
          : item.type.includes("webp")
            ? "webp"
            : item.type.includes("gif")
              ? "gif"
              : "jpg";
        const name = file.name?.trim() || `pasted-image.${ext}`;
        return name === file.name ? file : new File([file], name, { type: file.type || item.type });
      }
    }
  }
  const files = data.files ? Array.from(data.files) : [];
  for (const file of files) {
    if (IMAGE_MIME.test(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
      return file;
    }
  }
  return null;
}

export function validateEventImageFile(file: File): string | null {
  if (!IMAGE_MIME.test(file.type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    return "Use a JPG, PNG, WebP, or GIF image.";
  }
  if (file.size > MAX_BYTES) return "Image must be 5 MB or smaller.";
  return null;
}

export const eventImageAccept = "image/jpeg,image/png,image/webp,image/gif";
