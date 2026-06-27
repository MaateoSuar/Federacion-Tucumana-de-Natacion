import type { FormatAdapter } from '../../types/format-adapter.interface';
import type { NormalizedMeet } from '../../types/normalized-meet.types';
import type { ImportIssue } from '../../types/import-issue.types';
import { parseCsvLine, detectDelimiter, detectProfile, mapRowsToMeet } from './csv-mapper';

const UTF8_BOM = '﻿';

export class CsvAdapter implements FormatAdapter {
  detect(fileName: string, firstBytes: string): boolean {
    return fileName.toLowerCase().endsWith('.csv') || firstBytes.startsWith(UTF8_BOM);
  }

  async parse(content: Buffer, fileName: string): Promise<NormalizedMeet> {
    // Strip UTF-8 BOM if present
    const raw = content.toString('utf-8').replace(new RegExp(`^${UTF8_BOM}`), '');
    const allLines = raw.split(/\r?\n/);

    // Find first non-empty line as header
    const headerLineIdx = allLines.findIndex((l) => l.trim() !== '');
    if (headerLineIdx === -1) {
      throw new Error(`FATAL: El archivo CSV "${fileName}" está vacío o no tiene cabeceras.`);
    }

    const delimiter = detectDelimiter(allLines[headerLineIdx]!);
    const headers = parseCsvLine(allLines[headerLineIdx]!, delimiter);

    const detection = detectProfile(headers);
    const issues: ImportIssue[] = detection
      ? []
      : [
          {
            severity: 'WARNING',
            stage: 'parse',
            message: `No se detectó un perfil conocido para "${fileName}". Se intentó mapeo de columnas automático.`,
            suggested_action: 'Revisá el preview y corregí las columnas no reconocidas.',
          },
        ];

    // Use detected profile column map, or fall back to empty (best-effort)
    const columnMap = detection?.columnMap ?? {};

    const dataRows = allLines
      .slice(headerLineIdx + 1)
      .filter((l) => l.trim() !== '')
      .map((l) => parseCsvLine(l, delimiter));

    const meet = mapRowsToMeet(dataRows, headers, columnMap, fileName, 'csv');
    meet.issues = [...issues, ...meet.issues];
    return meet;
  }
}
