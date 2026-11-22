/**
 * Press feedback: elements with `data-press` shrink slightly while a pointer
 * holds them and spring back on release. Delegated, so markup added later
 * works too.
 */
import { EASE_OUT, SPRING_PRESS, motion } from './motion';

export function initPress(): void {
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-press]');
    if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
    const animate = motion();
    if (!animate) return;

    animate(target, { scale: 0.96 }, { duration: 0.1, ease: EASE_OUT });
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      motion()?.(target, { scale: 1 }, SPRING_PRESS);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  });
}
