/**
 * Normaliza un texto para comparaciones: minúsculas, sin tildes, sin espacios extra.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distancia de Levenshtein entre dos strings.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Inicialización flat para evitar problemas con acceso a arrays en strict mode
  const dp: number[] = Array.from({ length: (m + 1) * (n + 1) }, (_, k) => {
    const i = Math.floor(k / (n + 1));
    const j = k % (n + 1);
    return i === 0 ? j : j === 0 ? i : 0;
  });

  const idx = (i: number, j: number) => i * (n + 1) + j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[idx(i, j)] = dp[idx(i - 1, j - 1)]!;
      } else {
        dp[idx(i, j)] = 1 + Math.min(dp[idx(i - 1, j)]!, dp[idx(i, j - 1)]!, dp[idx(i - 1, j - 1)]!);
      }
    }
  }

  return dp[idx(m, n)]!;
}

/**
 * Similaridad normalizada [0, 1] — 1 = idénticos, 0 = completamente distintos.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/** Umbral mínimo para considerar un match fuzzy válido (sugiere candidato, no automático). */
export const FUZZY_SWIMMER_THRESHOLD = 0.8;
export const FUZZY_CLUB_THRESHOLD = 0.75;
