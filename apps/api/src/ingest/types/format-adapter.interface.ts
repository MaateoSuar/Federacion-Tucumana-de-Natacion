import type { NormalizedMeet } from './normalized-meet.types';

export interface FormatAdapter {
  detect(fileName: string, firstBytes: string): boolean;
  parse(content: Buffer, fileName: string): Promise<NormalizedMeet>;
}
