// SheetJS ships its own types; no @types needed
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx') as typeof import('xlsx');

import type { FormatAdapter } from '../../types/format-adapter.interface';
import type { NormalizedMeet } from '../../types/normalized-meet.types';
import type { ImportIssue } from '../../types/import-issue.types';
import { detectProfile, mapRowsToMeet } from '../csv/csv-mapper';

export class ExcelAdapter implements FormatAdapter {
  detect(fileName: string, _firstBytes: string): boolean {
    const lower = fileName.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls');
  }

  async parse(content: Buffer, fileName: string): Promise<NormalizedMeet> {
    let workbook: ReturnType<typeof XLSX.read>;
    try {
      workbook = XLSX.read(content, { type: 'buffer', cellText: true, cellDates: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`FATAL: No se pudo leer el archivo Excel "${fileName}": ${msg}`);
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error(`FATAL: El archivo Excel "${fileName}" no contiene hojas.`);
    }

    const sheet = workbook.Sheets[firstSheetName]!;

    // Convert to array-of-arrays; header=1 returns raw string values per cell
    const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Find first non-empty row as headers
    const headerRowIdx = aoa.findIndex((row) => row.some((c) => String(c).trim() !== ''));
    if (headerRowIdx === -1) {
      throw new Error(`FATAL: El archivo Excel "${fileName}" no tiene datos.`);
    }

    const headers = aoa[headerRowIdx]!.map((c) => String(c).trim());
    const dataRows = aoa
      .slice(headerRowIdx + 1)
      .filter((row) => row.some((c) => String(c).trim() !== ''))
      .map((row) => row.map((c) => String(c).trim()));

    const detection = detectProfile(headers);
    const issues: ImportIssue[] = detection
      ? []
      : [
          {
            severity: 'WARNING',
            stage: 'parse',
            message: `No se detectó un perfil conocido para "${fileName}". Se intentó mapeo automático.`,
            suggested_action: 'Revisá el preview y corregí las columnas no reconocidas.',
          },
        ];

    const meet = mapRowsToMeet(dataRows, headers, detection?.columnMap ?? {}, fileName, 'excel');
    meet.issues = [...issues, ...meet.issues];
    return meet;
  }
}
