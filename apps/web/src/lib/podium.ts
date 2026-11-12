/**
 * Podio de una prueba para una categoría, a partir de los resultados del torneo.
 *
 * Reglas:
 *  - Solo cuentan resultados HOMOLOGADOS, en estado OK y con tiempo: un podio que
 *    se difunde no puede cambiar después.
 *  - Se arma por la categoría congelada del resultado (como se premia).
 *  - Se ordena por tiempo (milisegundos enteros). Empate = mismo tiempo: comparten
 *    puesto y el siguiente se saltea (1°, 1°, 3°), como en una competencia.
 *  - Entran todos los que quedan en los puestos 1 a 3 (con empates pueden ser más de 3).
 */

export interface PodiumSourceResult {
  finalTime: number | null;
  status: string;
  homologated: boolean;
  swimmer: { firstName: string; lastName: string };
  club: { name: string; shortName: string };
  category: { id: string; name: string };
}

export interface PodiumEntry {
  place: 1 | 2 | 3;
  swimmerName: string;
  clubName: string;
  timeMs: number;
}

export function buildPodium(results: PodiumSourceResult[], categoryId: string): PodiumEntry[] {
  const valid = results
    .filter(
      (r): r is PodiumSourceResult & { finalTime: number } =>
        r.category.id === categoryId && r.homologated && r.status === 'OK' && r.finalTime !== null,
    )
    .sort((a, b) => a.finalTime - b.finalTime);

  const podium: PodiumEntry[] = [];
  let place = 0;
  let previousTime: number | null = null;
  valid.forEach((r, index) => {
    if (r.finalTime !== previousTime) place = index + 1;
    previousTime = r.finalTime;
    if (place === 1 || place === 2 || place === 3) {
      podium.push({
        place,
        swimmerName: `${r.swimmer.firstName} ${r.swimmer.lastName}`.trim(),
        clubName: r.club.name,
        timeMs: r.finalTime,
      });
    }
  });
  return podium;
}

/** true si el podio es el clásico de tres escalones, sin empates ni lugares vacíos. */
export function isClassicPodium(podium: PodiumEntry[]): boolean {
  return podium.length === 3 && podium[0]?.place === 1 && podium[1]?.place === 2 && podium[2]?.place === 3;
}
