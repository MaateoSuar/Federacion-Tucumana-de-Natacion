import type { EventRound } from '@prisma/client';
import type { NormalizedMeet, NormalizedResult, NormalizedRound } from '../../ingest/types/normalized-meet.types';

/**
 * Ronda "de base" de una prueba según lo que dice el archivo:
 * "Eliminatorias" = clasificatorio, "Finales" = final, toma de tiempos / serie única = serie única.
 */
export const BASE_ROUND: Record<NormalizedRound, EventRound> = {
  F: 'final',
  S: 'serie_unica',
  P: 'clasificatorio',
  T: 'serie_unica',
};

type MeetForRounds = Pick<NormalizedMeet, 'events' | 'results'>;

/**
 * Decide en qué ronda cayó cada nado.
 *
 * Meet Manager titula "Tiempo de Finales" a toda la columna aunque en un torneo (San Luis, Nacionales)
 * haya una jornada de pruebas a la mañana y las finales a la tarde. Regla de negocio (FTN, 25/11/2026):
 * si un nadador vuelve a nadar la misma prueba (mismo estilo y distancia, mismo nivel) en otra jornada
 * del mismo archivo, el último nado es la FINAL y los anteriores son CLASIFICATORIOS. Un nadador que la
 * nada una sola vez conserva la ronda que dice el archivo (nada cambia para él).
 *
 * Los relevos y las tomas de tiempo no se tocan.
 * Solo devuelve los nados que cambian respecto de la ronda de base.
 */
export function resolveResultRounds(meet: MeetForRounds): Map<NormalizedResult, EventRound> {
  const eventByKey = new Map(meet.events.map((e) => [e.event_key, e]));
  const groups = new Map<string, Array<{ result: NormalizedResult; eventNo: number; isPrelim: boolean }>>();

  for (const result of meet.results) {
    const event = eventByKey.get(result.event_key);
    if (!event || event.is_relay) continue;
    if (event.round !== 'F' && event.round !== 'P') continue;
    const key = `${result.swimmer_ref}|${event.distance}|${event.stroke}|${event.competition_type}`;
    const list = groups.get(key);
    const entry = { result, eventNo: event.event_no, isPrelim: event.round === 'P' };
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const resolved = new Map<NormalizedResult, EventRound>();
  for (const swims of groups.values()) {
    // Una "fase" es un número de prueba + si es eliminatoria: la eliminatoria y la final de una misma
    // prueba comparten número, y la eliminatoria va antes.
    const phases = new Set(swims.map((s) => `${s.eventNo}|${s.isPrelim ? 0 : 1}`));
    if (phases.size < 2) continue;

    const ordered = [...swims].sort(
      (a, b) => a.eventNo - b.eventNo || Number(b.isPrelim) - Number(a.isPrelim) || a.result.source_line - b.result.source_line,
    );
    const last = ordered[ordered.length - 1]!;
    // Si el último nado es una eliminatoria no hay evidencia de que exista una final: no se reclasifica nada
    if (last.isPrelim) continue;
    const lastPhase = `${last.eventNo}|${last.isPrelim ? 0 : 1}`;
    for (const s of ordered) {
      const phase = `${s.eventNo}|${s.isPrelim ? 0 : 1}`;
      resolved.set(s.result, phase === lastPhase ? 'final' : 'clasificatorio');
    }
  }
  return resolved;
}
