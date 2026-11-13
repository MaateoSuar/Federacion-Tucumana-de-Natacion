import { parseAgeRange, parseDataLine, parseLines } from './pdf-line-parser';

describe('parseAgeRange', () => {
  it.each([
    ['12-13', { min: 12, max: 13 }],
    ['9', { min: 9, max: 9 }],
    ['3-8', { min: 3, max: 8 }],
    ['19 & Mayores', { min: 19, max: Number.POSITIVE_INFINITY }],
  ])('%s', (group, expected) => {
    expect(parseAgeRange(group)).toEqual(expected);
  });

  it('devuelve null si no hay edad', () => {
    expect(parseAgeRange('Open')).toBeNull();
  });
});

// Filas reales de "Torneo Abierto Catamarca 2026" (Meet Manager 7.0, columnas pegadas).
describe('parseDataLine — formato pegado con coma (Catamarca)', () => {
  const r1213 = parseAgeRange('12-13');

  it('final + puntos + sembrado pegados', () => {
    expect(parseDataLine(' 121Villena Calatayud, Lujan Jocelyn3:02,9593:00,00', r1213)).toEqual({
      age: 12, place: 1, isDQ: false, name: 'Villena Calatayud, Lujan Jocelyn', finalTimeRaw: '3:02,95', seedTimeRaw: '3:00,00',
    });
  });

  it('sin puntos: espacio y sembrado', () => {
    expect(parseDataLine(' 1412Sosa, Agostina3:15,48 NT', parseAgeRange('14-15'))).toMatchObject({
      age: 14, place: 12, name: 'Sosa, Agostina', finalTimeRaw: '3:15,48', seedTimeRaw: 'NT',
    });
  });

  it('puntos pegados y sembrado NT', () => {
    expect(parseDataLine(' 148Martincic, Maria Agustina3:10,281NT', parseAgeRange('14-15'))).toMatchObject({
      place: 8, name: 'Martincic, Maria Agustina', finalTimeRaw: '3:10,28', seedTimeRaw: 'NT',
    });
  });

  it('nota al pie: el dígito suelto antes del tiempo NO es parte del tiempo', () => {
    // Antes se leía 52:56,32 (más de 52 minutos en un 200 combinado).
    expect(parseDataLine(' 142Vega, Juana Uma 52:56,3272:56,83', parseAgeRange('14-15'))).toMatchObject({
      age: 14, place: 2, name: 'Vega, Juana Uma', finalTimeRaw: '2:56,32', seedTimeRaw: '2:56,83',
    });
    expect(parseDataLine(' 114Villafañe, Sofia 535,60537,00', parseAgeRange('10-11'))).toMatchObject({
      age: 11, place: 4, name: 'Villafañe, Sofia', finalTimeRaw: '35,60', seedTimeRaw: '37,00',
    });
    expect(parseDataLine(' 1711Ortiz Barrios, Matias 42:47,23 2:40,84', parseAgeRange('16-18'))).toMatchObject({
      age: 17, place: 11, name: 'Ortiz Barrios, Matias', finalTimeRaw: '2:47,23', seedTimeRaw: '2:40,84',
    });
  });

  it('edad de un dígito: "81" es 8 años, 1° (no serie y carril)', () => {
    expect(parseDataLine(' 81Lema, Arnoldo22,68924,91', parseAgeRange('3-8'))).toMatchObject({
      age: 8, place: 1, name: 'Lema, Arnoldo', finalTimeRaw: '22,68', seedTimeRaw: '24,91',
    });
    expect(parseDataLine(' 910Perez, Amapola43,10 NT', parseAgeRange('9'))).toMatchObject({ age: 9, place: 10 });
  });

  it('edad y puesto de dos dígitos', () => {
    expect(parseDataLine(' 1010Araoz, Lorenzo 541,80 41,08', parseAgeRange('10-11'))).toMatchObject({
      age: 10, place: 10, name: 'Araoz, Lorenzo', finalTimeRaw: '41,80', seedTimeRaw: '41,08',
    });
  });

  it('empate ("*") con puntos compartidos "5. 50"', () => {
    expect(parseDataLine(' 13*3Ramos, Olivia1:23,475. 501:25,44', r1213)).toMatchObject({
      age: 13, place: 3, isDQ: false, name: 'Ramos, Olivia', finalTimeRaw: '1:23,47', seedTimeRaw: '1:25,44',
    });
    expect(parseDataLine(' 20*8Ibarra, Lucas39,32 38,59', parseAgeRange('19 & Mayores'))).toMatchObject({
      age: 20, place: 8, finalTimeRaw: '39,32', seedTimeRaw: '38,59',
    });
    expect(parseDataLine(' 17*7Salas, Alejo28,341. 50NT', parseAgeRange('16-18'))).toMatchObject({
      place: 7, finalTimeRaw: '28,34', seedTimeRaw: 'NT',
    });
  });

  it('descalificado: sin puesto, con y sin sembrado', () => {
    expect(parseDataLine(' 13---Gil, TeoDQ 3:10,76', r1213)).toEqual({
      age: 13, place: undefined, isDQ: true, name: 'Gil, Teo', finalTimeRaw: 'DQ', seedTimeRaw: '3:10,76',
    });
    expect(parseDataLine(' 51---Demasi, AgustinDQ NT', parseAgeRange('19 & Mayores'))).toMatchObject({
      age: 51, isDQ: true, name: 'Demasi, Agustin', finalTimeRaw: 'DQ', seedTimeRaw: 'NT',
    });
  });

  it('devuelve null si la fila no tiene tiempo ni estado', () => {
    expect(parseDataLine(' 121Villena Calatayud, Lujan Jocelyn', r1213)).toBeNull();
  });
});

describe('parseDataLine — lecturas dobles del tiempo', () => {
  const range = parseAgeRange('12-13');

  it('la distancia descarta la lectura imposible, con coma o con punto', () => {
    // 800 m: 12:09,06 es el tiempo; 2:09,06 sería imposible
    expect(parseDataLine(' 121Perez, Ana 12:09,06 NT', range, 800)).toMatchObject({ finalTimeRaw: '12:09,06' });
    // 100 m en formato CL con nota al pie 5: 51 minutos es imposible
    expect(parseDataLine('  1211RODRIGUEZ, MATEO 51:09.06', range, 100)).toMatchObject({ finalTimeRaw: '1:09.06' });
    // nota pegada sin espacio
    expect(parseDataLine(' 142Vega, Juana Uma52:56,3272:56,83', parseAgeRange('14-15'), 200)).toMatchObject({
      name: 'Vega, Juana Uma', finalTimeRaw: '2:56,32',
    });
    // 800 m con el tiempo pegado al nombre: 13 minutos, no nota "1" + 3:02
    expect(parseDataLine(' 121Perez, Ana13:02,95 NT', range, 800)).toMatchObject({ finalTimeRaw: '13:02,95' });
  });

  it('si nada lo decide, elige por formato y marca la fila como ambigua', () => {
    const row = parseDataLine(' 121Perez, Ana 12:09,06 NT', range);
    expect(row).toMatchObject({ finalTimeRaw: '2:09,06', ambiguous: true });
    expect(parseDataLine(' 121Villena Calatayud, Lujan Jocelyn3:02,9593:00,00', range)?.ambiguous).toBeUndefined();
  });

  it('puntos de dos dígitos: el sembrado es el comparable con el tiempo final', () => {
    expect(parseDataLine(' 121Perez, Ana1:05,30161:04,00', range)).toMatchObject({
      finalTimeRaw: '1:05,30', seedTimeRaw: '1:04,00',
    });
    expect(parseDataLine(' 121Perez, Ana1:05,30121:04,00', range)).toMatchObject({ seedTimeRaw: '1:04,00' });
    expect(parseDataLine(' 121Perez, Ana1:05,3091:04,00', range)).toMatchObject({ seedTimeRaw: '1:04,00' });
  });
});

describe('parseLines — clubes que empiezan con un dígito', () => {
  it('"1ro de Mayo" es un club, no una fila rota, y su nadador entra', () => {
    const parsed = parseLines(
      [
        'Evento 1  Niñas 12-13 100 CC Metro Estilo Libre FEDERADOS',
        '1ro de Mayo',
        ' 121Perez, Ana1:05,3091:04,00',
      ],
      'x.pdf',
    );
    expect(parsed.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
    expect(parsed.clubs.map((c) => c.name)).toEqual(['1ro de Mayo']);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({ final_time_ms: 65300, place: 1 });
  });

  it('una fila ambigua genera un WARNING para revisar en el preview', () => {
    const parsed = parseLines(
      [
        'Evento 1  Niñas 12-13 400 CC Metro Estilo Libre FEDERADOS',
        'Club Azucena',
        ' 121Perez, Ana 15:20,39 NT',
      ],
      'x.pdf',
    );
    expect(parsed.results).toHaveLength(1);
    expect(parsed.issues.filter((i) => i.severity === 'WARNING' && i.message.startsWith('Tiempo ambiguo'))).toHaveLength(1);
  });
});

describe('parseDataLine — formato CL (punto decimal, tiempo separado por espacio)', () => {
  const range = parseAgeRange('12-13');

  it('el tiempo separado por espacio no se confunde con una nota al pie', () => {
    expect(parseDataLine('  1211RODRIGUEZ, MATEO 1:09.06', range)).toMatchObject({
      age: 12, place: 11, name: 'RODRIGUEZ, MATEO', finalTimeRaw: '1:09.06', seedTimeRaw: 'NT',
    });
    expect(parseDataLine('  1211RODRIGUEZ, MATEO 17.95 NT', range)).toMatchObject({ finalTimeRaw: '17.95', seedTimeRaw: 'NT' });
    expect(parseDataLine('  1211RODRIGUEZ, MATEO 12:09.06', range)).toMatchObject({ finalTimeRaw: '12:09.06' });
  });

  it('un apellido en mayúsculas terminado en NS no se lee como "no se presentó"', () => {
    expect(parseDataLine('  1211EVANS, MARTINS 1:09.06', range)).toMatchObject({
      name: 'EVANS, MARTINS', finalTimeRaw: '1:09.06',
    });
  });

  it('estado separado por espacio', () => {
    expect(parseDataLine('  1211RODRIGUEZ, MATEO NS', range)).toMatchObject({ name: 'RODRIGUEZ, MATEO', finalTimeRaw: 'NS' });
  });
});
