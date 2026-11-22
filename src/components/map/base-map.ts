/**
 * Site-wide MapLibre map with OpenFreeMap tiles. Reusable: any page that
 * needs a map calls `createBaseMap` and owns the returned instance
 * (call `map.remove()` when its element leaves the DOM).
 *
 * Load this module with a dynamic `import()` so MapLibre (large) never
 * blocks the first render. The stylesheet `maplibre-gl/dist/maplibre-gl.css`
 * is imported by the Astro component that hosts the map.
 */
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type LngLatBoundsLike,
} from 'maplibre-gl';
// Emitted as its own file; MapLibre's default worker lookup breaks once bundled.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { PUBLIC_MAP_STYLE_URL } from 'astro:env/client';
import type { MapBounds } from '../../lib/validation/map-bounds';
import type { GeoPoint } from '../../types';

setWorkerUrl(workerUrl);

export interface BaseMapOptions {
  container: HTMLElement;
  /** Box to show first. Falls back to `center` / `zoom`. */
  bounds?: MapBounds | null;
  /** Padding around `bounds`, in px. */
  boundsPadding?: number;
  center: GeoPoint;
  zoom?: number;
  /** +/- buttons. Phones pinch instead. */
  zoomButtons?: boolean;
}

/** Point-of-interest layers hidden to keep the map calm (the price pills are the content). */
const HIDDEN_LAYERS = ['poi_r7', 'poi_r20'];

/** Labels in Vietnamese, falling back to the local name (the style prefers English). */
const LOCAL_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:vi'], ['get', 'name']];

const LOCALE: Record<string, string> = {
  'Map.Title': 'Bản đồ',
  'NavigationControl.ZoomIn': 'Phóng to',
  'NavigationControl.ZoomOut': 'Thu nhỏ',
  'AttributionControl.ToggleAttribution': 'Hiện hoặc ẩn nguồn bản đồ',
  'AttributionControl.MapFeedback': 'Góp ý về bản đồ',
  'Popup.Close': 'Đóng',
};

export function toLngLatBounds(bounds: MapBounds): LngLatBoundsLike {
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.north],
  ];
}

export function createBaseMap(options: BaseMapOptions): MapLibreMap {
  const { container, bounds, boundsPadding = 48, center, zoom = 13, zoomButtons = true } = options;
  const map = new MapLibreMap({
    container,
    style: PUBLIC_MAP_STYLE_URL,
    center: [center.lng, center.lat],
    zoom,
    bounds: bounds ? toLngLatBounds(bounds) : undefined,
    fitBoundsOptions: { padding: boundsPadding },
    // A flat, north-up map: rotation and tilt only confuse a room search.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    // OpenFreeMap / OpenMapTiles / OpenStreetMap credits come from the tile source.
    // MapLibre shows them in full on load and collapses them on narrow maps.
    attributionControl: {},
    locale: LOCALE,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  if (zoomButtons) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

  map.once('style.load', () => {
    for (const layer of map.getStyle().layers) {
      if (layer.type !== 'symbol') continue;
      const field = map.getLayoutProperty(layer.id, 'text-field');
      if (field && JSON.stringify(field).includes('name_en')) {
        map.setLayoutProperty(layer.id, 'text-field', LOCAL_NAME);
      }
    }
    for (const id of HIDDEN_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }
  });
  return map;
}
