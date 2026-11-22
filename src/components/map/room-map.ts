/**
 * <room-map> behaviour (markup in RoomMap.astro).
 *
 * - The side list renders at once from inlined JSON; MapLibre loads after it.
 * - After each pan/zoom (debounced), rooms inside the visible area come from
 *   /api/ban-do; the price-marker layer and the list update from that answer.
 * - Clicking a pill opens a preview: a MapLibre popup from md, a card pinned
 *   to the bottom of the map on phones. The list is not highlighted or scrolled.
 * - Everything the element creates is torn down in `disconnectedCallback`.
 */
import type { Map as MapLibreMap, Offset, Popup } from 'maplibre-gl';
import type { MapPayload, MapRoomView } from '../../lib/map';
import type { MapBounds } from '../../lib/validation/map-bounds';
import type { GeoPoint } from '../../types';
import type { PriceMarkerLayer, PricePoint } from './price-markers';

/** Props of RoomMap.astro, inlined as JSON. */
interface InitialData {
  payload: MapPayload;
  view: MapBounds | null;
  viewFromUrl: boolean;
  extent: MapBounds | null;
  center: GeoPoint;
  query: string;
}

/** Tailwind `md`: the preview is a popup above its pin, and the map has zoom buttons. */
const WIDE = '(min-width: 48rem)';
/** Tailwind `lg`: the list is always visible beside the map. */
const SPLIT = '(min-width: 64rem)';

/** Wait this long after the map stops before asking for its rooms. */
const FETCH_DEBOUNCE_MS = 250;
/** The skeleton appears this soon after the map stops on a new area... */
const LOADING_DELAY_MS = 120;
/** ...and, once shown, stays at least this long so it never flickers. */
const MIN_SKELETON_MS = 350;
/** Matches `.map-preview-leave` in RoomMap.astro. */
const LEAVE_MS = 140;
/** List cards that get a staggered entrance; later ones appear with the last. */
const STAGGERED_CARDS = 8;
const STAGGER_MS = 35;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const LIST_SIZES = '(min-width: 80rem) 20vw, (min-width: 64rem) 28vw, (min-width: 40rem) 50vw, 100vw';
const PREVIEW_SIZES = '(min-width: 48rem) 320px, 120px';

/** Popup distance from the pin's center, per side it opens to (pins are ~30px tall, ~60px wide). */
const POPUP_OFFSET: Offset = {
  center: [0, 0],
  top: [0, 22],
  'top-left': [0, 22],
  'top-right': [0, 22],
  bottom: [0, -22],
  'bottom-left': [0, -22],
  'bottom-right': [0, -22],
  left: [40, 0],
  right: [-40, 0],
};
/** Space kept between an open popup and the map edge; the right side clears the zoom buttons. */
const EDGE = { top: 12, left: 12, right: 56, bottom: 40 };

/** `south,west,north,east`, same format as `mapBoundsToParam` (kept local so zod stays out of the bundle). */
function bboxParam(map: MapLibreMap): string {
  const bounds = map.getBounds();
  const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
  const whole = bounds.getEast() - bounds.getWest() >= 360;
  const west = whole ? -180 : wrap(bounds.getWest());
  const east = whole ? 180 : wrap(bounds.getEast());
  const south = Math.max(-90, bounds.getSouth());
  const north = Math.min(90, bounds.getNorth());
  return [south, west, north, east].map((n) => n.toFixed(5)).join(',');
}

function statusText(payload: MapPayload): string {
  if (payload.rooms.length < payload.total) {
    return `Hiển thị ${payload.rooms.length} trong ${payload.total} phòng. Phóng to bản đồ để xem thêm.`;
  }
  return `${payload.total} phòng trong khu vực bản đồ`;
}

function toPricePoint(room: MapRoomView): PricePoint {
  return { id: room.id, lat: room.lat, lng: room.lng, label: room.marker, title: `${room.title}, ${room.price}/tháng` };
}

export class RoomMapElement extends HTMLElement {
  #data!: InitialData;
  #payload!: MapPayload;
  #rooms = new Map<string, MapRoomView>();
  #listKey = '';
  #loadingTimer = 0;
  /** When the skeleton appeared (performance.now()), or 0 while it is hidden. */
  #skeletonSince = 0;

  #map: MapLibreMap | undefined;
  #markers: PriceMarkerLayer | undefined;
  #PopupClass: typeof Popup | undefined;
  #preview: { id: string; card: HTMLElement; popup?: Popup } | undefined;

  #lastQuery = '';
  #request: AbortController | undefined;
  #debounce = 0;
  /** Aborting this removes every DOM listener the element added outside the map. */
  #listeners: AbortController | undefined;

  #wide = window.matchMedia(WIDE);
  #split = window.matchMedia(SPLIT);

  connectedCallback() {
    // Moving the element in the DOM must not build a second map.
    if (this.#listeners) return;
    const raw = this.querySelector('script[data-initial]')?.textContent;
    if (!raw) return;
    this.#data = JSON.parse(raw) as InitialData;
    this.#listeners = new AbortController();
    this.#renderList(this.#data.payload, true);
    this.#bindUi(this.#listeners.signal);
    this.#initMap().catch(() => this.#showNotice());
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#listeners = undefined;
    this.#request?.abort();
    window.clearTimeout(this.#debounce);
    window.clearTimeout(this.#loadingTimer);
    this.#closePreview(false, false);
    this.#markers?.destroy();
    this.#markers = undefined;
    this.#map?.remove();
    this.#map = undefined;
  }

  #part<T extends HTMLElement = HTMLElement>(name: string): T {
    const el = this.querySelector<T>(`[data-${name}]`);
    if (!el) throw new Error(`<room-map> is missing [data-${name}]`);
    return el;
  }

  // ---------------------------------------------------------------- UI

  #bindUi(signal: AbortSignal) {
    this.#part('toggle').addEventListener('click', () => this.#setView(this.dataset.view === 'map' ? 'list' : 'map'), {
      signal,
    });
    this.#part('fit-all').addEventListener(
      'click',
      () => {
        const extent = this.#data.extent;
        if (!this.#map || !extent) return;
        this.#map.fitBounds(
          [
            [extent.west, extent.south],
            [extent.east, extent.north],
          ],
          { padding: 48 },
        );
        this.#setView('map');
      },
      { signal },
    );

    // Hovering or focusing a list card highlights its pin.
    const list = this.#part('list');
    const roomAt = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest<HTMLElement>('[data-room]')?.dataset.room ?? null) : null;
    list.addEventListener('pointerover', (event) => this.#markers?.setHovered(roomAt(event.target)), { signal });
    list.addEventListener('pointerleave', () => this.#markers?.setHovered(null), { signal });
    list.addEventListener('focusin', (event) => this.#markers?.setHovered(roomAt(event.target)), { signal });
    list.addEventListener('focusout', () => this.#markers?.setHovered(null), { signal });

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && this.#preview) this.#closePreview(true);
      },
      { signal },
    );
    // The preview lives in a different place on each side of the breakpoint.
    this.#wide.addEventListener('change', () => this.#closePreview(false, false), { signal });
  }

  #setView(view: 'map' | 'list') {
    this.dataset.view = view;
    this.#part('toggle-to="list"').hidden = view === 'list';
    this.#part('toggle-to="map"').hidden = view === 'map';
    if (view === 'list') {
      this.#closePreview();
      this.#part('list-panel').scrollTop = 0;
    }
  }

  #showNotice() {
    this.#part('notice').hidden = false;
    this.#part('toggle-bar').hidden = true;
    // No map to fit: hide the empty-state "show all on the map" action.
    this.#part('fit-all').hidden = true;
    this.#setView('list');
  }

  /** Fills a card or preview template with one room. */
  #fill(template: HTMLTemplateElement, room: MapRoomView, sizes: string): HTMLElement {
    const root = (template.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
    const link = root.querySelector<HTMLAnchorElement>('[data-card]')!;
    link.href = room.href;
    link.dataset.room = room.id;
    root.querySelector('[data-title]')!.textContent = room.title;
    root.querySelector('[data-place]')!.textContent = room.place;
    root.querySelector('[data-details]')!.textContent = room.details;
    root.querySelector('[data-price]')!.textContent = room.price;
    root.querySelector('[data-new]')!.toggleAttribute('hidden', !room.isNew);
    const img = root.querySelector<HTMLImageElement>('[data-photo]')!;
    if (room.photo) {
      // sizes and srcset before src, so the browser picks once.
      img.sizes = sizes;
      if (room.photo.srcset) img.srcset = room.photo.srcset;
      img.src = room.photo.src;
    } else {
      img.remove();
    }
    return root;
  }

  /** Shows a result: rebuilds the cards only when the rooms changed, always restores visibility and status. */
  #renderList(payload: MapPayload, animate = false) {
    this.#payload = payload;
    this.#rooms = new Map(payload.rooms.map((room) => [room.id, room]));
    const list = this.#part('list');
    const key = `${payload.total}:${payload.rooms.map((room) => room.id).join('|')}`;
    if (key !== this.#listKey) {
      this.#listKey = key;
      const template = this.#part<HTMLTemplateElement>('card-template');
      list.replaceChildren(
        ...payload.rooms.map((room, index) => {
          const card = this.#fill(template, room, LIST_SIZES);
          if (animate) {
            card.classList.add('map-card-enter');
            card.style.setProperty('--enter-delay', `${Math.min(index, STAGGERED_CARDS) * STAGGER_MS}ms`);
          }
          return card;
        }),
      );
      this.#part('list-panel').scrollTop = 0;
    }
    list.hidden = payload.rooms.length === 0;
    this.#part('empty').hidden = payload.total > 0;
    this.#part('status').textContent = statusText(payload);
  }

  /** Map stopped on a new area: skeleton and spinner shortly, unless the answer beats them. */
  #beginLoading() {
    if (this.#loadingTimer || this.#skeletonSince) return;
    this.#loadingTimer = window.setTimeout(() => {
      this.#loadingTimer = 0;
      const count = this.#split.matches ? 6 : 3;
      const template = this.#part<HTMLTemplateElement>('skeleton-template');
      const skeleton = this.#part('skeleton');
      skeleton.replaceChildren(
        ...Array.from({ length: count }, () => template.content.firstElementChild!.cloneNode(true)),
      );
      skeleton.hidden = false;
      this.#part('list').hidden = true;
      this.#part('empty').hidden = true;
      this.#part('loading').hidden = false;
      this.#part('list-panel').setAttribute('aria-busy', 'true');
      this.#part('status').textContent = 'Đang tìm phòng trong khu vực này…';
      this.#skeletonSince = performance.now();
    }, LOADING_DELAY_MS);
  }

  /** Waits out the skeleton's minimum time, then hides it. Returns true if it was showing. */
  async #endLoading(): Promise<boolean> {
    window.clearTimeout(this.#loadingTimer);
    this.#loadingTimer = 0;
    if (!this.#skeletonSince) return false;
    const wait = MIN_SKELETON_MS - (performance.now() - this.#skeletonSince);
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    if (!this.#skeletonSince) return true; // another caller already hid it
    this.#skeletonSince = 0;
    this.#part('skeleton').hidden = true;
    this.#part('skeleton').replaceChildren();
    this.#part('loading').hidden = true;
    this.#part('list-panel').removeAttribute('aria-busy');
    return true;
  }

  // --------------------------------------------------------------- Map

  async #initMap() {
    // MapLibre is large: load it only after the list is on screen.
    const [{ createBaseMap }, { PriceMarkerLayer }, { Popup }] = await Promise.all([
      import('./base-map'),
      import('./price-markers'),
      import('maplibre-gl'),
    ]);
    if (!this.#listeners || this.#map) return; // removed while loading, or already built
    this.#PopupClass = Popup;

    const { view, viewFromUrl, center } = this.#data;
    const map = createBaseMap({
      container: this.#part('map'),
      bounds: view,
      boundsPadding: viewFromUrl ? 0 : 48,
      center,
      zoomButtons: this.#wide.matches,
    });
    this.#map = map;

    let styleLoaded = false;
    map.once('style.load', () => (styleLoaded = true));
    // A style that never loads (offline, tile server down) leaves a blank map: show the list instead.
    map.on('error', () => {
      if (!styleLoaded) this.#showNotice();
    });

    this.#markers = new PriceMarkerLayer(map, { onSelect: (id) => this.#openPreview(id) });
    this.#markers.setPoints(this.#data.payload.rooms.map(toPricePoint));

    map.on('moveend', () => {
      // Feedback right away when the area changed; the request itself waits for the map to settle.
      if (this.#visibleQuery() !== this.#lastQuery) this.#beginLoading();
      window.clearTimeout(this.#debounce);
      this.#debounce = window.setTimeout(() => void this.#loadVisibleRooms(), FETCH_DEBOUNCE_MS);
    });
    // A click on empty map closes the preview (pins stop their clicks from getting here).
    map.on('click', () => this.#closePreview());
    map.once('load', () => void this.#loadVisibleRooms(true));
  }

  /** Listing filters plus the visible area, as sent to /api/ban-do. */
  #visibleQuery(): string {
    if (!this.#map) return '';
    const params = new URLSearchParams(this.#data.query);
    params.set('bbox', bboxParam(this.#map));
    return params.toString().replaceAll('%2C', ',');
  }

  /** `quiet`: no skeleton (the first check after load, when the list already shows these rooms). */
  async #loadVisibleRooms(quiet = false) {
    if (!this.#map) return;
    const query = this.#visibleQuery();
    if (query === this.#lastQuery) {
      // Moved and came back before the request: nothing to fetch.
      if (!this.#request && (await this.#endLoading())) this.#renderList(this.#payload);
      return;
    }
    this.#lastQuery = query;

    this.#request?.abort();
    const request = (this.#request = new AbortController());
    if (!quiet) this.#beginLoading();
    try {
      const response = await fetch(`/api/ban-do?${query}`, { signal: request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as MapPayload;
      if (!this.#map || request.signal.aborted) return;
      const hadSkeleton = await this.#endLoading();
      if (this.#request !== request) return; // a newer area took over while the skeleton finished
      this.#markers?.setPoints(payload.rooms.map(toPricePoint));
      this.#renderList(payload, hadSkeleton);
      if (this.#preview && !this.#rooms.has(this.#preview.id)) this.#closePreview();
      // Keep the view in the URL so reload, back and shared links return here.
      history.replaceState(history.state, '', `${location.pathname}?${query}`);
    } catch {
      if (request.signal.aborted) return;
      this.#lastQuery = '';
      await this.#endLoading();
      this.#renderList(this.#payload);
      this.#part('status').textContent = 'Không tải được phòng ở khu vực này. Kéo bản đồ để thử lại.';
    } finally {
      if (this.#request === request) this.#request = undefined;
    }
  }

  // ----------------------------------------------------------- Preview

  #openPreview(id: string) {
    const room = this.#rooms.get(id);
    const map = this.#map;
    if (!room || !map || !this.#PopupClass) return;
    if (this.#preview?.id === id) return;
    this.#closePreview();

    const card = this.#fill(this.#part<HTMLTemplateElement>('preview-template'), room, PREVIEW_SIZES);
    card.classList.add('map-preview-enter');
    card.querySelector('[data-close]')!.addEventListener('click', () => this.#closePreview(true));

    if (this.#wide.matches) {
      const popup = new this.#PopupClass({
        className: 'room-popup',
        closeButton: false,
        // Map clicks are handled in #initMap, so closing can animate.
        closeOnClick: false,
        focusAfterOpen: false,
        maxWidth: 'none',
        offset: POPUP_OFFSET,
      })
        .setLngLat([room.lng, room.lat])
        .setDOMContent(card)
        .addTo(map);
      this.#preview = { id, card, popup };
      requestAnimationFrame(() => this.#panToFit(popup));
    } else {
      const slot = this.#part('preview-slot');
      slot.replaceChildren(card);
      slot.hidden = false;
      this.#part('toggle-bar').hidden = true;
      this.#preview = { id, card };
    }
    this.#markers?.setSelected(id);
  }

  /** Closes the preview; with `animate`, it fades out before it leaves the DOM. */
  #closePreview(restoreFocus = false, animate = true) {
    const preview = this.#preview;
    if (!preview) return;
    this.#preview = undefined;
    const slot = this.#part('preview-slot');
    const finish = () => {
      preview.popup?.remove();
      preview.card.remove();
      // A newer phone preview may already be in the slot.
      if (!this.#preview || this.#preview.popup) slot.hidden = true;
      if (this.#map && !this.#preview) this.#part('toggle-bar').hidden = false;
    };
    if (animate && !reducedMotion.matches) {
      preview.card.classList.remove('map-preview-enter');
      preview.card.classList.add('map-preview-leave');
      preview.card.style.pointerEvents = 'none';
      window.setTimeout(finish, LEAVE_MS);
    } else {
      finish();
    }
    this.#markers?.setSelected(null);
    if (restoreFocus) this.#markers?.focus(preview.id);
  }

  /** MapLibre flips the popup to the roomier side; pan only if it still does not fit. */
  #panToFit(popup: Popup) {
    const map = this.#map;
    if (!map || this.#preview?.popup !== popup) return;
    const area = map.getContainer().getBoundingClientRect();
    const box = popup.getElement().getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (box.left < area.left + EDGE.left) dx = box.left - area.left - EDGE.left;
    else if (box.right > area.right - EDGE.right) dx = box.right - area.right + EDGE.right;
    if (box.top < area.top + EDGE.top) dy = box.top - area.top - EDGE.top;
    else if (box.bottom > area.bottom - EDGE.bottom) dy = box.bottom - area.bottom + EDGE.bottom;
    if (dx !== 0 || dy !== 0) map.panBy([dx, dy]);
  }
}
