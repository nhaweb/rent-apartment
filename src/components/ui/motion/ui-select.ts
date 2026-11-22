/**
 * <ui-select>: wraps a native <select> and, on devices with a fine pointer,
 * replaces its popup with a styled, animated listbox (the APG "select-only
 * combobox" pattern). The native select stays in the form as the source of
 * truth and still fires `change`, so GetForm and form submits work as before.
 *
 * Touch devices keep the native picker (better on phones), and without JS
 * the plain select is shown.
 *
 * Markup: <ui-select class="relative block"> … <select> … <svg data-chevron> </ui-select>
 */
import { EASE_IN, EASE_OUT, motion } from './motion';

const finePointer = window.matchMedia('(pointer: fine)');
let uid = 0;

/** Lowercase, without Vietnamese diacritics, for type-ahead. */
function fold(text: string): string {
  return text.toLowerCase().replaceAll('đ', 'd').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

const CHECK_ICON =
  '<svg class="invisible size-4 shrink-0 text-accent group-aria-selected:visible" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

class UiSelectElement extends HTMLElement {
  private select: HTMLSelectElement | null = null;
  private trigger!: HTMLButtonElement;
  private list!: HTMLUListElement;
  private chevron: Element | null = null;
  private items: HTMLLIElement[] = [];
  private active = -1;
  private typed = '';
  private typedAt = 0;
  private closing = false;

  connectedCallback(): void {
    if (this.select || !finePointer.matches) return;
    const select = this.querySelector('select');
    if (!select) return;
    this.select = select;
    const id = select.id || `ui-select-${++uid}`;
    this.chevron = this.querySelector('[data-chevron]');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = `${select.className} cursor-pointer text-left`;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-listbox`);
    for (const attr of ['aria-invalid', 'aria-describedby', 'aria-label']) {
      const value = select.getAttribute(attr);
      if (value) trigger.setAttribute(attr, value);
    }

    const list = document.createElement('ul');
    list.id = `${id}-listbox`;
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    list.hidden = true;
    list.className =
      'absolute top-full left-0 z-50 mt-2 max-h-80 w-max max-w-80 min-w-full origin-top overflow-y-auto overscroll-contain rounded-card border border-line bg-paper py-1.5 text-small text-ink shadow-float';

    const label = select.labels?.[0];
    if (label) {
      label.id ||= `${id}-label`;
      trigger.setAttribute('aria-labelledby', label.id);
      list.setAttribute('aria-labelledby', label.id);
      label.addEventListener('click', (event) => {
        event.preventDefault();
        trigger.focus();
      });
    }

    this.items = [...select.options].map((option, index) => {
      const item = document.createElement('li');
      item.id = `${id}-option-${index}`;
      item.setAttribute('role', 'option');
      item.className =
        'group flex min-h-10 cursor-pointer items-center justify-between gap-6 px-3.5 whitespace-nowrap data-active:bg-surface aria-selected:font-medium aria-disabled:cursor-default aria-disabled:text-muted';
      if (option.disabled) item.setAttribute('aria-disabled', 'true');
      const text = document.createElement('span');
      text.textContent = option.text;
      item.append(text);
      item.insertAdjacentHTML('beforeend', CHECK_ICON);
      list.append(item);
      return item;
    });

    select.hidden = true;
    select.tabIndex = -1;
    select.before(trigger);
    this.append(list);
    this.trigger = trigger;
    this.list = list;
    this.sync();

    trigger.addEventListener('click', (event) => {
      // Keyboard clicks (detail 0) are handled in keydown.
      if (event.detail === 0) return;
      if (this.isOpen) this.close();
      else this.open();
    });
    trigger.addEventListener('keydown', (event) => this.onKeydown(event));
    this.addEventListener('focusout', (event) => {
      if (!this.contains(event.relatedTarget as Node | null)) this.close();
    });
    list.addEventListener('pointerdown', (event) => event.preventDefault());
    list.addEventListener('pointermove', (event) => {
      const index = this.indexOf(event.target);
      if (index >= 0 && index !== this.active) this.setActive(index, false);
    });
    list.addEventListener('click', (event) => {
      const index = this.indexOf(event.target);
      if (index >= 0) this.commit(index);
    });
    select.addEventListener('change', () => this.sync());
    window.addEventListener('pageshow', () => this.sync());
  }

  disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.onOutside, true);
  }

  private get isOpen(): boolean {
    return this.trigger.getAttribute('aria-expanded') === 'true';
  }

  private indexOf(target: EventTarget | null): number {
    const item = (target as Element | null)?.closest<HTMLLIElement>('[role="option"]');
    return item ? this.items.indexOf(item) : -1;
  }

  private sync(): void {
    if (!this.select) return;
    const selected = this.select.selectedIndex;
    this.trigger.textContent = this.select.options[selected]?.text ?? '';
    const options = this.select.options;
    this.items.forEach((item, index) => {
      item.setAttribute('aria-selected', String(index === selected));
      // Dependent selects (e.g. the room form's "Khu vực quen gọi") narrow their
      // options by disabling/hiding them, then fire `change`; mirror that here.
      const option = options[index];
      if (option?.disabled) item.setAttribute('aria-disabled', 'true');
      else item.removeAttribute('aria-disabled');
      item.hidden = Boolean(option?.hidden);
    });
  }

  private onOutside = (event: PointerEvent): void => {
    if (!this.contains(event.target as Node | null)) this.close();
  };

  private open(): void {
    if (this.isOpen || !this.select) return;
    this.closing = false;
    const { list } = this;
    list.hidden = false;
    list.style.left = '';
    list.style.right = '';
    if (list.getBoundingClientRect().right > window.innerWidth - 8) {
      list.style.left = 'auto';
      list.style.right = '0';
    }
    this.trigger.setAttribute('aria-expanded', 'true');
    this.setActive(Math.max(this.select.selectedIndex, this.step(-1, 1)), true);
    document.addEventListener('pointerdown', this.onOutside, true);

    const animate = motion();
    if (!animate) return;
    animate(list, { opacity: [0, 1], scale: [0.96, 1], y: [-4, 0] }, { duration: 0.18, ease: EASE_OUT });
    if (this.chevron) animate(this.chevron, { rotate: 180 }, { duration: 0.2, ease: EASE_OUT });
  }

  private close(): void {
    if (!this.isOpen) return;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', this.onOutside, true);

    const animate = motion();
    if (!animate) {
      this.list.hidden = true;
      if (this.chevron instanceof SVGElement) this.chevron.style.removeProperty('transform');
      return;
    }
    if (this.chevron) animate(this.chevron, { rotate: 0 }, { duration: 0.2, ease: EASE_OUT });
    this.closing = true;
    animate(this.list, { opacity: 0, scale: 0.98, y: -2 }, { duration: 0.12, ease: EASE_IN }).then(() => {
      if (!this.closing) return;
      this.closing = false;
      this.list.hidden = true;
    });
  }

  private setActive(index: number, scroll: boolean): void {
    this.active = index;
    this.items.forEach((item, i) => item.toggleAttribute('data-active', i === index));
    const item = this.items[index];
    if (!item) return;
    this.trigger.setAttribute('aria-activedescendant', item.id);
    if (scroll) item.scrollIntoView({ block: 'nearest' });
  }

  /** Next enabled index from `from` in `direction`, clamped to the ends. */
  private step(from: number, direction: 1 | -1, count = 1): number {
    const enabled = this.items.map((item, i) => (item.hasAttribute('aria-disabled') ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return -1;
    const after = direction === 1 ? enabled.filter((i) => i > from) : enabled.filter((i) => i < from).reverse();
    return after[Math.min(count, after.length) - 1] ?? (from >= 0 ? from : enabled[0]);
  }

  private commit(index: number): void {
    const select = this.select;
    const option = select?.options[index];
    if (!select || !option || option.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    this.sync();
    this.close();
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  private typeahead(key: string): void {
    const now = Date.now();
    this.typed = now - this.typedAt > 600 ? key : this.typed + key;
    this.typedAt = now;
    const query = fold(this.typed);
    const start = this.typed.length > 1 ? this.active : this.active + 1;
    const count = this.items.length;
    for (let offset = 0; offset < count; offset++) {
      const index = (Math.max(start, 0) + offset) % count;
      const item = this.items[index];
      if (!item.hasAttribute('aria-disabled') && fold(item.textContent ?? '').startsWith(query)) {
        if (!this.isOpen) this.open();
        this.setActive(index, true);
        return;
      }
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    const open = this.isOpen;
    const typing = Date.now() - this.typedAt < 600;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open || event.altKey) this.open();
        else this.setActive(this.step(this.active, 1), true);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) this.open();
        else if (event.altKey) this.commit(this.active);
        else this.setActive(this.step(this.active, -1), true);
        return;
      case 'Home':
      case 'End':
        event.preventDefault();
        this.open();
        this.setActive(event.key === 'Home' ? this.step(-1, 1) : this.step(this.items.length, -1), true);
        return;
      case 'PageDown':
      case 'PageUp':
        if (!open) return;
        event.preventDefault();
        this.setActive(this.step(this.active, event.key === 'PageDown' ? 1 : -1, 10), true);
        return;
      case 'Enter':
        event.preventDefault();
        if (open) this.commit(this.active);
        else this.open();
        return;
      case ' ':
        event.preventDefault();
        if (typing) this.typeahead(' ');
        else if (open) this.commit(this.active);
        else this.open();
        return;
      case 'Escape':
        if (!open) return;
        // Keep a surrounding sheet open: only the listbox closes.
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      case 'Tab':
        if (open) this.commit(this.active);
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          this.typeahead(event.key);
        }
    }
  }
}

if (!customElements.get('ui-select')) customElements.define('ui-select', UiSelectElement);
