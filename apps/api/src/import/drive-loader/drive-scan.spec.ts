import { planTournaments, type ScannedFile } from './drive-scan';

const file = (over: Partial<ScannedFile> & { fileName: string }): ScannedFile => ({
  folder: 'NOA',
  year: 2025,
  absPath: `/x/${over.fileName}`,
  relPath: `NOA/2025/${over.fileName}`,
  kind: /sembrad/i.test(over.fileName) ? 'sembrados' : 'resultados',
  hash: over.fileName,
  eventNumbers: [1, 2, 3],
  pool: 25,
  readError: null,
  summary: { rows: 100, events: 3, swimmers: 20, clubs: 4, withSeed: 100, courses: [25], headerName: 'Copa Uno', headerStart: '2025-04-05', headerEnd: '2025-04-06', issueErrors: 0 },
  ...over,
});

describe('planTournaments', () => {
  it('un archivo de resultados es un torneo con el alcance de su carpeta; ignora los sembrados', () => {
    const plan = planTournaments([
      file({ fileName: 'Salta Copa 04-2025 - Resultados.pdf' }),
      file({ fileName: 'Salta Copa 04-2025 - Sembrado.pdf' }),
    ]);
    expect(plan.tournaments).toHaveLength(1);
    expect(plan.tournaments[0]).toMatchObject({ scope: 'noa', type: 'provincial', pool: 25, name: 'Salta Copa 04-2025', decision: 'general' });
    expect(plan.tournaments[0]?.dates).toMatchObject({ startDate: '2025-04-05', endDate: '2025-04-06', estimated: false });
    expect(plan.ignoredSembrados).toHaveLength(1);
  });

  it('une las jornadas de un mismo torneo (pruebas que no se pisan)', () => {
    const plan = planTournaments([
      file({ fileName: 'Prov 2025 - 2da Fecha - Resultados1.pdf', eventNumbers: [1, 2] }),
      file({ fileName: 'Prov 2025 - 2da Fecha - Resultados2.pdf', eventNumbers: [3, 4] }),
    ]);
    expect(plan.tournaments).toHaveLength(1);
    expect(plan.tournaments[0]).toMatchObject({ decision: 'unir', name: 'Prov 2025 - 2da Fecha' });
    expect(plan.tournaments[0]?.files).toHaveLength(2);
  });

  it('no carga si las jornadas repiten pruebas, si el lector no leyó filas, si mezcla piletas o es toma de tiempos', () => {
    const plan = planTournaments([
      file({ fileName: 'A - Resultados1.pdf', eventNumbers: [1, 2] }),
      file({ fileName: 'A - Resultados2.pdf', eventNumbers: [2, 3] }),
      file({ fileName: 'B - Resultados.pdf', summary: { rows: 0, events: 0, swimmers: 0, clubs: 0, withSeed: 0, courses: [], headerName: null, headerStart: '', headerEnd: '', issueErrors: 1 } }),
      file({ fileName: 'C - Resultados.pdf', pool: 'mixta' }),
      file({ fileName: 'D Tomas de Tiempo.pdf' }),
    ]);
    expect(plan.tournaments).toHaveLength(0);
    expect(plan.skipped.map((s) => s.torneo).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('carpeta Nacionales -> nacional y Tucuman -> provincial; fecha estimada marcada', () => {
    const noDate = { rows: 10, events: 1, swimmers: 2, clubs: 1, withSeed: 0, courses: [50], headerName: null, headerStart: '', headerEnd: '', issueErrors: 0 };
    const plan = planTournaments([
      file({ folder: 'Nacionales', year: 2024, fileName: 'Junior 05-2024 Invierno - Resultados.pdf', pool: 50, summary: noDate }),
      file({ folder: 'Tucuman', year: 2024, fileName: 'CTG 13-12 - Resultados.pdf', summary: { ...noDate, courses: [25] } }),
    ]);
    const nac = plan.tournaments.find((t) => t.folder === 'Nacionales');
    const tuc = plan.tournaments.find((t) => t.folder === 'Tucuman');
    expect(nac).toMatchObject({ scope: 'nacional', type: 'nacional', pool: 50 });
    expect(nac?.dates).toMatchObject({ startDate: '2024-05-01', estimated: true });
    expect(tuc).toMatchObject({ scope: 'provincial' });
    expect(tuc?.dates).toMatchObject({ startDate: '2024-12-13', estimated: true });
  });

  it('avisa si hay PDF de sembrado y los resultados no traen sembrado', () => {
    const noSeed = { rows: 10, events: 1, swimmers: 2, clubs: 1, withSeed: 0, courses: [25], headerName: 'X', headerStart: '2025-01-01', headerEnd: '2025-01-01', issueErrors: 0 };
    const plan = planTournaments([
      file({ fileName: 'Z - Resultados.pdf', summary: noSeed }),
      file({ fileName: 'Z - Sembrado.pdf' }),
    ]);
    expect(plan.tournaments[0]?.notes.join(' ')).toMatch(/NO traen tiempo de sembrado/);
  });
});
