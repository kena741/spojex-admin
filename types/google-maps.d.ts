export interface GoogleMapsLatLng {
  lat: () => number;
  lng: () => number;
}

export interface GoogleMapsPlaceGeometry {
  location?: GoogleMapsLatLng;
}

export interface GoogleMapsPlaceResult {
  formatted_address?: string;
  geometry?: GoogleMapsPlaceGeometry;
}

export interface GoogleMapsAutocomplete {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => GoogleMapsPlaceResult;
}

export interface GoogleMapsMap {
  setCenter: (center: { lat: number; lng: number }) => void;
  addListener: (event: string, handler: (e: { latLng?: GoogleMapsLatLng }) => void) => void;
}

export interface GoogleMapsMarker {
  setPosition: (pos: { lat: number; lng: number }) => void;
  getPosition: () => GoogleMapsLatLng | null;
  addListener: (event: string, handler: () => void) => void;
}

export interface GoogleMapsGeocoderResult {
  formatted_address?: string;
}

export interface GoogleMapsGeocoder {
  geocode: (
    request: { location: { lat: number; lng: number } },
    callback: (results: GoogleMapsGeocoderResult[] | null, status: string) => void
  ) => void;
}

export interface GoogleMapsPlaces {
  Autocomplete: new (
    input: HTMLInputElement,
    opts?: {
      fields?: string[];
      componentRestrictions?: { country: string | string[] };
      bounds?: { south: number; west: number; north: number; east: number };
      strictBounds?: boolean;
    }
  ) => GoogleMapsAutocomplete;
}

export interface GoogleMapsApi {
  Map: new (
    el: HTMLElement,
    opts: {
      center: { lat: number; lng: number };
      zoom: number;
      mapTypeControl?: boolean;
      restriction?: {
        latLngBounds: { south: number; west: number; north: number; east: number };
        strictBounds?: boolean;
      };
    }
  ) => GoogleMapsMap;
  Marker: new (opts: {
    map: GoogleMapsMap;
    position: { lat: number; lng: number };
    draggable?: boolean;
  }) => GoogleMapsMarker;
  Geocoder: new () => GoogleMapsGeocoder;
  places: GoogleMapsPlaces;
  event: {
    clearInstanceListeners: (instance: GoogleMapsAutocomplete | GoogleMapsMap | GoogleMapsMarker) => void;
  };
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
  }
}

export {};
