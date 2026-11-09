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

/**
 * Separa un texto en palabras normalizadas. Las siglas con puntos ("C.A.T.") se compactan ("cat").
 */
export function tokenize(text: string): string[] {
  const compacted = text.replace(/(?<=\b[A-Za-z])\.(?=[A-Za-z]\b)/g, '');
  return normalizeText(compacted)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0);
}

/**
 * Similaridad Jaro-Winkler [0, 1]. Más adecuada que Levenshtein para palabras cortas como nombres propios.
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched: boolean[] = new Array<boolean>(a.length).fill(false);
  const bMatched: boolean[] = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const from = Math.max(0, i - window);
    const to = Math.min(b.length - 1, i + window);
    for (let j = from; j <= to; j++) {
      if (!bMatched[j] && a[i] === b[j]) {
        aMatched[i] = true;
        bMatched[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;

  return jaro + prefix * 0.1 * (1 - jaro);
}
