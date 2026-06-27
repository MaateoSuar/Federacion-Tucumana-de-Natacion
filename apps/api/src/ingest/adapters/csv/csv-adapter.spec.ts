import { CsvAdapter } from './csv-adapter';
import { ExcelAdapter } from '../excel/excel-adapter';
import { parseCsvLine, detectDelimiter, detectProfile } from './csv-mapper';

// ─── Unit: parseCsvLine ───────────────────────────────────────────────────────

describe('parseCsvLine', () => {
  it('splits by comma', () => {
    expect(parseCsvLine('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('splits by semicolon', () => {
    expect(parseCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with commas inside', () => {
    expect(parseCsvLine('"García, Juan",CNA,27.45', ',')).toEqual(['García, Juan', 'CNA', '27.45']);
  });

  it('trims whitespace from fields', () => {
    expect(parseCsvLine(' a , b , c ', ',')).toEqual(['a', 'b', 'c']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('a,,c', ',')).toEqual(['a', '', 'c']);
  });
});

// ─── Unit: detectDelimiter ────────────────────────────────────────────────────

describe('detectDelimiter', () => {
  it('detects semicolon when more semicolons than commas', () => {
    expect(detectDelimiter('apellido;nombre;club;tiempo')).toBe(';');
  });

  it('detects comma when more commas than semicolons', () => {
    expect(detectDelimiter('Name,Team,Time,Place')).toBe(',');
  });
});

// ─── Unit: detectProfile ──────────────────────────────────────────────────────

describe('detectProfile', () => {
  it('detects ftn-results profile from Spanish headers', () => {
    const result = detectProfile(['apellido', 'nombre', 'club', 'estilo', 'distancia', 'tiempo', 'puesto']);
    expect(result).not.toBeNull();
    expect(result?.profile.id).toBe('ftn-results');
    expect(result?.columnMap['time']).toBe('tiempo');
    expect(result?.columnMap['club']).toBe('club');
  });

  it('detects mm-export-en profile from English headers', () => {
    const result = detectProfile(['Name', 'Team', 'Stroke', 'Dist', 'Finals Time', 'Place', 'Heat', 'Lane']);
    expect(result).not.toBeNull();
    expect(result?.profile.id).toBe('mm-export-en');
  });

  it('returns null when not enough recognized columns', () => {
    const result = detectProfile(['foo', 'bar', 'baz']);
    expect(result).toBeNull();
  });
});

// ─── CsvAdapter.parse — FTN profile ──────────────────────────────────────────

const FTN_CSV = [
  'apellido;nombre;club;estilo;distancia;genero;tiempo;puesto;serie;carril',
  'Pérez;Juan;Club Atlético;libre;50;M;27.45;1;1;4',
  'García;Mateo;Club Atlético;libre;50;M;28.30;2;1;5',
  'Rodríguez;Ana;Natación Norte;espalda;100;F;1:12.55;1;1;3',
].join('\n');

describe('CsvAdapter', () => {
  const adapter = new CsvAdapter();

  it('detect() returns true for .csv files', () => {
    expect(adapter.detect('results.csv', '')).toBe(true);
    expect(adapter.detect('results.xlsx', '')).toBe(false);
  });

  it('parses FTN CSV and produces NormalizedMeet', async () => {
    const buf = Buffer.from(FTN_CSV, 'utf-8');
    const meet = await adapter.parse(buf, 'results.csv');

    expect(meet.meet.source).toBe('csv');
    expect(meet.events).toHaveLength(2); // 50 libre M + 100 espalda F
    expect(meet.swimmers).toHaveLength(3);
    expect(meet.clubs).toHaveLength(2);
    expect(meet.results).toHaveLength(3);
  });

  it('converts time correctly to ms', async () => {
    const buf = Buffer.from(FTN_CSV, 'utf-8');
    const meet = await adapter.parse(buf, 'results.csv');

    const r1 = meet.results[0]!;
    expect(r1.final_time_ms).toBe(27450); // 27.45 → 27450ms
    expect(r1.status).toBe('OK');
  });

  it('converts time with minutes correctly to ms', async () => {
    const buf = Buffer.from(FTN_CSV, 'utf-8');
    const meet = await adapter.parse(buf, 'results.csv');

    const r3 = meet.results[2]!;
    expect(r3.final_time_ms).toBe(72550); // 1:12.55 → 72550ms
  });

  it('assigns correct place', async () => {
    const buf = Buffer.from(FTN_CSV, 'utf-8');
    const meet = await adapter.parse(buf, 'results.csv');
    expect(meet.results[0]!.place).toBe(1);
    expect(meet.results[1]!.place).toBe(2);
  });

  it('handles DNS status row', async () => {
    const csv = [
      'apellido;nombre;club;estilo;distancia;genero;tiempo;puesto;serie;carril',
      'López;Carlos;Club Sur;libre;50;M;DNS;0;1;2',
    ].join('\n');
    const meet = await adapter.parse(Buffer.from(csv), 'test.csv');
    expect(meet.results[0]!.status).toBe('DNS');
    expect(meet.results[0]!.final_time_ms).toBeNull();
  });
});

// ─── CsvAdapter.parse — Meet Manager English ─────────────────────────────────

const MM_CSV = [
  'Name,Team,Stroke,Dist,Gender,Finals Time,Place,Heat,Lane',
  'Pérez Juan,CNA,Freestyle,50,M,27.45,1,1,4',
  'García Mateo,CNA,Freestyle,50,M,28.30,2,1,5',
].join('\n');

describe('CsvAdapter — Meet Manager English profile', () => {
  const adapter = new CsvAdapter();

  it('detects mm-export-en profile and parses correctly', async () => {
    const buf = Buffer.from(MM_CSV, 'utf-8');
    const meet = await adapter.parse(buf, 'mm_results.csv');

    expect(meet.events).toHaveLength(1);
    expect(meet.events[0]!.stroke).toBe('libre');
    expect(meet.events[0]!.distance).toBe(50);
    expect(meet.results).toHaveLength(2);
    expect(meet.results[0]!.final_time_ms).toBe(27450);
  });
});

// ─── ExcelAdapter ─────────────────────────────────────────────────────────────

describe('ExcelAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx') as typeof import('xlsx');

  const adapter = new ExcelAdapter();

  function buildXlsx(rows: string[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  it('detect() returns true for .xlsx files', () => {
    expect(adapter.detect('results.xlsx', '')).toBe(true);
    expect(adapter.detect('results.csv', '')).toBe(false);
  });

  it('parses .xlsx with FTN headers and produces NormalizedMeet', async () => {
    const data = [
      ['apellido', 'nombre', 'club', 'estilo', 'distancia', 'genero', 'tiempo', 'puesto'],
      ['Pérez', 'Juan', 'Club Atlético', 'libre', '50', 'M', '27.45', '1'],
      ['García', 'Mateo', 'Club Norte', 'libre', '50', 'M', '28.30', '2'],
    ];
    const buf = buildXlsx(data);
    const meet = await adapter.parse(buf, 'results.xlsx');

    expect(meet.meet.source).toBe('excel');
    expect(meet.events).toHaveLength(1);
    expect(meet.swimmers).toHaveLength(2);
    expect(meet.results[0]!.final_time_ms).toBe(27450);
  });

  it('produces same NormalizedMeet structure as CsvAdapter for equivalent data', async () => {
    const csvData = [
      'apellido;nombre;club;estilo;distancia;genero;tiempo;puesto',
      'Pérez;Juan;CNA;libre;50;M;27.45;1',
    ].join('\n');

    const xlsxData = [
      ['apellido', 'nombre', 'club', 'estilo', 'distancia', 'genero', 'tiempo', 'puesto'],
      ['Pérez', 'Juan', 'CNA', 'libre', '50', 'M', '27.45', '1'],
    ];

    const csvMeet = await new CsvAdapter().parse(Buffer.from(csvData), 'test.csv');
    const xlsxMeet = await adapter.parse(buildXlsx(xlsxData), 'test.xlsx');

    expect(csvMeet.events[0]!.stroke).toBe(xlsxMeet.events[0]!.stroke);
    expect(csvMeet.events[0]!.distance).toBe(xlsxMeet.events[0]!.distance);
    expect(csvMeet.results[0]!.final_time_ms).toBe(xlsxMeet.results[0]!.final_time_ms);
    expect(csvMeet.swimmers[0]!.last_name).toBe(xlsxMeet.swimmers[0]!.last_name);
  });
});
