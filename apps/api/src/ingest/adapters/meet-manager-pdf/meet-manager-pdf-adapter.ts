// pdf-parse v1 exports a callable function as the default CJS export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  dataBuffer: Buffer,
  options?: object,
) => Promise<{ text: string; numpages: number }>;

import type { FormatAdapter } from '../../types/format-adapter.interface';
import type { NormalizedMeet } from '../../types/normalized-meet.types';
import type { ImportIssue } from '../../types/import-issue.types';
import { parseLines } from './pdf-line-parser';

export class MeetManagerPdfAdapter implements FormatAdapter {
  detect(fileName: string, firstBytes: string): boolean {
    if (fileName.toLowerCase().endsWith('.pdf')) return true;
    return firstBytes.startsWith('%PDF-');
  }

  async parse(content: Buffer, fileName: string): Promise<NormalizedMeet> {
    const issues: ImportIssue[] = [];

    let pdfData: { text: string; numpages: number };
    try {
      pdfData = await pdfParse(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`FATAL: No se pudo leer el PDF "${fileName}": ${msg}`);
    }

    if (!pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error(
        `FATAL: El PDF "${fileName}" no tiene texto extraíble (¿PDF escaneado?)`,
      );
    }

    const lines = pdfData.text.split('\n');
    const parsed = parseLines(lines, fileName);

    issues.push(...parsed.issues);

    if (!parsed.meetHeader) {
      issues.push({
        severity: 'ERROR',
        stage: 'parse',
        message: 'No se encontró el encabezado del torneo en el PDF',
        suggested_action:
          'Verificar que el PDF fue generado por HY-TEK Meet Manager',
      });
    }

    const header = parsed.meetHeader ?? {
      venue: 'Desconocido',
      name: fileName.replace('.pdf', ''),
      start_date: '',
      end_date: '',
      course: 25 as const,
    };

    return {
      meet: {
        name: header.name,
        venue: header.venue,
        course: header.course,
        start_date: header.start_date,
        end_date: header.end_date,
        source: 'pdf',
      },
      clubs: parsed.clubs,
      swimmers: parsed.swimmers,
      events: parsed.events,
      results: parsed.results,
      issues,
      meta: {
        source_file_name: fileName,
        parsed_at: new Date().toISOString(),
        total_lines: lines.length,
      },
    };
  }
}
