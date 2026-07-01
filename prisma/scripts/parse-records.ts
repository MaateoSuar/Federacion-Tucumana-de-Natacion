/**
 * parse-records.ts — Parsea prisma/data/records-source.txt (texto extraído de
 * "Tabla Oficial de Récords Tucumanos de Natación") a JSON estructurado.
 * Ejecutar: npx ts-node prisma/scripts/parse-records.ts
 * Salida: prisma/data/records-parsed.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface ParsedRecord {
  poolLength: 'P25' | 'P50';
  categoryCode: 'INF' | 'MEN' | 'CAD' | 'JUV' | 'MAY' | 'ABS';
  gender: 'M' | 'F' | 'MIX';
  eventCode: string; // matches EventDefinition.code (sin sufijo _M/_F para MIX)
  stroke: string;
  distance: number;
  isRelay: boolean;
  swimmerRaw: string; // "Apellido, Nombre" o nombre de equipo de relevo
  club: string;
  timeMs: number;
  recordDate: string; // ISO yyyy-mm-dd
  pool: string | null;
  tournament: string | null;
  sourcePage: number;
}

const CATEGORY_MAP: Record<string, ParsedRecord['categoryCode']> = {
  INFANTILES: 'INF',
  MENORES: 'MEN',
  CADETES: 'CAD',
  JUVENILES: 'JUV',
  MAYORES: 'MAY',
  ABSOLUTO: 'ABS',
};

const STROKE_MAP: Record<string, string> = {
  LIBRE: 'libre',
  PECHO: 'pecho',
  MARIPOSA: 'mariposa',
  ESPALDA: 'espalda',
  COMBINADO: 'combinado',
};

function parseTimeToMs(time: string): number {
  // formatos: mm:ss.cc  o  hh:mm:ss.cc (no aparece, pero por robustez)
  const parts = time.split(':').map((p) => p.trim());
  let seconds = 0;
  if (parts.length === 2) {
    const [mm, ss] = parts;
    seconds = parseInt(mm, 10) * 60 + parseFloat(ss);
  } else if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    seconds = parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseFloat(ss);
  } else {
    throw new Error(`Formato de tiempo no reconocido: ${time}`);
  }
  return Math.round(seconds * 1000);
}

function parseDateToIso(date: string): string {
  const [dd, mm, yyyy] = date.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

const TIME_RE = /(\d{1,2}:\d{2}\.\d{2})/;
const DATE_RE = /(\d{2}\/\d{2}\/\d{4})/;

function parseDataLine(rest: string): {
  swimmerRaw: string;
  club: string;
  timeMs: number;
  recordDate: string;
  pool: string | null;
  tournament: string | null;
} | null {
  const timeMatch = TIME_RE.exec(rest);
  if (!timeMatch) return null; // sin marca -> prueba vacía
  const dateMatch = DATE_RE.exec(rest);
  if (!dateMatch) return null;

  const beforeTime = rest.slice(0, timeMatch.index).trim();
  const afterDate = rest.slice(dateMatch.index + dateMatch[0].length).trim();

  // "beforeTime" = swimmerRaw + club (el club es el último token, may incluir dígitos ej. "CEF1", "CEF 24")
  // Estrategia: el club es la última "palabra" en mayúsculas antes del tiempo.
  // Puede tener espacio (ej. "CEF 24"): probamos con 2 tokens primero.
  const tokens = beforeTime.split(/\s+/);
  let club = tokens[tokens.length - 1];
  let swimmerRaw = tokens.slice(0, -1).join(' ');

  // Caso "CEF 24" — el penúltimo token es "CEF" (todo mayúsculas, <=4 letras) y el
  // último es puramente numérico → el club son ambos tokens.
  const prev = tokens[tokens.length - 2];
  if (prev && /^[A-ZÑ]{2,6}$/.test(prev) && /^\d+$/.test(club)) {
    club = `${prev} ${club}`;
    swimmerRaw = tokens.slice(0, -2).join(' ');
  }

  // "afterDate" = [pool] + [tournament]. El primer token es el código de pileta si
  // está completamente en mayúsculas (sin minúsculas) y no es parte de "Tabla Original"/etc.
  // Algunos códigos de pileta llevan un número separado por espacio (ej. "CEF 24", "CEF 1").
  let pool: string | null = null;
  let tournament: string | null = null;
  if (afterDate.length > 0) {
    const afterTokens = afterDate.split(/\s+/);
    const firstToken = afterTokens[0];
    const isPoolCode = /^[A-ZÑ0-9]{2,8}$/.test(firstToken) && firstToken !== firstToken.toLowerCase();
    if (isPoolCode) {
      let consumed = 1;
      pool = firstToken;
      const second = afterTokens[1];
      if (second && /^\d{1,3}$/.test(second)) {
        pool = `${pool} ${second}`;
        consumed = 2;
      }
      tournament = afterTokens.slice(consumed).join(' ').trim() || null;
    } else {
      tournament = afterDate;
    }
  }

  return {
    swimmerRaw: swimmerRaw.replace(/,\s*$/, '').trim(),
    club,
    timeMs: parseTimeToMs(timeMatch[1]),
    recordDate: parseDateToIso(dateMatch[1]),
    pool,
    tournament,
  };
}

function parseEventPrefix(line: string): {
  eventCode: string;
  stroke: string;
  distance: number;
  isRelay: boolean;
  isMixed: boolean;
  rest: string;
} | null {
  // Individual: "50 LIBRE ..." / "100 PECHO ..." / etc.
  const indMatch = /^(\d{2,4})\s+(LIBRE|PECHO|MARIPOSA|ESPALDA|COMBINADO)\b\s*(.*)$/.exec(line);
  if (indMatch) {
    const distance = parseInt(indMatch[1], 10);
    const strokeWord = indMatch[2];
    const stroke = STROKE_MAP[strokeWord];
    return {
      eventCode: `${distance}${strokeCodeFor(strokeWord)}`,
      stroke,
      distance,
      isRelay: false,
      isMixed: false,
      rest: indMatch[3] ?? '',
    };
  }

  // Relevos: "4X50 L ...", "4X100C MIX ...", "4X200 L MIX", etc.
  const relayMatch = /^4X(50|100|200)\s*(L|C)(\s*MIX)?\b\s*(.*)$/.exec(line);
  if (relayMatch) {
    const distanceTeam = parseInt(relayMatch[1], 10);
    const strokeCode = relayMatch[2]; // L = libre, C = combinado
    const isMixed = !!relayMatch[3];
    const totalDistance = distanceTeam * 4;
    const relayCode = `4x${distanceTeam}R${strokeCode}`;
    return {
      eventCode: isMixed ? `${relayCode}_MIX` : relayCode, // gender suffix (_M/_F) se agrega afuera
      stroke: strokeCode === 'L' ? 'relevo_libre' : 'relevo_combinado',
      distance: totalDistance,
      isRelay: true,
      isMixed,
      rest: relayMatch[4] ?? '',
    };
  }

  return null;
}

function strokeCodeFor(strokeWord: string): string {
  switch (strokeWord) {
    case 'LIBRE': return 'L';
    case 'ESPALDA': return 'E';
    case 'PECHO': return 'P';
    case 'MARIPOSA': return 'MA';
    case 'COMBINADO': return 'C';
    default: throw new Error(`Stroke desconocido: ${strokeWord}`);
  }
}

function main() {
  const srcPath = path.join(process.cwd(), 'prisma', 'data', 'records-source.txt');
  const raw = fs.readFileSync(srcPath, 'utf-8');

  const pageBlocks = raw.split(/=== PAGE (\d+) ===/).slice(1);
  const records: ParsedRecord[] = [];
  const mixSeen = new Set<string>(); // dedupe: MIX aparece en página Varones Y Mujeres
  const unparsedLines: Array<{ page: number; line: string }> = [];

  for (let i = 0; i < pageBlocks.length; i += 2) {
    const pageNum = parseInt(pageBlocks[i], 10);
    const content = pageBlocks[i + 1];
    const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    // línea 3 (índice 2) es la etiqueta de categoría — páginas de portada no la tienen
    const catLine = lines[2] ?? '';
    const catMatch = /^(INFANTILES|MENORES|CADETES|JUVENILES|MAYORES|ABSOLUTO)\s+(VARONES|MUJERES)\s*-\s*PILETA\s*(\d+)\s*METROS/i.exec(catLine);
    if (!catMatch) continue; // página de portada, sin tabla

    const categoryCode = CATEGORY_MAP[catMatch[1].toUpperCase()];
    const genderPage: 'M' | 'F' = catMatch[2].toUpperCase() === 'VARONES' ? 'M' : 'F';
    const poolLength: 'P25' | 'P50' = catMatch[3] === '25' ? 'P25' : 'P50';

    // línea 4 (índice 3) es el encabezado de columnas "PRUEBA APELLIDO/NOMBRE..."
    const dataLines = lines.slice(4);

    for (const line of dataLines) {
      const eventInfo = parseEventPrefix(line);
      if (!eventInfo) {
        unparsedLines.push({ page: pageNum, line });
        continue;
      }
      const parsedRest = parseDataLine(eventInfo.rest);
      if (!parsedRest) continue; // prueba sin marca registrada

      const gender: 'M' | 'F' | 'MIX' = eventInfo.isMixed ? 'MIX' : genderPage;
      const eventCode = eventInfo.isMixed ? eventInfo.eventCode : `${eventInfo.eventCode}_${genderPage}`;

      if (eventInfo.isMixed) {
        const dedupeKey = `${poolLength}|${categoryCode}|${eventCode}|${parsedRest.timeMs}|${parsedRest.swimmerRaw}`;
        if (mixSeen.has(dedupeKey)) continue;
        mixSeen.add(dedupeKey);
      }

      records.push({
        poolLength,
        categoryCode,
        gender,
        eventCode,
        stroke: eventInfo.stroke,
        distance: eventInfo.distance,
        isRelay: eventInfo.isRelay,
        swimmerRaw: parsedRest.swimmerRaw,
        club: parsedRest.club,
        timeMs: parsedRest.timeMs,
        recordDate: parsedRest.recordDate,
        pool: parsedRest.pool,
        tournament: parsedRest.tournament,
        sourcePage: pageNum,
      });
    }
  }

  const outPath = path.join(process.cwd(), 'prisma', 'data', 'records-parsed.json');
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8');

  console.log(`✅ ${records.length} récords parseados → ${outPath}`);
  if (unparsedLines.length > 0) {
    console.log(`⚠️  ${unparsedLines.length} líneas no reconocidas:`);
    for (const u of unparsedLines) console.log(`   [pág ${u.page}] ${u.line}`);
  }

  // Resumen por categoría/pileta/género para spot-check manual
  const summary = new Map<string, number>();
  for (const r of records) {
    const key = `${r.poolLength} ${r.categoryCode} ${r.gender}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  console.log('\nResumen por categoría:');
  for (const [key, count] of [...summary.entries()].sort()) {
    console.log(`   ${key}: ${count}`);
  }
}

main();
