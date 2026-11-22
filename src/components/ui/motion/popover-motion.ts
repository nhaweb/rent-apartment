/**
 * Enter and exit animations for native popovers marked `data-motion`:
 * - `sheet`: full-screen panel, fades and rises in.
 * - `drawer`: like `sheet` on phones; from md it slides in from the right.
 *
 * Native `popover="auto"` hides at once on Escape or an outside click, which
 * leaves no time for an exit animation. With JS the popover is switched to
 * `manual` and those dismissals are handled here instead. Without JS the
 * markup keeps working as a plain auto popover.
 */
import { EASE_IN, EASE_OUT, SPRING_PANEL, motion } from './motion';

const SELECTOR = '[popover][data-motion]';
const md = window.matchMedia('(min-width: 48rem)');
const closing = new WeakSet<HTMLElement>();

function slides(pop: HTMLElement): boolean {
  return pop.dataset.motion === 'drawer' && md.matches;
}

function enter(pop: HTMLElement): void {
  const animate = motion();
  if (!animate) return;
  if (slides(pop)) {
    animate(pop, { x: ['100%', '0%'] }, SPRING_PANEL);
  } else {
    animate(pop, { opacity: [0, 1], y: [24, 0] }, { duration: 0.28, ease: EASE_OUT });
  }
}

function clearStyles(pop: HTMLElement): void {
  for (const property of ['opacity', 'transform', 'translate']) pop.style.removeProperty(property);
}

export function closePopover(pop: HTMLElement): void {
  if (!pop.matches(':popover-open') || closing.has(pop)) return;
  const animate = motion();
  if (!animate) {
    pop.hidePopover();
    return;
  }
  closing.add(pop);
  const animation = slides(pop)
    ? animate(pop, { x: '100%' }, { duration: 0.22, ease: EASE_IN })
    : animate(pop, { opacity: 0, y: 16 }, { duration: 0.18, ease: EASE_IN });
  animation.then(() => {
    pop.hidePopover();
    clearStyles(pop);
    closing.delete(pop);
  });
}

function openPopovers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`${SELECTOR}:popover-open`)];
}

export function initPopoverMotion(): void {
  for (const pop of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    pop.setAttribute('popover', 'manual');
    pop.addEventListener('beforetoggle', (event) => {
      if ((event as ToggleEvent).newState === 'open') enter(pop);
    });
  }

  // Close buttons (`popovertargetaction="hide"`) and toggles on an open panel.
  document.addEventListener(
    'click',
    (event) => {
      const invoker = (event.target as Element | null)?.closest<HTMLButtonElement>('button[popovertarget]');
      if (!invoker || invoker.getAttribute('popovertargetaction') === 'show') return;
      const pop = document.getElementById(invoker.getAttribute('popovertarget') ?? '');
      if (!pop?.matches(`${SELECTOR}:popover-open`)) return;
      event.preventDefault();
      closePopover(pop);
    },
    true,
  );

  // Escape closes the top-most panel, unless something inside handled it.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const top = openPopovers().at(-1);
    if (!top) return;
    event.preventDefault();
    closePopover(top);
  });

  // Light dismiss: a press outside the panel (only reachable around the drawer).
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null;
    if (!target) return;
    for (const pop of openPopovers()) {
      if (target.closest(`[popovertarget="${pop.id}"]`)) continue;
      const rect = pop.getBoundingClientRect();
      const inside =
        pop.contains(target) &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) closePopover(pop);
    }
  });
}
