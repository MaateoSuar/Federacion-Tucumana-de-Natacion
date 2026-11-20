/**
 * Etiqueta pública de un torneo según sus FECHAS, no según el estado interno
 * (programado / cerrado / finalizado…), que alguien tiene que cambiar a mano en el
 * panel y por eso suele quedar desactualizado.
 *
 *   Próximo     → todavía no empezó
 *   En curso    → hoy está entre la fecha de inicio y la de fin (inclusive)
 *   Finalizado  → ya pasó la fecha de fin
 *
 * Las fechas del torneo son días calendario (se guardan a medianoche UTC) y "hoy"
 * es el día en Tucumán.
 */

export type TournamentPhase = 'proximo' | 'en_curso' | 'finalizado';

export const PHASE_LABEL: Record<TournamentPhase, string> = {
  proximo: 'Próximo',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
};

const TIME_ZONE = 'America/Argentina/Tucuman';

/** Día calendario "AAAA-MM-DD" en Tucumán para un instante dado. */
function localDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function tournamentPhase(startDate: string, endDate: string | null | undefined, now: Date = new Date()): TournamentPhase {
  const start = startDate.slice(0, 10);
  const end = (endDate ?? startDate).slice(0, 10);
  const today = localDay(now);
  if (today < start) return 'proximo';
  if (today > (end < start ? start : end)) return 'finalizado';
  return 'en_curso';
}
