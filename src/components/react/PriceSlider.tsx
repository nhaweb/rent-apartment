/**
 * "Giá tối đa" slider for the filter panel (React Bits ElasticSlider).
 * Writes the listing `gia` param (`min-max`, max exclusive) into a hidden input
 * and fires `input` on the form so LiveCount can refresh. The filter panel
 * keeps preset radio chips in <noscript> for the no-JS path.
 */
import { useEffect, useRef, useState } from 'react';
import ElasticSlider from './vendor/ElasticSlider';
import { formatPriceShort } from '../../lib/format';

interface Props {
  name: string;
  /** Current filter bounds, VND. */
  min?: number;
  max?: number;
  /** Slider top end; at this value there is no upper limit. */
  ceiling?: number;
  step?: number;
}

export default function PriceSlider({ name, min, max, ceiling = 10_000_000, step = 500_000 }: Props) {
  const floor = step * 2;
  const [value, setValue] = useState(() => Math.min(ceiling, Math.max(floor, max ?? ceiling)));
  // Until the slider is moved, submit the bounds from the URL unchanged, so a
  // max below the slider floor (or above the ceiling) is not silently rewritten.
  const [touched, setTouched] = useState(false);
  const initialParam = min !== undefined || max !== undefined ? `${min ?? ''}-${max ?? ''}` : '';
  const inputRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  const unlimited = value >= ceiling;
  const lower = min !== undefined && (unlimited || min < value) ? min : undefined;
  const param = !touched
    ? initialParam
    : unlimited
      ? lower !== undefined
        ? `${lower}-`
        : ''
      : `${lower ?? ''}-${value}`;
  const label = unlimited ? 'Không giới hạn' : `Dưới ${formatPriceShort(value)}`;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    inputRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
  }, [param]);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-small text-muted">Giá tối đa mỗi tháng</span>
        <span className="font-medium text-ink tabular-nums" aria-hidden="true">
          {label}
        </span>
      </div>
      <ElasticSlider
        className="w-full! text-accent"
        startingValue={floor}
        maxValue={ceiling}
        defaultValue={value}
        isStepped
        stepSize={step}
        onChange={(next) => {
          setTouched(true);
          setValue(next);
        }}
        valuePosition="none"
        formatValue={(next) => (next >= ceiling ? 'Không giới hạn' : `Dưới ${formatPriceShort(next)}`)}
        thumb
        thickness={6}
        activeThickness={10}
        trackColor="var(--color-line)"
        rangeColor="var(--color-accent)"
        maxStretch={24}
        ariaLabel="Giá thuê tối đa mỗi tháng"
      />
      <div className="mt-1 flex justify-between text-caption text-muted" aria-hidden="true">
        <span>{formatPriceShort(floor)}</span>
        <span>{formatPriceShort(ceiling)}+</span>
      </div>
      <input ref={inputRef} type="hidden" name={name} value={param} />
    </div>
  );
}
