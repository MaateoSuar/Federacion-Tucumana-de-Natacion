import { parseTimeToMs } from './pdf-time-parser';
import { parseEventHeader } from './pdf-event-header';

/**
 * Lectura de UNA fila de resultado de Meet Manager (compartida por parseResultadosPdf y
 * parseLines). Meet Manager pega las columnas sin separador y su orden cambia según el
 * archivo. Variantes reales cubiertas:
 *
 *   puesto al frente   " 121Villena, Lujan3:02,9593:00,00"   edad 12 · puesto 1 · final · 9 pts · sembrado
 *   puesto al final    " 13Suarez, Constanza2:56,17203:04,001" edad 13 · final · 20 pts · sembrado · puesto 1
 *   con marca de tope  " 10Sosa, Jazmin2:47.59TB122:59.033"    final · marca TB · 12 pts · sembrado · puesto 3
 *   sin sembrado       " 191Urgelles, Martina9:06,149"          final · 9 pts
 *
 * Cuál de las dos disposiciones usa un archivo NO está en el encabezado de columnas (es
 * idéntico), pero sí se deduce de la propia fila: el prefijo de dígitos con puesto lleva
 * un dígito de más respecto de la edad que admite el rango de la prueba.
 */

export interface ParsedRow {
  age: number | null; // null solo si no se pudo separar edad y puesto (sin rango de edades)
  place: number | undefined;
  isDQ: boolean;
  name: string;
  finalTimeRaw: string;
  seedTimeRaw: string;
  /** El tiempo o el puesto admitía dos lecturas y se eligió por convención: revisar. */
  ambiguous?: boolean;
}

/** Rango de edades de la prueba ("12-13" → 12..13, "19 & Mayores" → 19..∞, "9" → 9..9). */
export interface AgeRange {
  min: number;
  max: number;
}

export function parseAgeRange(ageGroup: string): AgeRange | null {
  const m = ageGroup.trim().match(/^(\d{1,3})(?:\s*-\s*(\d{1,3}))?(?:\s*&\s*(Mayores|Menores|O)\b)?/i);
  if (!m) return null;
  const first = parseInt(m[1] ?? '0', 10);
  const suffix = (m[3] ?? '').toLowerCase();
  if (suffix === 'mayores' || suffix === 'o') return { min: first, max: Number.POSITIVE_INFINITY };
  if (suffix === 'menores') return { min: 0, max: first };
  return { min: first, max: m[2] ? parseInt(m[2], 10) : first };
}

/** Dónde imprime el archivo el puesto: pegado a la edad ("front") o al final de la fila ("trailing"). */
export type PlaceLayout = 'front' | 'trailing';

export interface DataLineOptions {
  /** Disposición del archivo, para cuando el rango de edades de la prueba no decide. */
  layout?: PlaceLayout | null;
  /** Último puesto leído en la prueba: desempata cuando puntos y puesto vienen pegados. */
  prevPlace?: number;
}

const MAX_AGE = 120;
const TIME_SRC = '(?:\\d{1,2}:\\d{2}|\\d{2})[,.]\\d{2}';
const FINAL_RE = new RegExp(`^(${TIME_SRC}|DQ|DNF|DNS|NS|NF|NT)`);
const SEED_FULL_RE = new RegExp(`^(${TIME_SRC}|NT|NS|NF)$`);
// sembrado + puesto opcional al final; "*" marca empate ("38,61*9" = sembrado 38,61, puesto 9 compartido)
const SEED_AND_PLACE_RE = new RegExp(`^(${TIME_SRC}|NT|NS|NF)\\*?(\\d{1,2})?(---)?$`);
// Estado en lugar de tiempo final, al final de la fila, con sembrado y puesto opcionales.
const STATUS_TAIL_RE = new RegExp(
  `(?<=[a-záéíóúüñ\\s]|\\s[A-Z])(?:DQ|DNF|DNS|NS|NF|NT)\\s*(?:${TIME_SRC}|NT|NS|NF)?\\*?\\d{0,2}(?:\\s*---)?$`,
);
// Puntos compartidos por empate: "5. 50" (= 5,50)
const TIE_POINTS_RE = /^\d{1,2}\. ?\d{2}/;
// Marca que Meet Manager imprime junto al tiempo (tiempo básico, récord, clasificado): "TB", "TBM",
// "JMU B", "PAN", "q", "qTB". Nunca NT/NS/NF/DQ, que son estados.
// También con una letra de marca antes de la "q" ("Cq", "CqTB", "CqMU B").
const MARKER_RE =
  /^(?:[A-Z]q(?:[A-Z]{1,4}(?: [A-Z])?)?|q(?:[A-Z]{1,4}(?: [A-Z])?)?|(?!(?:NT|NS|NF|DQ)(?![A-Z]))[A-Z]{1,4}(?: [A-Z])?)(?=[\s\d*]|$)/;

// Cotas de cordura del lector (no son reglas de negocio): un tiempo fuera de
// 0,4–3 s por metro no es un tiempo de natación, es una fila mal cortada.
const MIN_MS_PER_METRE = 400;
const MAX_MS_PER_METRE = 3000;

function isPlausibleTime(raw: string, distance: number | undefined): boolean | null {
  const ms = parseTimeToMs(raw);
  if (ms === null || !distance) return null;
  return ms >= distance * MIN_MS_PER_METRE && ms <= distance * MAX_MS_PER_METRE;
}

function isComparable(finalRaw: string, seedRaw: string): boolean {
  const finalMs = parseTimeToMs(finalRaw);
  const seedMs = parseTimeToMs(seedRaw);
  return finalMs !== null && seedMs !== null && seedMs >= finalMs / 2 && seedMs <= finalMs * 2;
}

// ─── Prefijo: edad (y puesto) ─────────────────────────────────────────────────

const inRange = (range: AgeRange, n: number): boolean => n >= range.min && n <= range.max;

/** Interpretación "puesto al frente" del prefijo: edad de 1 o 2 dígitos + puesto. */
function splitFront(digits: string, range: AgeRange | null | undefined): { age: number | null; place: number } | null {
  const two = digits.length >= 3 ? parseInt(digits.slice(0, 2), 10) : NaN;
  const one = digits.length >= 2 ? parseInt(digits.slice(0, 1), 10) : NaN;
  if (range) {
    if (!Number.isNaN(two) && inRange(range, two)) return { age: two, place: parseInt(digits.slice(2), 10) };
    if (!Number.isNaN(one) && inRange(range, one)) return { age: one, place: parseInt(digits.slice(1), 10) };
    return null;
  }
  if (digits.length >= 3) return { age: two, place: parseInt(digits.slice(2), 10) };
  // Dos dígitos sin rango que lo confirme: edad desconocida, el segundo dígito es el puesto.
  if (digits.length === 2) return { age: null, place: parseInt(digits.slice(1), 10) };
  return null;
}

/** Interpretación "puesto al final": todo el prefijo es la edad. */
function readTrailingAge(digits: string, range: AgeRange | null | undefined): number | null {
  if (digits.length > 3) return null;
  const age = parseInt(digits, 10);
  if (age < 1 || age > MAX_AGE) return null;
  if (range && !inRange(range, age)) return null;
  return age;
}

/** Disposición que impone el prefijo, o null si el rango de edades no alcanza para decidir. */
export function inferLayoutFromPrefix(digits: string, range: AgeRange | null | undefined): PlaceLayout | null {
  if (!range) return null;
  const front = splitFront(digits, range) !== null;
  const trailing = readTrailingAge(digits, range) !== null;
  if (trailing && !front) return 'trailing';
  if (front && !trailing) return 'front';
  return null;
}

// ─── Cola: final + marca + puntos + sembrado (+ puesto) ───────────────────────

interface TailResult {
  finalTimeRaw: string;
  seedTimeRaw: string;
  /** Puesto impreso al final de la fila (disposición "trailing"). */
  place?: number;
  /** Puntos y puesto pegados sin sembrado: "91" = 9 pts + puesto 1. Se resuelve con el orden de llegada. */
  ptsAndPlaceDigits?: string;
  /** Hay más de una lectura posible con los datos de la fila. */
  ambiguous?: boolean;
}

interface Candidate {
  seedTimeRaw: string;
  place?: number;
  dq?: boolean;
}

function gluedCandidates(after: string, trailing: boolean): Candidate[] {
  const tie = after.match(TIE_POINTS_RE);
  const lens = tie ? [tie[0].length] : [1, 2, 0, 3];
  const out: Candidate[] = [];
  for (const len of lens) {
    if (len > after.length) continue;
    const pts = after.slice(0, len);
    if (!tie && !/^\d*$/.test(pts)) continue;
    const m = after.slice(len).trim().match(SEED_AND_PLACE_RE);
    if (!m) continue;
    const placeDigits = m[2];
    if (!trailing && (placeDigits !== undefined || m[3] !== undefined)) continue;
    if (/^0\d:/.test(m[1] ?? '')) continue; // "03:04" no es un tiempo: el 0 es el último dígito de los puntos
    out.push({ seedTimeRaw: m[1] ?? 'NT', place: placeDigits ? parseInt(placeDigits, 10) : undefined });
  }
  return out;
}

function pickCandidate(
  finalTimeRaw: string,
  candidates: Candidate[],
  distance: number | undefined,
): { candidate: Candidate; ambiguous: boolean } | null {
  if (candidates.length === 0) return null;
  let pool = candidates;
  const comparable = pool.filter((c) => isComparable(finalTimeRaw, c.seedTimeRaw));
  if (comparable.length > 0) pool = comparable;
  const plausible = pool.filter((c) => isPlausibleTime(c.seedTimeRaw, distance) !== false);
  if (plausible.length > 0) pool = plausible;
  const first = pool[0] as Candidate;
  const seedMs = (c: Candidate): number | null => parseTimeToMs(c.seedTimeRaw);
  const distinct = pool.some((c) => seedMs(c) !== seedMs(first) || c.place !== first.place);
  return { candidate: first, ambiguous: distinct };
}

/**
 * Parsea la cola "tiempo final + puntos + sembrado (+ puesto)", que Meet Manager pega sin
 * separadores. Variantes reales:
 *   "3:02,9593:00,00"   final 3:02,95 · 9 pts · sembrado 3:00,00
 *   "3:15,48 NT"        final · sin puntos (hay espacio) · sembrado NT
 *   "1:23,475. 501:25,44"  empate: 5,50 pts
 *   "DQ 3:10,76"        descalificado
 *   "1:09.06"           formato CL: sin sembrado
 *   "32.021231.001"     (puesto al final) final 32.02 · 12 pts · sembrado 31.00 · puesto 1
 *   "9:05.05TBM91"      (puesto al final, sin sembrado) final · marca TBM · 9 pts · puesto 1
 */
function parseTimesTail(tail: string, trailing: boolean, distance: number | undefined): TailResult | null {
  const finalMatch = tail.match(FINAL_RE);
  if (!finalMatch) return null;
  const matched = finalMatch[1] ?? 'NT';
  // "DNF"/"DNS" son los mismos estados que NF/NS
  const finalTimeRaw = matched === 'DNF' ? 'NF' : matched === 'DNS' ? 'NS' : matched;
  let after = tail.slice(matched.length);

  const isStatus = !/\d/.test(matched);
  if (!isStatus) {
    const marker = after.match(MARKER_RE);
    if (marker) after = after.slice(marker[0].length);
  }

  if (after.trim() === '') return { finalTimeRaw, seedTimeRaw: 'NT' };
  // Estado sin puesto: "NS ---", "DNF ---"
  if (after.trim() === '---') return { finalTimeRaw, seedTimeRaw: 'NT' };

  // Empate sin sembrado: puntos compartidos ("10. 50") y/o puesto compartido ("*8"), con o sin espacios.
  const tied = after.trim().match(/^(?:\d{0,2}\. \d{2}|\d{0,2})\*(\d{1,3})$/);
  if (tied && trailing) return { finalTimeRaw, seedTimeRaw: 'NT', place: parseInt(tied[1] ?? '', 10) };
  if (/^\d{1,2}\. \d{2}$/.test(after.trim())) return { finalTimeRaw, seedTimeRaw: 'NT' };

  // Con espacio después del final no hay puntos: lo que sigue es el sembrado (y el puesto).
  if (/^\s/.test(after)) {
    // Sin columna de sembrado: lo único que sigue al tiempo (y a su marca) es el puesto, " 1" o " *17" (empate).
    const onlyPlace = after.trim().match(/^\*?(\d{1,3})$/);
    if (onlyPlace && trailing) return { finalTimeRaw, seedTimeRaw: 'NT', place: parseInt(onlyPlace[1] ?? '', 10) };
    const m = after.trim().match(SEED_AND_PLACE_RE);
    if (!m) return null;
    if (!trailing && (m[2] !== undefined || m[3] !== undefined)) return null;
    return { finalTimeRaw, seedTimeRaw: m[1] ?? 'NT', ...(m[2] ? { place: parseInt(m[2], 10) } : {}) };
  }

  // Solo dígitos: puntos (y puesto) sin columna de sembrado.
  if (/^\d{1,4}$/.test(after)) {
    return { finalTimeRaw, seedTimeRaw: 'NT', ...(trailing ? { ptsAndPlaceDigits: after } : {}) };
  }

  const picked = pickCandidate(finalTimeRaw, gluedCandidates(after, trailing), distance);
  if (!picked) return null;
  return {
    finalTimeRaw,
    seedTimeRaw: picked.candidate.seedTimeRaw,
    ...(picked.candidate.place !== undefined ? { place: picked.candidate.place } : {}),
    ...(picked.ambiguous ? { ambiguous: true } : {}),
  };
}

/**
 * Nota al pie de Meet Manager: un dígito suelto pegado al tiempo ("Uma 52:56,32" =
 * nota 5 + 2:56,32). Si la cola admite las dos lecturas (con y sin ese dígito) se decide:
 *   1. por la distancia de la prueba: 52 minutos no es un 200 combinado;
 *   2. por el sembrado, si es comparable con una sola de las lecturas;
 *   3. por el formato: con coma decimal el tiempo va pegado al nombre, así que un
 *      dígito tras un espacio es la nota; con punto (formato CL) el tiempo va separado.
 * Si solo decide el paso 3, la fila se marca `ambiguous` para que se revise en el preview.
 */
function resolveTimes(
  nameRaw: string,
  tail: string,
  distance: number | undefined,
  trailing: boolean,
): TailResult | null {
  const asIs = parseTimesTail(tail, trailing, distance);
  const withoutNote = /^\d/.test(tail) ? parseTimesTail(tail.slice(1), trailing, distance) : null;

  if (!withoutNote) return asIs;
  if (!asIs) return withoutNote;

  const plausibleAsIs = isPlausibleTime(asIs.finalTimeRaw, distance);
  const plausibleNote = isPlausibleTime(withoutNote.finalTimeRaw, distance);
  if (plausibleAsIs !== null && plausibleNote !== null && plausibleAsIs !== plausibleNote) {
    return plausibleAsIs ? asIs : withoutNote;
  }

  const nearSeed = (t: TailResult): boolean => isComparable(t.finalTimeRaw, t.seedTimeRaw);
  if (nearSeed(asIs) !== nearSeed(withoutNote)) {
    return nearSeed(asIs) ? asIs : withoutNote;
  }

  const noteByFormat = /\s$/.test(nameRaw) && withoutNote.finalTimeRaw.includes(',');
  return { ...(noteByFormat ? withoutNote : asIs), ambiguous: true };
}

/** Puntos y puesto pegados ("91" = 9 pts + puesto 1): el puesto es el menor candidato mayor que el anterior. */
function resolvePlaceFromDigits(digits: string, prevPlace: number): { place: number; ambiguous: boolean } | null {
  const candidates = [digits, digits.slice(1), digits.slice(2)]
    .filter((d) => d !== '' && !d.startsWith('0'))
    .map((d) => parseInt(d, 10))
    .filter((n) => n >= 1 && n <= 999);
  const later = candidates.filter((n) => n > prevPlace);
  if (later.length === 0) return null;
  const place = Math.min(...later);
  return { place, ambiguous: later.length > 1 && place !== prevPlace + 1 };
}

// ─── Fila completa ────────────────────────────────────────────────────────────

/**
 * Parsea una fila de resultado: edad (+ puesto) + nombre + tiempos, todo pegado.
 * `ageRange` (de la prueba) permite distinguir edades de 1 y 2 dígitos y la disposición del
 * puesto; `distance` (metros) permite descartar lecturas de tiempo imposibles.
 */
export function parseDataLine(
  line: string,
  ageRange?: AgeRange | null,
  distance?: number,
  options?: DataLineOptions,
): ParsedRow | null {
  // Un archivo usa siempre la misma disposición: la del archivo (votada fila por fila) manda sobre la
  // que sugiere el prefijo de una sola fila, que se equivoca cuando la edad cae fuera del rango de la
  // prueba. Si la fila no se puede leer así, se prueba la otra disposición.
  const digits = line.trim().match(/^(\d{1,4})/)?.[1] ?? '';
  const preferred: PlaceLayout = options?.layout ?? inferLayoutFromPrefix(digits, ageRange) ?? 'front';
  const other: PlaceLayout = preferred === 'front' ? 'trailing' : 'front';
  return (
    parseDataLineAs(line, ageRange, distance, options, preferred) ??
    parseDataLineAs(line, ageRange, distance, options, other)
  );
}

function parseDataLineAs(
  line: string,
  ageRange: AgeRange | null | undefined,
  distance: number | undefined,
  options: DataLineOptions | undefined,
  layoutChoice: PlaceLayout,
): ParsedRow | null {
  const trimmed = line.trim();

  // Prefijo: dígitos de edad(+puesto), "*" de empate opcional, y puesto o "---" (descalificado).
  const head = trimmed.match(/^(\d{1,4})(?:(\*)(\d+)|(---))?(.+)$/s);
  if (!head) return null;

  const digits = head[1] ?? '';
  const starPlace = head[3];
  const isDQ = head[4] === '---';
  // Clase deportiva de natación adaptada pegada al nombre ("Ibarra, Paula SM10J3:10.32"): no es parte del nombre.
  const rest = (head[5] ?? '').replace(/\s+S[BM]?\d{1,2}X?(?=\s?J?(?:\d{1,2}:\d{2}|\d{2})[:.,]\d{2})/, '');

  let age: number | null;
  let place: number | undefined;
  let trailing = false;
  if (starPlace !== undefined || isDQ) {
    // Con "*" o "---" los dígitos iniciales son solo la edad.
    if (digits.length > 2) return null;
    age = parseInt(digits, 10);
    place = isDQ ? undefined : parseInt(starPlace ?? '', 10);
  } else {
    if (layoutChoice === 'trailing') {
      trailing = true;
      age = readTrailingAge(digits, ageRange) ?? (digits.length <= 2 ? parseInt(digits, 10) : null);
      if (age === null) return null;
      place = undefined;
    } else {
      const split = splitFront(digits, ageRange);
      if (!split) {
        // Sin rango que lo confirme: lectura histórica (edad de 2 dígitos + puesto). Con rango, una edad
        // fuera de él ("73" en "19 & Mayores" = 7 años, puesto 3) se lee igual: el puesto va siempre.
        if (digits.length >= 3) {
          age = parseInt(digits.slice(0, 2), 10);
          place = parseInt(digits.slice(2), 10);
        } else if (digits.length === 2) {
          age = ageRange ? parseInt(digits.slice(0, 1), 10) : null;
          place = parseInt(digits.slice(1), 10);
        } else {
          return null;
        }
      } else {
        age = split.age;
        place = split.place;
      }
    }
  }

  // ¿Dónde termina el nombre?
  //  a) En un estado sin tiempo (DQ/NS/NF/NT), pegado a una minúscula ("TeoDQ 3:10,76")
  //     o separado por espacio ("MATEO NS"). Nunca dentro de un apellido en mayúsculas.
  //  b) Si no, en el primer dígito: los nombres no tienen dígitos.
  const statusMatch = rest.match(STATUS_TAIL_RE);
  const firstDigit = rest.search(/\d/);
  // Lo que aparezca primero: "Agostina3:15,48 NT" corta en el tiempo, no en el NT del sembrado.
  const statusAt = statusMatch?.index ?? -1;
  const nameEnd =
    statusAt >= 0 && firstDigit >= 0 ? Math.min(statusAt, firstDigit) : Math.max(statusAt, firstDigit);
  if (nameEnd < 0) return null;
  const nameRaw = rest.slice(0, nameEnd);
  const tail = rest.slice(nameEnd);

  const times = resolveTimes(nameRaw, tail, distance, trailing);
  if (!times) return null;

  const name = nameRaw.trim();
  if (!name) return null;

  let ambiguous = times.ambiguous === true;
  if (trailing) {
    if (times.place !== undefined) {
      place = times.place;
    } else if (times.ptsAndPlaceDigits !== undefined) {
      const resolved = resolvePlaceFromDigits(times.ptsAndPlaceDigits, options?.prevPlace ?? 0);
      if (resolved) {
        place = resolved.place;
        if (resolved.ambiguous) ambiguous = true;
      }
    }
  }
  const dq = isDQ || (trailing && times.finalTimeRaw === 'DQ');

  return {
    age,
    place: dq ? undefined : place,
    isDQ: dq,
    name,
    finalTimeRaw: times.finalTimeRaw,
    seedTimeRaw: times.seedTimeRaw,
    ...(ambiguous ? { ambiguous: true } : {}),
  };
}

/**
 * Disposición del puesto que usa el archivo, por votación de las filas cuyo prefijo la
 * decide (ver `inferLayoutFromPrefix`). null si ninguna fila la decide.
 */
export function detectPlaceLayout(lines: string[]): PlaceLayout | null {
  let range: AgeRange | null = null;
  let front = 0;
  let trailing = 0;
  for (const raw of lines) {
    const header = parseEventHeader(raw);
    if (header) {
      range = parseAgeRange(header.ageGroup);
      continue;
    }
    if (!/^\s/.test(raw)) continue;
    const m = raw.trim().match(/^(\d{1,4})[^\d*\-\s]/);
    if (!m || !raw.includes(',')) continue;
    let layout = inferLayoutFromPrefix(m[1] ?? '', range);
    if (layout === null && !range) {
      // Sin rango de edades ("Categoría Mayores") decide la cola: con el puesto al final, la
      // lectura "puesto al frente" no encuentra dónde poner los dígitos sobrantes, y al revés.
      const asFront = parseDataLineAs(raw, null, undefined, undefined, 'front');
      const asTrailing = parseDataLineAs(raw, null, undefined, undefined, 'trailing');
      if (asFront && !asTrailing) layout = 'front';
      else if (asTrailing && !asFront) layout = 'trailing';
    }
    if (layout === 'front') front++;
    else if (layout === 'trailing') trailing++;
  }
  if (front === 0 && trailing === 0) return null;
  return trailing > front ? 'trailing' : 'front';
}

// ─── Disposición "Equipo antes del nombre" (Edad   EquipoNombreTiempo de Finales) ──

export interface TeamFirstRow extends ParsedRow {
  team: string;
}

/**
 * "FANJ 13Chavez Puch, Emma Victoria131.05  20" = club FANJ · edad 13 · nombre · puesto 1 ·
 * final 31.05 · 20 pts. El club viene abreviado (sigla), no con el nombre completo.
 * Puesto y tiempo van pegados: "1341.19" = puesto 13 + 41.19 (la lectura "1" + "341.19"
 * no es un tiempo); si caben las dos, decide la distancia y después el orden de llegada.
 */
export function parseTeamFirstRow(line: string, distance?: number, prevPlace = 0): TeamFirstRow | null {
  const m = line.trim().match(/^([A-Za-z0-9]{2,8})\s+(\d{1,3})(.+)$/s);
  if (!m) return null;
  const team = m[1] ?? '';
  const age = parseInt(m[2] ?? '', 10);
  const rest = m[3] ?? '';
  const nameEnd = rest.search(/\d|---/);
  if (nameEnd <= 0) return null;
  const name = rest.slice(0, nameEnd).trim();
  if (!name.includes(',')) return null;
  const tail = rest.slice(nameEnd);

  const status = tail.match(/^---\s*(DQ|NS|NF)\s*(?:(\d+))?$/);
  if (status) {
    const code = status[1] ?? 'DQ';
    return { team, age, place: undefined, isDQ: code === 'DQ', name, finalTimeRaw: code, seedTimeRaw: 'NT' };
  }

  const body = tail.replace(/\s+\d{1,3}\s*$/, '');
  const options: Array<{ place: number; time: string }> = [];
  for (const len of [1, 2]) {
    const time = body.slice(len);
    if (/^\d+$/.test(body.slice(0, len)) && new RegExp(`^${TIME_SRC}$`).test(time)) {
      options.push({ place: parseInt(body.slice(0, len), 10), time });
    }
  }
  if (options.length === 0) return null;
  let pool = options;
  const plausible = pool.filter((o) => isPlausibleTime(o.time, distance) !== false);
  if (plausible.length > 0) pool = plausible;
  const later = pool.filter((o) => o.place > prevPlace);
  if (later.length > 0) pool = later;
  const chosen = pool[0] as { place: number; time: string };
  const ambiguous = pool.length > 1;
  return {
    team,
    age,
    place: chosen.place,
    isDQ: false,
    name,
    finalTimeRaw: chosen.time,
    seedTimeRaw: 'NT',
    ...(ambiguous ? { ambiguous: true } : {}),
  };
}

export function isSeedToken(s: string): boolean {
  return SEED_FULL_RE.test(s);
}

/**
 * Algunas páginas parten la fila en dos líneas: " 12" (edad) y, debajo y sin sangría,
 * "Navamuel Ayala, Antonella Maite35,59 38,621". Se une en una sola, dejando la segunda en
 * blanco para no mover los números de línea.
 */
export function joinSplitRows(lines: string[]): string[] {
  const out = lines.slice();
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i] ?? '';
    if (!/^\s+\d{1,4}(?:\*\d+|---)?\s*$/.test(a)) continue;
    const b = out[i + 1] ?? '';
    if (/^\s/.test(b) || !/^[^\d\s][^,]*,\s*\S/.test(b) || !/(\d[.,]\d\d|NT|DQ|NS|NF)/.test(b)) continue;
    out[i] = a.replace(/\s+$/, '') + b;
    out[i + 1] = '';
  }
  return out;
}

/**
 * Puntos + sembrado que el PDF imprimió en una línea aparte, justo debajo de la fila:
 * "161:26.31" = 16 pts + sembrado 1:26.31; "201:04.57" = 20 pts + 1:04.57; "NT".
 * Devuelve el sembrado, o null si la línea no tiene esa forma. Si hay dos lecturas, gana la
 * que es comparable con el tiempo final (entre la mitad y el doble).
 */
export function parseSeedContinuation(line: string, finalTimeMs: number | null, distance?: number): string | null {
  const t = line.trim();
  if (!/^\d{0,3}(?:(?:\d{1,2}:)?\d{1,2}[.,]\d{2}|NT)$/.test(t)) return null;
  const candidates = gluedCandidates(t, false).map((c) => c.seedTimeRaw);
  if (candidates.length === 0) return null;
  const near = candidates.filter((c) => {
    const ms = parseTimeToMs(c);
    return finalTimeMs !== null && ms !== null && ms >= finalTimeMs / 2 && ms <= finalTimeMs * 2;
  });
  const pool = near.length > 0 ? near : candidates;
  const plausible = pool.filter((c) => isPlausibleTime(c, distance) !== false);
  return (plausible.length > 0 ? plausible : pool)[0] ?? null;
}
