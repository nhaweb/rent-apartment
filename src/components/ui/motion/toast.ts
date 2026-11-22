/**
 * Toasts (`[data-toast]`, `Toast.astro`): fade and rise in, close after
 * `TOAST_DURATION` (paused while hovered or focused) or with ×, fade out.
 * Also removes the query params that triggered the toast, so a reload or a
 * shared link does not show it again. Without JS the toast simply stays.
 */
import { EASE_IN, EASE_OUT, loadMotion, motion } from './motion';

export const TOAST_DURATION = 5000;

function clearParams(toast: HTMLElement): void {
  const names = toast.dataset.toastParams?.split(',').filter(Boolean) ?? [];
  if (!names.length) return;
  const url = new URL(window.location.href);
  for (const name of names) url.searchParams.delete(name);
  if (url.href !== window.location.href) history.replaceState(history.state, '', url);
}

function dismiss(toast: HTMLElement): void {
  if (toast.dataset.closing) return;
  toast.dataset.closing = '1';
  const animate = motion();
  if (!animate) {
    toast.remove();
    return;
  }
  animate(toast, { opacity: 0, y: 8 }, { duration: 0.18, ease: EASE_IN }).then(() => toast.remove());
}

function setup(toast: HTMLElement): void {
  clearParams(toast);

  const close = toast.querySelector<HTMLButtonElement>('[data-toast-close]');
  if (close) {
    close.hidden = false;
    close.addEventListener('click', () => dismiss(toast));
  }

  // Countdown that pauses while the pointer or focus is inside.
  let remaining = TOAST_DURATION;
  let startedAt = 0;
  let timer: number | undefined;
  const hovered = { pointer: false, focus: false };
  const run = () => {
    if (timer !== undefined || hovered.pointer || hovered.focus) return;
    startedAt = performance.now();
    timer = window.setTimeout(() => dismiss(toast), remaining);
  };
  const pause = () => {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(1000, remaining - (performance.now() - startedAt));
  };
  const track = (key: keyof typeof hovered, value: boolean) => () => {
    hovered[key] = value;
    if (value) pause();
    else run();
  };
  toast.addEventListener('pointerenter', track('pointer', true));
  toast.addEventListener('pointerleave', track('pointer', false));
  toast.addEventListener('focusin', track('focus', true));
  toast.addEventListener('focusout', track('focus', false));

  // Hide until Motion is ready so it does not pop in and then animate.
  toast.style.opacity = '0';
  void loadMotion().then(() => {
    const animate = motion();
    if (animate) {
      animate(toast, { opacity: [0, 1], y: [8, 0] }, { duration: 0.24, ease: EASE_OUT });
    } else {
      toast.style.removeProperty('opacity');
    }
    run();
  });
}

export function initToasts(): void {
  for (const toast of document.querySelectorAll<HTMLElement>('[data-toast]')) setup(toast);
}
