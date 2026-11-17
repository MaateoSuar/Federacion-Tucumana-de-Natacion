/** Minúsculas, sin acentos y sin puntuación: "Pérez, José" → "perez jose". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokensOf(query: string): string[] {
  return normalizeSearchText(query).split(' ').filter(Boolean);
}

// Búsqueda tolerante: cada palabra escrita debe aparecer en algún lugar del
// texto, sin importar el orden ni los acentos — así "200 comb" encuentra
// "200 m Combinado" y "emiliano la marca" encuentra "LA MARCA, Emiliano".
export function matchesFuzzySearch(text: string, query: string): boolean {
  const haystack = normalizeSearchText(text);
  const tokens = tokensOf(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}

export interface PruebaSearchResult {
  /** La prueba se muestra (siempre completa: el buscador nunca recorta la tabla). */
  visible: boolean;
  /** Por cada fila, en el mismo orden recibido: true si hay que resaltarla. */
  highlighted: boolean[];
}

/**
 * Buscador de resultados: decide QUÉ pruebas se muestran y qué filas se resaltan.
 * Nunca quita filas de una prueba: una prueba visible se ve entera, con los puestos reales.
 *
 *  - Sin texto: todo visible, nada resaltado.
 *  - Una fila se resalta si todas las palabras aparecen entre el nombre de la prueba y
 *    la fila (nadador o club), y al menos una está en la fila. Así sirven "la marca",
 *    "marca emiliano", un club, o "perez 100 libre".
 *  - La prueba se muestra si su nombre coincide con todo el texto o si tiene alguna fila resaltada.
 */
export function searchPrueba(pruebaText: string, rowTexts: string[], query: string): PruebaSearchResult {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return { visible: true, highlighted: rowTexts.map(() => false) };

  const prueba = normalizeSearchText(pruebaText);
  const pruebaHit = tokens.every((t) => prueba.includes(t));
  const highlighted = rowTexts.map((raw) => {
    const row = normalizeSearchText(raw);
    return tokens.some((t) => row.includes(t)) && tokens.every((t) => row.includes(t) || prueba.includes(t));
  });
  return { visible: pruebaHit || highlighted.some(Boolean), highlighted };
}
