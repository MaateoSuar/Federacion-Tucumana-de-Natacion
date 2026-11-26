/**
 * Alcances de récord según la provincia del club del nadador (decisiones del 18/11/2026).
 *  - Récord tucumano: solo clubes de Tucumán.
 *  - Récord NOA: clubes de cualquiera de las provincias del NOA, en cualquier torneo.
 * La lista del NOA es configurable: se cambia acá, sin tocar el evaluador.
 */
export const TUCUMAN_PROVINCE = 'Tucumán';

export const NOA_PROVINCES: readonly string[] = [
  'Tucumán',
  'Salta',
  'Jujuy',
  'Catamarca',
  'Santiago del Estero',
  'La Rioja',
];
