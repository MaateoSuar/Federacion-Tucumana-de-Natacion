/**
 * Arma el archivo "General" de los torneos que el Drive tiene partidos por jornada (D-1).
 *
 * Desde apps/api:
 *   pnpm exec ts-node-transpile-only -P tsconfig.json ../../prisma/scripts/merge-jornadas.ts \
 *     --root C:\ruta\ftn-drive-copia --out C:\ruta\ftn-drive-copia\generales [--apply]
 *
 * Sin --apply solo informa qué se uniría y qué queda para revisar a mano.
 * Con --apply escribe los PDF unidos en --out. NUNCA modifica los originales y NO sube nada al Drive:
 * subirlos es decisión de una persona, archivo por archivo.
 *
 * Regla de detección: ver apps/api/src/ingest/jornadas/jornada-detector.ts. Cada PDF unido es la
 * concatenación de las páginas originales, en orden de número de prueba, sin tocar su contenido.
 */
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectJornadas,
  extractEventNumbers,
  extractPoolLength,
  fileKind,
  tournamentBaseName,
  type TournamentFileInfo,
} from '../../apps/api/src/ingest/jornadas/jornada-detector';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const APPLY = process.argv.includes('--apply');

const req = createRequire(path.join(process.cwd(), 'package.json'));
const pdfParse = req('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages: number }>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { PDFDocument } = req('pdf-lib') as typeof import('pdf-lib');

interface Scanned extends TournamentFileInfo { dir: string; pages: number }

const KIND_LABEL = { resultados: 'Resultados', sembrados: 'Sembrado', otro: 'Otros' } as const;

async function main(): Promise<void> {
  const root = arg('--root');
  const out = arg('--out');
  if (!root || !out) throw new Error('Faltan --root y --out.');

  const lines: string[] = [];
  const log = (s: string): void => { lines.push(s); console.log(s); };
  log(`# Archivos generales por jornada (${APPLY ? 'escritos' : 'solo informe'})`);

  let merged = 0;
  const review: string[] = [];

  for (const category of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    if (category.name === 'informes' || category.name === 'generales') continue;
    for (const year of fs.readdirSync(path.join(root, category.name), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dir = path.join(root, category.name, year.name);
      const pdfs = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f));
      const scanned: Scanned[] = [];
      for (const name of pdfs) {
        const buf = fs.readFileSync(path.join(dir, name));
        let text = ''; let pages = 0;
        try { ({ text, numpages: pages } = await pdfParse(buf)); } catch { /* queda sin pruebas legibles */ }
        const pool = extractPoolLength(text);
        scanned.push({ name, dir, pages, eventNumbers: extractEventNumbers(text), poolLength: pool === 'mixta' ? null : pool });
      }

      for (const g of detectJornadas(scanned)) {
        if (g.decision === 'general') continue;
        const where = `${category.name}/${year.name} · ${g.torneo} · ${KIND_LABEL[g.kind]}`;
        const parts = g.files.map((f) => `${f.name} (pruebas ${Math.min(...f.eventNumbers)}-${Math.max(...f.eventNumbers)})`);
        if (g.decision === 'revisar') {
          review.push(`- **${where}**: ${g.reason} Archivos: ${g.files.map((f) => f.name).join(', ')}`);
          continue;
        }
        log(`\n## ${where}\n- Se une en este orden: ${parts.join(' → ')}`);
        if (!APPLY) continue;

        const merger = await PDFDocument.create();
        let pagesExpected = 0;
        for (const f of g.files) {
          const src = await PDFDocument.load(fs.readFileSync(path.join(dir, f.name)));
          const copied = await merger.copyPages(src, src.getPageIndices());
          copied.forEach((p) => merger.addPage(p));
          pagesExpected += src.getPageCount();
        }
        const outDir = path.join(out, category.name, year.name);
        fs.mkdirSync(outDir, { recursive: true });
        const outName = `${tournamentBaseName(g.files[0]?.name ?? g.torneo)} - ${KIND_LABEL[g.kind]} General.pdf`;
        const outPath = path.join(outDir, outName);
        const bytes = await merger.save();
        fs.writeFileSync(outPath, bytes);

        // Verificación: el PDF unido tiene todas las páginas y todas las pruebas de las partes
        const check = await pdfParse(Buffer.from(bytes));
        const expectedEvents = [...new Set(g.files.flatMap((f) => f.eventNumbers))].sort((a, b) => a - b);
        const gotEvents = extractEventNumbers(check.text);
        const ok = check.numpages === pagesExpected && JSON.stringify(gotEvents) === JSON.stringify(expectedEvents);
        log(`- Escrito: ${outPath}\n- Páginas: ${check.numpages} de ${pagesExpected} · pruebas: ${gotEvents.length} de ${expectedEvents.length} · ${ok ? 'OK' : 'REVISAR: no coincide'}`);
        merged++;
      }
    }
  }

  log('\n## Para revisar a mano (no se unen)');
  log(review.length > 0 ? review.join('\n') : '- Ninguno.');
  log(`\nPDF generales ${APPLY ? 'escritos' : 'que se escribirían con --apply'}: ${APPLY ? merged : 'ver arriba'}`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'informe-generales.md'), lines.join('\n') + '\n');
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
