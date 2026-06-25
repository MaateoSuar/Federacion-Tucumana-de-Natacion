export const POOL_LENGTHS = [25, 50] as const;

export const STROKES = ['libre', 'espalda', 'pecho', 'mariposa', 'combinado'] as const;
export type Stroke = (typeof STROKES)[number];

export const DISTANCES = [50, 100, 200, 400, 800, 1500] as const;
export type Distance = (typeof DISTANCES)[number];

export const CATEGORY_AGE_CUTOFF_MONTH = 12;
export const CATEGORY_AGE_CUTOFF_DAY = 31;
