/**
 * Lectura del encabezado de prueba de Meet Manager, compartida por los tres lectores
 * (resultados, sembrados y la importación al sistema).
 *
 *   "Evento 1  Niñas 12-13 100 CC Metro Estilo Libre FEDERADOS"
 *   "Evento 1  Mujeres Categoría Mayores 800 CL Metro Estilo Libre"
 *   "Evento  1   Mujeres 12 & Mayores 50 CC Metro Estilo de Mariposa FEDERADO"
 *   "Evento 4  Hombres 9 Años de Edad 100 CL Metro Estilo de Espalda"
 *   "Eliminatorias ...   (Evento 4  Hombres Categoría Mayores 200 CL Metro CI)"   (continuación de página)
 *
 * "CC Metro" es pileta de 25 m y "CL Metro" pileta de 50 m: el código se lee del archivo,
 * no se deduce de los tiempos. El texto entre el género y la distancia (rango de edades,
 * "Categoría Mayores", "9 Años de Edad"…) se devuelve tal cual: no se interpreta acá.
 */

export type CourseCode = 'CC' | 'CL' | 'LC' | 'LM';

export interface ParsedEventHeader {
  eventNo: number;
  genderRaw: string;
  /** Texto entre el género y la distancia, sin tocar. Vacío si la prueba no trae categoría de edad. */
  ageGroup: string;
  distance: number;
  courseCode: CourseCode;
  /** Estilo y nivel tal como se escriben, con "Relevo" incluido si lo trae. */
  rest: string;
  isRelay: boolean;
  /** true si es la línea que repite la prueba al cambiar de página ("... (Evento N …)"). */
  isContinuation: boolean;
}

const EVENT_BODY_RE =
  /^Evento\s+(\d+)\s+(Ni[ñn]as?|Mujeres|Ni[ñn]os?|Hombres|Mixto)\s+(?:(.*?)\s+)?(?:(\d+)\s*x\s*)?(\d+)\s+(CC|CL|LC|LM)\s+Metros?\b\s*(.*)$/i;

export function parseEventHeader(rawLine: string): ParsedEventHeader | null {
  const line = rawLine.trim();
  let body = line;
  let isContinuation = false;

  const paren = line.match(/\(\s*(Evento\s+\d+\s.*)\)\s*$/);
  if (paren) {
    body = paren[1] ?? '';
    isContinuation = true;
  } else if (!/^Evento\s+\d+/i.test(line)) {
    return null;
  }

  const m = body.match(EVENT_BODY_RE);
  if (!m) return null;
  const rest = (m[7] ?? '').trim();
  const legs = m[4] ? parseInt(m[4], 10) : 1;
  return {
    eventNo: parseInt(m[1] ?? '0', 10),
    genderRaw: m[2] ?? '',
    ageGroup: (m[3] ?? '').trim(),
    // Posta "4x50": distancia total (200). Las postas se saltean igual.
    distance: legs * parseInt(m[5] ?? '0', 10),
    courseCode: (m[6] ?? 'CC').toUpperCase() as CourseCode,
    rest,
    isRelay: legs > 1 || /\bRelevo\b/i.test(rest),
    isContinuation,
  };
}

/**
 * Estilo y nivel sin la palabra "Relevo", para la etiqueta de la prueba. Se conserva tal cual el texto
 * del archivo (también los espacios dobles): la web arma filtros con esta etiqueta y no debe cambiar.
 */
export function restWithoutRelay(rest: string): string {
  return rest.replace(/\bRelevo\b/i, '').trim();
}

/** "<distancia>m <estilo y nivel> — <género> <edades>" (la web separa por " — "). */
export function buildResultEventLabel(h: ParsedEventHeader): string {
  return `${h.distance}m ${restWithoutRelay(h.rest)} — ${h.genderRaw} ${h.ageGroup}`.trim();
}
