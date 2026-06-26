/**
 * Parses Meet Manager time strings (comma as decimal separator) to integer milliseconds.
 * "3:02,95" → 182950   (3min 2sec 95/100ths)
 * "34,17"   → 34170    (34sec 17/100ths)
 * Returns null for NT, DQ, or unparseable values.
 */
export function parseTimeToMs(raw: string): number | null {
  const cleaned = raw.trim();
  if (
    !cleaned ||
    cleaned === 'NT' ||
    cleaned === 'DQ' ||
    cleaned === 'NS' ||
    cleaned === 'NF'
  ) {
    return null;
  }

  // Normalize: replace comma decimal separator with period
  const normalized = cleaned.replace(',', '.');

  // Format: "m:ss.hh"
  const withMinutes = normalized.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
  if (withMinutes) {
    const minutes = parseInt(withMinutes[1] ?? '0', 10);
    const seconds = parseInt(withMinutes[2] ?? '0', 10);
    const hundredths = parseInt(withMinutes[3] ?? '0', 10);
    return (minutes * 60 + seconds) * 1000 + hundredths * 10;
  }

  // Format: "ss.hh"
  const secondsOnly = normalized.match(/^(\d{1,2})\.(\d{2})$/);
  if (secondsOnly) {
    const seconds = parseInt(secondsOnly[1] ?? '0', 10);
    const hundredths = parseInt(secondsOnly[2] ?? '0', 10);
    return seconds * 1000 + hundredths * 10;
  }

  return null;
}

export function isTimeToken(token: string): boolean {
  const t = token.trim();
  if (t === 'NT' || t === 'DQ' || t === 'NS' || t === 'NF') return true;
  return /^\d{1,2}(?::\d{2})?,\d{2}$/.test(t);
}
