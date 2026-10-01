"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import {
  ADDIS_ABABA_BOUNDS,
  ADDIS_ABABA_CENTER,
  loadGoogleMapsPlaces,
} from "@/lib/google-maps-loader";
import type {
  GoogleMapsAutocomplete,
  GoogleMapsGeocoder,
  GoogleMapsMap,
  GoogleMapsMarker,
} from "@/types/google-maps";

export type StadiumPin = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

function latLngFromPlace(place: ReturnType<GoogleMapsAutocomplete["getPlace"]>) {
  const loc = place.geometry?.location;
  if (!loc) return { lat: null as number | null, lng: null as number | null };
  return { lat: loc.lat(), lng: loc.lng() };
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
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapsMap | null>(null);
  const markerRef = useRef<GoogleMapsMarker | null>(null);
  const autocompleteRef = useRef<GoogleMapsAutocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
    if (!mapsReady || disabled || !inputRef.current || !window.google?.maps?.places) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry"],
      componentRestrictions: { country: "et" },
      bounds: ADDIS_ABABA_BOUNDS,
      strictBounds: true,
    });
    autocompleteRef.current = autocomplete;
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const { lat, lng } = latLngFromPlace(place);
      onChangeRef.current({
        address: place.formatted_address ?? inputRef.current?.value ?? "",
        latitude: lat,
        longitude: lng,
      });
    });

    return () => {
      if (window.google?.maps?.event && autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
  }, [mapsReady, disabled]);

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
        <input
          ref={inputRef}
          id={inputId}
          value={address}
          onChange={(event) =>
            onChange({
              address: event.target.value,
              latitude,
              longitude,
            })
          }
          placeholder="Search a place or pick it on the map"
          disabled={disabled || !mapsReady}
          autoComplete="off"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
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
      {mapsError ? <p className="text-sm text-destructive">{mapsError}</p> : null}
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
