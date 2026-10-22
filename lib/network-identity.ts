import type { NetworkUserBrief } from "@/lib/types";

export function networkUserLabel(
  user?: NetworkUserBrief | null,
  fallbackId?: string | null,
): string {
  if (user?.display_name?.trim()) return user.display_name.trim();
  if (user?.username?.trim()) return `@${user.username.trim()}`;
  if (fallbackId) return "Profile unavailable";
  return "Profile unavailable";
}

export function networkUserSecondary(user?: NetworkUserBrief | null): string | null {
  if (user?.display_name?.trim() && user?.username?.trim()) {
    return `@${user.username.trim()}`;
  }
  return null;
}
