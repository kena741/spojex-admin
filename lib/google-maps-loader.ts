const SCRIPT_ID = "google-maps-js";
const SCRIPT_BASE = "https://maps.googleapis.com/maps/api/js";

let loadPromise: Promise<void> | null = null;

export function getGoogleMapsApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

/** Load Maps JS (async) and import the Places library (PlaceAutocompleteElement). */
export function loadGoogleMapsPlaces(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }
  if (window.google?.maps?.importLibrary) {
    return window.google.maps.importLibrary("places").then(() => undefined);
  }
  if (loadPromise) return loadPromise;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Add it to .env.local and restart the dev server."),
    );
  }

  loadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      const importLibrary = window.google?.maps?.importLibrary;
      if (!importLibrary) {
        reject(new Error("Google Maps loaded without importLibrary support"));
        return;
      }
      importLibrary("places")
        .then(() => resolve())
        .catch((error: unknown) =>
          reject(error instanceof Error ? error : new Error("Failed to import Places library")),
        );
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.maps?.importLibrary) {
        finish();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps script")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `${SCRIPT_BASE}?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places&loading=async`;
    script.onload = finish;
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export const ADDIS_ABABA_CENTER = { lat: 9.032, lng: 38.7469 };

/** Approximate city bbox for Places locationRestriction. */
export const ADDIS_ABABA_BOUNDS = {
  south: 8.83,
  west: 38.65,
  north: 9.12,
  east: 38.92,
};
