// Búsqueda tolerante: cada palabra escrita debe aparecer en algún lugar del
// texto, sin importar el orden — así "200 comb" encuentra "200 m Combinado".
export function matchesFuzzySearch(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}
