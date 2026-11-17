import type { MatchResultsPayload } from '../matching/types';

/** Una identidad dudosa que la carga masiva NO resolvió: queda en la lista de un Admin. */
export interface PendingIdentity {
  file: string;
  kind: 'nadador' | 'club';
  /** Nombre tal como figura en el archivo. */
  name: string;
  matchedBy: string;
  confidence: string;
  candidates: Array<{ id: string; displayName: string; score: number; reasons: string[] }>;
  /** Qué se hizo para que la carga no se frene. */
  appliedDecision: 'new';
}

/**
 * Política conservadora para la carga masiva. El commit exige una decisión para todo match de
 * confianza intermedia; la carga no puede elegir un candidato (vincular mal contamina la historia
 * de otra persona sin que nadie lo note). Entonces:
 *  - confianza 'none' -> el matcher ya dijo que es nuevo: no hay nada que decidir.
 *  - confianza seguridad alta (strong/high) -> se respeta el vínculo del matcher.
 *  - cualquier otro match que pida confirmación -> se marca como NUEVO (no se vincula a nadie) con
 *    el usuario de sistema como autor y queda en la lista de pendientes con sus candidatos.
 *    Un duplicado se puede unir después; un vínculo equivocado es mucho más difícil de detectar.
 *
 * Muta `matchResults` (agrega `resolution`) y devuelve la lista de pendientes.
 */
export function applyConservativePolicy(
  matchResults: MatchResultsPayload,
  file: string,
  systemUserId: string,
  decidedAt: string,
): PendingIdentity[] {
  const pending: PendingIdentity[] = [];

  for (const m of matchResults.swimmers) {
    if (!m.requiresConfirmation || m.resolution) continue;
    m.resolution = { decision: 'new', decidedBy: systemUserId, decidedAt };
    pending.push({
      file,
      kind: 'nadador',
      name: m.displayName,
      matchedBy: m.matchedBy,
      confidence: m.confidence,
      candidates: (m.candidates ?? []).map((c) => ({
        id: c.swimmerId,
        displayName: `${c.displayName}${c.clubName ? ` (${c.clubName})` : ''}${c.birthYear ? ` ${c.birthYear}` : ''}`,
        score: c.score,
        reasons: c.reasons,
      })),
      appliedDecision: 'new',
    });
  }

  for (const m of matchResults.clubs) {
    if (!m.requiresConfirmation || m.resolution) continue;
    m.resolution = { decision: 'new', decidedBy: systemUserId, decidedAt };
    pending.push({
      file,
      kind: 'club',
      name: m.displayName,
      matchedBy: m.matchedBy,
      confidence: m.confidence,
      candidates: (m.candidates ?? []).map((c) => ({
        id: c.clubId,
        displayName: c.displayName,
        score: c.score,
        reasons: c.reasons,
      })),
      appliedDecision: 'new',
    });
  }

  return pending;
}
