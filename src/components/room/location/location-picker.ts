/**
 * `<location-picker>`: map pin for the room form (markup in
 * `LocationPicker.astro`). MapLibre is imported only when the element first
 * scrolls near the viewport. Tap/click the map to place the pin, drag it to
 * adjust, or use "Đặt ghim ở giữa bản đồ" (keyboard: pan with the arrow keys
 * first). The hidden `lat` / `lng` inputs are the source of truth.
 */
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { ICONS } from '../../ui/icons';
import type { GeoPoint } from '../../../types';

/** Same precision as the server (`LOCATION_DECIMALS`). */
const round = (value: number) => Number(value.toFixed(5));

const ZOOM_PIN = 16;
const ZOOM_WARD = 15;
const ZOOM_CITY = 13;

const STATUS_SET = 'Đã đặt vị trí. Kéo ghim để sửa.';
const STATUS_EMPTY = 'Chưa đặt vị trí. Phòng sẽ không hiện trên bản đồ.';

function pinElement(): HTMLElement {
  const pin = document.createElement('div');
  pin.className = 'cursor-grab text-accent active:cursor-grabbing';
  pin.setAttribute('aria-hidden', 'true');
  // Lucide map-pin, filled with paper so it reads on any basemap.
  pin.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="var(--color-paper)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.mapPin}</svg>`;
  return pin;
}

export class LocationPickerElement extends HTMLElement {
  private map: MapLibreMap | null = null;
  private marker: Marker | null = null;
  private observer: IntersectionObserver | null = null;
  private wardSelect: HTMLSelectElement | null = null;
  private readonly onWardChange = () => this.followWard();

  private get latInput() {
    return this.querySelector<HTMLInputElement>('[data-lat]')!;
  }

  private get lngInput() {
    return this.querySelector<HTMLInputElement>('[data-lng]')!;
  }

  connectedCallback(): void {
    this.wardSelect = this.closest('form')?.querySelector<HTMLSelectElement>('[data-ward-select]') ?? null;
    this.wardSelect?.addEventListener('change', this.onWardChange);
    this.querySelector<HTMLElement>('[data-loading]')?.removeAttribute('hidden');

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.observer?.disconnect();
          this.observer = null;
          void this.init();
        }
      },
      { rootMargin: '200px' },
    );
    this.observer.observe(this);
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.wardSelect?.removeEventListener('change', this.onWardChange);
    this.marker?.remove();
    this.map?.remove();
    this.map = null;
    this.marker = null;
  }

  private pin(): GeoPoint | null {
    const lat = Number.parseFloat(this.latInput.value);
    const lng = Number.parseFloat(this.lngInput.value);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  private wardCenter(): GeoPoint | null {
    const ward = this.wardSelect?.value;
    if (!ward) return null;
    const centers = JSON.parse(this.dataset.wardCenters ?? '{}') as Record<string, GeoPoint>;
    return centers[ward] ?? null;
  }

  private async init(): Promise<void> {
    const container = this.querySelector<HTMLElement>('[data-map]');
    if (!container) return;
    try {
      const [{ createBaseMap }, { Marker }] = await Promise.all([import('../../map/base-map'), import('maplibre-gl')]);
      if (!this.isConnected) return;

      const pin = this.pin();
      const ward = this.wardCenter();
      const fallback = JSON.parse(this.dataset.defaultCenter ?? 'null') as GeoPoint;
      this.map = createBaseMap({
        container,
        center: pin ?? ward ?? fallback,
        zoom: pin ? ZOOM_PIN : ward ? ZOOM_WARD : ZOOM_CITY,
      });
      this.querySelector('[data-map-placeholder]')?.remove();

      this.marker = new Marker({ element: pinElement(), anchor: 'bottom', draggable: true });
      this.marker.on('dragend', () => {
        const { lat, lng } = this.marker!.getLngLat();
        this.setPin({ lat, lng });
      });
      if (pin) this.marker.setLngLat([pin.lng, pin.lat]).addTo(this.map);

      this.map.on('click', (event) => this.setPin({ lat: event.lngLat.lat, lng: event.lngLat.lng }));

      const controls = this.querySelector<HTMLElement>('[data-controls]');
      if (controls) controls.hidden = false;
      this.querySelector('[data-place-center]')?.addEventListener('click', () => {
        const center = this.map!.getCenter();
        this.setPin({ lat: center.lat, lng: center.lng });
      });
      this.querySelector('[data-clear]')?.addEventListener('click', () => this.setPin(null));
    } catch (error) {
      console.error('[location-picker] map failed to load', error);
      const loading = this.querySelector<HTMLElement>('[data-loading]');
      if (loading) loading.textContent = 'Không tải được bản đồ. Vị trí đã lưu vẫn được giữ nguyên.';
    }
  }

  private setPin(point: GeoPoint | null): void {
    this.latInput.value = point ? String(round(point.lat)) : '';
    this.lngInput.value = point ? String(round(point.lng)) : '';
    if (point && this.map && this.marker) this.marker.setLngLat([point.lng, point.lat]).addTo(this.map);
    else this.marker?.remove();

    const status = this.querySelector('[data-status]');
    if (status) status.textContent = point ? STATUS_SET : STATUS_EMPTY;
    const clear = this.querySelector<HTMLElement>('[data-clear]');
    if (clear) clear.hidden = !point;
  }

  /** No pin yet: show the newly chosen ward. */
  private followWard(): void {
    if (!this.map || this.pin()) return;
    const ward = this.wardCenter();
    if (ward) this.map.jumpTo({ center: [ward.lng, ward.lat], zoom: ZOOM_WARD });
  }
}
