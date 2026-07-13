import { parseTimeToMs } from './pdf-time-parser';
import { parseDataLine } from './pdf-line-parser';

export interface ResultadoRow {
  eventNo: number;
  eventLabel: string;
  place: number | null; // null = DSQ/DNS/DNF
  swimmerName: string;
  age: number | null;
  club: string;
  seedTimeMs: number | null;
  finalTimeMs: number | null;
  status: 'OK' | 'DSQ' | 'DNS' | 'DNF';
}

export interface ResultadosParseResult {
  rows: ResultadoRow[];
  warning: string | null;
}

// "Evento N  <Género> <RangoEtario libre: "12-13" o "19 & Mayores"> <Distancia> CC Metro <resto>"
const EVENT_RE = /^Evento\s+(\d+)\s+(Ni[ñn]as?|Mujeres|Ni[ñn]os?|Hombres|Mixto)\s+(.+?)\s+(\d+)\s+CC\s+Metro\s+(.+)$/i;

function isNoiseLine(line: string): boolean {
  if (line.includes("HY-TEK's MEET MANAGER")) return true;
  if (line === 'Resultados') return true;
  if (line.includes('Nombre') && line.includes('Edad') && line.includes('Equipo')) return true;
  if (/^-?\s*Chequeo de Tiempo$/.test(line)) return true;
  // "3era fecha torneo de verano 2019-20 - 29/2/2020"
  if (/\s-\s\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(line)) return true;
  return false;
}

/**
 * Parsea el reporte "Resultados" de HY-TEK Meet Manager (formato con prefijo
 * edad+puesto pegado, ej. "131Bueso, María del Milagro7:39,30 NT"). Reutiliza
 * parseDataLine de pdf-line-parser.ts, que ya sabe leer ese formato — no
 * confundir con parseSembradosPdf (formato de sembrados, separado por espacios).
 * Los relevos se saltean (formato de fila completamente distinto).
 */
export function parseResultadosPdf(rawText: string): ResultadosParseResult {
  const lines = rawText.split('\n');
  const rows: ResultadoRow[] = [];

  let currentEventNo: number | null = null;
  let currentEventLabel = '';
  let skippingRelay = false;
  let pendingClub: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { pendingClub = null; continue; }
    if (isNoiseLine(line)) continue;

    const eventMatch = line.match(EVENT_RE);
    if (eventMatch) {
      currentEventNo = parseInt(eventMatch[1] ?? '0', 10);
      const genderRaw = eventMatch[2] ?? '';
      const ageGroup = eventMatch[3] ?? '';
      const distance = eventMatch[4] ?? '0';
      const rest = (eventMatch[5] ?? '').replace(/\bRelevo\b/i, '').trim();
      currentEventLabel = `${distance}m ${rest} — ${genderRaw} ${ageGroup}`;
      skippingRelay = /\bRelevo\b/i.test(line);
      pendingClub = null;
      continue;
    }

    if (skippingRelay) continue;

    const row = parseDataLine(line);
    if (row && currentEventNo !== null) {
      // Nombre debe tener coma (Apellido, Nombre) — si no, no es una fila de resultado real
      if (!row.name.includes(',')) continue;
      const commaIdx = row.name.indexOf(',');
      const swimmerName = `${row.name.slice(0, commaIdx).trim()}, ${row.name.slice(commaIdx + 1).trim()}`;

      const finalTimeMs = parseTimeToMs(row.finalTimeRaw);
      const seedTimeMs = parseTimeToMs(row.seedTimeRaw);

      let status: ResultadoRow['status'] = 'OK';
      if (row.isDQ || row.finalTimeRaw === 'DQ') status = 'DSQ';
      else if (row.finalTimeRaw === 'NS') status = 'DNS';
      else if (row.finalTimeRaw === 'NF') status = 'DNF';
      else if (row.finalTimeRaw === 'NT' || finalTimeMs === null) status = 'DNS';

      rows.push({
        eventNo: currentEventNo,
        eventLabel: currentEventLabel,
        place: row.isDQ ? null : (row.place ?? null),
        swimmerName,
        age: row.age,
        club: pendingClub ?? '',
        seedTimeMs,
        finalTimeMs: status === 'OK' ? finalTimeMs : null,
        status,
      });
      pendingClub = null;
      continue;
    }

    // Línea de club: texto plano sin espacio inicial, no reconocida como evento/fila
    if (!raw.startsWith(' ')) {
      pendingClub = line;
    }
  }

  if (rows.length === 0) {
    return { rows, warning: 'No se reconoció ninguna fila de resultados en el archivo.' };
  }
  return { rows, warning: null };
}
