"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import {
  ADDIS_ABABA_BOUNDS,
  ADDIS_ABABA_CENTER,
  loadGoogleMapsPlaces,
} from "@/lib/google-maps-loader";
import type {
  GoogleMapsGeocoder,
  GoogleMapsMap,
  GoogleMapsMarker,
  GoogleMapsPlaceAutocompleteElement,
  GoogleMapsPlacePredictionSelectEvent,
} from "@/types/google-maps";

export type StadiumPin = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

function latLngFromPlaceLocation(location: { lat: () => number; lng: () => number } | null | undefined) {
  if (!location) return { lat: null as number | null, lng: null as number | null };
  return { lat: location.lat(), lng: location.lng() };
}

export function StadiumLocationPicker({
  address,
  latitude,
  longitude,
  disabled = false,
  onChange,
}: {
  address: string;
  latitude: number | null;
  longitude: number | null;
  disabled?: boolean;
  onChange: (value: StadiumPin) => void;
}) {
  const autocompleteHostRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<GoogleMapsPlaceAutocompleteElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapsMap | null>(null);
  const markerRef = useRef<GoogleMapsMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const addressRef = useRef(address);
  addressRef.current = address;
  const pinRef = useRef({ latitude, longitude });
  pinRef.current = { latitude, longitude };

  const value: StadiumPin = { address, latitude, longitude };
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapDraft, setMapDraft] = useState<StadiumPin>(value);
  const [mapLoading, setMapLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsPlaces()
      .then(() => {
        if (!cancelled) {
          setMapsReady(true);
          setMapsError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapsError(error instanceof Error ? error.message : "Failed to load Google Maps");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapsReady || !autocompleteHostRef.current || !window.google?.maps) return;

    let cancelled = false;
    let element: GoogleMapsPlaceAutocompleteElement | null = null;
    let onSelect: ((event: Event) => void) | null = null;
    let onInput: ((event: Event) => void) | null = null;

    void (async () => {
      const places = (await window.google!.maps.importLibrary("places")) as {
        PlaceAutocompleteElement: new (opts?: {
          placeholder?: string;
          includedRegionCodes?: string[];
          locationRestriction?: typeof ADDIS_ABABA_BOUNDS;
        }) => GoogleMapsPlaceAutocompleteElement;
      };
      if (cancelled || !autocompleteHostRef.current) return;

      element = new places.PlaceAutocompleteElement({
        placeholder: "Search a place or pick it on the map",
        includedRegionCodes: ["et"],
        locationRestriction: ADDIS_ABABA_BOUNDS,
      });
      element.style.width = "100%";
      element.style.display = "block";
      element.value = addressRef.current;
      element.disabled = disabled;

      onSelect = (event: Event) => {
        void (async () => {
          const { placePrediction } = event as GoogleMapsPlacePredictionSelectEvent;
          const place = placePrediction.toPlace();
          await place.fetchFields({ fields: ["formattedAddress", "location"] });
          const { lat, lng } = latLngFromPlaceLocation(place.location);
          onChangeRef.current({
            address: place.formattedAddress ?? element?.value ?? "",
            latitude: lat,
            longitude: lng,
          });
        })();
      };
      onInput = () => {
        if (!element) return;
        onChangeRef.current({
          address: element.value,
          latitude: pinRef.current.latitude,
          longitude: pinRef.current.longitude,
        });
      };

      element.addEventListener("gmp-select", onSelect);
      element.addEventListener("input", onInput);
      autocompleteHostRef.current.replaceChildren(element);
      autocompleteRef.current = element;
    })();

    return () => {
      cancelled = true;
      if (element && onSelect) element.removeEventListener("gmp-select", onSelect);
      if (element && onInput) element.removeEventListener("input", onInput);
      autocompleteRef.current = null;
      autocompleteHostRef.current?.replaceChildren();
    };
  }, [mapsReady, disabled]);

  useEffect(() => {
    const el = autocompleteRef.current;
    if (!el) return;
    el.disabled = disabled;
    if (el.value !== address) {
      el.value = address;
    }
  }, [address, disabled]);

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    return new Promise<string>((resolve) => {
      if (!window.google?.maps) {
        resolve("");
        return;
      }
      const geocoder: GoogleMapsGeocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results?.[0]?.formatted_address) {
          resolve(results[0].formatted_address);
          return;
        }
        resolve("");
      });
    });
  }, []);

  const initMapPicker = useCallback(async () => {
    if (!mapContainerRef.current || !window.google?.maps) return;
    const center =
      mapDraft.latitude != null && mapDraft.longitude != null
        ? { lat: mapDraft.latitude, lng: mapDraft.longitude }
        : ADDIS_ABABA_CENTER;

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center,
        zoom: 15,
        mapTypeControl: false,
        restriction: {
          latLngBounds: ADDIS_ABABA_BOUNDS,
          strictBounds: false,
        },
      });
      markerRef.current = new window.google.maps.Marker({
        map: mapRef.current,
        position: center,
        draggable: true,
      });

      const applyPosition = async (lat: number, lng: number) => {
        setMapLoading(true);
        const nextAddress = await reverseGeocode(lat, lng);
        setMapDraft({
          address: nextAddress || mapDraft.address,
          latitude: lat,
          longitude: lng,
        });
        setMapLoading(false);
      };

      mapRef.current.addListener("click", (event) => {
        const point = event.latLng;
        if (!point) return;
        const lat = point.lat();
        const lng = point.lng();
        markerRef.current?.setPosition({ lat, lng });
        void applyPosition(lat, lng);
      });
      markerRef.current.addListener("dragend", () => {
        const pos = markerRef.current?.getPosition();
        if (!pos) return;
        void applyPosition(pos.lat(), pos.lng());
      });
    } else {
      mapRef.current.setCenter(center);
      markerRef.current?.setPosition(center);
    }
  }, [mapDraft.address, mapDraft.latitude, mapDraft.longitude, reverseGeocode]);

  useEffect(() => {
    if (!mapOpen) {
      mapRef.current = null;
      markerRef.current = null;
      return;
    }
    if (!mapsReady) return;
    const timer = window.setTimeout(() => {
      void initMapPicker();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [mapOpen, mapsReady, initMapPicker]);

  const pinned = latitude != null && longitude != null;

  return (
    <div className="grid gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div
          ref={autocompleteHostRef}
          className="min-h-10 w-full [&_gmp-place-autocomplete]:h-10 [&_gmp-place-autocomplete]:w-full"
        />
        <button
          type="button"
          onClick={() => {
            setMapDraft(value);
            setMapOpen(true);
          }}
          disabled={disabled || !mapsReady}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-50"
        >
          <MapPin className="h-4 w-4" aria-hidden />
          Pick on map
        </button>
      </div>
      {mapsError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Map search unavailable</p>
          <p className="mt-1 text-xs">
            {mapsError} Existing pins are preserved. Enter latitude and longitude below if you need to
            update the location.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs">
              Latitude
              <input
                type="number"
                step="any"
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                disabled={disabled}
                value={latitude ?? ""}
                onChange={(e) => {
                  const lat = e.target.value === "" ? null : Number(e.target.value);
                  onChange({
                    address,
                    latitude: lat != null && Number.isFinite(lat) ? lat : null,
                    longitude,
                  });
                }}
              />
            </label>
            <label className="grid gap-1 text-xs">
              Longitude
              <input
                type="number"
                step="any"
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                disabled={disabled}
                value={longitude ?? ""}
                onChange={(e) => {
                  const lng = e.target.value === "" ? null : Number(e.target.value);
                  onChange({
                    address,
                    latitude,
                    longitude: lng != null && Number.isFinite(lng) ? lng : null,
                  });
                }}
              />
            </label>
          </div>
        </div>
      ) : null}
      {!mapsError && !mapsReady ? (
        <p className="text-sm text-text-secondary">Loading location picker…</p>
      ) : null}
      {pinned ? <p className="text-sm text-text-secondary">Map pin is set.</p> : null}

      {mapOpen ? (
        <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close map"
            onClick={() => setMapOpen(false)}
          />
          <div className="absolute inset-0 flex items-end sm:items-center sm:justify-center sm:p-4">
            <div
              className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:max-w-2xl sm:rounded-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="stadium-map-picker-title"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id="stadium-map-picker-title" className="text-base font-semibold">
                  Pick stadium on map
                </h3>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm text-text-secondary hover:bg-muted"
                  onClick={() => setMapOpen(false)}
                >
                  Close
                </button>
              </div>
              <div
                ref={mapContainerRef}
                className="h-[42vh] min-h-48 w-full overflow-hidden rounded-md border border-border bg-muted sm:h-[360px]"
              />
              <p className="mt-2 text-sm text-text-secondary">
                {mapLoading
                  ? "Loading address…"
                  : mapDraft.address || "Tap the map or drag the pin to set the stadium."}
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-3 text-sm"
                  onClick={() => setMapOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  disabled={mapLoading}
                  onClick={() => {
                    onChange(mapDraft);
                    setMapOpen(false);
                  }}
                >
                  Use this location
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
