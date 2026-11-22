/** Preset ranges offered in the listing filters and the home search box. */
export interface RangeOption {
  /** The `min-max` query value. */
  value: string;
  label: string;
}

export const PRICE_RANGE_OPTIONS: RangeOption[] = [
  { value: '-2000000', label: 'Dưới 2 triệu' },
  { value: '2000000-3500000', label: '2 – 3,5 triệu' },
  { value: '3500000-5000000', label: '3,5 – 5 triệu' },
  { value: '5000000-', label: 'Trên 5 triệu' },
];

export const AREA_RANGE_OPTIONS: RangeOption[] = [
  { value: '-20', label: 'Dưới 20 m²' },
  { value: '20-30', label: '20 – 30 m²' },
  { value: '30-', label: 'Từ 30 m²' },
];
