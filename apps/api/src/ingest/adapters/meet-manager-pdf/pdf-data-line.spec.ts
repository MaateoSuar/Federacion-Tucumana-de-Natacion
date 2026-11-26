import {
  detectPlaceLayout,
  inferLayoutFromPrefix,
  joinSplitRows,
  parseAgeRange,
  parseDataLine,
  parseSeedContinuation,
  parseTeamFirstRow,
} from './pdf-data-line';

// Todas las filas de este archivo son líneas reales de los PDF de torneos 2024-2026 del Drive de la FTN
// (Meet Manager 5.0, 7.0 y 8.0). El tiempo siempre es milisegundos enteros.

describe('parseAgeRange — encabezados de categoría', () => {
  it.each([
    ['12 & Mayores', { min: 12, max: Number.POSITIVE_INFINITY }],
    ['9 & Menores', { min: 0, max: 9 }],
    ['12-108', { min: 12, max: 108 }],
    ['9 Años de Edad', { min: 9, max: 9 }],
  ])('%s', (group, expected) => {
    expect(parseAgeRange(group)).toEqual(expected);
  });

  it('"Categoría Mayores" no es un rango de edad: queda sin rango', () => {
    expect(parseAgeRange('Categoría Mayores')).toBeNull();
    expect(parseAgeRange('')).toBeNull();
  });
});

describe('parseDataLine — puesto pegado a la edad, pileta de 50 m sin sembrado (Nacionales, coma)', () => {
  it('edad 19, puesto 1, final 9:06,14 y 9 puntos', () => {
    // "Evento 1  Mujeres Categoría Mayores 800 CL Metro Estilo Libre": no hay rango de edades
    expect(parseDataLine(' 191Urgelles, Martina9:06,149', null, 800)).toEqual({
      age: 19, place: 1, isDQ: false, name: 'Urgelles, Martina', finalTimeRaw: '9:06,14', seedTimeRaw: 'NT',
    });
    expect(parseDataLine(' 215Kaniuka, Brisa Abigail10:36,064', null, 800)).toMatchObject({
      age: 21, place: 5, name: 'Kaniuka, Brisa Abigail', finalTimeRaw: '10:36,06',
    });
  });
});

describe('parseDataLine — puesto al final de la fila (Salta, Tucumán: decimales con punto o coma)', () => {
  const r1213 = parseAgeRange('12-13');

  it('final · puntos · sembrado · puesto, todo pegado (punto decimal, 25 m)', () => {
    expect(parseDataLine(' 13Lopez, Martina Noelia32.021231.001', r1213, 50)).toEqual({
      age: 13, place: 1, isDQ: false, name: 'Lopez, Martina Noelia', finalTimeRaw: '32.02', seedTimeRaw: '31.00',
    });
  });

  it('sembrado NT y puntos de dos dígitos', () => {
    expect(parseDataLine(' 12Corimayo, Lucia40.0510NT2', r1213, 50)).toEqual({
      age: 12, place: 2, isDQ: false, name: 'Corimayo, Lucia', finalTimeRaw: '40.05', seedTimeRaw: 'NT',
    });
  });

  it('sin puntos: sembrado separado por espacio y puesto al final', () => {
    expect(parseDataLine(' 12Rios, Ana40.78 39.009', r1213, 50)).toMatchObject({
      age: 12, place: 9, finalTimeRaw: '40.78', seedTimeRaw: '39.00',
    });
    expect(parseDataLine(' 11Cruz, Enzo Nahuel49.12 55.781', parseAgeRange('10-11'), 50)).toMatchObject({
      age: 11, place: 1, name: 'Cruz, Enzo Nahuel', finalTimeRaw: '49.12', seedTimeRaw: '55.78',
    });
  });

  it('coma decimal: final 2:56,17 · 20 pts · sembrado 3:04,00 · puesto 1 — sin lectura ambigua', () => {
    const row = parseDataLine(' 13Suarez, Constanza Antonella2:56,17203:04,001', r1213, 200);
    expect(row).toEqual({
      age: 13, place: 1, isDQ: false, name: 'Suarez, Constanza Antonella', finalTimeRaw: '2:56,17', seedTimeRaw: '3:04,00',
    });
    // "03:04" no es un tiempo: el 0 pertenece a los puntos "20"
    expect(row?.ambiguous).toBeUndefined();
  });

  it('el puesto puede venir en la línea siguiente: la fila queda sin puesto', () => {
    expect(parseDataLine(' 12Chiumiento, Simon3:17,1415NT', r1213, 200)).toMatchObject({
      age: 12, place: undefined, finalTimeRaw: '3:17,14', seedTimeRaw: 'NT',
    });
  });

  it('descalificado con sembrado y "---" de puesto', () => {
    expect(parseDataLine(' 16Hurtado, SolanaDQ 2:58,30---', parseAgeRange('16-18'), 200)).toEqual({
      age: 16, place: undefined, isDQ: true, name: 'Hurtado, Solana', finalTimeRaw: 'DQ', seedTimeRaw: '2:58,30',
    });
  });

  it('nota al pie pegada al nombre, con puesto al final', () => {
    expect(parseDataLine(' 13Araujo, Bautista 544.74 45.511', r1213, 50)).toMatchObject({
      age: 13, place: 1, name: 'Araujo, Bautista', finalTimeRaw: '44.74', seedTimeRaw: '45.51',
    });
  });

  it('empate: "*" y puesto compartido después del sembrado', () => {
    expect(parseDataLine(' 15Apaza, Aron41.75 NT*7', parseAgeRange('14-15'), 50)).toMatchObject({
      age: 15, place: 7, finalTimeRaw: '41.75', seedTimeRaw: 'NT',
    });
    expect(parseDataLine(' 15Cruz, Juan38.10 38.61*9', parseAgeRange('14-15'), 50)).toMatchObject({
      place: 9, finalTimeRaw: '38.10', seedTimeRaw: '38.61',
    });
  });

  it('estados con "---": NS y DNF son estados, no tiempos', () => {
    expect(parseDataLine(' 11Sosa, JazminNS ---', parseAgeRange('10-11'), 50)).toMatchObject({
      name: 'Sosa, Jazmin', finalTimeRaw: 'NS', place: undefined,
    });
    expect(parseDataLine(' 19Ruiz, Diego IsmaelDNF ---', null, 100, { layout: 'trailing' })).toMatchObject({
      name: 'Ruiz, Diego Ismael', finalTimeRaw: 'NF',
    });
  });
});

describe('parseDataLine — marcas de tiempo básico/récord y puesto al final (Nacionales, punto)', () => {
  it('marca TB: final · TB · puntos · sembrado · puesto', () => {
    expect(parseDataLine(' 10Perez Paz, Renata P2:40.59TB182:48.461', parseAgeRange('10'), 200)).toEqual({
      age: 10, place: 1, isDQ: false, name: 'Perez Paz, Renata P', finalTimeRaw: '2:40.59', seedTimeRaw: '2:48.46',
    });
    expect(parseDataLine(' 10DE Filippis, Giovanna Paz3:01.08TB 3:07.6210', parseAgeRange('10'), 200)).toMatchObject({
      place: 10, finalTimeRaw: '3:01.08', seedTimeRaw: '3:07.62',
    });
  });

  it('marca y puesto separado por espacio, sin columna de sembrado', () => {
    expect(parseDataLine(' 14Gerbaudo, Ana2:14.75TB 3', parseAgeRange('14'), 200)).toMatchObject({
      age: 14, place: 3, finalTimeRaw: '2:14.75', seedTimeRaw: 'NT',
    });
    expect(parseDataLine(' 17Hein, Agostina Ariadna8:36.72CMU B 1', null, 800, { layout: 'trailing' })).toMatchObject({
      age: 17, place: 1, finalTimeRaw: '8:36.72',
    });
  });

  it('marca de clasificado "q" y marcas compuestas', () => {
    expect(parseDataLine(' 21Urgelles, Martina2:08.22CqTB 2:05.651', null, 200, { layout: 'trailing' })).toMatchObject({
      age: 21, place: 1, finalTimeRaw: '2:08.22', seedTimeRaw: '2:05.65',
    });
    expect(parseDataLine(' 12Cordoba Vizcarra, Maximo1:05.75q 1:09.232', parseAgeRange('12-13'), 100, { layout: 'trailing' })).toMatchObject({
      place: 2, finalTimeRaw: '1:05.75', seedTimeRaw: '1:09.23',
    });
  });

  it('sin sembrado, puntos y puesto pegados: el puesto sigue el orden de llegada', () => {
    // "TBM91" = TBM + 9 pts + puesto 1; "TBM72" = 7 pts + puesto 2
    expect(parseDataLine(' 19Urgelles, Martina9:05.05TBM91', null, 800, { layout: 'trailing', prevPlace: 0 })).toMatchObject({
      age: 19, place: 1, finalTimeRaw: '9:05.05',
    });
    expect(parseDataLine(' 19Maselli, Camila9:26.68TBM72', null, 800, { layout: 'trailing', prevPlace: 1 })).toMatchObject({
      place: 2,
    });
  });

  it('puntos compartidos por empate sin sembrado', () => {
    expect(parseDataLine(' 17*2Curto, Malena Veronica38.4810. 50', parseAgeRange('16-18'), 50)).toMatchObject({
      age: 17, place: 2, finalTimeRaw: '38.48', seedTimeRaw: 'NT',
    });
  });

  it('clase deportiva pegada al nombre (natación adaptada) no es parte del nombre ni del tiempo', () => {
    expect(parseDataLine(' 19Costa, Bautista SM10 2:31.642', null, 200, { layout: 'trailing', prevPlace: 1 })).toMatchObject({
      name: 'Costa, Bautista', finalTimeRaw: '2:31.64', place: 2,
    });
    expect(parseDataLine(' 19Lombardi, Mariano SM9J2:38.073', null, 200, { layout: 'trailing', prevPlace: 2 })).toMatchObject({
      finalTimeRaw: '2:38.07', place: 3,
    });
  });
});

describe('parseDataLine — formato CL de Santiago (punto, tiempo separado por espacio, puesto al frente)', () => {
  it('edad 12, puesto 1, final 1:06.30, sembrado 1:07.21', () => {
    expect(parseDataLine(' 121Cordoba Vizcarra, Maximo1:06.30 1:07.21', parseAgeRange('12-13'), 100)).toEqual({
      age: 12, place: 1, isDQ: false, name: 'Cordoba Vizcarra, Maximo', finalTimeRaw: '1:06.30', seedTimeRaw: '1:07.21',
    });
  });

  it('puntos y sembrado en la misma fila (CL con puntos)', () => {
    expect(parseDataLine(' 131Pauletto Olea, Bianca1:22.59 1:16.54', parseAgeRange('12-13'), 100)).toMatchObject({
      age: 13, place: 1, finalTimeRaw: '1:22.59', seedTimeRaw: '1:16.54',
    });
  });
});

describe('parseDataLine — el archivo manda sobre el prefijo de una sola fila', () => {
  it('una edad fuera del rango de la prueba no cambia la disposición del archivo', () => {
    // "Mujeres 19 & Mayores": la nadadora de 7 años aparece igual, con puesto al frente
    expect(parseDataLine('  73Villafanñ e, Agustina 556,61 NT', parseAgeRange('19 & Mayores'), 50, { layout: 'front' })).toMatchObject({
      age: 7, place: 3, name: 'Villafanñ e, Agustina', finalTimeRaw: '56,61',
    });
  });

  it('sin rango y sin layout, si la cola no cuadra con una disposición se prueba la otra', () => {
    expect(parseDataLine(' 20Urgelles, Martina8:59.85 3', null, 800)).toMatchObject({
      age: 20, place: 3, finalTimeRaw: '8:59.85',
    });
  });

  it('inferLayoutFromPrefix: el rango decide cuando solo una disposición es posible', () => {
    expect(inferLayoutFromPrefix('13', parseAgeRange('12-13'))).toBe('trailing');
    expect(inferLayoutFromPrefix('131', parseAgeRange('12-13'))).toBe('front');
    expect(inferLayoutFromPrefix('81', parseAgeRange('3-8'))).toBe('front');
    expect(inferLayoutFromPrefix('191', null)).toBeNull();
  });
});

describe('detectPlaceLayout', () => {
  it('vota con las filas cuyo rango decide la disposición', () => {
    const front = ['Evento 1  Niñas 12-13 100 CC Metro Estilo Libre', ' 131Perez, Ana1:10,00 1:11,00', ' 122Gomez, Eva1:12,00 1:13,00'];
    const trailing = ['Evento 1  Niñas 12-13 100 CC Metro Estilo Libre', ' 13Perez, Ana1:10,00121:11,001', ' 12Gomez, Eva1:12,0081:13,002'];
    expect(detectPlaceLayout(front)).toBe('front');
    expect(detectPlaceLayout(trailing)).toBe('trailing');
  });

  it('sin rango de edades ("Categoría Mayores") decide la cola de la fila', () => {
    const lines = [
      'Evento 1  Mujeres Categoría Mayores 800 CL Metro Estilo Libre',
      ' 17Hein, Agostina Ariadna8:36.72CMU B 1',
      ' 20Urgelles, Martina8:59.85 3',
    ];
    expect(detectPlaceLayout(lines)).toBe('trailing');
  });
});

describe('filas partidas en varias líneas', () => {
  it('joinSplitRows une la edad suelta con la línea del nombre, sin mover los números de línea', () => {
    const lines = ['Gimnasia Y Tiro de Salta', ' 12', 'Navamuel Ayala, Antonella Maite35,59 38,621', 'Club'];
    expect(joinSplitRows(lines)).toEqual([
      'Gimnasia Y Tiro de Salta',
      ' 12Navamuel Ayala, Antonella Maite35,59 38,621',
      '',
      'Club',
    ]);
    // un club con número no se une
    expect(joinSplitRows([' 12', 'Club Azucena'])).toEqual([' 12', 'Club Azucena']);
  });

  it('parseSeedContinuation separa los puntos del sembrado con el tiempo final como referencia', () => {
    expect(parseSeedContinuation('161:26.31', 83860, 100)).toBe('1:26.31');
    expect(parseSeedContinuation('201:04.57', 65950, 100)).toBe('1:04.57');
    expect(parseSeedContinuation('1:24,43', 81500, 100)).toBe('1:24,43');
    expect(parseSeedContinuation('NT', 81500, 100)).toBe('NT');
    expect(parseSeedContinuation('Madre de Ciudades', 81500, 100)).toBeNull();
  });
});

describe('parseTeamFirstRow — "Edad   EquipoNombreTiempo de Finales" (sigla del club antes de la edad)', () => {
  it('puesto y tiempo pegados: decide la distancia', () => {
    expect(parseTeamFirstRow('FANJ 13Chavez Puch, Emma Victoria131.05  20', 50)).toMatchObject({
      team: 'FANJ', age: 13, place: 1, name: 'Chavez Puch, Emma Victoria', finalTimeRaw: '31.05',
    });
    expect(parseTeamFirstRow('CHEIL 13Horgan, Valentina81:26.67  11', 100)).toMatchObject({
      team: 'CHEIL', place: 8, finalTimeRaw: '1:26.67',
    });
    expect(parseTeamFirstRow('FANJ 13Ramos, Lourdes Pilar1341.19  4', 50)).toMatchObject({ place: 13, finalTimeRaw: '41.19' });
  });

  it('descalificado', () => {
    expect(parseTeamFirstRow('FANJ 10Saldias, Alba Elena---DQ', 50)).toMatchObject({
      isDQ: true, place: undefined, finalTimeRaw: 'DQ', name: 'Saldias, Alba Elena',
    });
  });
});
