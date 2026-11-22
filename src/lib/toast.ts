/**
 * Confirmation toasts after a redirect (PRG): the action redirects with a
 * flag such as `?da-luu=1`, the page turns it into a `ToastNotice`, and
 * `DashboardLayout` renders it (`components/ui/Toast.astro`). The flag is
 * removed from the address bar once shown.
 */
export interface ToastNotice {
  tone: 'info' | 'error';
  text: string;
  /** Query params that triggered it, removed from the address bar once shown. */
  clearParams?: string[];
}

/** The first `param -> text` whose param is present, as an info toast. */
export function toastFromParams(params: URLSearchParams, messages: Record<string, string>): ToastNotice | null {
  const match = Object.entries(messages).find(([param]) => params.has(param));
  return match ? { tone: 'info', text: match[1], clearParams: [match[0]] } : null;
}
