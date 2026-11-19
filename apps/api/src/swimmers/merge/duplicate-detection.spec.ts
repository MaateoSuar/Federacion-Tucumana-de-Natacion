import {
  ClubLike,
  DUPLICATE_MIN_SCORE,
  SwimmerLike,
  findClubDuplicatePairs,
  findSwimmerDuplicatePairs,
} from './duplicate-detection';

// ── Helpers de prueba ────────────────────────────────────────────────────────

const CLUB_A = { id: 'club-a', name: 'Club Atlético Tucumán', shortName: 'CAT' };
const CLUB_B = { id: 'club-b', name: 'Lawn Tennis Club', shortName: 'LTC' };

function sw(
  id: string,
  firstName: string,
  lastName: string,
  opts: Partial<Pick<SwimmerLike, 'gender' | 'birthDate' | 'currentClub' | 'documentId'>> = {},
): SwimmerLike {
  return {
    id,
    firstName,
    lastName,
    gender: opts.gender ?? 'M',
    birthDate: opts.birthDate ?? null,
    currentClub: opts.currentClub ?? null,
    ...(opts.documentId !== undefined ? { documentId: opts.documentId } : {}),
  };
}

const born = (year: number, month = 6, day = 15): Date => new Date(Date.UTC(year, month - 1, day));

function club(id: string, name: string, shortName: string, locality = 'San Miguel de Tucumán'): ClubLike {
  return { id, name, shortName, locality };
}

function pairIds(pairs: Array<{ a: { id: string }; b: { id: string } }>): string[] {
  return pairs.map((p) => `${p.a.id}|${p.b.id}`);
}

// PRNG determinista para los datos sintéticos
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = ['ba', 'co', 'de', 'fi', 'ga', 'ho', 'ju', 'ka', 'le', 'mo', 'na', 'pe', 'ri', 'so', 'tu', 'va', 'ze', 'lo', 'mi', 'ra'];

function syntheticWord(rand: () => number, syllables: number): string {
  let w = '';
  for (let i = 0; i < syllables; i++) w += SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// ── Nadadores ────────────────────────────────────────────────────────────────

describe('findSwimmerDuplicatePairs', () => {
  describe('casos reales de nombres', () => {
    it('detecta nombre y apellido invertidos', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Rodriguez', { birthDate: born(2008) }), sw('2', 'Rodriguez', 'Mateo', { birthDate: born(2008) })],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.reasons).toContain('nombre y apellido invertidos');
      expect(res[0]!.score).toBeGreaterThanOrEqual(0.85);
    });

    it('detecta apellido compuesto / segundo nombre ("Mateo Rodriguez Suar" vs "Mateo Suar")', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Rodriguez Suar'), sw('2', 'Mateo', 'Suar')],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.score).toBeGreaterThanOrEqual(DUPLICATE_MIN_SCORE);
      expect(res[0]!.reasons.join(' ')).toContain('incluye al otro');
    });

    it('detecta segundo nombre presente en uno solo ("Mateo" vs "Mateo Ignacio")', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { birthDate: born(2009) }), sw('2', 'Mateo Ignacio', 'Suar', { birthDate: born(2009) })],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.score).toBeGreaterThanOrEqual(0.8);
    });

    it('detecta apellidos en otro orden ("Rodriguez Suar" vs "Suar Rodriguez")', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Rodriguez Suar'), sw('2', 'Mateo', 'Suar Rodriguez')],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.score).toBeGreaterThanOrEqual(0.7);
    });

    it('ignora tildes, mayúsculas, ñ y espacios dobles', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', '  MATEO ', 'Rodríguez  Núñez'), sw('2', 'mateo', 'rodriguez nunez')],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.reasons).toContain('mismo nombre y apellido');
    });

    it('detecta inicial en lugar del nombre ("M. Rodriguez" vs "Mateo Rodriguez")', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'M.', 'Rodriguez', { birthDate: born(2008) }), sw('2', 'Mateo', 'Rodriguez', { birthDate: born(2008) })],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.reasons).toContain('coincide por inicial');
    });

    it('detecta error de tipeo de 1 letra en apellido (sustitución)', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Rodriguez'), sw('2', 'Mateo', 'Rodrigues')],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.reasons).toContain('posible error de tipeo');
    });

    it('detecta tipeo por letra faltante, sobrante y transposición', () => {
      const missing = findSwimmerDuplicatePairs([sw('1', 'Santiago', 'Gonzalez'), sw('2', 'Santiago', 'Gonzale')], 10);
      const extra = findSwimmerDuplicatePairs([sw('1', 'Santiago', 'Gonzalez'), sw('2', 'Santiago', 'Gonzalezz')], 10);
      const swap = findSwimmerDuplicatePairs([sw('1', 'Mateo', 'Suar'), sw('2', 'Maeto', 'Suar')], 10);
      expect(missing).toHaveLength(1);
      expect(extra).toHaveLength(1);
      expect(swap).toHaveLength(1);
    });

    it('detecta mismo DNI aunque el nombre esté muy distinto', () => {
      const res = findSwimmerDuplicatePairs(
        [
          sw('1', 'Mateo', 'Suar', { documentId: '45.123.456' }),
          sw('2', 'Matías', 'Suarez', { documentId: '45123456' }),
        ],
        10,
      );
      expect(res).toHaveLength(1);
      expect(res[0]!.reasons[0]).toBe('mismo DNI');
      expect(res[0]!.score).toBeGreaterThanOrEqual(0.95);
    });

    it('DNI distinto con el mismo nombre baja el score por debajo del umbral', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { documentId: '45123456' }), sw('2', 'Mateo', 'Suar', { documentId: '40999888' })],
        10,
      );
      expect(res).toHaveLength(0);
    });
  });

  describe('señales independientes', () => {
    it('nunca empareja géneros distintos', () => {
      const res = findSwimmerDuplicatePairs(
        [
          sw('1', 'Mateo', 'Suar', { gender: 'M', birthDate: born(2008), documentId: '45123456' }),
          sw('2', 'Mateo', 'Suar', { gender: 'F', birthDate: born(2008), documentId: '45123456' }),
        ],
        10,
      );
      expect(res).toHaveLength(0);
    });

    it('descarta como homónimos a quienes difieren más de 1 año', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { birthDate: born(2008) }), sw('2', 'Mateo', 'Suar', { birthDate: born(2012) })],
        10,
      );
      expect(res).toHaveLength(0);
    });

    it('±1 año se tolera y puntúa menos que el mismo año', () => {
      const same = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { birthDate: born(2008) }), sw('2', 'Mateo', 'Suar', { birthDate: born(2008) })],
        10,
      );
      const adj = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { birthDate: born(2008) }), sw('2', 'Mateo', 'Suar', { birthDate: born(2009) })],
        10,
      );
      expect(adj).toHaveLength(1);
      expect(adj[0]!.score).toBeLessThan(same[0]!.score);
    });

    it('si falta la fecha de nacimiento no penaliza', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { birthDate: born(2008) }), sw('2', 'Mateo', 'Suar')],
        10,
      );
      expect(res).toHaveLength(1);
    });

    it('mismo club suma al score', () => {
      const without = findSwimmerDuplicatePairs([sw('1', 'Mateo', 'Suar'), sw('2', 'Mateo', 'Suar')], 10);
      const withClub = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { currentClub: CLUB_A }), sw('2', 'Mateo', 'Suar', { currentClub: CLUB_A })],
        10,
      );
      const otherClub = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { currentClub: CLUB_A }), sw('2', 'Mateo', 'Suar', { currentClub: CLUB_B })],
        10,
      );
      expect(withClub[0]!.score).toBeGreaterThan(without[0]!.score);
      expect(withClub[0]!.reasons).toContain('mismo club');
      // club distinto no descarta ni penaliza: los nadadores cambian de club
      expect(otherClub[0]!.score).toBe(without[0]!.score);
    });
  });

  describe('falsos positivos que NO deben aparecer', () => {
    it('mismo nombre de pila pero distinto apellido', () => {
      expect(findSwimmerDuplicatePairs([sw('1', 'Juan', 'Perez'), sw('2', 'Juan', 'Gomez')], 10)).toHaveLength(0);
    });

    it('mismo apellido pero distinto nombre (hermanos)', () => {
      expect(
        findSwimmerDuplicatePairs(
          [sw('1', 'Juan', 'Perez', { birthDate: born(2008) }), sw('2', 'Pedro', 'Perez', { birthDate: born(2008) })],
          10,
        ),
      ).toHaveLength(0);
    });

    it('nombres compuestos distintos con el mismo apellido', () => {
      expect(
        findSwimmerDuplicatePairs(
          [
            sw('1', 'Juan Carlos', 'Perez', { birthDate: born(2008), currentClub: CLUB_A }),
            sw('2', 'Juan Pablo', 'Perez', { birthDate: born(2008), currentClub: CLUB_A }),
          ],
          10,
        ),
      ).toHaveLength(0);
    });

    it('apellidos con letras iguales en las mismas posiciones pero no consecutivas (viejo sharesPrefix)', () => {
      // "garcia" vs "gomez": coinciden en posiciones sueltas, no son parecidos
      expect(
        findSwimmerDuplicatePairs([sw('1', 'Mateo', 'Garcia'), sw('2', 'Mateo', 'Gomez')], 10),
      ).toHaveLength(0);
      expect(
        findSwimmerDuplicatePairs([sw('1', 'Lucia', 'Romero'), sw('2', 'Lucia', 'Ramirez')], 10),
      ).toHaveLength(0);
    });

    it('nombres cortos que difieren en 1 letra no se toleran como tipeo ("Luca" vs "Lucas")', () => {
      expect(
        findSwimmerDuplicatePairs([sw('1', 'Luca', 'Rios'), sw('2', 'Lucas', 'Rios')], 10),
      ).toHaveLength(0);
    });
  });

  describe('forma de la salida', () => {
    it('cada par sale una sola vez y con a.id < b.id, sin importar el orden de entrada', () => {
      const data = [
        sw('9', 'Mateo', 'Suar', { birthDate: born(2008) }),
        sw('3', 'Mateo', 'Suar', { birthDate: born(2008) }),
        sw('5', 'Mateo', 'Suar', { birthDate: born(2008) }),
      ];
      const res = findSwimmerDuplicatePairs(data, 10);
      expect(pairIds(res)).toEqual(['3|5', '3|9', '5|9']);
      expect(findSwimmerDuplicatePairs([...data].reverse(), 10)).toEqual(res);
      for (const p of res) expect(p.a.id < p.b.id).toBe(true);
    });

    it('es determinista entre llamadas y no muta la entrada', () => {
      const data = [sw('2', 'Mateo', 'Suar'), sw('1', 'Mateo', 'Suar'), sw('3', 'Ana', 'Lopez')];
      const snapshot = data.map((d) => d.id);
      const r1 = findSwimmerDuplicatePairs(data, 10);
      const r2 = findSwimmerDuplicatePairs(data, 10);
      expect(r1).toEqual(r2);
      expect(data.map((d) => d.id)).toEqual(snapshot);
    });

    it('ordena por score descendente y respeta el límite', () => {
      const data = [
        sw('1', 'Mateo', 'Suar', { birthDate: born(2008), currentClub: CLUB_A }),
        sw('2', 'Mateo', 'Suar', { birthDate: born(2008), currentClub: CLUB_A }),
        sw('3', 'Ana', 'Lopez'),
        sw('4', 'Ana', 'Lopez', { birthDate: born(2008) }),
        sw('5', 'Maria', 'Lopez Sosa'),
        sw('6', 'Maria', 'Sosa'),
      ];
      const res = findSwimmerDuplicatePairs(data, 10);
      expect(res.length).toBe(3);
      for (let i = 1; i < res.length; i++) expect(res[i - 1]!.score).toBeGreaterThanOrEqual(res[i]!.score);
      expect(findSwimmerDuplicatePairs(data, 2)).toHaveLength(2);
      expect(findSwimmerDuplicatePairs(data, 0)).toEqual([]);
    });

    it('todos los scores están en [0,1] y >= umbral', () => {
      const res = findSwimmerDuplicatePairs(
        [sw('1', 'Mateo', 'Suar', { birthDate: born(2008), currentClub: CLUB_A, documentId: '45123456' }), sw('2', 'Mateo', 'Suar', { birthDate: born(2008), currentClub: CLUB_A, documentId: '45123456' })],
        10,
      );
      expect(res[0]!.score).toBeLessThanOrEqual(1);
      expect(res[0]!.score).toBeGreaterThanOrEqual(DUPLICATE_MIN_SCORE);
    });
  });

  describe('sin sesgo por orden alfabético (se quitó el corte temprano)', () => {
    it('un par de score alto al final del alfabeto entra en el top aunque haya muchos pares al principio', () => {
      const data: SwimmerLike[] = [];
      // 40 pares de score medio con apellidos "A..." (dos nombres de pila contenidos, sin otras señales)
      for (let i = 0; i < 40; i++) {
        const last = `Acosta${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`;
        data.push(sw(`a${i}-1`, 'Juan', last), sw(`a${i}-2`, 'Juan Ignacio', last));
      }
      // 1 par idéntico con todas las señales y apellido "Zapata" (último en el alfabeto)
      data.push(
        sw('z-1', 'Mateo', 'Zapata', { birthDate: born(2008), currentClub: CLUB_A }),
        sw('z-2', 'Mateo', 'Zapata', { birthDate: born(2008), currentClub: CLUB_A }),
      );
      const top = findSwimmerDuplicatePairs(data, 3);
      expect(top).toHaveLength(3);
      expect(top[0]!.a.id).toBe('z-1');
      expect(top[0]!.b.id).toBe('z-2');
    });

    it('el resultado no depende del orden en que vienen los nadadores', () => {
      const rand = mulberry32(7);
      const data: SwimmerLike[] = [];
      for (let i = 0; i < 300; i++) {
        data.push(sw(`s${String(i).padStart(4, '0')}`, syntheticWord(rand, 2), syntheticWord(rand, 3), { birthDate: born(2000 + Math.floor(rand() * 15)) }));
      }
      for (let i = 0; i < 20; i++) {
        const base = data[i * 7]!;
        data.push(sw(`d${String(i).padStart(4, '0')}`, base.firstName, base.lastName, { birthDate: base.birthDate }));
      }
      const shuffled = [...data].sort(() => rand() - 0.5);
      expect(findSwimmerDuplicatePairs(shuffled, 100)).toEqual(findSwimmerDuplicatePairs(data, 100));
    });
  });

  describe('rendimiento', () => {
    it('7.000 nadadores sintéticos se procesan en menos de 2 segundos y encuentran los duplicados plantados', () => {
      const rand = mulberry32(2026);
      const firstNames = Array.from({ length: 150 }, () => syntheticWord(rand, 2));
      const lastNames = Array.from({ length: 1500 }, () => syntheticWord(rand, 3));
      const clubs = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, name: `Club ${i}`, shortName: `C${i}` }));
      const pick = <U,>(arr: U[]): U => arr[Math.floor(rand() * arr.length)]!;

      const data: SwimmerLike[] = [];
      for (let i = 0; i < 7000; i++) {
        data.push(
          sw(`s${String(i).padStart(5, '0')}`, rand() < 0.4 ? pick(firstNames) : `${pick(firstNames)} ${pick(firstNames)}`, `${pick(lastNames)} ${pick(lastNames)}`, {
            gender: rand() < 0.5 ? 'M' : 'F',
            birthDate: born(1995 + Math.floor(rand() * 20), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
            currentClub: pick(clubs),
          }),
        );
      }
      // Duplicados plantados: invertido, apellido de menos, tipeo en el apellido
      const planted: Array<[string, string]> = [];
      for (let i = 0; i < 30; i++) {
        const base = data[100 + i * 50]!;
        const copyId = `p${String(i).padStart(3, '0')}`;
        const lastTokens = base.lastName.split(' ');
        let copy: SwimmerLike;
        if (i % 3 === 0) copy = sw(copyId, base.lastName, base.firstName, base);
        else if (i % 3 === 1) copy = sw(copyId, base.firstName, lastTokens[lastTokens.length - 1]!, base);
        else copy = sw(copyId, base.firstName, `${lastTokens[0]!.slice(0, -1)}x ${lastTokens[1]!}`, base);
        data.push(copy);
        planted.push([base.id, copyId]);
      }

      const t0 = Date.now();
      const res = findSwimmerDuplicatePairs(data, 5000);
      const elapsed = Date.now() - t0;

      // eslint-disable-next-line no-console
      console.log(`[perf] ${data.length} nadadores -> ${res.length} pares en ${elapsed} ms`);
      // Margen holgado: con todos los tests en paralelo la máquina se carga (aislado tarda ~1,3 s).
      // El O(n²) viejo tardaba minutos, así que 10 s igual lo detecta.
      expect(elapsed).toBeLessThan(10000);

      const found = new Set(pairIds(res));
      for (const [x, y] of planted) {
        const key = x < y ? `${x}|${y}` : `${y}|${x}`;
        expect(found.has(key)).toBe(true);
      }
    });
  });
});

// ── Clubes ───────────────────────────────────────────────────────────────────

describe('findClubDuplicatePairs', () => {
  it('"Club Atlético X" vs "X" es duplicado', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Club Atlético Tucumán', 'CAT'), club('2', 'Tucumán', 'TUC')],
      10,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.score).toBeGreaterThanOrEqual(DUPLICATE_MIN_SCORE);
  });

  it('nombre idéntico con tildes, mayúsculas y espacios dobles', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Club  Atlético   Tucumán', 'CAT'), club('2', 'CLUB ATLETICO TUCUMAN', 'CAT')],
      10,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.reasons).toContain('nombre idéntico');
    expect(res[0]!.score).toBeGreaterThanOrEqual(0.9);
  });

  it('sigla del uno igual al nombre del otro', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Atlético Concepción', 'ATC'), club('2', 'ATC', 'A')],
      10,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.reasons).toContain('sigla = nombre del otro');
  });

  it('sigla igual a las iniciales del nombre del otro ("CAT" vs "Club Atlético Tucumán")', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Club Atlético Tucumán', 'TUC'), club('2', 'CAT', 'C')],
      10,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.reasons.join(' ')).toContain('sigla');
  });

  it('misma sigla y misma localidad (como el comportamiento anterior)', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Natación Norte', 'NN'), club('2', 'Asoc. Norte Natatorio', 'NN')],
      10,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.reasons).toContain('misma sigla');
  });

  it('tolera un error de tipeo en el nombre', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Club Atlético Tucumán', 'CAT'), club('2', 'Club Atlético Tucuman', 'CAT'), club('3', 'Tukuman', 'TUK')],
      10,
    );
    expect(pairIds(res)).toContain('1|3');
  });

  it('mismo nombre con distinta localidad: queda con menor confianza que con la misma localidad', () => {
    const sameLoc = findClubDuplicatePairs(
      [club('1', 'Club Social Deportivo Amigos', 'AMI', 'Concepción'), club('2', 'Club Social Deportivo Amigos', 'AMI', 'Concepción')],
      10,
    );
    const diffLoc = findClubDuplicatePairs(
      [club('1', 'Club Social Deportivo Amigos', 'AMI', 'Concepción'), club('2', 'Club Social Deportivo Amigos', 'AMI', 'Tafí Viejo')],
      10,
    );
    expect(sameLoc).toHaveLength(1);
    expect(diffLoc).toHaveLength(1);
    expect(diffLoc[0]!.score).toBeLessThan(sameLoc[0]!.score);
    expect(diffLoc[0]!.reasons).toContain('distinta localidad');
  });

  it('un mismo nombre sin ninguna otra señal y con distinta localidad por más de lo genérico no sale con score alto', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Tucumán', 'T1', 'Concepción'), club('2', 'Tucumán Rugby', 'T2', 'Yerba Buena')],
      10,
    );
    expect(res).toHaveLength(0);
  });

  it('NO empareja clubes distintos solo porque empiecen igual ("Club Atlético ...")', () => {
    const res = findClubDuplicatePairs(
      [
        club('1', 'Club Atlético Concepción', 'CAC'),
        club('2', 'Club Atlético Tucumán', 'CAT'),
        club('3', 'Club Atlético Lules', 'CAL'),
        club('4', 'Club Atlético San Martín', 'CASM'),
      ],
      10,
    );
    expect(res).toHaveLength(0);
  });

  it('un nombre incluido en el otro (2+ palabras) con misma localidad es candidato', () => {
    const res = findClubDuplicatePairs(
      [club('1', 'Club Atlético San Martín de Tucumán', 'CASM'), club('2', 'San Martín', 'SM')],
      10,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.reasons).toContain('un nombre incluye al otro');
  });

  it('cada par sale una vez, a.id < b.id, determinista y sin importar el orden de entrada', () => {
    const data = [
      club('c', 'Club Atlético Tucumán', 'CAT'),
      club('a', 'Tucumán', 'TUC'),
      club('b', 'CLUB ATLETICO TUCUMAN', 'CAT'),
    ];
    const res = findClubDuplicatePairs(data, 10);
    expect(pairIds(res)).toEqual(expect.arrayContaining(['a|b', 'a|c', 'b|c']));
    expect(new Set(pairIds(res)).size).toBe(res.length);
    expect(findClubDuplicatePairs([...data].reverse(), 10)).toEqual(res);
  });

  it('sin sesgo alfabético: el mejor par del final entra en el top', () => {
    const data: ClubLike[] = [];
    for (let i = 0; i < 30; i++) {
      const n = `Alfa${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}Beta`;
      data.push(club(`a${i}-1`, `Club Atlético San ${n}`, `S${i}A`, 'Concepción'), club(`a${i}-2`, `San ${n}`, `S${i}B`, 'Tafí Viejo'));
    }
    data.push(club('z-1', 'Zeta Natación', 'ZET'), club('z-2', 'ZETA NATACIÓN', 'ZET'));
    const top = findClubDuplicatePairs(data, 1);
    expect(top[0]!.a.id).toBe('z-1');
    expect(top[0]!.b.id).toBe('z-2');
  });

  it('rendimiento: 2.000 clubes sintéticos en menos de 2 segundos (la base real tiene ~470)', () => {
    const rand = mulberry32(99);
    const data: ClubLike[] = [];
    for (let i = 0; i < 2000; i++) {
      data.push(club(`c${String(i).padStart(4, '0')}`, `Club ${syntheticWord(rand, 3)} ${syntheticWord(rand, 2)}`, syntheticWord(rand, 1).toUpperCase() + i, 'Tucumán'));
    }
    const t0 = Date.now();
    findClubDuplicatePairs(data, 100);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
