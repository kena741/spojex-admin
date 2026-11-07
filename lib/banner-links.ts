/**
 * Banner destinations: either a website / in-app link (`link_url`) OR
 * per-platform store links (`ios_url`, `android_url`) — never both. The app
 * opens the store link for the viewer's device, so iOS never lands on Google Play.
 */
export type BannerLinks = {
  link_url: string;
  ios_url: string;
  android_url: string;
};

const APP_STORE_HOSTS = new Set(["apps.apple.com", "itunes.apple.com"]);
const PLAY_STORE_HOSTS = new Set(["play.google.com"]);

function parseHttps(value: string): URL | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function isStoreHost(host: string) {
  return APP_STORE_HOSTS.has(host) || PLAY_STORE_HOSTS.has(host);
}

export function normalizeBannerLinks(input: Partial<Record<keyof BannerLinks, unknown>>): BannerLinks {
  const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    link_url: clean(input.link_url),
    ios_url: clean(input.ios_url),
    android_url: clean(input.android_url),
  };
}

/** Returns an error message, or null when the combination is valid. */
export function validateBannerLinks(links: BannerLinks): string | null {
  const { link_url, ios_url, android_url } = links;

  if (link_url && (ios_url || android_url)) {
    return "Use either a website link or store links, not both.";
  }

  if (link_url && !link_url.startsWith("/")) {
    let u: URL;
    try {
      u = new URL(link_url);
    } catch {
      return "Website link is not a valid URL.";
    }
    if (!["https:", "http:"].includes(u.protocol)) {
      return "Website link must be http(s) or an in-app /route.";
    }
    if (isStoreHost(u.hostname.toLowerCase())) {
      return "Store listings go in the App Store / Play Store fields, not the website link.";
    }
  }

  if (ios_url) {
    const u = parseHttps(ios_url);
    if (!u || !APP_STORE_HOSTS.has(u.hostname.toLowerCase())) {
      return "iOS link must be an https://apps.apple.com/… App Store URL.";
    }
  }

  if (android_url) {
    const u = parseHttps(android_url);
    if (!u || !PLAY_STORE_HOSTS.has(u.hostname.toLowerCase())) {
      return "Android link must be an https://play.google.com/… Play Store URL.";
    }
  }

  return null;
}
