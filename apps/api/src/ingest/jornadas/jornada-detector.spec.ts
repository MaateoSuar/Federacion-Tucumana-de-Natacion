import {
  detectJornadas,
  extractEventNumbers,
  extractPoolLength,
  fileKind,
  tournamentBaseName,
  type TournamentFileInfo,
} from './jornada-detector';

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const file = (name: string, eventNumbers: number[], poolLength: 25 | 50 | null = 25): TournamentFileInfo => ({
  name, eventNumbers, poolLength,
});

describe('tournamentBaseName / fileKind', () => {
  it('quita el tipo y el número de jornada', () => {
    expect(tournamentBaseName('Provincia de Tucumán 2025 - 2da Fecha - Resultados2.pdf')).toBe('Provincia de Tucumán 2025 - 2da Fecha');
    expect(tournamentBaseName('Catamarca Abierto 05-2026 - Sembrado 3.pdf')).toBe('Catamarca Abierto 05-2026');
    expect(tournamentBaseName('Copa Salta 12-2022 1ra Jornada - Resultados.pdf')).toBe('Copa Salta 12-2022');
    expect(tournamentBaseName('Jujuy 7 Colores 08-2025 Resultados.pdf')).toBe('Jujuy 7 Colores 08-2025');
    expect(tournamentBaseName('Salta Independencia 2024 - Sembrados.pdf')).toBe('Salta Independencia 2024');
  });

  it('no quita "Fecha": cada fecha es otro torneo', () => {
    expect(tournamentBaseName('Provincia de Tucumán 2025 - 1ra Fecha - Resultados.pdf'))
      .not.toBe(tournamentBaseName('Provincia de Tucumán 2025 - 2da Fecha - Resultados.pdf'));
  });

  it('reconoce el tipo de archivo', () => {
    expect(fileKind('X - Resultados.pdf')).toBe('resultados');
    expect(fileKind('X - Resultados3.pdf')).toBe('resultados');
    expect(fileKind('X - Sembrado 2.pdf')).toBe('sembrados');
    expect(fileKind('X - Sembrados.pdf')).toBe('sembrados');
    expect(fileKind('X 08-2025 Tomas de Tiempo.pdf')).toBe('otro');
    // Sin tipo en el nombre: en el Drive son resultados
    expect(fileKind('Santiago Regional Invierno 08-2025.pdf')).toBe('resultados');
  });
});

describe('extractEventNumbers / extractPoolLength', () => {
  const text = [
    'Evento 1  Niñas 12-13 50 CC Metro Estilo Libre',
    ' 121Lopez, Ana32,10',
    'Evento 1  Niñas 14-15 50 CC Metro Estilo Libre',
    'Evento 4  Hombres 16-18 100 CC Metro CI',
  ].join('\n');

  it('lista cada número de prueba una vez', () => {
    expect(extractEventNumbers(text)).toEqual([1, 4]);
  });

  it('CC = 25 m, CL = 50 m, y avisa si el archivo mezcla', () => {
    expect(extractPoolLength(text)).toBe(25);
    expect(extractPoolLength('Evento 2  Mujeres Categoría Mayores 800 CL Metro Estilo Libre')).toBe(50);
    expect(extractPoolLength(`${text}\nEvento 9  Niños 12-13 100 CL Metro Estilo Libre`)).toBe('mixta');
    expect(extractPoolLength('Evento 3  Niñas 12-13 50 Estilo Libre')).toBeNull();
  });
});

describe('detectJornadas', () => {
  it('resultados en tres partes sin general: unir, en orden de prueba', () => {
    const [group] = detectJornadas([
      file('Provincia 2025 - 2da Fecha - Resultados3.pdf', [29, 30]),
      file('Provincia 2025 - 2da Fecha - Resultados1.pdf', range(1, 20)),
      file('Provincia 2025 - 2da Fecha - Resultados2.pdf', [23, 24]),
    ]);
    expect(group?.decision).toBe('unir');
    expect(group?.files.map((f) => f.name)).toEqual([
      'Provincia 2025 - 2da Fecha - Resultados1.pdf',
      'Provincia 2025 - 2da Fecha - Resultados2.pdf',
      'Provincia 2025 - 2da Fecha - Resultados3.pdf',
    ]);
  });

  it('un solo archivo por tipo: ya es el general', () => {
    const groups = detectJornadas([
      file('Catamarca Abierto 05-2026 - Resultados.pdf', range(1, 70)),
      file('Catamarca Abierto 05-2026 - Sembrado 1.pdf', range(1, 16)),
      file('Catamarca Abierto 05-2026 - Sembrado 2.pdf', range(17, 36)),
      file('Catamarca Abierto 05-2026 - Sembrado 3.pdf', range(41, 54)),
    ]);
    expect(groups.find((g) => g.kind === 'resultados')?.decision).toBe('general');
    expect(groups.find((g) => g.kind === 'sembrados')?.decision).toBe('unir');
  });

  it('fechas distintas no se unen aunque repitan los números de prueba', () => {
    const groups = detectJornadas([
      file('Provincia 2025 - 1ra Fecha - Resultados.pdf', range(1, 37)),
      file('Provincia 2025 - 2da Fecha - Resultados.pdf', range(1, 34)),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.decision === 'general')).toBe(true);
  });

  it('una prueba en dos archivos: no elige, la lista como conflicto', () => {
    const [group] = detectJornadas([
      file('Copa X - Resultados1.pdf', range(1, 20)),
      file('Copa X - Resultados2.pdf', range(19, 40)),
    ]);
    expect(group?.decision).toBe('revisar');
    expect(group?.repeatedEvents).toEqual([19, 20]);
  });

  it('nunca mezcla 25 m con 50 m', () => {
    const [group] = detectJornadas([
      file('Copa X - Resultados1.pdf', range(1, 20), 25),
      file('Copa X - Resultados2.pdf', range(21, 40), 50),
    ]);
    expect(group?.decision).toBe('revisar');
    expect(group?.reason).toMatch(/piletas distintas/);
  });

  it('un sembrado que no dice la pileta no frena la unión', () => {
    const [group] = detectJornadas([
      file('Copa X - Sembrado 1.pdf', range(1, 20), null),
      file('Copa X - Sembrado 2.pdf', range(21, 40), 50),
    ]);
    expect(group?.decision).toBe('unir');
  });

  it('un archivo sin pruebas legibles queda para revisar', () => {
    const [group] = detectJornadas([
      file('Copa X - Resultados1.pdf', range(1, 20)),
      file('Copa X - Resultados2.pdf', []),
    ]);
    expect(group?.decision).toBe('revisar');
  });
});
