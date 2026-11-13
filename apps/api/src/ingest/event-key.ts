import type { NormalizedEvent } from './types/normalized-meet.types';

/**
 * Clave única de una prueba dentro de un archivo.
 *
 * El número de prueba de Meet Manager (`event_no`) NO es único: se reutiliza
 * para las distintas categorías de edad de una misma prueba y, en algunos
 * torneos, para las dos ramas (p. ej. el 59 es 50 espalda F y M). Por eso cada
 * resultado referencia a su prueba por esta clave y nunca por el número.
 */
export function buildEventKey(
  event: Pick<NormalizedEvent, 'event_no' | 'gender' | 'age_group' | 'distance' | 'stroke' | 'is_relay'>,
): string {
  const ageGroup = event.age_group.trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    event.event_no,
    event.gender,
    ageGroup,
    event.distance,
    event.stroke,
    event.is_relay ? 'R' : 'I',
  ].join('|');
}
