import { Injectable } from '@nestjs/common';

export type DetectedFormat = 'pdf' | 'hy3' | 'csv' | 'excel' | 'unknown';

@Injectable()
export class FormatDetector {
  detect(fileName: string, firstBytes: Buffer): DetectedFormat {
    const name = fileName.toLowerCase();
    const head = firstBytes.toString('utf8', 0, Math.min(firstBytes.length, 512));

    if (name.endsWith('.pdf') || head.startsWith('%PDF-')) return 'pdf';
    if (name.endsWith('.hy3') || name.endsWith('.hyv')) {
      return 'hy3';
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel';
    if (name.endsWith('.csv')) return 'csv';

    // HY3 content heuristic: starts with "A0" record code
    if (/^A0/.test(head)) return 'hy3';

    return 'unknown';
  }
}
