/**
 * parse-time-standards.ts — Convierte la planilla de marcas básicas (BASICOS.xlsx)
 * en prisma/data/time-standards.json, que después carga prisma/seed-time-standards.ts.
 *
 * La planilla tiene una hoja con tres tablas:
 *   - azul  "MUJERES" / "VARONES": Básica Nacional, una columna por categoría.
 *   - verde "BASICOS FEDERARSE":   Básica para federarse, VARON/MUJER por grupo.
 * "S/T" = sin tiempo (no hay marca para esa prueba y categoría): se omite.
 * Los tiempos se copian tal cual están en la planilla; no se corrige nada.
 *
 * Uso (desde apps/api, donde está instalada la librería xlsx):
 *   node --require ts-node/register scripts/parse-time-standards.ts <ruta.xlsx> <25|50>
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

type GenderCode = 'M' | 'F';

interface StandardRow {
  set: string;
  stroke: string;
  distance: number;
  gender: GenderCode;
  category: string;
  pool: 'P25' | 'P50';
  time: string;
  timeMs: number;
}

const SETS = [
  { code: 'NACIONAL', name: 'Básica Nacional', shortLabel: 'NAC', purpose: 'nacional', color: 'sky', orderNo: 1, source: null },
  { code: 'FEDERARSE', name: 'Básica para federarse', shortLabel: 'FED', purpose: 'federacion', color: 'emerald', orderNo: 2, source: 'FTN' },
];

const STROKES: Record<string, string> = {
  LIBRE: 'libre', ESPALDA: 'espalda', PECHO: 'pecho', MARIPOSA: 'mariposa', MEDLEY: 'combinado',
};

// Encabezado de la planilla → códigos de categoría de la plataforma.
const CATEGORIES: Record<string, string[]> = {
  'INFANTILES 1': ['INF_1'], 'INFANTILES 2': ['INF_2'],
  'MENORES 1': ['MEN_1'], 'MENORES 2': ['MEN_2'],
  'CADETES 1': ['CAD_1'], 'CADETES 2': ['CAD_2'], 'CAEDETES 2': ['CAD_2'],
  'JUVENILES 1': ['JUV_1'], 'JUVENILES 2': ['JUV_2'],
  JUNIOR: ['JUN'], MAYORES: ['MAY'],
  'JUVENILES - MAYORES': ['JUV_1', 'JUV_2', 'JUN', 'MAY'],
};

function text(ws: XLSX.WorkSheet, r: number, c: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
  if (!cell || cell.v === undefined || cell.v === null) return '';
  return String(cell.w ?? cell.v).trim();
}

/** "01:05.40" → 65400. Solo acepta mm:ss.cc; cualquier otra cosa es un error de la planilla. */
function toMs(raw: string, where: string): number {
  const m = raw.match(/^(\d{2}):(\d{2})\.(\d{2})$/);
  if (!m) throw new Error(`Tiempo ilegible "${raw}" en ${where}`);
  return (parseInt(m[1] ?? '0', 10) * 60 + parseInt(m[2] ?? '0', 10)) * 1000 + parseInt(m[3] ?? '0', 10) * 10;
}

function categoriesFor(header: string, where: string): string[] {
  const codes = CATEGORIES[header.toUpperCase().replace(/\s+/g, ' ')];
  if (!codes) throw new Error(`Categoría desconocida "${header}" en ${where}`);
  return codes;
}

function main(): void {
  const [file, poolArg] = process.argv.slice(2);
  if (!file || (poolArg !== '25' && poolArg !== '50')) {
    throw new Error('Uso: parse-time-standards.ts <ruta.xlsx> <25|50>');
  }
  const pool = poolArg === '25' ? 'P25' : 'P50';
  const ws = XLSX.readFile(file).Sheets['BASICOS'];
  if (!ws) throw new Error('La planilla no tiene la hoja "BASICOS".');
  const lastRow = XLSX.utils.decode_range(ws['!ref'] ?? 'A1').e.r;

  const rows: StandardRow[] = [];
  let skipped = 0;
  const push = (set: string, r: number, c: number, gender: GenderCode, header: string) => {
    const strokeRaw = text(ws, r, 0).toUpperCase();
    const stroke = STROKES[strokeRaw];
    const distance = parseInt(text(ws, r, 1), 10);
    const where = `${XLSX.utils.encode_cell({ r, c })} (${strokeRaw} ${distance})`;
    if (!stroke || Number.isNaN(distance)) throw new Error(`Prueba desconocida en ${where}`);
    const raw = text(ws, r, c);
    if (raw.toUpperCase() === 'S/T' || raw === '') { skipped++; return; }
    const timeMs = toMs(raw, where);
    for (const category of categoriesFor(header, where)) {
      rows.push({ set, stroke, distance, gender, category, pool, time: raw, timeMs });
    }
  };

  for (let r = 0; r <= lastRow; r++) {
    const title = text(ws, r, 0).toUpperCase();
    if (title === 'MUJERES' || title === 'VARONES') {
      const gender: GenderCode = title === 'MUJERES' ? 'F' : 'M';
      const headerRow = r + 1;
      for (let d = headerRow + 1; d <= lastRow && text(ws, d, 0) !== ''; d++) {
        for (let c = 2; text(ws, headerRow, c) !== ''; c++) push('NACIONAL', d, c, gender, text(ws, headerRow, c));
      }
    } else if (title === 'BASICOS FEDERARSE') {
      const genderRow = r + 1;
      for (let d = genderRow + 1; d <= lastRow && text(ws, d, 0) !== ''; d++) {
        for (let c = 2; text(ws, genderRow, c) !== ''; c++) {
          const g = text(ws, genderRow, c).toUpperCase();
          if (g !== 'VARON' && g !== 'MUJER') throw new Error(`Género desconocido "${g}" en la tabla de federarse`);
          // El grupo está en una celda combinada sobre el par VARON/MUJER.
          const header = text(ws, r, c) || text(ws, r, c - 1);
          push('FEDERARSE', d, c, g === 'VARON' ? 'M' : 'F', header);
        }
      }
    }
  }

  const out = path.join(__dirname, '..', '..', '..', 'prisma', 'data', 'time-standards.json');
  fs.writeFileSync(out, JSON.stringify({ source: path.basename(file), sets: SETS, standards: rows }, null, 1) + '\n');
  const bySet = rows.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.set]: (acc[x.set] ?? 0) + 1 }), {});
  console.log(`OK → ${out}`);
  console.log(`   ${rows.length} marcas ${JSON.stringify(bySet)} · ${skipped} celdas "S/T" omitidas`);
}

main();
