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

/** Diferencia de tiempo para indicador de mejora: "-2.34" o "+1.10" */
export function formatTimeDiff(baseMs: number, compareMs: number): string {
  const diffMs = compareMs - baseMs;
  const sign = diffMs <= 0 ? '−' : '+';
  return `${sign}${formatTime(Math.abs(diffMs))}`;
}
