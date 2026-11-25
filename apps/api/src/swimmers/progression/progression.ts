/**
 * buildProgression — función pura que transforma los resultados de un nadador
 * en la estructura SwimmerProgression para el endpoint GET /swimmers/:id/progression.
 *
 * Reglas (spec TRASPASO-SONNET.md §5.3):
 * - Cada (eventDefinitionId, poolLength) es una serie independiente. 25m y 50m NO se mezclan.
 * - Solo resultados status=OK con tiempo no nulo. NO se exige homologación: el perfil muestra las marcas
 *   del nadador en cualquier torneo (NOA, nacionales, San Luis…). La homologación solo condiciona récords y rankings.
 * - Si en un torneo nadó la prueba más de una vez en la MISMA jornada, el valor = mejor tiempo. La jornada de
 *   pruebas (clasificatorio) y la final son entradas separadas del historial (`phase`); el puesto de la
 *   jornada de pruebas no da medalla.
 * - Orden cronológico por fecha del torneo; empate por orderNo del evento.
 * - deltaVsPrevious = time_t − time_{t−1} (negativo = mejoró).
 * - pbBefore_t = mejor tiempo antes de t; deltaVsPb = time_t − pbBefore_t.
 * - isPb = time_t < pbBefore_t (o primer registro).
 * - totalImprovementMs = firstTime − currentPb.
 * - Tiempos en ms enteros.
 */

export interface ProgressionResultRow {
  id: string;
  finalTime: number;
  status: string;
  homologated: boolean;
  place: number | null;
  isPb: boolean;
  event: {
    orderNo: number;
    /** Ronda del evento (clasificatorio = jornada de pruebas, final). Ausente en datos viejos. */
    round?: string;
    eventDefinition: {
      id: string;
      stroke: string;
      distance: number;
      gender: string;
      code: string;
    };
    tournament: {
      id: string;
      name: string;
      startDate: Date;
      poolLength: string;
    };
  };
  category: { id: string; name: string } | null;
  club: { id: string; name: string; shortName: string } | null;
}

export interface ProgressionHistoryEntry {
  tournamentId: string;
  tournamentName: string;
  date: string;
  timeMs: number;
  deltaVsPreviousMs: number | null;
  deltaVsPbMs: number | null;
  isPb: boolean;
  categoryName: string;
  clubName: string;
  place: number | null;
  /** Solo las finales (y las series únicas) dan medalla: el puesto de la jornada de pruebas no. */
  medal: 'gold' | 'silver' | 'bronze' | null;
  /**
   * 'prueba' (jornada de la mañana) o 'final' (tarde) cuando el nadador nadó la prueba en ambas
   * jornadas de ese torneo; null si la nadó una sola vez (no hay nada que separar).
   */
  phase: 'prueba' | 'final' | null;
}

export interface ProgressionEvent {
  eventDefinitionId: string;
  label: string;
  stroke: string;
  distance: number;
  pool: 'P25' | 'P50';
  personalBest: {
    timeMs: number;
    tournamentId: string;
    tournamentName: string;
    date: string;
    worldAquaticsPoints: number | null;
  } | null;
  last: {
    timeMs: number;
    tournamentId: string;
    tournamentName: string;
    date: string;
    deltaVsPreviousMs: number | null;
    deltaVsPbMs: number | null;
    isPb: boolean;
  } | null;
  totalImprovementMs: number | null;
  history: ProgressionHistoryEntry[];
}

export interface TournamentSummary {
  tournamentId: string;
  name: string;
  date: string;
  pool: 'P25' | 'P50';
  events: number;
  pbs: number;
  medals: { gold: number; silver: number; bronze: number };
}

export interface SwimmerProgression {
  swimmerId: string;
  events: ProgressionEvent[];
  tournaments: TournamentSummary[];
}

type EventKey = string; // `${eventDefinitionId}|${poolLength}`

export function buildProgression(
  swimmerId: string,
  rows: ProgressionResultRow[],
  poolFilter?: 'P25' | 'P50',
): SwimmerProgression {
  // Filtrar: solo OK y tiempo no nulo (homologado o no: es el historial del nadador, no un récord)
  const valid = rows.filter((r) => r.status === 'OK' && r.finalTime != null);

  // Agrupar por (eventDefinitionId, poolLength) → (torneo, jornada) → mejor tiempo.
  // La jornada de pruebas (clasificatorio) y la final de un mismo torneo son nados distintos: se muestran por separado.
  const byEvent = new Map<EventKey, Map<string, ProgressionResultRow>>();

  for (const r of valid) {
    const pool = r.event.tournament.poolLength as 'P25' | 'P50';
    if (poolFilter && pool !== poolFilter) continue;

    const key: EventKey = `${r.event.eventDefinition.id}|${pool}`;
    if (!byEvent.has(key)) byEvent.set(key, new Map());

    const byTournament = byEvent.get(key)!;
    const slot = `${r.event.tournament.id}|${isPrelim(r) ? 'P' : 'F'}`;
    const existing = byTournament.get(slot);
    // Mantener el mejor tiempo de esa jornada
    if (!existing || r.finalTime < existing.finalTime) {
      byTournament.set(slot, r);
    }
  }

  // Para el resumen de torneos
  const tournamentMap = new Map<string, { name: string; date: string; pool: 'P25' | 'P50'; events: Set<string>; pbEvents: Set<string>; medals: { gold: number; silver: number; bronze: number } }>();

  const events: ProgressionEvent[] = [];

  for (const [key, tournamentResults] of byEvent) {
    const [eventDefinitionId, pool] = key.split('|') as [string, 'P25' | 'P50'];

    // Torneos donde nadó la prueba en las dos jornadas
    const bothPhases = new Set<string>();
    for (const slot of tournamentResults.keys()) {
      const [tId, ph] = slot.split('|') as [string, string];
      if (tournamentResults.has(`${tId}|${ph === 'P' ? 'F' : 'P'}`)) bothPhases.add(tId);
    }

    // Ordenar por fecha del torneo; dentro del torneo, primero la jornada de pruebas y después la final
    const sorted = Array.from(tournamentResults.values()).sort((a, b) => {
      const dateA = a.event.tournament.startDate.getTime();
      const dateB = b.event.tournament.startDate.getTime();
      if (dateA !== dateB) return dateA - dateB;
      if (a.event.tournament.id === b.event.tournament.id && isPrelim(a) !== isPrelim(b)) return isPrelim(a) ? -1 : 1;
      return a.event.orderNo - b.event.orderNo;
    });

    if (sorted.length === 0) continue;
    const first = sorted[0]!;
    const eventDef = first.event.eventDefinition;

    const history: ProgressionHistoryEntry[] = [];
    let pbTime: number | null = null;
    let pbRow: ProgressionResultRow | null = null;

    for (const row of sorted) {
      const time = row.finalTime;
      const deltaVsPrevious = history.length > 0 ? time - history[history.length - 1]!.timeMs : null;
      const deltaVsPb = pbTime !== null ? time - pbTime : null;
      const isPb = pbTime === null || time < pbTime;

      if (isPb) {
        pbTime = time;
        pbRow = row;
      }

      // El puesto de la jornada de pruebas (clasificatorio) no da medalla
      const medal: 'gold' | 'silver' | 'bronze' | null = isPrelim(row)
        ? null
        : row.place === 1 ? 'gold' : row.place === 2 ? 'silver' : row.place === 3 ? 'bronze' : null;
      const phase: 'prueba' | 'final' | null = bothPhases.has(row.event.tournament.id)
        ? (isPrelim(row) ? 'prueba' : 'final')
        : null;

      history.push({
        tournamentId: row.event.tournament.id,
        tournamentName: row.event.tournament.name,
        date: row.event.tournament.startDate.toISOString().slice(0, 10),
        timeMs: time,
        deltaVsPreviousMs: deltaVsPrevious,
        deltaVsPbMs: deltaVsPb,
        isPb,
        categoryName: row.category?.name ?? '',
        clubName: row.club?.shortName ?? '',
        place: row.place,
        medal,
        phase,
      });

      // Acumular en tournamentMap
      const tId = row.event.tournament.id;
      if (!tournamentMap.has(tId)) {
        tournamentMap.set(tId, {
          name: row.event.tournament.name,
          date: row.event.tournament.startDate.toISOString().slice(0, 10),
          pool,
          events: new Set(),
          pbEvents: new Set(),
          medals: { gold: 0, silver: 0, bronze: 0 },
        });
      }
      const ts = tournamentMap.get(tId)!;
      ts.events.add(eventDefinitionId);
      if (isPb) ts.pbEvents.add(eventDefinitionId);
      if (medal) ts.medals[medal]++;
    }

    const lastEntry = history[history.length - 1]!;
    const firstTime = history[0]!.timeMs;
    const totalImprovementMs = pbTime !== null && history.length > 1 ? firstTime - pbTime : null;

    const distanceLabel = `${eventDef.distance} m`;
    const strokeLabel = strokeName(eventDef.stroke);
    const label = `${distanceLabel} ${strokeLabel}`;

    events.push({
      eventDefinitionId,
      label,
      stroke: eventDef.stroke,
      distance: eventDef.distance,
      pool,
      personalBest: pbRow
        ? {
            timeMs: pbRow.finalTime,
            tournamentId: pbRow.event.tournament.id,
            tournamentName: pbRow.event.tournament.name,
            date: pbRow.event.tournament.startDate.toISOString().slice(0, 10),
            worldAquaticsPoints: null,
          }
        : null,
      last: {
        timeMs: lastEntry.timeMs,
        tournamentId: lastEntry.tournamentId,
        tournamentName: lastEntry.tournamentName,
        date: lastEntry.date,
        deltaVsPreviousMs: lastEntry.deltaVsPreviousMs,
        deltaVsPbMs: lastEntry.deltaVsPbMs,
        isPb: lastEntry.isPb,
      },
      totalImprovementMs,
      history,
    });
  }

  // Ordenar eventos por distancia, luego nombre
  events.sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label));

  const tournaments: TournamentSummary[] = Array.from(tournamentMap.entries())
    .map(([id, t]) => ({
      tournamentId: id,
      name: t.name,
      date: t.date,
      pool: t.pool,
      events: t.events.size,
      pbs: t.pbEvents.size,
      medals: t.medals,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { swimmerId, events, tournaments };
}

/** true si el nado es de la jornada de pruebas (clasificatorio / eliminatoria). */
function isPrelim(row: ProgressionResultRow): boolean {
  return row.event.round === 'clasificatorio';
}

function strokeName(stroke: string): string {
  const map: Record<string, string> = {
    freestyle: 'Libre',
    backstroke: 'Espalda',
    breaststroke: 'Pecho',
    butterfly: 'Mariposa',
    medley: 'Combinado',
    relay_freestyle: 'Posta Libre',
    relay_medley: 'Posta Combinado',
  };
  return map[stroke] ?? stroke;
}
