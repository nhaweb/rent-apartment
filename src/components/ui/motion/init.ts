/**
 * Site-wide motion enhancements, loaded once from BaseLayout. Everything
 * here is progressive: the page works the same before it runs.
 */
import { loadMotion } from './motion';
import { initPopoverMotion } from './popover-motion';
import { initPress } from './press';
import { initToasts } from './toast';
import './ui-select';

initPopoverMotion();
initPress();
initToasts();

// Fetch Motion when the browser is idle, or right away on the first press.
const preload = () => void loadMotion();
if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 2000 });
else setTimeout(preload, 200);
document.addEventListener('pointerdown', preload, { once: true, capture: true });
