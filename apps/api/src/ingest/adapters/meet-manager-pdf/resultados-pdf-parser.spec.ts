import { parseResultadosPdf } from './resultados-pdf-parser';

// Bloques reales de los PDF de torneos 2024-2026 del Drive de la FTN, uno por variante de Meet Manager.
const lines = (...l: string[]): string => l.join('\n');

describe('parseResultadosPdf — Nacionales, 50 m ("CL Metro"), coma, sin sembrado', () => {
  const text = lines(
    'Evento 1  Mujeres Categoría Mayores 800 CL Metro Estilo Libre',
    'EdadNombreEquipoTiempo de Finales Puntos',
    'Acv',
    ' 191Urgelles, Martina9:06,149',
    'Echesortu Foot Ball Club',
    ' 192Suarez Monaco, Natalia9:19,187',
    ' ',
    'Evento 2  Hombres Categoría Mayores 800 CL Metro Estilo Libre',
    'EdadNombreEquipoTiempo de Finales Puntos',
    'Bucor Natacion Cba',
    ' 191Salinas, Lucas8:33,679',
  );

  it('lee las filas con tiempos en milisegundos enteros y sin inventar sembrado', () => {
    const { rows, warning } = parseResultadosPdf(text);
    expect(warning).toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      eventNo: 1,
      eventLabel: '800m Estilo Libre — Mujeres Categoría Mayores',
      place: 1,
      swimmerName: 'Urgelles, Martina',
      age: 19,
      club: 'Acv',
      seedTimeMs: null,
      finalTimeMs: 546140,
      status: 'OK',
    });
    expect(rows[1]).toMatchObject({ place: 2, club: 'Echesortu Foot Ball Club', finalTimeMs: 559180 });
    expect(rows[2]).toMatchObject({ eventNo: 2, finalTimeMs: 513670 });
    for (const r of rows) expect(Number.isInteger(r.finalTimeMs)).toBe(true);
  });
});

describe('parseResultadosPdf — Salta, 25 m, decimales con punto y puesto al final', () => {
  const text = lines(
    'Evento 1  Niñas 12-13 50 CC Metro Estilo de Mariposa FEDERADO',
    'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
    'Fundacion Acuatica Natacion JU',
    ' 13Lopez, Martina Noelia32.021231.001',
    'Fundacion Acuatica Natacion JU',
    ' 12Corimayo, Lucia40.0510NT2',
    'Gimnasia Y Tiro de Salta',
    ' 13Vivero Artayeta, Abril Delfina48.95843.813',
  );

  it('separa edad, final, puntos, sembrado y puesto', () => {
    const { rows, warning } = parseResultadosPdf(text);
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.age, r.place, r.finalTimeMs, r.seedTimeMs])).toEqual([
      [13, 1, 32020, 31000],
      [12, 2, 40050, null],
      [13, 3, 48950, 43810],
    ]);
    expect(rows[0]?.eventLabel).toBe('50m Estilo de Mariposa FEDERADO — Niñas 12-13');
    expect(rows[0]?.club).toBe('Fundacion Acuatica Natacion JU');
  });
});

describe('parseResultadosPdf — Santiago, 50 m, punto, tiempo separado por espacio', () => {
  it('final y sembrado con punto', () => {
    const { rows } = parseResultadosPdf(
      lines(
        'Evento 1  Niños 12-13 100 CL Metro Estilo Libre',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Madre de Ciudades',
        ' 121Cordoba Vizcarra, Maximo1:06.30 1:07.21',
        'Club Azucena',
        ' 122Solorzano, Juan Cruz1:12.78 1:13.29',
      ),
    );
    expect(rows.map((r) => [r.age, r.place, r.finalTimeMs, r.seedTimeMs])).toEqual([
      [12, 1, 66300, 67210],
      [12, 2, 72780, 73290],
    ]);
  });
});

describe('parseResultadosPdf — Tucumán (Meet Manager 5.0): puesto y sembrado en la línea siguiente', () => {
  it('el puesto suelto debajo de la fila es el de la fila anterior', () => {
    const { rows, warning } = parseResultadosPdf(
      lines(
        'Evento 2  Niños 12-13 200 CC Metro CI Federados',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Club Azucena',
        ' 13Solorazano Sancho, Juan Cruz2:34,57202:46,16',
        '1',
        'Club Azucena',
        ' 12Hild Manino, Benicio2:58,22172:57,092',
        'Club Azucena',
        ' 13Biazzo Carbonell, Benjamin3:05,18163:47,00',
        '3',
      ),
    );
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.swimmerName, r.age, r.place, r.finalTimeMs, r.seedTimeMs])).toEqual([
      ['Solorazano Sancho, Juan Cruz', 13, 1, 154570, 166160],
      ['Hild Manino, Benicio', 12, 2, 178220, 177090],
      ['Biazzo Carbonell, Benjamin', 13, 3, 185180, 227000],
    ]);
  });

  it('el sembrado impreso en la línea siguiente se asigna a la fila y no cuenta como fila rota', () => {
    const { rows, warning } = parseResultadosPdf(
      lines(
        'Evento 2  Niños 12-13 100 CC Metro Estilo de Espalda FEDERADO',
        'EdadNombreEquipoTiempo de FinalesTiempo para Sembrado',
        'Escuela Normal Manuel Belgrano',
        ' 131Ayunta Aybar, Mateo Agustin1:21,50',
        ' 1:24,43',
        'Escuela Normal Manuel Belgrano',
        ' 132Gulotta, Lucca1:25,41',
        ' 1:29,20',
      ),
    );
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.place, r.finalTimeMs, r.seedTimeMs])).toEqual([
      [1, 81500, 84430],
      [2, 85410, 89200],
    ]);
  });

  it('puntos + sembrado pegados en la línea siguiente ("161:26.31")', () => {
    const { rows } = parseResultadosPdf(
      lines(
        'Evento 1  Hombres 16-18 100 CL Metro Estilo de Pecho FEDERADOS',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Madre de Ciudades',
        ' 163Arguello, Lautaro1:23.86',
        '161:26.31',
      ),
    );
    expect(rows[0]).toMatchObject({ age: 16, place: 3, finalTimeMs: 83860, seedTimeMs: 86310 });
  });
});

describe('parseResultadosPdf — puesto al final con marcas de tiempo básico (Nacionales Infantiles/Juveniles)', () => {
  it('final · marca · puesto', () => {
    const { rows, warning } = parseResultadosPdf(
      lines(
        'Evento 1  Niñas 14 Años de Edad 200 CL Metro Estilo Libre',
        'TB TIEMPO BASICO3:16.00',
        'EdadNombreEquipoTiempo de Finales',
        'Natacioá n Sagvb',
        ' 14Meirinñ o, Morena Mia2:11.63RTB 1',
        'Sociedad Italiana DE Tiro AL S',
        ' 14Medina Villegas, Malena2:13.60RTB 2',
        'Ctro Deportiv Nado Rio Cuarto',
        ' 14Gerbaudo, Ana2:14.75TB 3',
      ),
    );
    expect(warning).toBeNull();
    expect(rows.map((r) => [r.age, r.place, r.finalTimeMs])).toEqual([
      [14, 1, 131630],
      [14, 2, 133600],
      [14, 3, 134750],
    ]);
    expect(rows[0]?.club).toBe('Natacioá n Sagvb');
  });
});

describe('parseResultadosPdf — líneas especiales', () => {
  it('"Edad   EquipoNombre": sigla del club antes de la edad', () => {
    const { rows } = parseResultadosPdf(
      lines(
        'Evento 1  Niñas 12-13 50 CC Metro Estilo Libre FEDERADO',
        'Edad   EquipoNombreTiempo de Finales',
        'FANJ 13Chavez Puch, Emma Victoria131.05  20',
        'GYT 12Diaz, Paula Martina232.20  17',
        'FANJ 10Saldias, Alba Elena---DQ',
      ),
    );
    expect(rows.map((r) => [r.club, r.age, r.place, r.finalTimeMs, r.status])).toEqual([
      ['FANJ', 13, 1, 31050, 'OK'],
      ['GYT', 12, 2, 32200, 'OK'],
      ['FANJ', 10, null, null, 'DSQ'],
    ]);
  });

  it('descalificados y no presentados son estados, no tiempos', () => {
    const { rows } = parseResultadosPdf(
      lines(
        'Evento 1  Niñas 16-18 200 CC Metro CI Federados',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Soc Tiro Gimnasia y Esgrima ju',
        ' 16Hurtado, SolanaDQ 2:58,30---',
        'Mitre',
        ' 14---Alarcon Cano, Allegra del MilagroDQ NT',
        'Madre de Ciudades',
        ' 11Sosa, JazminNS ---',
      ),
    );
    expect(rows.map((r) => [r.status, r.finalTimeMs, r.place])).toEqual([
      ['DSQ', null, null],
      ['DSQ', null, null],
      ['DNS', null, null],
    ]);
    expect(rows[2]?.swimmerName).toBe('Sosa, Jazmin');
  });

  it('una fila partida en dos líneas (edad suelta + nombre) se une', () => {
    const { rows, warning } = parseResultadosPdf(
      lines(
        'Evento 3  Niños 16-18 50 CC Metro Estilo Libre FEDERADO',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Mitre',
        ' 178',
        'Barrionuevo Vilvao, Santiago Agustin34,11 35,54',
      ),
    );
    expect(warning).toBeNull();
    expect(rows[0]).toMatchObject({ age: 17, place: 8, finalTimeMs: 34110, seedTimeMs: 35540, club: 'Mitre' });
  });

  it('un nombre que termina en "x" pegado al tiempo no se confunde con una posta', () => {
    const { rows } = parseResultadosPdf(
      lines(
        'Evento 9  Hombres 12-13 50 CC Metro Estilo Libre FEDERADOS',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Club Azucena',
        ' 138Heredia, Felix38,76139,04',
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ swimmerName: 'Heredia, Felix', place: 8, finalTimeMs: 38760 });
  });

  it('saltea las postas', () => {
    const { rows } = parseResultadosPdf(
      lines(
        'Evento 89  Mixto 12-108 100 CC Metro Combinado FEDERADOS Relevo',
        ' EquipoRelevoTiempo de FinalesTiempo para SembradoPuntos',
        '    A',
        'Club Azucena Tucuman4:32,05 NT1',
        '1) Salazar, Pilar W162) Escalera, Gonzalo M233) Torres, Juan Pablo M184) Ferreyra, Ana Lucia W18',
        'Evento 90  Niñas 12-13 100 CC Metro Estilo Libre FEDERADOS',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Club Azucena',
        ' 13Frias, Leila Valentina1:17,33 1:09,741',
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventNo).toBe(90);
  });

  it('no descarta en silencio: una fila ilegible se cuenta en el aviso', () => {
    const { rows, warning } = parseResultadosPdf(
      lines(
        'Evento 1  Mujeres 16 Años de Edad 200 CL Metro Estilo Libre',
        'EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos',
        'Club Regatas',
        ' 16Garces, Sofia2:08.33TB92:09.691',
        'Club DE Regatas Corrientes',
        ' 16Lafuente, 32931 P2:15.88TB62:20.853',
      ),
    );
    expect(rows).toHaveLength(1);
    expect(warning).toContain('1 línea(s) con aspecto de fila no se pudieron leer');
    expect(warning).toContain('Lafuente');
  });

  it('un archivo sin ninguna fila avisa', () => {
    expect(parseResultadosPdf('Resultados\nnada').warning).toBe('No se reconoció ninguna fila de resultados en el archivo.');
  });
});
