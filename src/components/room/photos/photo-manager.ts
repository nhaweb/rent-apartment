/**
 * <photo-manager>: the room photo uploader on `/quan-ly/phong/[id]`.
 *
 * Per file: check -> resize/re-encode in the browser (`process-image.ts`) ->
 * `requestPhotoUploads` (presigned URLs) -> PUT to R2 with progress ->
 * `confirmPhotoUploads` (server verifies and saves). At most two at a time.
 * Failed files keep their tile with "Thử lại". Saved photos can be reordered
 * by dragging the grip (mouse or touch), with the arrow buttons, or with the
 * arrow keys on the grip; the first is the cover. Delete asks first.
 *
 * Fires `photos-change` (detail: { count, hidden }) so the room form can
 * keep its status choice in line with the "available needs a photo" rule.
 */
import { actions } from 'astro:actions';
import { MAX_PHOTOS_PER_ROOM } from '../../../lib/photo-rules';
import { photoSources } from '../../../lib/photo-urls';
import type { RoomPhoto } from '../../../types';
import { closePopover } from '../../ui/motion/popover-motion';
import { checkFile, PhotoError, processImage, uploadBlob, type ProcessedPhoto } from './process-image';

const CONCURRENCY = 2;

interface PendingUpload {
  file: File;
  tile: HTMLLIElement;
  processed?: ProcessedPhoto;
  previewUrl?: string;
}

export interface PhotosChangeDetail {
  count: number;
  /** The room was just switched to "Đang ẩn" because its last photo was deleted. */
  hidden: boolean;
}

const q = <T extends Element>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;

class PhotoManagerElement extends HTMLElement {
  private roomId = '';
  private status = '';
  private list!: HTMLUListElement;
  private input!: HTMLInputElement;
  private dropzone!: HTMLElement;
  private notice!: HTMLElement;
  private template!: HTMLTemplateElement;
  private dialog!: HTMLElement;
  private pending = new Set<PendingUpload>();
  private queue: PendingUpload[] = [];
  private active = 0;
  private deleteTarget: HTMLLIElement | null = null;
  /** Reorder requests run one after another, in order. */
  private saving: Promise<unknown> = Promise.resolve();

  connectedCallback(): void {
    if (this.list) return;
    this.roomId = this.dataset.roomId ?? '';
    this.status = this.dataset.status ?? '';
    this.list = q(this, '[data-list]');
    this.input = q(this, '[data-input]');
    this.dropzone = q(this, '[data-dropzone]');
    this.notice = q(this, '[data-notice]');
    this.template = q(this, '[data-tile-template]');
    this.dialog = q(this, '[popover]');
    this.dropzone.hidden = false;

    this.input.addEventListener('change', () => {
      this.add([...(this.input.files ?? [])]);
      this.input.value = '';
    });

    // The whole section accepts dropped files; never let the browser open them instead.
    this.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      this.dropzone.toggleAttribute('data-over', true);
    });
    this.addEventListener('dragleave', (event) => {
      if (!this.contains(event.relatedTarget as Node | null)) this.dropzone.removeAttribute('data-over');
    });
    this.addEventListener('drop', (event) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      this.dropzone.removeAttribute('data-over');
      this.add([...event.dataTransfer.files]);
    });

    this.list.addEventListener('click', (event) => this.onClick(event));
    this.list.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.list.addEventListener('keydown', (event) => this.onKeydown(event));
    q(this, '[data-confirm-delete]').addEventListener('click', () => void this.confirmDelete());

    window.addEventListener('beforeunload', (event) => {
      if (this.active > 0 || this.queue.length > 0) event.preventDefault();
    });

    this.refresh(false);
  }

  // ------------------------------------------------------------ state

  private get savedTiles(): HTMLLIElement[] {
    return [...this.list.querySelectorAll<HTMLLIElement>('[data-tile][data-photo-id]')];
  }

  private savedIds(): string[] {
    return this.savedTiles.map((tile) => tile.dataset.photoId!);
  }

  /** Labels, cover badge, arrow buttons, counter, and whether more can be added. */
  private refresh(announce = true, hidden = false): void {
    const saved = this.savedTiles;
    saved.forEach((tile, index) => {
      q<HTMLElement>(tile, '[data-label]').textContent = index === 0 ? 'Ảnh bìa' : `Ảnh ${index + 1}`;
      q<HTMLElement>(tile, '[data-cover]').hidden = index !== 0;
      q<HTMLButtonElement>(tile, '[data-move="-1"]').disabled = index === 0;
      q<HTMLButtonElement>(tile, '[data-move="1"]').disabled = index === saved.length - 1;
    });
    q<HTMLElement>(this, '[data-count]').textContent = String(saved.length);
    const full = saved.length + this.pending.size >= MAX_PHOTOS_PER_ROOM;
    this.input.disabled = full;
    this.dropzone.toggleAttribute('data-full', full);
    if (announce) {
      this.dispatchEvent(
        new CustomEvent<PhotosChangeDetail>('photos-change', { bubbles: true, detail: { count: saved.length, hidden } }),
      );
    }
  }

  private say(message: string, tone: 'info' | 'error' = 'info'): void {
    this.notice.textContent = message;
    this.notice.classList.toggle('text-danger', tone === 'error');
    this.notice.classList.toggle('text-muted', tone !== 'error');
  }

  // ------------------------------------------------------------ uploads

  private add(files: File[]): void {
    if (files.length === 0) return;
    const room = MAX_PHOTOS_PER_ROOM - this.savedTiles.length - this.pending.size;
    const skipped = Math.max(0, files.length - room);
    if (skipped > 0) {
      this.say(`Mỗi phòng tối đa ${MAX_PHOTOS_PER_ROOM} ảnh. Đã bỏ qua ${skipped} ảnh.`, 'error');
    } else {
      this.say('');
    }
    for (const file of files.slice(0, Math.max(0, room))) {
      const tile = this.newTile(file.name);
      this.list.append(tile);
      const problem = checkFile(file);
      if (problem) {
        this.showFailure(tile, problem);
        continue;
      }
      const item: PendingUpload = { file, tile };
      this.pending.add(item);
      tile.addEventListener('photo-retry', () => this.enqueue(item));
      tile.addEventListener('photo-dismiss', () => this.dismiss(item));
      this.enqueue(item);
    }
    this.refresh(false);
  }

  private newTile(name: string): HTMLLIElement {
    const tile = (this.template.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
    tile.dataset.fileName = name;
    q<HTMLElement>(tile, '[data-label]').textContent = name;
    q<HTMLImageElement>(tile, '[data-img]').alt = '';
    return tile;
  }

  private enqueue(item: PendingUpload): void {
    q<HTMLElement>(item.tile, '[data-failed]').hidden = true;
    this.setProgress(item.tile, 0, 'Đang chờ...');
    this.queue.push(item);
    this.pump();
  }

  private pump(): void {
    while (this.active < CONCURRENCY && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.active++;
      void this.upload(item).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private setProgress(tile: HTMLLIElement, fraction: number | null, label?: string): void {
    const bar = q<HTMLElement>(tile, '[data-progress]');
    bar.hidden = fraction === null;
    if (fraction !== null) q<HTMLElement>(bar, '[data-progress-bar]').style.width = `${Math.round(fraction * 100)}%`;
    if (label !== undefined) q<HTMLElement>(tile, '[data-label]').textContent = label;
  }

  private async upload(item: PendingUpload): Promise<void> {
    const { tile } = item;
    try {
      if (!item.processed) {
        this.setProgress(tile, 0, 'Đang xử lý ảnh...');
        item.processed = await processImage(item.file, () =>
          this.setProgress(tile, 0, 'Đang xử lý ảnh HEIC, lần đầu có thể mất vài giây...'),
        );
        item.previewUrl = URL.createObjectURL(item.processed.thumb);
        const img = q<HTMLImageElement>(tile, '[data-img]');
        img.src = item.previewUrl;
        img.width = item.processed.width;
        img.height = item.processed.height;
        img.classList.remove('invisible');
      }
      const { full, thumb } = item.processed;

      this.setProgress(tile, 0, 'Đang tải lên 0%');
      const presigned = await actions.requestPhotoUploads({ roomId: this.roomId, count: 1 });
      if (presigned.error) throw new PhotoError(presigned.error.message);
      const target = presigned.data.uploads[0]!;

      const total = full.size + thumb.size;
      const loaded = [0, 0];
      const report = () => {
        const fraction = (loaded[0]! + loaded[1]!) / total;
        this.setProgress(tile, fraction, `Đang tải lên ${Math.round(fraction * 100)}%`);
      };
      await Promise.all([
        uploadBlob(target.url, full, (bytes) => ((loaded[0] = bytes), report())),
        uploadBlob(target.thumbUrl, thumb, (bytes) => ((loaded[1] = bytes), report())),
      ]);

      this.setProgress(tile, 1, 'Đang lưu...');
      const confirmed = await actions.confirmPhotoUploads({
        roomId: this.roomId,
        uploads: [{ key: target.key, thumbKey: target.thumbKey }],
      });
      if (confirmed.error) throw new PhotoError(confirmed.error.message);
      const photo = confirmed.data.photos[0];
      if (!photo) throw new PhotoError('Ảnh tải lên bị lỗi. Hãy thử lại.');
      this.markSaved(item, photo);
    } catch (error) {
      this.showFailure(tile, error instanceof PhotoError ? error : new PhotoError('Có lỗi xảy ra. Hãy thử lại.'));
    }
  }

  private markSaved(item: PendingUpload, photo: RoomPhoto): void {
    const { tile } = item;
    this.pending.delete(item);
    const wasEmpty = this.savedTiles.length === 0;
    tile.dataset.photoId = photo.id;
    const img = q<HTMLImageElement>(tile, '[data-img]');
    const { src, srcset } = photoSources(photo, 'thumb');
    const preview = item.previewUrl;
    img.width = photo.width;
    img.height = photo.height;
    img.srcset = srcset;
    img.src = src;
    if (preview) img.addEventListener('load', () => URL.revokeObjectURL(preview), { once: true });
    this.setProgress(tile, null);
    q<HTMLElement>(tile, '[data-actions]').hidden = false;
    // Saved photos come before uploads still in progress.
    const lastSaved = this.savedTiles.filter((other) => other !== tile).at(-1);
    if (lastSaved) lastSaved.after(tile);
    else this.list.prepend(tile);
    this.refresh();
    if (wasEmpty && this.status !== 'available') {
      this.say('Phòng đã có ảnh. Chọn “Còn trống” rồi lưu để phòng hiện công khai.');
    }
  }

  private showFailure(tile: HTMLLIElement, error: PhotoError): void {
    this.setProgress(tile, null, tile.dataset.fileName ?? 'Chưa tải lên được');
    q<HTMLElement>(tile, '[data-failed]').hidden = false;
    q<HTMLElement>(tile, '[data-error-text]').textContent = error.message;
    q<HTMLElement>(tile, '[data-retry]').hidden = !error.retryable;
    if (!error.retryable) {
      // Not uploadable: free its slot; "Bỏ" removes the tile.
      for (const item of this.pending) if (item.tile === tile) this.pending.delete(item);
      tile.addEventListener('photo-dismiss', () => tile.remove(), { once: true });
      this.refresh(false);
    }
  }

  private dismiss(item: PendingUpload): void {
    this.pending.delete(item);
    this.queue = this.queue.filter((other) => other !== item);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    item.tile.remove();
    this.refresh(false);
  }

  // ------------------------------------------------------------ tile buttons

  private onClick(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    const tile = button?.closest<HTMLLIElement>('[data-tile]');
    if (!button || !tile) return;
    if (button.matches('[data-retry]')) tile.dispatchEvent(new Event('photo-retry'));
    else if (button.matches('[data-dismiss]')) tile.dispatchEvent(new Event('photo-dismiss'));
    else if (button.matches('[data-move]')) this.move(tile, Number(button.dataset.move), button.dataset.move!);
    else if (button.matches('[data-delete]')) this.askDelete(tile);
  }

  private onKeydown(event: KeyboardEvent): void {
    const handle = (event.target as Element).closest('[data-drag]');
    const tile = handle?.closest<HTMLLIElement>('[data-tile][data-photo-id]');
    if (!tile) return;
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    this.move(tile, delta);
    q<HTMLElement>(tile, '[data-drag]').focus();
  }

  /** Moves a saved photo one place and saves the order. */
  private move(tile: HTMLLIElement, delta: number, refocus?: string): void {
    const before = this.savedIds();
    const tiles = this.savedTiles;
    const index = tiles.indexOf(tile);
    const target = tiles[index + delta];
    if (!target) return;
    if (delta < 0) target.before(tile);
    else target.after(tile);
    this.refresh();
    if (refocus) {
      const button = q<HTMLButtonElement>(tile, `[data-move="${refocus}"]`);
      (button.disabled ? q<HTMLElement>(tile, '[data-drag]') : button).focus();
    }
    this.saveOrder(before);
  }

  private saveOrder(previous: string[]): void {
    const ids = this.savedIds();
    if (ids.join() === previous.join()) return;
    this.saving = this.saving.then(async () => {
      const { error } = await actions.reorderPhotos({ roomId: this.roomId, photoIds: ids });
      if (!error) {
        this.say(ids[0] !== previous[0] ? 'Đã đổi ảnh bìa.' : 'Đã lưu thứ tự ảnh.');
        return;
      }
      // Put the tiles back the way the server has them.
      const byId = new Map(this.savedTiles.map((tile) => [tile.dataset.photoId!, tile]));
      const first = this.list.firstElementChild;
      for (const id of previous.toReversed()) {
        const tile = byId.get(id);
        if (tile) this.list.insertBefore(tile, this.list.firstElementChild ?? first);
      }
      this.refresh();
      this.say(error.message, 'error');
    });
  }

  // ------------------------------------------------------------ drag to reorder

  private onPointerDown(event: PointerEvent): void {
    const handle = (event.target as Element).closest<HTMLElement>('[data-drag]');
    const tile = handle?.closest<HTMLLIElement>('[data-tile][data-photo-id]');
    if (!handle || !tile || event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const before = this.savedIds();
    tile.toggleAttribute('data-dragging', true);

    const onMove = (move: PointerEvent) => {
      const over = document
        .elementFromPoint(move.clientX, move.clientY)
        ?.closest<HTMLLIElement>('[data-tile][data-photo-id]');
      if (over && over !== tile && over.parentElement === this.list) {
        const tiles = this.savedTiles;
        if (tiles.indexOf(tile) < tiles.indexOf(over)) over.after(tile);
        else over.before(tile);
        this.refresh(false);
      }
      // Scroll when dragging near the top or bottom of the screen (phones).
      const edge = 64;
      if (move.clientY < edge) window.scrollBy(0, -12);
      else if (move.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      tile.removeAttribute('data-dragging');
      this.refresh();
      this.saveOrder(before);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  // ------------------------------------------------------------ delete

  private askDelete(tile: HTMLLIElement): void {
    this.deleteTarget = tile;
    const warning = q<HTMLElement>(this.dialog, '[data-last-warning]');
    const last = this.savedTiles.length === 1;
    warning.hidden = !last;
    warning.textContent =
      this.status === 'available'
        ? 'Đây là ảnh cuối cùng. Phòng sẽ chuyển sang “Đang ẩn” và không hiện công khai cho tới khi bạn thêm ảnh mới.'
        : 'Đây là ảnh cuối cùng của phòng.';
    this.dialog.showPopover();
  }

  private async confirmDelete(): Promise<void> {
    const tile = this.deleteTarget;
    this.deleteTarget = null;
    closePopover(this.dialog);
    const photoId = tile?.dataset.photoId;
    if (!tile || !photoId) return;
    tile.querySelectorAll('button').forEach((button) => (button.disabled = true));
    const { data, error } = await actions.deletePhoto({ roomId: this.roomId, photoId });
    if (error) {
      tile.querySelectorAll('button').forEach((button) => (button.disabled = false));
      this.refresh(false);
      this.say(error.message, 'error');
      q<HTMLElement>(tile, '[data-delete]').focus();
      return;
    }
    const next = tile.nextElementSibling ?? tile.previousElementSibling;
    tile.remove();
    if (data.hidden) this.status = 'hidden';
    this.refresh(true, data.hidden);
    this.say(data.hidden ? 'Đã xóa ảnh. Phòng đã chuyển sang “Đang ẩn” vì không còn ảnh.' : 'Đã xóa ảnh.');
    (next?.querySelector<HTMLElement>('[data-delete]') ?? this.input).focus();
  }
}

customElements.define('photo-manager', PhotoManagerElement);
