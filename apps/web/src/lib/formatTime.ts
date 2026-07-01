/**
 * Formatea milisegundos enteros a mm:ss.cc para presentación.
 * Ejemplos: 55240 → "55.24"  |  65890 → "1:05.89"
 */
export function formatTime(ms: number): string {
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const secs = totalSec % 60;
  const mins = Math.floor(totalSec / 60);

  const csStr = cs.toString().padStart(2, '0');
  const secStr = secs.toString().padStart(2, '0');

  if (mins === 0) return `${secs}.${csStr}`;
  return `${mins}:${secStr}.${csStr}`;
}

/**
 * Parsea un tiempo ingresado como texto ("1:05.89", "55.24", "55,24") a
 * milisegundos enteros. Devuelve null si el formato no es válido.
 */
export function parseTimeToMs(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  const match = /^(?:(\d{1,2}):)?(\d{1,2})\.(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  const [, mm, ss, cs] = match;
  if (!ss || !cs) return null;
  const minutes = mm ? parseInt(mm, 10) : 0;
  const seconds = parseInt(ss, 10);
  const centis = parseInt(cs.padEnd(2, '0'), 10);
  if (seconds >= 60) return null;
  return (minutes * 60 + seconds) * 1000 + centis * 10;
}

/** Diferencia de tiempo para indicador de mejora: "-2.34" o "+1.10" */
export function formatTimeDiff(baseMs: number, compareMs: number): string {
  const diffMs = compareMs - baseMs;
  const sign = diffMs <= 0 ? '−' : '+';
  return `${sign}${formatTime(Math.abs(diffMs))}`;
}
