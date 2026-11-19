/**
 * Detección de duplicados de nadadores y clubes (funciones puras, sin Prisma).
 *
 * Diseño:
 *  - Cada registro se normaliza UNA sola vez (tokens, año, sigla, etc.).
 *  - Se indexa por bloques (token exacto, vecindad por borrado de 1 letra para tipeos,
 *    clave de transposición, DNI, sigla) y solo se comparan pares que comparten al menos
 *    un bloque. Nunca se recorre el producto cartesiano completo.
 *  - La comparación es por palabras (no por string completo), así que tolera nombre y
 *    apellido invertidos, segundo nombre / apellido extra, iniciales y tipeos de 1 letra.
 *  - No hay corte temprano: se juntan todos los pares >= umbral, se ordenan por score
 *    (desempate por id) y se devuelven los mejores `limit`.
 *  - Cada par sale una sola vez y con `a.id < b.id`, así que es determinista.
 *
 * La decisión de unificar es siempre humana: esto solo sugiere candidatos.
 */
import { normalizeText, tokenize } from '../../import/matching/fuzzy';

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface SwimmerLike {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  birthDate: Date | null;
  currentClub: { id: string; name: string; shortName: string } | null;
  /** Opcional: si existe y ambos lo tienen, un DNI igual es señal casi definitiva. */
  documentId?: string | null;
}

export interface ClubLike {
  id: string;
  name: string;
  shortName: string;
  locality: string;
}

export interface DuplicatePairResult<T> {
  a: T;
  b: T;
  score: number;
  reasons: string[];
}

// ── Configuración (pesos y umbrales en un solo lugar) ────────────────────────

/** Score mínimo (escala 0–1) para que un par se informe como posible duplicado. */
export const DUPLICATE_MIN_SCORE = 0.6;

const SWIMMER_WEIGHTS = {
  /** Máximo aporte del nombre (tokens). */
  name: 0.75,
  sameBirthYear: 0.15,
  sameBirthDate: 0.05,
  adjacentBirthYear: 0.05,
  /** Años que difieren en más de 1: probable homónimo, no duplicado. */
  farBirthYearPenalty: 0.45,
  sameClub: 0.1,
  /** Si hay palabras sin emparejar en ambos lados (ej. "Juan Carlos" vs "Juan Pablo"). */
  conflictFactor: 0.5,
  /** Tope del aporte del nombre cuando un lado tiene una sola palabra. */
  singleTokenCap: 0.4,
  sameDocumentFloor: 0.95,
  differentDocumentPenalty: 0.4,
} as const;

const CLUB_WEIGHTS = {
  sameName: 0.7,
  containedMulti: 0.5,
  containedSingle: 0.3,
  /** Sigla igual / sigla = nombre del otro, cuando es la única señal del nombre. */
  shortNameAlone: 0.5,
  /** Lo mismo, pero cuando el nombre ya coincide (solo refuerza). */
  shortNameWithNameMatch: 0.2,
  sameLocality: 0.1,
  differentLocalityPenalty: 0.1,
} as const;

/** Valor de cada tipo de coincidencia de palabra. */
const TOKEN_SCORE = { exact: 1, typo: 0.9, initial: 0.7 } as const;

/** Largo mínimo de una palabra para tolerar un error de tipeo de 1 letra. */
const MIN_TYPO_LEN = 5;

/** Un bloque con más miembros que esto se ignora (protege de entradas patológicas). */
const MAX_BLOCK_SIZE = 1500;

/** Palabras genéricas que no distinguen a un club ("Club Atlético X" ≈ "X"). */
const CLUB_STOPWORDS: ReadonlySet<string> = new Set([
  'club', 'atletico', 'deportivo', 'social', 'cultural', 'natacion', 'sociedad', 'civil',
  'asociacion', 'centro', 'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'ca', 'cd', 'cs',
]);

/** Conectores que no cuentan para armar la sigla de las iniciales. */
const CLUB_CONNECTORS: ReadonlySet<string> = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e']);

// ── Utilidades comunes ───────────────────────────────────────────────────────

function compareIds(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

/**
 * ¿Las palabras difieren en a lo sumo 1 edición (sustitución, inserción, borrado o
 * transposición de letras adyacentes)? Es lineal y sin reservar matrices, a diferencia
 * de levenshtein(), que se reserva para otros usos: acá se llama muchas veces.
 */
function withinOneEdit(x: string, y: string): boolean {
  const lx = x.length;
  const ly = y.length;
  if (Math.abs(lx - ly) > 1) return false;
  // Filtro barato: un tipeo rara vez rompe a la vez la primera y la última letra.
  if (x[0] !== y[0] && x[lx - 1] !== y[ly - 1]) return false;

  let i = 0;
  const min = Math.min(lx, ly);
  while (i < min && x[i] === y[i]) i++;
  if (i === min) return true; // iguales o una letra de más al final

  if (lx === ly) {
    if (x.slice(i + 1) === y.slice(i + 1)) return true; // sustitución
    return x[i] === y[i + 1] && x[i + 1] === y[i] && x.slice(i + 2) === y.slice(i + 2); // transposición
  }
  return lx < ly ? x.slice(i) === y.slice(i + 1) : x.slice(i + 1) === y.slice(i);
}

interface TokenMatch {
  /** Suma de valores de coincidencia (exacta 1, tipeo 0.9, inicial 0.7). */
  total: number;
  matched: number;
  typos: number;
  initials: number;
  /** Para cada palabra de A, índice de la palabra de B emparejada (-1 si ninguna). */
  aToB: number[];
}

/**
 * Empareja palabras de A con palabras de B sin importar el orden. Tres pasadas:
 * exactas, tipeo de 1 letra (solo palabras largas) e inicial ("m" ~ "mateo").
 */
function matchTokens(a: readonly string[], b: readonly string[], allowInitials: boolean): TokenMatch {
  const aToB: number[] = new Array<number>(a.length).fill(-1);
  const usedB: boolean[] = new Array<boolean>(b.length).fill(false);
  let total = 0;
  let matched = 0;
  let typos = 0;
  let initials = 0;

  for (let i = 0; i < a.length; i++) {
    const ta = a[i]!;
    for (let j = 0; j < b.length; j++) {
      if (!usedB[j] && b[j] === ta) {
        aToB[i] = j;
        usedB[j] = true;
        total += TOKEN_SCORE.exact;
        matched++;
        break;
      }
    }
  }

  for (let i = 0; i < a.length; i++) {
    if (aToB[i] !== -1) continue;
    const ta = a[i]!;
    if (ta.length < MIN_TYPO_LEN) continue;
    for (let j = 0; j < b.length; j++) {
      const tb = b[j]!;
      if (usedB[j] || tb.length < MIN_TYPO_LEN) continue;
      if (withinOneEdit(ta, tb)) {
        aToB[i] = j;
        usedB[j] = true;
        total += TOKEN_SCORE.typo;
        matched++;
        typos++;
        break;
      }
    }
  }

  if (allowInitials) {
    for (let i = 0; i < a.length; i++) {
      if (aToB[i] !== -1) continue;
      const ta = a[i]!;
      for (let j = 0; j < b.length; j++) {
        if (usedB[j]) continue;
        const tb = b[j]!;
        const isInitial =
          (ta.length === 1 && tb.length >= 2 && tb[0] === ta) ||
          (tb.length === 1 && ta.length >= 2 && ta[0] === tb);
        if (isInitial) {
          aToB[i] = j;
          usedB[j] = true;
          total += TOKEN_SCORE.initial;
          matched++;
          initials++;
          break;
        }
      }
    }
  }

  return { total, matched, typos, initials, aToB };
}

/**
 * Claves de bloque de una palabra: la palabra misma y las variantes que cubren 1 edición:
 * con 1 letra borrada (sustitución, letra de más o de menos) y con 2 letras adyacentes
 * intercambiadas (transposición). Dos palabras a 1 edición comparten al menos una clave.
 */
function addTokenKeys(token: string, prefix: string, out: Set<string>): void {
  if (token.length < 2) return;
  out.add(`${prefix}d:${token}`);
  if (token.length >= MIN_TYPO_LEN) {
    for (let i = 0; i < token.length; i++) {
      out.add(`${prefix}d:${token.slice(0, i)}${token.slice(i + 1)}`);
    }
    for (let i = 0; i < token.length - 1; i++) {
      out.add(`${prefix}d:${token.slice(0, i)}${token[i + 1]}${token[i]}${token.slice(i + 2)}`);
    }
  }
}

/**
 * Recorre cada par (i < j) que comparte al menos un bloque, una sola vez por par, e informa
 * cuántas claves comparten (`shared`). Con eso el llamador descarta barato los pares que
 * no pueden alcanzar el umbral sin tener que puntuarlos.
 */
function forEachCandidatePair(
  keysByItem: ReadonlyArray<ReadonlySet<string>>,
  visit: (i: number, j: number, shared: number) => void,
): void {
  const index = new Map<string, number[]>();
  for (let i = 0; i < keysByItem.length; i++) {
    for (const key of keysByItem[i]!) {
      const bucket = index.get(key);
      if (bucket) bucket.push(i);
      else index.set(key, [i]);
    }
  }

  const marks = new Int32Array(keysByItem.length).fill(-1);
  const counts = new Int32Array(keysByItem.length);
  const touched: number[] = [];
  for (let i = 0; i < keysByItem.length; i++) {
    touched.length = 0;
    for (const key of keysByItem[i]!) {
      const bucket = index.get(key);
      if (!bucket || bucket.length > MAX_BLOCK_SIZE) continue;
      // Los bloques están ordenados por índice: se salta directo a los j > i.
      let lo = 0;
      let hi = bucket.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (bucket[mid]! <= i) lo = mid + 1;
        else hi = mid;
      }
      for (let p = lo; p < bucket.length; p++) {
        const j = bucket[p]!;
        if (marks[j] !== i) {
          marks[j] = i;
          counts[j] = 0;
          touched.push(j);
        }
        counts[j]!++;
      }
    }
    for (const j of touched) visit(i, j, counts[j]!);
  }
}

function finalizePairs<T extends { id: string }>(
  found: Array<DuplicatePairResult<T>>,
  limit: number,
): Array<DuplicatePairResult<T>> {
  found.sort(
    (x, y) => y.score - x.score || compareIds(x.a.id, y.a.id) || compareIds(x.b.id, y.b.id),
  );
  return found.slice(0, Math.max(0, limit));
}

// ── Nadadores ────────────────────────────────────────────────────────────────

interface PreparedSwimmer<T> {
  item: T;
  gender: string;
  /** Todas las palabras (nombre + apellido), normalizadas. */
  tokens: string[];
  /** 0 = viene del nombre, 1 = viene del apellido (paralelo a `tokens`). */
  roles: number[];
  year: number | null;
  time: number | null;
  clubId: string | null;
  doc: string | null;
  /** Alguna palabra de 1 letra (inicial): esas no generan claves de bloque. */
  hasInitial: boolean;
  keys: Set<string>;
}

function normalizeGender(gender: string): string {
  const g = normalizeText(gender);
  if (g.startsWith('m')) return 'm';
  if (g.startsWith('f')) return 'f';
  return g;
}

function prepareSwimmer<T extends SwimmerLike>(item: T): PreparedSwimmer<T> {
  const first = tokenize(item.firstName);
  const last = tokenize(item.lastName);
  const tokens = [...first, ...last];
  const roles = [...first.map(() => 0), ...last.map(() => 1)];
  const gender = normalizeGender(item.gender);

  const valid = item.birthDate instanceof Date && !Number.isNaN(item.birthDate.getTime());
  const digits = (item.documentId ?? '').replace(/\D/g, '');
  const doc = digits.length >= 6 ? digits : null;

  const keys = new Set<string>();
  for (const t of tokens) addTokenKeys(t, `${gender}|`, keys);
  // El DNI vale por dos claves: así un DNI igual pasa el filtro de 2 claves compartidas.
  if (doc) {
    keys.add(`${gender}|n1:${doc}`);
    keys.add(`${gender}|n2:${doc}`);
  }

  return {
    item,
    gender,
    tokens,
    roles,
    year: valid ? item.birthDate!.getUTCFullYear() : null,
    time: valid ? item.birthDate!.getTime() : null,
    clubId: item.currentClub?.id ?? null,
    doc,
    hasInitial: tokens.some((t) => t.length === 1),
    keys,
  };
}

function scoreSwimmerPair<T>(
  a: PreparedSwimmer<T>,
  b: PreparedSwimmer<T>,
): { score: number; reasons: string[] } | null {
  // Distinto género: nunca es la misma persona.
  if (a.gender !== b.gender) return null;

  const W = SWIMMER_WEIGHTS;
  const docEqual = a.doc !== null && a.doc === b.doc;
  const docDifferent = a.doc !== null && b.doc !== null && a.doc !== b.doc;

  const nA = a.tokens.length;
  const nB = b.tokens.length;
  if (nA === 0 || nB === 0) return null;

  const m = matchTokens(a.tokens, b.tokens, true);
  const minN = Math.min(nA, nB);
  const maxN = Math.max(nA, nB);

  // Con dos palabras o más de cada lado se exigen al menos 2 coincidencias
  // ("Juan Pérez" vs "Juan Gómez" no es candidato). Con una sola palabra alcanza 1.
  const enough = m.matched >= 2 || (minN === 1 && m.matched === 1);
  if (!enough && !docEqual) return null;

  const reasons: string[] = [];
  let score = 0;

  if (enough) {
    const unmatchedA = nA - m.matched;
    const unmatchedB = nB - m.matched;
    let name = W.name * (0.7 * (m.total / minN) + 0.3 * (m.total / maxN));
    if (unmatchedA > 0 && unmatchedB > 0) name *= W.conflictFactor;
    if (minN === 1) name = Math.min(name, W.singleTokenCap);
    score += name;

    let cross = 0;
    for (let i = 0; i < nA; i++) {
      const j = m.aToB[i]!;
      if (j >= 0 && a.roles[i] !== b.roles[j]) cross++;
    }
    const exactOnly = m.typos === 0 && m.initials === 0;

    if (unmatchedA === 0 && unmatchedB === 0) {
      if (exactOnly) {
        reasons.push(cross === m.matched ? 'nombre y apellido invertidos' : cross > 0 ? 'nombre y apellido en otro orden' : 'mismo nombre y apellido');
      } else {
        reasons.push('nombre casi idéntico');
        if (cross > 0) reasons.push('orden de nombre y apellido distinto');
      }
    } else if (unmatchedA === 0 || unmatchedB === 0) {
      reasons.push('un nombre incluye al otro (segundo nombre o apellido extra)');
      if (cross > 0) reasons.push('orden de nombre y apellido distinto');
    } else {
      reasons.push('comparten parte del nombre');
    }
    if (m.typos > 0) reasons.push('posible error de tipeo');
    if (m.initials > 0) reasons.push('coincide por inicial');
  }

  // Año de nacimiento
  if (a.year !== null && b.year !== null) {
    const diff = Math.abs(a.year - b.year);
    if (diff === 0) {
      score += W.sameBirthYear;
      reasons.push(`mismo año de nacimiento (${a.year})`);
      if (a.time === b.time) {
        score += W.sameBirthDate;
        reasons.push('misma fecha de nacimiento');
      }
    } else if (diff === 1) {
      score += W.adjacentBirthYear;
      reasons.push('año de nacimiento ±1');
    } else {
      score -= W.farBirthYearPenalty;
      reasons.push('años de nacimiento distintos (probable homónimo)');
    }
  }

  // Club
  if (a.clubId !== null && a.clubId === b.clubId) {
    score += W.sameClub;
    reasons.push('mismo club');
  }

  // DNI
  if (docEqual) {
    score = Math.max(score, W.sameDocumentFloor);
    reasons.unshift('mismo DNI');
  } else if (docDifferent) {
    score -= W.differentDocumentPenalty;
    reasons.push('DNI distinto');
  }

  return { score, reasons };
}

/**
 * Pares de nadadores que probablemente sean la misma persona, ordenados por score
 * descendente (desempate por id). Cada par sale una vez, con `a.id < b.id`.
 */
export function findSwimmerDuplicatePairs<T extends SwimmerLike>(
  swimmers: T[],
  limit: number,
): Array<{ a: T; b: T; score: number; reasons: string[] }> {
  if (limit <= 0 || swimmers.length < 2) return [];

  // Orden por id: hace determinista cuál es `a` y cuál `b`.
  const prepared = swimmers.map(prepareSwimmer).sort((x, y) => compareIds(x.item.id, y.item.id));

  const found: Array<DuplicatePairResult<T>> = [];
  forEachCandidatePair(
    prepared.map((p) => p.keys),
    (i, j, shared) => {
      const pa = prepared[i]!;
      const pb = prepared[j]!;
      if (pa.item.id === pb.item.id) return;
      // Dos palabras o más de cada lado exigen >= 2 coincidencias, y cada coincidencia
      // comparte al menos una clave; las iniciales (1 letra) no tienen clave, por eso se excluyen.
      const needShared =
        pa.tokens.length >= 2 && pb.tokens.length >= 2 && !pa.hasInitial && !pb.hasInitial ? 2 : 1;
      if (shared < needShared) return;
      const res = scoreSwimmerPair(pa, pb);
      if (!res || res.score + 1e-9 < DUPLICATE_MIN_SCORE) return;
      found.push({ a: pa.item, b: pb.item, score: round2(clamp01(res.score)), reasons: res.reasons });
    },
  );

  return finalizePairs(found, limit);
}

// ── Clubes ───────────────────────────────────────────────────────────────────

interface PreparedClub<T> {
  item: T;
  nameCompact: string;
  /** Palabras del nombre sin términos genéricos ("club", "atlético"...). */
  core: string[];
  coreCompact: string;
  shortCompact: string;
  acronyms: Set<string>;
  localityTokens: string[];
  localityNorm: string;
  keys: Set<string>;
}

function acronymOf(tokens: string[]): string {
  return tokens
    .filter((t) => !CLUB_CONNECTORS.has(t))
    .map((t) => t[0] ?? '')
    .join('');
}

function prepareClub<T extends ClubLike>(item: T): PreparedClub<T> {
  const tokens = tokenize(item.name);
  const filtered = tokens.filter((t) => t.length > 1 && !CLUB_STOPWORDS.has(t));
  const core = filtered.length > 0 ? filtered : tokens;
  const shortCompact = tokenize(item.shortName).join('');
  const nameCompact = tokens.join('');
  const coreCompact = core.join('');

  const acronyms = new Set<string>();
  for (const acr of [acronymOf(tokens), acronymOf(tokens.filter((t) => t !== 'club'))]) {
    if (acr.length >= 3) acronyms.add(acr);
  }

  const localityTokens = tokenize(item.locality);

  const keys = new Set<string>();
  for (const t of core) addTokenKeys(t, '', keys);
  if (shortCompact.length >= 2) keys.add(`s:${shortCompact}`);
  if (nameCompact.length >= 2) keys.add(`s:${nameCompact}`);
  if (coreCompact.length >= 2) keys.add(`s:${coreCompact}`);
  for (const acr of acronyms) keys.add(`s:${acr}`);

  return {
    item,
    nameCompact,
    core,
    coreCompact,
    shortCompact,
    acronyms,
    localityTokens,
    localityNorm: localityTokens.join(' '),
    keys,
  };
}

/** ¿La sigla de `x` coincide con el nombre (completo, sin genéricos o iniciales) de `y`? */
function shortNameMatchesOtherName<T>(x: PreparedClub<T>, y: PreparedClub<T>): 'nombre' | 'iniciales' | null {
  const s = x.shortCompact;
  if (s.length < 2) return null;
  if (s === y.nameCompact || s === y.coreCompact) return 'nombre';
  if (s.length >= 3 && y.acronyms.has(s)) return 'iniciales';
  return null;
}

/** ¿El nombre de `x` (una sola palabra, ej. "CAT") coincide con las iniciales del nombre de `y`? */
function nameIsOtherAcronym<T>(x: PreparedClub<T>, y: PreparedClub<T>): boolean {
  return x.nameCompact.length >= 3 && y.acronyms.has(x.nameCompact);
}

function scoreClubPair<T>(a: PreparedClub<T>, b: PreparedClub<T>): { score: number; reasons: string[] } | null {
  const W = CLUB_WEIGHTS;
  const reasons: string[] = [];
  let score = 0;

  // Nombre
  if (a.nameCompact.length > 0 && a.nameCompact === b.nameCompact) {
    score += W.sameName;
    reasons.push('nombre idéntico');
  } else if (a.core.length > 0 && b.core.length > 0) {
    const m = matchTokens(a.core, b.core, false);
    const nA = a.core.length;
    const nB = b.core.length;
    const unmatchedA = nA - m.matched;
    const unmatchedB = nB - m.matched;
    if (m.matched > 0 && unmatchedA === 0 && unmatchedB === 0) {
      score += W.sameName * (m.total / nA);
      reasons.push(m.typos > 0 ? 'nombre casi idéntico (error de tipeo)' : 'mismo nombre sin "Club", "Atlético"...');
    } else if (m.matched > 0 && (unmatchedA === 0 || unmatchedB === 0)) {
      score += Math.min(nA, nB) >= 2 ? W.containedMulti : W.containedSingle;
      reasons.push('un nombre incluye al otro');
    }
  }

  // Sigla: sola vale más; si el nombre ya coincide, solo refuerza.
  const nameScore = score;
  const siglaWeight = nameScore > 0 ? W.shortNameWithNameMatch : W.shortNameAlone;
  const aInB = shortNameMatchesOtherName(a, b);
  const bInA = shortNameMatchesOtherName(b, a);
  if (a.shortCompact.length >= 2 && a.shortCompact === b.shortCompact) {
    score += siglaWeight;
    reasons.push('misma sigla');
  } else if (aInB || bInA) {
    score += siglaWeight;
    reasons.push((aInB ?? bInA) === 'nombre' ? 'sigla = nombre del otro' : 'sigla = iniciales del nombre del otro');
  } else if (nameIsOtherAcronym(a, b) || nameIsOtherAcronym(b, a)) {
    // El nombre de uno es una sigla ("CAT") que coincide con las iniciales del otro.
    score += siglaWeight;
    reasons.push('nombre = sigla (iniciales) del otro');
  }

  if (score === 0) return null;

  // Localidad
  if (a.localityNorm.length > 0 && b.localityNorm.length > 0) {
    if (a.localityNorm === b.localityNorm) {
      score += W.sameLocality;
      reasons.push('misma localidad');
    } else {
      const overlap = a.localityTokens.some((t) => t.length >= 3 && b.localityTokens.includes(t));
      if (!overlap) {
        score -= W.differentLocalityPenalty;
        reasons.push('distinta localidad');
      }
    }
  }

  return { score, reasons };
}

/**
 * Pares de clubes que probablemente sean el mismo, ordenados por score descendente
 * (desempate por id). Cada par sale una vez, con `a.id < b.id`.
 */
export function findClubDuplicatePairs<T extends ClubLike>(
  clubs: T[],
  limit: number,
): Array<{ a: T; b: T; score: number; reasons: string[] }> {
  if (limit <= 0 || clubs.length < 2) return [];

  const prepared = clubs.map(prepareClub).sort((x, y) => compareIds(x.item.id, y.item.id));

  const found: Array<DuplicatePairResult<T>> = [];
  forEachCandidatePair(
    prepared.map((p) => p.keys),
    (i, j) => {
      const pa = prepared[i]!;
      const pb = prepared[j]!;
      if (pa.item.id === pb.item.id) return;
      const res = scoreClubPair(pa, pb);
      if (!res || res.score + 1e-9 < DUPLICATE_MIN_SCORE) return;
      found.push({ a: pa.item, b: pb.item, score: round2(clamp01(res.score)), reasons: res.reasons });
    },
  );

  return finalizePairs(found, limit);
}
