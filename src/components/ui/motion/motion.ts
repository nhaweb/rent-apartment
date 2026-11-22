/**
 * Lazy access to Motion. The library loads when the browser is idle (or on
 * the first pointer press), so it never delays first paint. Until it has
 * loaded, or when the user prefers reduced motion, UI changes happen
 * instantly: every animation here is an enhancement, never a requirement.
 */
type MotionLib = typeof import('./motion-lib');

let lib: MotionLib | null = null;
let loading: Promise<MotionLib | null> | null = null;

export function loadMotion(): Promise<MotionLib | null> {
  loading ??= import('./motion-lib')
    .then((module) => (lib = module))
    .catch(() => null);
  return loading;
}

const reduce = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Motion's `animate`, or null when not loaded yet or motion is reduced. */
export function motion(): MotionLib['animate'] | null {
  if (!lib || reduce?.matches) return null;
  return lib.animate;
}

/** Shared timings, so every surface moves the same way. */
export const EASE_OUT = [0.2, 0, 0, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;
export const SPRING_PANEL = { type: 'spring', stiffness: 420, damping: 40, mass: 1 } as const;
export const SPRING_PRESS = { type: 'spring', stiffness: 600, damping: 28 } as const;
