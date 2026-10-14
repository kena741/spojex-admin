export interface GoogleMapsLatLng {
  lat: () => number;
  lng: () => number;
}

export interface GoogleMapsLatLngLiteral {
  lat: number;
  lng: number;
}

export interface GoogleMapsLatLngBoundsLiteral {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface GoogleMapsPlace {
  formattedAddress?: string | null;
  location?: GoogleMapsLatLng | null;
  fetchFields: (opts: { fields: string[] }) => Promise<void>;
}

export interface GoogleMapsPlacePrediction {
  toPlace: () => GoogleMapsPlace;
}

export interface GoogleMapsPlacePredictionSelectEvent extends Event {
  placePrediction: GoogleMapsPlacePrediction;
}

export interface GoogleMapsPlaceAutocompleteElement extends HTMLElement {
  placeholder: string;
  disabled: boolean;
  value: string;
  includedRegionCodes: string[];
  locationRestriction: GoogleMapsLatLngBoundsLiteral | null;
}

export interface GoogleMapsMap {
  setCenter: (center: GoogleMapsLatLngLiteral) => void;
  addListener: (event: string, handler: (e: { latLng?: GoogleMapsLatLng }) => void) => void;
}

export interface GoogleMapsMarker {
  setPosition: (pos: GoogleMapsLatLngLiteral) => void;
  getPosition: () => GoogleMapsLatLng | null;
  addListener: (event: string, handler: () => void) => void;
}

export interface GoogleMapsGeocoderResult {
  formatted_address?: string;
}

export interface GoogleMapsGeocoder {
  geocode: (
    request: { location: GoogleMapsLatLngLiteral },
    callback: (results: GoogleMapsGeocoderResult[] | null, status: string) => void,
  ) => void;
}

export interface GoogleMapsPlacesLibrary {
  PlaceAutocompleteElement: new (opts?: {
    placeholder?: string;
    includedRegionCodes?: string[];
    locationRestriction?: GoogleMapsLatLngBoundsLiteral;
  }) => GoogleMapsPlaceAutocompleteElement;
}

export interface GoogleMapsApi {
  importLibrary: (name: "places" | "maps" | "marker" | string) => Promise<GoogleMapsPlacesLibrary | unknown>;
  Map: new (
    el: HTMLElement,
    opts: {
      center: GoogleMapsLatLngLiteral;
      zoom: number;
      mapTypeControl?: boolean;
      restriction?: {
        latLngBounds: GoogleMapsLatLngBoundsLiteral;
        strictBounds?: boolean;
      };
    },
  ) => GoogleMapsMap;
  Marker: new (opts: {
    map: GoogleMapsMap;
    position: GoogleMapsLatLngLiteral;
    draggable?: boolean;
  }) => GoogleMapsMarker;
  Geocoder: new () => GoogleMapsGeocoder;
  places?: {
    PlaceAutocompleteElement: GoogleMapsPlacesLibrary["PlaceAutocompleteElement"];
  };
  event: {
    clearInstanceListeners: (instance: GoogleMapsMap | GoogleMapsMarker) => void;
  };
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
  }

  interface HTMLElementTagNameMap {
    "gmp-place-autocomplete": GoogleMapsPlaceAutocompleteElement;
  }
}

export {};
