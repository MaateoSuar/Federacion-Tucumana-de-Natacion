import { buildResultEventLabel, parseEventHeader } from './pdf-event-header';

describe('parseEventHeader', () => {
  it('Nacionales (50 m, "CL Metro", sin rango de edades): conserva "Categoría Mayores" tal cual', () => {
    const h = parseEventHeader('Evento 1  Mujeres Categoría Mayores 800 CL Metro Estilo Libre');
    expect(h).toMatchObject({
      eventNo: 1, genderRaw: 'Mujeres', ageGroup: 'Categoría Mayores', distance: 800, courseCode: 'CL',
      rest: 'Estilo Libre', isRelay: false, isContinuation: false,
    });
  });

  it('25 m ("CC Metro") con rango de edades', () => {
    expect(parseEventHeader('Evento 1  Niñas 12-13 100 CC Metro Estilo Libre FEDERADOS')).toMatchObject({
      ageGroup: '12-13', distance: 100, courseCode: 'CC', rest: 'Estilo Libre FEDERADOS',
    });
  });

  it('"9 Años de Edad", "12 & Mayores" y espacios múltiples', () => {
    expect(parseEventHeader('Evento 4  Hombres 9 Años de Edad 100 CL Metro Estilo de Espalda')).toMatchObject({
      ageGroup: '9 Años de Edad', distance: 100, courseCode: 'CL',
    });
    expect(parseEventHeader('Evento  1   Mujeres 12 & Mayores 50 CC Metro Estilo de Mariposa FEDERADO')).toMatchObject({
      eventNo: 1, ageGroup: '12 & Mayores', distance: 50, rest: 'Estilo de Mariposa FEDERADO',
    });
  });

  it('prueba sin categoría de edad', () => {
    expect(parseEventHeader('Evento 3  Mujeres 50 CC Metro Estilo Libre')).toMatchObject({ ageGroup: '', distance: 50 });
  });

  it('línea que repite la prueba al cambiar de página', () => {
    expect(parseEventHeader('Eliminatorias ...   (Evento 4  Hombres Categoría Mayores 200 CL Metro CI)')).toMatchObject({
      eventNo: 4, ageGroup: 'Categoría Mayores', distance: 200, rest: 'CI', isContinuation: true,
    });
    expect(parseEventHeader('Serie   2   Finales Contra Tiempo...   (Evento  7   Mujeres 12 & Mayores 50 CC Metro Estilo Libre PROMOCIONALES)')).toMatchObject({
      eventNo: 7, isContinuation: true, rest: 'Estilo Libre PROMOCIONALES',
    });
  });

  it('postas: "Relevo" y distancia "4x50" (se toma la distancia total)', () => {
    expect(parseEventHeader('Evento 89  Mixto 12-108 100 CC Metro Combinado FEDERADOS Relevo')).toMatchObject({ isRelay: true });
    expect(parseEventHeader('Evento  105   Mixto 4x50 CC Metro Estilo Libre Relevo')).toMatchObject({
      isRelay: true, distance: 200, ageGroup: '',
    });
  });

  it('no es un encabezado de prueba', () => {
    expect(parseEventHeader('Resultados')).toBeNull();
    expect(parseEventHeader('Evento 12')).toBeNull();
    expect(parseEventHeader(' 191Urgelles, Martina9:06,149')).toBeNull();
  });
});

describe('buildResultEventLabel — "<dist>m <estilo y nivel> — <género> <edades>"', () => {
  it('no cambia el formato que parsea la web', () => {
    const h = parseEventHeader('Evento 1  Niñas 12-13 100 CC Metro Estilo Libre FEDERADOS');
    expect(h && buildResultEventLabel(h)).toBe('100m Estilo Libre FEDERADOS — Niñas 12-13');
  });

  it('conserva el texto del archivo, también los espacios dobles', () => {
    const h = parseEventHeader('Evento 56  Hombres 16-18 50 CC Metro Estilo de Espalda TOMA  DE TIEMPOS');
    expect(h && buildResultEventLabel(h)).toBe('50m Estilo de Espalda TOMA  DE TIEMPOS — Hombres 16-18');
  });

  it('con "Categoría Mayores" conserva el texto sin mapearlo a una categoría', () => {
    const h = parseEventHeader('Evento 1  Mujeres Categoría Mayores 800 CL Metro Estilo Libre');
    expect(h && buildResultEventLabel(h)).toBe('800m Estilo Libre — Mujeres Categoría Mayores');
  });
});
