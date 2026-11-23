/**
 * `<room-chat>`: the renter assistant inside `ChatLauncher.astro`. Loaded on
 * first open. Talks to `POST /api/tro-ly`; the history lives in this tab
 * (sessionStorage) so it survives moving between pages.
 */
import { ICONS } from '../ui/icons';
import type { ChatReply, ChatRoomCard } from '../../lib/chat/assistant';
import { CHAT_HISTORY_MAX, CHAT_MESSAGE_MAX, CHAT_MODEL_TEXT_MAX } from '../../lib/chat/limits';

interface Entry {
  role: 'user' | 'model';
  text: string;
  rooms?: ChatRoomCard[];
  listingUrl?: string;
  total?: number;
  error?: boolean;
}

const STORAGE_KEY = 'room-chat-v1';


function loadHistory(): Entry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Entry[]).slice(-30) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: Entry[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-30)));
  } catch {
    // Private mode or storage full: the chat still works for this page.
  }
}

function icon(name: keyof typeof ICONS, size = 20, extra = ''): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 ${extra}" aria-hidden="true">${ICONS[name]}</svg>`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Only same-site paths from the server are turned into links. */
function safePath(path: string | undefined): string | undefined {
  return path && path.startsWith('/') && !path.startsWith('//') ? path : undefined;
}

function roomCard(room: ChatRoomCard): HTMLElement {
  const link = el('a', 'transition-feedback flex gap-3 rounded-card border border-line bg-paper p-2 hover:border-ink');
  link.href = safePath(room.url) ?? '#';
  if (room.thumb) {
    const img = el('img', 'aspect-[4/3] h-auto w-24 shrink-0 self-start rounded-lg bg-surface object-cover');
    img.src = room.thumb.src;
    img.width = room.thumb.width;
    img.height = room.thumb.height;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    link.append(img);
  }
  const info = el('div', 'min-w-0 flex-1 py-0.5');
  info.append(el('p', 'truncate text-small font-medium text-ink', room.title));
  const price = el('p', 'text-small');
  price.append(el('span', 'font-medium text-ink', room.price), el('span', 'text-caption text-muted', '/tháng'));
  info.append(price, el('p', 'truncate text-caption text-muted', `${room.area} · ${room.place}`));
  link.append(info);
  return link;
}

class RoomChat extends HTMLElement {
  private entries: Entry[] = [];
  private busy = false;
  private log!: HTMLElement;
  private empty!: HTMLElement;
  private form!: HTMLFormElement;
  private input!: HTMLTextAreaElement;
  private submit!: HTMLButtonElement;

  connectedCallback(): void {
    this.log = this.querySelector('[data-chat-log]')!;
    this.empty = this.querySelector('[data-chat-empty]')!;
    this.form = this.querySelector('[data-chat-form]')!;
    this.input = this.form.querySelector('textarea')!;
    this.submit = this.form.querySelector('button[type="submit"]')!;

    this.form.hidden = false;
    this.querySelector<HTMLElement>('[data-chat-suggestions]')!.hidden = false;

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.send(this.input.value);
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.input.addEventListener('input', () => this.fitInput());
    this.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-suggestion]');
      if (button) void this.send(button.dataset.suggestion ?? '');
    });

    this.entries = loadHistory();
    for (const entry of this.entries) this.render(entry);
    this.updateEmpty();
    this.scrollToEnd();

    // Focus the box on fine pointers only (on phones it would pop the keyboard).
    const popover = this.closest<HTMLElement>('[popover]');
    const focus = () => {
      if (matchMedia('(pointer: fine)').matches) this.input.focus();
    };
    popover?.addEventListener('toggle', (event) => {
      if ((event as ToggleEvent).newState === 'open') focus();
    });
    if (popover?.matches(':popover-open')) focus();
  }

  private fitInput(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${this.input.scrollHeight}px`;
  }

  private updateEmpty(): void {
    this.empty.hidden = this.entries.length > 0;
  }

  private scrollToEnd(): void {
    this.log.scrollTop = this.log.scrollHeight;
  }

  private render(entry: Entry): HTMLElement {
    const wrap = el('div', entry.role === 'user' ? 'mt-4 flex justify-end first:mt-0' : 'mt-4 grid grid-cols-1 gap-2 first:mt-0');
    if (entry.role === 'user') {
      wrap.append(el('p', 'max-w-[85%] rounded-lg bg-surface px-3 py-2 whitespace-pre-line break-words', entry.text));
    } else {
      const text = el('p', `whitespace-pre-line break-words ${entry.error ? 'text-danger' : ''}`, entry.text);
      wrap.append(text);
      if (entry.rooms?.length) {
        const list = el('div', 'grid grid-cols-1 gap-2');
        for (const room of entry.rooms) list.append(roomCard(room));
        wrap.append(list);
      }
      const listing = safePath(entry.listingUrl);
      if (listing && entry.total && entry.total > (entry.rooms?.length ?? 0)) {
        const more = el('a', 'link inline-flex min-h-11 items-center gap-1 text-small font-medium text-accent');
        more.href = listing;
        more.textContent = `Xem tất cả ${entry.total} phòng`;
        more.insertAdjacentHTML('beforeend', icon('arrowRight', 16));
        wrap.append(more);
      }
    }
    this.log.append(wrap);
    return wrap;
  }

  private add(entry: Entry): void {
    this.entries.push(entry);
    this.render(entry);
    this.updateEmpty();
    this.scrollToEnd();
    if (!entry.error) saveHistory(this.entries.filter((e) => !e.error));
  }

  /** The last turns, starting with a user message, as the API expects. */
  private payload(): { role: 'user' | 'model'; text: string }[] {
    const turns = this.entries
      .filter((entry) => !entry.error)
      .map((entry) => ({ role: entry.role, text: entry.text.slice(0, entry.role === 'user' ? CHAT_MESSAGE_MAX : CHAT_MODEL_TEXT_MAX) }))
      .slice(-CHAT_HISTORY_MAX);
    while (turns.length > 1 && turns[0]!.role !== 'user') turns.shift();
    return turns;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.submit.disabled = busy;
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-suggestion]')) button.disabled = busy;
    this.setAttribute('aria-busy', String(busy));
  }

  private async send(raw: string): Promise<void> {
    const text = raw.trim().slice(0, CHAT_MESSAGE_MAX);
    if (!text || this.busy) return;
    this.input.value = '';
    this.fitInput();
    this.add({ role: 'user', text });
    this.setBusy(true);

    const pending = el('p', 'mt-4 flex items-center gap-2 text-small text-muted');
    pending.innerHTML = `${icon('loaderCircle', 16, 'motion-safe:animate-spin')}<span>Đang tìm…</span>`;
    this.log.append(pending);
    this.scrollToEnd();

    try {
      const response = await fetch('/api/tro-ly', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: this.payload(), roomId: this.dataset.roomId || undefined }),
      });
      const data = (await response.json().catch(() => null)) as (ChatReply & { error?: string }) | null;
      pending.remove();
      if (!response.ok || !data || data.error) {
        this.add({ role: 'model', text: data?.error ?? 'Không gửi được câu hỏi. Kiểm tra kết nối rồi thử lại.', error: true });
        return;
      }
      this.add({ role: 'model', text: data.reply, rooms: data.rooms, listingUrl: data.listingUrl, total: data.total });
    } catch {
      pending.remove();
      this.add({ role: 'model', text: 'Không gửi được câu hỏi. Kiểm tra kết nối rồi thử lại.', error: true });
    } finally {
      this.setBusy(false);
    }
  }
}

if (!customElements.get('room-chat')) customElements.define('room-chat', RoomChat);
