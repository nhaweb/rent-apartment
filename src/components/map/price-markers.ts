/**
 * Price pills on a MapLibre map, clustered with Supercluster.
 *
 * Only what is on screen becomes DOM: on every `moveend` the layer asks the
 * index for clusters inside the view and diffs its markers by key, so a
 * pan keeps existing elements and their hover/selected state.
 *
 * Each marker is a button (MapLibre moves it with `transform`) wrapping a
 * "face" span that does all the animating, so motion never fights the
 * positioning. Animations live in RoomMap.astro (`.map-face`, `.map-enter`,
 * `.map-leave`) and switch off under `prefers-reduced-motion`.
 */
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import Supercluster from 'supercluster';

export interface PricePoint {
  id: string;
  lat: number;
  lng: number;
  /** Text on the pill, e.g. `6,5 tr`. */
  label: string;
  /** Accessible name, e.g. the title and full price. */
  title: string;
}

export interface PriceMarkerOptions {
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** Cluster radius in px. Pills are wide, so a little more than the usual 60. */
  radius?: number;
  /** Above this zoom nothing clusters. */
  maxZoom?: number;
}

type PointProps = { id: string };

const BUTTON_CLASS = 'group block cursor-pointer rounded-full';
const PIN_FACE =
  'map-face map-enter block rounded-full border px-2.5 py-1 text-small font-medium whitespace-nowrap tabular-nums shadow-float';
const PIN_IDLE = ['border-line', 'bg-paper', 'text-ink', 'group-hover:border-ink', 'group-hover:scale-105'];
const PIN_ACTIVE = ['border-ink', 'bg-ink', 'text-inv-ink', 'scale-110'];
const CLUSTER_FACE =
  'map-face map-enter grid h-10 min-w-10 place-items-center rounded-full border-2 border-paper bg-ink px-2 text-small font-medium text-inv-ink tabular-nums shadow-float group-hover:scale-110';

/** Stacking inside the marker pane: clusters, then pins, then the active pin. */
const Z = { cluster: '1', pin: '2', active: '3' } as const;

/** Matches the `.map-leave` animation in RoomMap.astro. */
const LEAVE_MS = 140;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function face(marker: Marker): HTMLElement | null {
  return marker.getElement().firstElementChild as HTMLElement | null;
}

export class PriceMarkerLayer {
  #map: MapLibreMap;
  #options: Required<Omit<PriceMarkerOptions, 'onHover'>> & Pick<PriceMarkerOptions, 'onHover'>;
  #index: Supercluster<PointProps> | undefined;
  #points = new Map<string, PricePoint>();
  /** Every marker on the map, by `p:<room id>` or `c:<cluster id>`. */
  #markers = new Map<string, Marker>();
  /** Markers playing their exit animation; removed when it ends. */
  #leaving = new Set<Marker>();
  /** Room id to the key of the cluster it is hidden in, for the current view. */
  #clusterOf = new Map<string, string>();
  #selected: string | null = null;
  #hovered: string | null = null;
  #render = () => this.render();

  constructor(map: MapLibreMap, options: PriceMarkerOptions) {
    this.#map = map;
    this.#options = { radius: 64, maxZoom: 16, ...options };
    map.on('moveend', this.#render);
  }

  /** Replaces the data set (one viewport's worth of rooms). */
  setPoints(points: PricePoint[]) {
    this.#points = new Map(points.map((point) => [point.id, point]));
    const index = new Supercluster<PointProps>({ radius: this.#options.radius, maxZoom: this.#options.maxZoom });
    index.load(
      points.map((point) => ({
        type: 'Feature' as const,
        properties: { id: point.id },
        geometry: { type: 'Point' as const, coordinates: [point.lng, point.lat] },
      })),
    );
    this.#index = index;
    this.render();
  }

  render() {
    const index = this.#index;
    if (!index) return;
    const bounds = this.#map.getBounds();
    const features = index.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      Math.floor(this.#map.getZoom()),
    );

    const next = new Map<string, Marker>();
    this.#clusterOf.clear();
    for (const feature of features) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties;
      const isCluster = 'cluster' in props && props.cluster;
      const key = isCluster ? `c:${props.cluster_id}` : `p:${(props as PointProps).id}`;
      if (isCluster) {
        // At most a few hundred rooms per view, so listing leaves is cheap.
        for (const leaf of index.getLeaves(props.cluster_id, Infinity)) this.#clusterOf.set(leaf.properties.id, key);
      }
      let marker = this.#markers.get(key);
      if (!marker) {
        const element = isCluster
          ? this.#clusterElement(props.cluster_id, props.point_count, lng, lat)
          : this.#pinElement((props as PointProps).id);
        if (!element) continue;
        marker = new Marker({ element, anchor: 'center' }).setLngLat([lng, lat]).addTo(this.#map);
      }
      next.set(key, marker);
    }
    for (const [key, marker] of this.#markers) {
      if (!next.has(key)) this.#leave(marker);
    }
    this.#markers = next;
    // The hovered room may now sit in a different cluster.
    this.#paintClusters();
  }

  setSelected(id: string | null) {
    const previous = this.#selected;
    this.#selected = id;
    this.#paint(previous);
    this.#paint(id);
  }

  setHovered(id: string | null) {
    if (id === this.#hovered) return;
    const previous = this.#hovered;
    this.#hovered = id;
    this.#paint(previous);
    this.#paint(id);
    this.#paintClusters();
  }

  /** Focuses a room's pin if it is drawn (not inside a cluster or off screen). */
  focus(id: string) {
    this.#markers.get(`p:${id}`)?.getElement().focus();
  }

  destroy() {
    this.#map.off('moveend', this.#render);
    for (const marker of [...this.#markers.values(), ...this.#leaving]) marker.remove();
    this.#markers.clear();
    this.#leaving.clear();
    this.#index = undefined;
  }

  /** Fades a marker out, then takes it off the map. */
  #leave(marker: Marker) {
    const el = face(marker);
    if (!el || reducedMotion.matches) {
      marker.remove();
      return;
    }
    marker.getElement().style.pointerEvents = 'none';
    el.classList.remove('map-enter');
    el.classList.add('map-leave');
    this.#leaving.add(marker);
    window.setTimeout(() => {
      marker.remove();
      this.#leaving.delete(marker);
    }, LEAVE_MS);
  }

  #pinElement(id: string): HTMLElement | undefined {
    const point = this.#points.get(id);
    if (!point) return undefined;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', point.title);
    const pill = document.createElement('span');
    pill.className = PIN_FACE;
    pill.textContent = point.label;
    button.append(pill);

    button.addEventListener('click', (event) => {
      // Keep the click from reaching the map, which closes the preview.
      event.stopPropagation();
      this.#options.onSelect(id);
    });
    button.addEventListener('pointerenter', () => {
      this.setHovered(id);
      this.#options.onHover?.(id);
    });
    button.addEventListener('pointerleave', () => {
      this.setHovered(null);
      this.#options.onHover?.(null);
    });
    this.#style(button, id);
    return button;
  }

  #clusterElement(clusterId: number, count: number, lng: number, lat: number): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', `${count} phòng. Bấm để phóng to`);
    button.style.zIndex = Z.cluster;
    const circle = document.createElement('span');
    circle.className = CLUSTER_FACE;
    circle.textContent = String(count);
    button.append(circle);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const zoom = this.#index?.getClusterExpansionZoom(clusterId) ?? this.#map.getZoom() + 2;
      // MapLibre skips the animation when the user prefers reduced motion.
      this.#map.easeTo({ center: [lng, lat], zoom: Math.min(zoom, this.#options.maxZoom + 1), duration: 600 });
    });
    return button;
  }

  #paint(id: string | null) {
    if (!id) return;
    const marker = this.#markers.get(`p:${id}`);
    if (marker) this.#style(marker.getElement(), id);
  }

  /** Grows the cluster that hides the hovered room, so hovering a list card always shows where it is. */
  #paintClusters() {
    const target = this.#hovered ? this.#clusterOf.get(this.#hovered) : undefined;
    for (const [key, marker] of this.#markers) {
      if (!key.startsWith('c:')) continue;
      const active = key === target;
      face(marker)?.classList.toggle('scale-115', active);
      marker.getElement().style.zIndex = active ? Z.active : Z.cluster;
    }
  }

  #style(button: HTMLElement, id: string) {
    const active = id === this.#selected || id === this.#hovered;
    const pill = button.firstElementChild as HTMLElement;
    pill.classList.remove(...(active ? PIN_IDLE : PIN_ACTIVE));
    pill.classList.add(...(active ? PIN_ACTIVE : PIN_IDLE));
    button.style.zIndex = active ? Z.active : Z.pin;
    button.setAttribute('aria-expanded', String(id === this.#selected));
  }
}
