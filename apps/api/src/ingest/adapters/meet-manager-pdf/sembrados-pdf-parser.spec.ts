import { parseSembradosPdf } from './sembrados-pdf-parser';

// Bloques reales de "Programa de Competencias" (sembrados) de los PDF 2024-2026 del Drive de la FTN.
const lines = (...l: string[]): string => l.join('\n');

describe('parseSembradosPdf — encabezados de prueba', () => {
  it('50 m ("CL Metro") y categoría "Categoría Mayores": conserva el texto en la etiqueta', () => {
    const { events } = parseSembradosPdf(
      lines(
        'Evento  1   Mujeres Categoría Mayores 800 CL Metro Estilo Libre',
        'EdadCarril  EquipoNombreTiempo para Sembrado',
        'Serie   1 of 2   Finales',
        'MDC',
        'NT 27Ingratta, Nahuel Augusto3',
      ),
    );
    expect(events).toEqual([
      {
        eventNo: 1,
        eventLabel: '800m Estilo Libre — Mujeres Categoría Mayores',
        stroke: 'libre',
        distance: 800,
        gender: 'F',
        competitionType: 'desconocido',
        ageGroupMin: null,
        ageGroupMax: null,
      },
    ]);
  });

  it('"12 & Mayores", "9 & Menores" y "N Años de Edad" dan rango de edades', () => {
    const { events } = parseSembradosPdf(
      lines(
        'Evento  1   Mujeres 12 & Mayores 50 CC Metro Estilo de Mariposa FEDERADO',
        'Evento  2   Niños 9 & Menores 25 CC Metro Estilo de Espalda ESCUELA',
        'Evento  3   Hombres 9 Años de Edad 100 CL Metro Estilo de Pecho PROMOCIONAL',
        'Serie   1 of 1   Finales',
        'GYT',
        'NT 9Pauletto Olea, Mattias2_____',
        'Evento  4   Mixto 4x50 CC Metro Estilo Libre Relevo',
      ),
    );
    const [e1, e2, e3, e4] = events;
    expect(e1).toMatchObject({ stroke: 'mariposa', competitionType: 'federados', ageGroupMin: 12, ageGroupMax: null });
    expect(e2).toMatchObject({ stroke: 'espalda', competitionType: 'escuela', ageGroupMin: null, ageGroupMax: 9 });
    expect(e3).toMatchObject({ stroke: 'pecho', competitionType: 'promocional', ageGroupMin: 9, ageGroupMax: 9, distance: 100 });
    // una posta no es una prueba individual: sin estilo, la plataforma no la crea
    expect(e4).toMatchObject({ stroke: null });
  });
});

describe('parseSembradosPdf — filas', () => {
  it('club + sembrado + nombre + edad + carril con guiones bajos (Salta)', () => {
    const { rows, warning } = parseSembradosPdf(
      lines(
        'Evento  1   Mujeres 12 & Mayores 50 CC Metro Estilo de Mariposa FEDERADO',
        'EdadNombreFinalesEquipoLugarCarrilTiempo para Sembrado',
        'Serie   1 of 2   Finales Contra Tiempo',
        'Gimnasia Y Tiro de Salta43.81Vivero Artayeta, Abril Delfina 13________________________1',
        'Mitre35.14Robledo, Brenda Sofia 14________________________4',
        'Fundacion Acuatica Natacion JUNTCorimayo, Lucia 12________________________8',
      ),
    );
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.heatNo, r.lane, r.swimmerName, r.age, r.club, r.seedTimeMs])).toEqual([
      [1, 1, 'Vivero Artayeta, Abril Delfina', 13, 'Gimnasia Y Tiro de Salta', 43810],
      [1, 4, 'Robledo, Brenda Sofia', 14, 'Mitre', 35140],
      [1, 8, 'Corimayo, Lucia', 12, 'Fundacion Acuatica Natacion JU', null],
    ]);
  });

  it('nombre + edad + carril + club al final, sin sembrado (Catamarca)', () => {
    const { rows } = parseSembradosPdf(
      lines(
        'Evento  1   Mujeres 12 & Mayores 200 CC Metro CI FEDERADOS',
        'Serie   1 of 7   Finales Contra Tiempo',
        'Sosa, Agostina 14________________________2Centro Deportivo Don Bosco',
        'Martincic, Maria Agustina 14________________________3Club Azucena',
        'NTFerreyra, Ana Lucia 20________________________2Club Azucena Tucuman',
        '4:07,01Gramajo, Valentina 19________________________3Centro Deportivo Don Bosco',
      ),
    );
    expect(rows.map((r) => [r.lane, r.swimmerName, r.age, r.club, r.seedTimeMs])).toEqual([
      [2, 'Sosa, Agostina', 14, 'Centro Deportivo Don Bosco', null],
      [3, 'Martincic, Maria Agustina', 14, 'Club Azucena', null],
      [2, 'Ferreyra, Ana Lucia', 20, 'Club Azucena Tucuman', null],
      [3, 'Gramajo, Valentina', 19, 'Centro Deportivo Don Bosco', 247010],
    ]);
  });

  it('carril separado por espacios, sin guiones bajos (San Luis)', () => {
    const { rows } = parseSembradosPdf(
      lines(
        'Evento  1   Hombres 100 CC Metro Estilo de Espalda',
        'EdadNombreEquipoCarrilTiempo para Sembrado',
        'Serie   1 of 6   Finales Contra Tiempo',
        'Club Petroleros Ypf1:31.70Garcia Cacolyris, Emiliano Valentino 13  1',
        'Asoc. Sanjuanina de Tríáatloá n32.16Botella, Delfina A 16  6',
      ),
    );
    expect(rows.map((r) => [r.lane, r.swimmerName, r.age, r.club, r.seedTimeMs])).toEqual([
      [1, 'Garcia Cacolyris, Emiliano Valentino', 13, 'Club Petroleros Ypf', 91700],
      [6, 'Botella, Delfina A', 16, 'Asoc. Sanjuanina de Tríáatloá n', 32160],
    ]);
  });

  it('club en la línea anterior y "sembrado edad nombre carril" (Tucumán, 25 y 50 m)', () => {
    const { rows, warning } = parseSembradosPdf(
      lines(
        'Evento  1   Hombres 12-99 100 CL Metro Estilo de Pecho FEDERADOS',
        'EdadCarril  EquipoNombreTiempo para Sembrado',
        'Serie   1 of 3   Finales   Inicia a las  09:00 AM',
        'MDC',
        'NT 27Ingratta, Nahuel Augusto3',
        'FANJ',
        '12:00.00 15Garcia Cruz, Bruno Augusto4',
        'Serie   2 of 3   Finales   Inicia a las  09:13 AM',
        'GYT',
        'NT 13Pauletto Olea, Bianca2_____',
        'CAZU',
        '3:07,67 14Gomez, Ana Lucia3_____',
      ),
    );
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.heatNo, r.lane, r.swimmerName, r.age, r.club, r.seedTimeMs])).toEqual([
      [1, 3, 'Ingratta, Nahuel Augusto', 27, 'MDC', null],
      [1, 4, 'Garcia Cruz, Bruno Augusto', 15, 'FANJ', 720000],
      [2, 2, 'Pauletto Olea, Bianca', 13, 'GYT', null],
      [2, 3, 'Gomez, Ana Lucia', 14, 'CAZU', 187670],
    ]);
  });

  it('la fila partida ("sembrado edad" y debajo "nombre carril") se une', () => {
    const { rows, warning } = parseSembradosPdf(
      lines(
        'Evento  1   Niñas 12-108 200 CC Metro Estilo Libre',
        'EdadCarril  EquipoNombreTiempo para Sembrado',
        'Serie   1 of 5   Finales',
        'GYT',
        '2:35,04 12',
        'Guanca Rocha, Elias Lautaro3_____',
        'CAZU',
        '2:36,04 16Olmedo, Rodrigo David2',
        '_____',
      ),
    );
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.lane, r.swimmerName, r.age, r.club, r.seedTimeMs])).toEqual([
      [3, 'Guanca Rocha, Elias Lautaro', 12, 'GYT', 155040],
      [2, 'Olmedo, Rodrigo David', 16, 'CAZU', 156040],
    ]);
  });

  it('una línea por dato: sembrado / nombre y edad / guiones / carril / club (Copa Independencia)', () => {
    const { rows, warning } = parseSembradosPdf(
      lines(
        'Evento  1   Niños 12-15 50 CC Metro Estilo Libre FEDERADOS',
        'EdadNombreFinalesEquipoLugarCarrilTiempo para Sembrado',
        'Serie   1 of 2   Finales Contra Tiempo',
        '37.26',
        'Biazzo Carbonell, Benjamin 14',
        '________________________',
        '2',
        'Club Azucena Tucuman',
        'NT',
        'Molino, Ciro Santino Leonard 12',
        '________________________',
        '3',
        'Gimnasia Y Tiro de Salta',
      ),
    );
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.lane, r.swimmerName, r.age, r.club, r.seedTimeMs])).toEqual([
      [2, 'Biazzo Carbonell, Benjamin', 14, 'Club Azucena Tucuman', 37260],
      [3, 'Molino, Ciro Santino Leonard', 12, 'Gimnasia Y Tiro de Salta', null],
    ]);
  });

  it('pruebas mixtas: la letra de sexo viene pegada a la edad', () => {
    const { rows } = parseSembradosPdf(
      lines(
        'Evento  80   Mixto 100 CC Metro Estilo Libre Chequeo de Tiempo FEDERADOS',
        'EdadNombreFinalesEquipoLugarCarrilTiempo para Sembrado',
        'Serie   1 of 2   Finales Contra Tiempo',
        '1:27.75',
        'Jimenez Bekerman, JoaquinM11',
        '________________________',
        '3',
        'Gimnasia Y Tiro de Salta',
        'Sociedad Espanñ ola de Salta2:15.58Oulier Vivas, Julio BenjaminM15________________________2',
      ),
    );
    expect(rows.map((r) => [r.lane, r.swimmerName, r.age, r.club, r.seedTimeMs])).toEqual([
      [3, 'Jimenez Bekerman, Joaquin', 11, 'Gimnasia Y Tiro de Salta', 87750],
      [2, 'Oulier Vivas, Julio Benjamin', 15, 'Sociedad Espanñ ola de Salta', 135580],
    ]);
  });

  it('continuación de página y postas salteadas', () => {
    const { rows } = parseSembradosPdf(
      lines(
        'Evento  105   Mixto 4x50 CC Metro Estilo Libre Relevo',
        ' EquipoRelevoCarrilTiempo para Sembrado',
        'Serie   1 of 4   Finales Contra Tiempo',
        'CNTCtro Deportiv Nado Rio Cuarto  2',
        '1) Vaisman, Gabriel M164) Herrera Amiri, Ignacio M172) Chinen, Martina W163) Nuz, Martina W16',
        'Evento  7   Mujeres 12 & Mayores 50 CC Metro Estilo Libre PROMOCIONALES',
        'Serie   2 of 3   Finales Contra Tiempo',
        'Mitre35.14Robledo, Brenda Sofia 14________________________4',
        'Serie   2   Finales Contra Tiempo...   (Evento  7   Mujeres 12 & Mayores 50 CC Metro Estilo Libre PROMOCIONALES)',
        'Mitre36.00Ruiz, Ana 15________________________5',
      ),
    );
    expect(rows.map((r) => [r.eventNo, r.heatNo, r.lane, r.swimmerName])).toEqual([
      [7, 2, 4, 'Robledo, Brenda Sofia'],
      [7, 2, 5, 'Ruiz, Ana'],
    ]);
  });

  it('"Equipo Inscripciones" no es un sembrado (no trae serie ni carril): no se lee y avisa', () => {
    const { rows, warning } = parseSembradosPdf(
      lines(
        'Equipo Inscripciones - Todos los Eventos',
        'Escuela Normal Manuel Belgrano',
        ' 1Alvarez, Melina - Femenino - Edad: 14 - Ind/Rel: 5 / 0',
        '#6 Mujeres 12-99 50 Máriposá PROMOCIONALES46.11#16 Mujeres 12-99 100 Libre PROMOCIONALES1:33.55',
      ),
    );
    expect(rows).toEqual([]);
    expect(warning).toBe('No se reconoció ninguna fila de sembrados en el archivo.');
  });

  it('no descarta en silencio: una línea ilegible se cuenta en el aviso', () => {
    const { rows, warning } = parseSembradosPdf(
      lines(
        'Evento  1   Niñas 12-13 50 CC Metro Estilo Libre FEDERADOS',
        'Serie   1 of 1   Finales',
        'GYT',
        'NT 13Pauletto Olea, Bianca2_____',
        'CAZU',
        'XXX 14Gomez, Ana Lucia, Raro3_____ 99',
      ),
    );
    expect(rows).toHaveLength(1);
    expect(warning).toContain('1 línea(s) con aspecto de fila no se pudieron leer');
  });
});
