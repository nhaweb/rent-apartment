/**
 * Submit-button label that shows how many rooms the panel's current choices
 * match ("Xem 5 phòng"), updated while the renter changes filters. The digits
 * roll with React Bits Counter. Reads its surrounding <form>; the count comes
 * from GET /api/dem-phong with the same params as /phong.
 */
import { useEffect, useRef, useState } from 'react';
import Counter from './vendor/Counter';

interface Props {
  /** Count for the filters the page was rendered with. */
  total: number;
}

/** Same query shape as GetForm: empty values dropped, repeats joined with commas. */
function formQuery(form: HTMLFormElement): string {
  const values = new Map<string, string[]>();
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== 'string' || !value) continue;
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return [...values]
    .map(([name, list]) => `${encodeURIComponent(name)}=${list.map(encodeURIComponent).join(',')}`)
    .join('&');
}

export default function LiveCount({ total: initial }: Props) {
  const [total, setTotal] = useState(initial);
  const [announce, setAnnounce] = useState('');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        controller?.abort();
        controller = new AbortController();
        try {
          const response = await fetch(`/api/dem-phong?${formQuery(form)}`, { signal: controller.signal });
          if (!response.ok) return;
          const data = (await response.json()) as { total: number };
          setTotal(data.total);
          setAnnounce(`${data.total} phòng khớp bộ lọc`);
        } catch {
          // Aborted or offline: keep the last count; submitting still works.
        }
      }, 250);
    };

    form.addEventListener('change', refresh);
    form.addEventListener('input', refresh);
    return () => {
      clearTimeout(timer);
      controller?.abort();
      form.removeEventListener('change', refresh);
      form.removeEventListener('input', refresh);
    };
  }, []);

  return (
    <span ref={ref} className="inline-flex items-baseline gap-[0.25em]">
      {total === 0 ? (
        'Không có phòng khớp'
      ) : (
        <>
          Xem
          <Counter value={total} locale="vi-VN" fontSize="1em" intro={false} motionBlur={false} fade={0.15} duration={0.5} />
          phòng
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </span>
  );
}
