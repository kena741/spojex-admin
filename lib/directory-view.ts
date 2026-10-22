/** Shared Cards / List directory layout for admin pages that support both. */

export type DirectoryView = "cards" | "list";

export function readStoredDirectoryView(
  storageKey: string,
  fallback: DirectoryView = "list",
): DirectoryView {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === "cards" || raw === "list") return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStoredDirectoryView(storageKey: string, view: DirectoryView) {
  try {
    localStorage.setItem(storageKey, view);
  } catch {
    /* ignore */
  }
}
