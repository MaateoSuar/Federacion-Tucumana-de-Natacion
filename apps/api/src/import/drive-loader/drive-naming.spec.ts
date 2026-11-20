import {
  chooseTournamentName,
  dayMonthFromName,
  deriveTournamentDates,
  monthYearFromName,
  scopeForFolder,
} from './drive-naming';

describe('scopeForFolder', () => {
  it('mapea las carpetas del Drive al alcance', () => {
    expect(scopeForFolder('Nacionales')).toEqual({ scope: 'nacional', type: 'nacional' });
    expect(scopeForFolder('NOA')).toEqual({ scope: 'noa', type: 'provincial' });
    expect(scopeForFolder('Tucuman')).toEqual({ scope: 'provincial', type: 'provincial' });
    expect(scopeForFolder('Otra')).toBeNull();
  });
});

describe('monthYearFromName / dayMonthFromName', () => {
  it('lee mes-año del nombre', () => {
    expect(monthYearFromName('Junior 12-2024 Verano - Parque Roca.pdf')).toEqual({ month: 12, year: 2024 });
    expect(monthYearFromName('Primavera 9-2026 - Resultados.pdf')).toEqual({ month: 9, year: 2026 });
  });
  it('no confunde una temporada ni un mes inválido', () => {
    expect(monthYearFromName('Verano 23-24 1ra fecha - Resultados.pdf')).toBeNull();
    expect(monthYearFromName('Algo 13-2024.pdf')).toBeNull();
  });
  it('lee día-mes solo si no es ambiguo', () => {
    expect(dayMonthFromName('Batalla de Tucuman 28-09 CC - Resultados.pdf', 2024)).toEqual({ day: 28, month: 9 });
    expect(dayMonthFromName('CTG 13-12 - Resultados.pdf', 2024)).toEqual({ day: 13, month: 12 });
    expect(dayMonthFromName('Torneo 05-06.pdf', 2024)).toBeNull();
    expect(dayMonthFromName('Verano 23-24 1ra fecha.pdf', 2024)).toBeNull();
    expect(dayMonthFromName('Junior 12-2024.pdf', 2024)).toBeNull();
  });
});

describe('deriveTournamentDates', () => {
  it('usa el encabezado (mínimo y máximo entre jornadas) y no lo marca como estimado', () => {
    const d = deriveTournamentDates({
      fileNames: ['a.pdf'],
      folderYear: 2025,
      headerDates: [
        { start: '2025-05-10', end: '2025-05-10' },
        { start: '2025-05-09', end: '2025-05-11' },
      ],
    });
    expect(d).toMatchObject({ startDate: '2025-05-09', endDate: '2025-05-11', source: 'encabezado', estimated: false });
  });
  it('sin encabezado: mes y año del nombre, día 1, marcado como estimado', () => {
    const d = deriveTournamentDates({ fileNames: ['Santiago 08-2024 torneo.pdf'], folderYear: 2024, headerDates: [] });
    expect(d).toMatchObject({ startDate: '2024-08-01', source: 'nombre-mes-anio', estimated: true });
  });
  it('sin encabezado: día y mes del nombre con el año de la carpeta', () => {
    const d = deriveTournamentDates({ fileNames: ['CTG 13-12 - Resultados.pdf'], folderYear: 2024, headerDates: [] });
    expect(d).toMatchObject({ startDate: '2024-12-13', endDate: '2024-12-13', source: 'nombre-dia-mes', estimated: true });
  });
  it('sin nada: 1 de enero de la carpeta, marcado', () => {
    const d = deriveTournamentDates({ fileNames: ['Copa España - Resultados.pdf'], folderYear: 2024, headerDates: [{ start: '', end: '' }] });
    expect(d).toMatchObject({ startDate: '2024-01-01', source: 'carpeta', estimated: true });
  });
  it('si la fecha final es anterior a la inicial, la corrige a la inicial', () => {
    const d = deriveTournamentDates({ fileNames: [], folderYear: 2025, headerDates: [{ start: '2025-05-10', end: '2025-05-01' }] });
    expect(d.endDate).toBe('2025-05-10');
  });
});

describe('chooseTournamentName', () => {
  it('prefiere el encabezado, salvo que lo compartan varios torneos', () => {
    expect(chooseTournamentName({ headerName: 'Copa X', baseName: 'Copa X 2024', taken: new Set(), prefer: 'encabezado' })).toEqual({ name: 'Copa X', source: 'encabezado' });
    expect(chooseTournamentName({ headerName: 'Copa X', baseName: 'Junior 05-2024', taken: new Set(['copa x']), prefer: 'encabezado' })).toEqual({ name: 'Junior 05-2024', source: 'archivo' });
    expect(chooseTournamentName({ headerName: null, baseName: 'Junior 05-2024', taken: new Set(), prefer: 'encabezado' })).toEqual({ name: 'Junior 05-2024', source: 'archivo' });
  });
});

describe('monthShortYearFromName y nombre', () => {
  it('lee mes y año de dos cifras solo si coincide con la carpeta', () => {
    expect(deriveTournamentDates({ fileNames: ['Infantiles y Menores 06-24 Invierno - Parque Roca.pdf'], folderYear: 2024, headerDates: [] }))
      .toMatchObject({ startDate: '2024-06-01', estimated: true });
    expect(deriveTournamentDates({ fileNames: ['Verano 23-24 1ra fecha - Resultados.pdf'], folderYear: 2024, headerDates: [] }).source).toBe('carpeta');
  });
  it('por defecto usa el nombre del archivo', () => {
    expect(chooseTournamentName({ headerName: 'Copa X', baseName: 'Copa X Salta', taken: new Set() }).name).toBe('Copa X Salta');
  });
});
