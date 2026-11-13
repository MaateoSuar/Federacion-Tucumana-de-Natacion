import type { ProgressionEvent, SwimmerProgression } from './api';

/**
 * Presentación de la progresión del nadador. Los cálculos de PB y deltas los hace
 * la API (en milisegundos enteros); acá solo se formatea y se resume para la pantalla.
 */

export type DeltaTone = 'better' | 'worse' | 'same';

export interface DeltaView {
  tone: DeltaTone;
  /** "▼", "▲" o "=": nunca se comunica solo con color. */
  arrow: string;
  /** "-0.58 s", "+1.25 s", "0.00 s" (o "-1:02.30" si es de un minuto o más). */
  text: string;
  /** Para lectores de pantalla: "bajó 0,58 segundos". */
  label: string;
}

/** En natación, un delta NEGATIVO es una mejora (bajó el tiempo). */
export function describeDelta(deltaMs: number): DeltaView {
  const abs = Math.abs(deltaMs);
  const totalCs = Math.round(abs / 10);
  const cs = (totalCs % 100).toString().padStart(2, '0');
  const totalSec = Math.floor(totalCs / 100);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const magnitude = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}.${cs}` : `${secs}.${cs} s`;
  const spoken =
    mins > 0 ? `${mins} minutos ${secs},${cs} segundos` : `${secs},${cs} segundos`;

  if (totalCs === 0) return { tone: 'same', arrow: '=', text: magnitude, label: 'mismo tiempo' };
  if (deltaMs < 0) return { tone: 'better', arrow: '▼', text: `-${magnitude}`, label: `bajó ${spoken}` };
  return { tone: 'worse', arrow: '▲', text: `+${magnitude}`, label: `subió ${spoken}` };
}

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho', mariposa: 'Mariposa', combinado: 'Combinado',
};
const STROKE_ORDER = ['libre', 'espalda', 'pecho', 'mariposa', 'combinado'];

export function eventLabel(event: Pick<ProgressionEvent, 'distance' | 'stroke'>): string {
  return `${event.distance} m ${STROKE_ES[event.stroke] ?? event.stroke}`;
}

/** Pruebas de una pileta, ordenadas por estilo y distancia. 25 m y 50 m nunca se mezclan. */
export function eventsForPool(progression: SwimmerProgression, pool: 'P25' | 'P50'): ProgressionEvent[] {
  const rank = (stroke: string) => {
    const i = STROKE_ORDER.indexOf(stroke);
    return i === -1 ? STROKE_ORDER.length : i;
  };
  return progression.events
    .filter((e) => e.pool === pool)
    .sort((a, b) => rank(a.stroke) - rank(b.stroke) || a.distance - b.distance);
}

export interface PoolSummary {
  tournaments: number;
  events: number;
  /** Mejores marcas logradas en el año del último torneo de esa pileta. */
  pbsThisYear: number;
  latestYear: number | null;
  /** Suma de lo que bajó en cada prueba desde su primer tiempo (ms, siempre >= 0). */
  totalImprovementMs: number;
  medals: { gold: number; silver: number; bronze: number };
}

export function summarizePool(progression: SwimmerProgression, pool: 'P25' | 'P50'): PoolSummary {
  const tournaments = progression.tournaments.filter((t) => t.pool === pool);
  const events = progression.events.filter((e) => e.pool === pool);
  const years = tournaments.map((t) => new Date(t.date).getUTCFullYear());
  const latestYear = years.length > 0 ? Math.max(...years) : null;
  const medals = { gold: 0, silver: 0, bronze: 0 };
  for (const t of tournaments) {
    medals.gold += t.medals.gold;
    medals.silver += t.medals.silver;
    medals.bronze += t.medals.bronze;
  }
  return {
    tournaments: tournaments.length,
    events: events.length,
    latestYear,
    pbsThisYear: tournaments
      .filter((t) => new Date(t.date).getUTCFullYear() === latestYear)
      .reduce((sum, t) => sum + t.pbs, 0),
    totalImprovementMs: events.reduce((sum, e) => sum + Math.max(0, e.totalImprovementMs ?? 0), 0),
    medals,
  };
}

export interface ChartPoint {
  date: string;
  tournamentName: string;
  timeMs: number;
  /** Mejor marca vigente después de ese torneo (línea escalonada). */
  bestSoFarMs: number;
  isPb: boolean;
  deltaVsPreviousMs: number | null;
}

/** Serie cronológica de una prueba para el gráfico. */
export function chartSeries(event: ProgressionEvent): ChartPoint[] {
  let best = Number.POSITIVE_INFINITY;
  return [...event.history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => {
      best = Math.min(best, h.timeMs);
      return {
        date: h.date,
        tournamentName: h.tournamentName,
        timeMs: h.timeMs,
        bestSoFarMs: best,
        isPb: h.isPb,
        deltaVsPreviousMs: h.deltaVsPreviousMs,
      };
    });
}

/** Pileta a mostrar al abrir el perfil: la recordada si tiene datos; si no, la que tenga. */
export function initialPool(progression: SwimmerProgression, remembered: string | null): 'P25' | 'P50' {
  const has = (pool: 'P25' | 'P50') => progression.events.some((e) => e.pool === pool);
  if ((remembered === 'P25' || remembered === 'P50') && has(remembered)) return remembered;
  return has('P25') || !has('P50') ? 'P25' : 'P50';
}

// ─── Felicitación por bajar el tiempo ────────────────────────────────────────

export interface Improvement {
  /** Identifica el logro para no volver a mostrarlo: prueba + pileta + torneo + tiempo. */
  key: string;
  eventLabel: string;
  pool: 'P25' | 'P50';
  previousMs: number;
  newMs: number;
  /** Cuánto bajó respecto del torneo anterior (ms, siempre > 0). */
  improvedByMs: number;
  tournamentName: string;
  date: string;
}

/**
 * Mejoras para festejar: pruebas donde el ÚLTIMO torneo fue su mejor marca y bajó
 * el tiempo respecto del torneo anterior. Solo sale de resultados homologados (es
 * lo único que trae la progresión) y nunca compara 25 m con 50 m (cada prueba ya
 * viene separada por pileta). `seen` son las claves que el nadador ya vio.
 */
export function findNewImprovements(progression: SwimmerProgression, seen: ReadonlySet<string>): Improvement[] {
  const found: Improvement[] = [];
  for (const e of progression.events) {
    const last = e.last;
    if (!last || !last.isPb || last.deltaVsPreviousMs === null || last.deltaVsPreviousMs >= 0) continue;
    const key = `${e.eventDefinitionId}|${e.pool}|${last.tournamentId}|${last.timeMs}`;
    if (seen.has(key)) continue;
    found.push({
      key,
      eventLabel: eventLabel(e),
      pool: e.pool,
      previousMs: last.timeMs - last.deltaVsPreviousMs,
      newMs: last.timeMs,
      improvedByMs: -last.deltaVsPreviousMs,
      tournamentName: last.tournamentName,
      date: last.date,
    });
  }
  return found.sort((a, b) => b.date.localeCompare(a.date) || b.improvedByMs - a.improvedByMs);
}
