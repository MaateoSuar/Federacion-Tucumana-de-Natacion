import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeText } from '../../import/matching/fuzzy';
import { findSwimmerDuplicatePairs } from './duplicate-detection';
import { MERGE_TX_OPTIONS, indexByKey, translateMergeError } from './merge-helpers';

export interface DuplicateSwimmerCandidate {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  birthDate: string | null;
  currentClub: { id: string; name: string; shortName: string } | null;
  resultCount: number;
  score: number;
  reasons: string[];
}

export interface DuplicatePair {
  a: DuplicateSwimmerCandidate;
  b: DuplicateSwimmerCandidate;
  score: number;
  reasons: string[];
}

export interface SwimmerMergeSummary {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  birthDate: string | null;
  documentId: string | null;
  hasAccount: boolean;
  currentClub: { id: string; name: string; shortName: string } | null;
}

/** Qué pasaría al unificar, sin tocar nada: lo muestra la pantalla antes de confirmar. */
export interface SwimmerMergePreview {
  canonical: SwimmerMergeSummary;
  duplicate: SwimmerMergeSummary;
  /** Cantidad de datos del duplicado que pasan al principal. */
  willMove: Record<string, number>;
  /** Motivos que impiden unificar. Si hay alguno, el botón de confirmar no debe habilitarse. */
  blockers: string[];
  /** Cosas raras que el administrador debería mirar antes de confirmar. */
  warnings: string[];
}

export interface SwimmerMergeResult {
  merged: true;
  canonicalId: string;
  duplicateId: string;
  moved: Record<string, number>;
}

type Tx = Prisma.TransactionClient;

const SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  gender: true,
  birthDate: true,
  documentId: true,
  currentClubId: true,
  photoUrl: true,
  currentClub: { select: { id: true, name: true, shortName: true } },
  user: { select: { id: true } },
  _count: {
    select: {
      results: true,
      registrations: true,
      personalBests: true,
      records: true,
      rankings: true,
      rankingHistory: true,
      clubHistory: true,
      statistics: true,
      achievements: true,
      aliases: true,
      linkRequests: true,
      externalIdMaps: true,
    },
  },
} satisfies Prisma.SwimmerSelect;

type SwimmerWithCounts = Prisma.SwimmerGetPayload<{ select: typeof SUMMARY_SELECT }>;

@Injectable()
export class SwimmerMergeService {
  constructor(private readonly prisma: PrismaService) {}

  async findDuplicates(limit = 50): Promise<DuplicatePair[]> {
    const swimmers = await this.prisma.swimmer.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        birthDate: true,
        documentId: true,
        currentClub: { select: { id: true, name: true, shortName: true } },
        _count: { select: { results: true } },
      },
    });
    // La comparación vive en duplicate-detection.ts (indexada, sin O(n²) ni sesgo por orden)
    return findSwimmerDuplicatePairs(swimmers, limit).map(({ a, b, score, reasons }) => ({
      a: toCandidate(a),
      b: toCandidate(b),
      score,
      reasons,
    }));
  }

  /** Vista previa de la unificación: qué se mueve, qué la impide y qué conviene revisar. */
  async preview(canonicalId: string, duplicateId: string): Promise<SwimmerMergePreview> {
    const { canonical, duplicate, blockers, warnings } = await this.inspect(this.prisma, canonicalId, duplicateId);
    const c = duplicate._count;
    return {
      canonical: toSummary(canonical),
      duplicate: toSummary(duplicate),
      willMove: {
        results: c.results,
        registrations: c.registrations,
        personalBests: c.personalBests,
        records: c.records,
        rankings: c.rankings,
        rankingHistory: c.rankingHistory,
        clubHistory: c.clubHistory,
        achievements: c.achievements,
        aliases: c.aliases,
        externalIds: c.externalIdMaps,
      },
      blockers,
      warnings,
    };
  }

  /**
   * Fusiona `duplicateId` dentro de `canonicalId`. Es todo o nada: si algo falla, no se
   * cambia nada. Cada dato del duplicado se mueve al principal o, si choca con uno equivalente
   * que el principal ya tenía, se resuelve (queda la mejor marca, la inscripción del principal…).
   */
  async merge(canonicalId: string, duplicateId: string, adminUserId: string, acknowledgeWarnings = false): Promise<SwimmerMergeResult> {
    try {
      return await this.prisma.$transaction((tx) => this.mergeInTransaction(tx, canonicalId, duplicateId, adminUserId, acknowledgeWarnings), MERGE_TX_OPTIONS);
    } catch (error) {
      return translateMergeError(error, 'nadador');
    }
  }

  // ── Validación común (merge y vista previa) ────────────────────────────────

  private async inspect(db: Tx | PrismaService, canonicalId: string, duplicateId: string) {
    if (canonicalId === duplicateId) {
      throw new BadRequestException('El nadador principal y el duplicado no pueden ser el mismo.');
    }
    const [canonical, duplicate] = [
      await db.swimmer.findUnique({ where: { id: canonicalId }, select: SUMMARY_SELECT }),
      await db.swimmer.findUnique({ where: { id: duplicateId }, select: SUMMARY_SELECT }),
    ];
    if (!canonical) throw new NotFoundException('El nadador principal ya no existe (¿ya fue unificado?). Actualizá la lista.');
    if (!duplicate) throw new NotFoundException('El nadador duplicado ya no existe (¿ya fue unificado?). Actualizá la lista.');

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (canonical.gender !== duplicate.gender) {
      blockers.push('No se puede unificar nadadores de distinto género.');
    }

    // Regla 6: una cuenta se vincula a un nadador SOLO por AccountLinkRequest aprobado.
    // Borrar un nadador con cuenta la desvincularía en silencio: el que tiene cuenta debe quedar.
    if (duplicate.user && canonical.user) {
      blockers.push('Los dos nadadores tienen una cuenta de usuario vinculada. Resolvé primero las vinculaciones y después unificá.');
    } else if (duplicate.user) {
      blockers.push('El nadador que se elimina tiene una cuenta de usuario vinculada. Unificá al revés: dejá como principal al que tiene la cuenta.');
    }

    if (canonical.birthDate && duplicate.birthDate && canonical.birthDate.getUTCFullYear() !== duplicate.birthDate.getUTCFullYear()) {
      warnings.push(
        `Años de nacimiento distintos (${canonical.birthDate.getUTCFullYear()} y ${duplicate.birthDate.getUTCFullYear()}): confirmá que es la misma persona.`,
      );
    }
    if (canonical.documentId && duplicate.documentId && canonical.documentId !== duplicate.documentId) {
      warnings.push('Tienen DNI distinto: confirmá que es la misma persona.');
    }
    if (canonical.currentClubId && duplicate.currentClubId && canonical.currentClubId !== duplicate.currentClubId) {
      warnings.push('Tienen clubes actuales distintos (los resultados conservan el club con el que compitió cada uno).');
    }
    if (canonical._count.results === 0 && duplicate._count.results > 0) {
      warnings.push('El principal no tiene resultados y el duplicado sí: ¿no será al revés?');
    }

    return { canonical, duplicate, blockers, warnings };
  }

  // ── Unificación ────────────────────────────────────────────────────────────

  private async mergeInTransaction(
    tx: Tx,
    canonicalId: string,
    duplicateId: string,
    adminUserId: string,
    acknowledgeWarnings: boolean,
  ): Promise<SwimmerMergeResult> {
    // Se bloquean las dos filas hasta el final: si en este momento otro administrador aprueba una
    // vinculación de cuenta sobre el duplicado, esperamos y la verificación de abajo la ve.
    await tx.$queryRaw`SELECT id FROM swimmers WHERE id IN (${canonicalId}, ${duplicateId}) ORDER BY id FOR UPDATE`;
    const { canonical, duplicate, blockers, warnings } = await this.inspect(tx, canonicalId, duplicateId);
    if (blockers.length > 0) throw new BadRequestException(blockers[0]);
    if (warnings.length > 0 && !acknowledgeWarnings) {
      throw new BadRequestException(`Hay advertencias que hay que confirmar antes de unificar: ${warnings.join(' ')}`);
    }

    const duplicateName = `${duplicate.firstName} ${duplicate.lastName}`;
    const moved: Record<string, number> = {};
    const movedIds = {
      results: (await tx.result.findMany({ where: { swimmerId: duplicateId }, select: { id: true } })).map((r) => r.id),
      records: (await tx.record.findMany({ where: { swimmerId: duplicateId }, select: { id: true } })).map((r) => r.id),
    };
    const duplicateSnapshot = await tx.swimmer.findUnique({ where: { id: duplicateId } });

    // Las marcas personales van antes que los resultados: así, al deduplicar un resultado,
    // ya no queda ninguna marca apuntando al que se descarta sin motivo.
    moved.personalBests = await this.mergePersonalBests(tx, canonicalId, duplicateId);
    moved.registrations = await this.mergeRegistrations(tx, canonicalId, duplicateId);
    const { discarded, ...resultCounts } = await this.mergeResults(tx, canonicalId, duplicateId);
    Object.assign(moved, resultCounts);
    moved.rankings = await this.mergeRankings(tx, canonicalId, duplicateId);
    moved.rankingHistory = await this.mergeRankingHistory(tx, canonicalId, duplicateId);

    moved.clubHistory = (await tx.swimmerClubHistory.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;

    // Récords: TODOS pasan al principal, también los homologados. Unificar corrige la identidad
    // del titular (es la misma persona): no cambia tiempo, estado, vigencia ni homologación.
    moved.records = (await tx.record.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;

    moved.externalIds = (await tx.externalIdMap.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;
    moved.aliases = await this.mergeAliases(tx, canonicalId, duplicateId, normalizeText(duplicateName));
    moved.linkRequests = await this.mergeLinkRequests(tx, canonicalId, duplicateId);
    moved.achievements = await this.mergeAchievements(tx, canonicalId, duplicateId);
    await this.mergeProfile(tx, canonicalId, duplicateId);
    moved.statistics = await this.mergeStatistics(tx, canonicalId, duplicateId);

    // Regla 6, red de seguridad: la FK users.swimmer_id borra el vínculo en silencio (SET NULL).
    if ((await tx.user.count({ where: { swimmerId: duplicateId } })) > 0) {
      throw new BadRequestException('Mientras se unificaba, al nadador duplicado le vincularon una cuenta. No se cambió nada: revisá las cuentas y volvé a intentar.');
    }

    // Eliminar el duplicado: ya no debe quedar nada apuntándole.
    await tx.swimmer.delete({ where: { id: duplicateId } });

    // Datos que el principal no tenía y el duplicado sí (no se pisa nada existente).
    // Va después de borrar el duplicado: el documento es único.
    const inherited: Prisma.SwimmerUpdateInput = {
      ...(canonical.birthDate === null && duplicate.birthDate !== null ? { birthDate: duplicate.birthDate } : {}),
      ...(canonical.documentId === null && duplicate.documentId !== null ? { documentId: duplicate.documentId } : {}),
      ...(canonical.photoUrl === null && duplicate.photoUrl !== null ? { photoUrl: duplicate.photoUrl } : {}),
      ...(canonical.currentClubId === null && duplicate.currentClubId !== null ? { currentClub: { connect: { id: duplicate.currentClubId } } } : {}),
    };
    if (Object.keys(inherited).length > 0) {
      await tx.swimmer.update({ where: { id: canonicalId }, data: inherited });
    }

    // Las estadísticas son derivadas: se recalculan con los resultados ya unificados.
    await this.recomputeStatistics(tx, canonicalId);

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'SWIMMER_MERGED',
        entityType: 'swimmer',
        entityId: canonicalId,
        payload: {
          duplicateId,
          duplicateName,
          aliasNorm: normalizeText(duplicateName),
          moved,
          inheritedFields: Object.keys(inherited),
          inherited: JSON.parse(JSON.stringify(inherited)) as Prisma.InputJsonValue,
          warningsAcknowledged: warnings,
          // Con esto se puede reconstruir qué era del duplicado
          duplicateSnapshot: JSON.parse(JSON.stringify(duplicateSnapshot)) as Prisma.InputJsonValue,
          movedIds,
          discardedResults: discarded,
        },
      },
    });
    // Segundo registro a nombre del duplicado: así se lo encuentra buscando por su id
    await tx.auditLog.create({
      data: { userId: adminUserId, action: 'SWIMMER_MERGED_INTO', entityType: 'swimmer', entityId: duplicateId, payload: { canonicalId, duplicateName } },
    });

    return { merged: true, canonicalId, duplicateId, moved };
  }

  /** Mejores marcas: una por (prueba, pileta). Si chocan, queda la mejor. */
  private async mergePersonalBests(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const [canonical, duplicate] = [
      await tx.personalBest.findMany({ where: { swimmerId: canonicalId } }),
      await tx.personalBest.findMany({ where: { swimmerId: duplicateId } }),
    ];
    const byKey = indexByKey(canonical, (pb) => `${pb.eventDefinitionId}|${pb.poolLength}`);
    const toDelete: string[] = [];
    const toMove: string[] = [];
    for (const pb of duplicate) {
      const existing = byKey.get(`${pb.eventDefinitionId}|${pb.poolLength}`);
      if (!existing) toMove.push(pb.id);
      else if (pb.bestTime < existing.bestTime) {
        toDelete.push(existing.id);
        toMove.push(pb.id);
      } else toDelete.push(pb.id);
    }
    if (toDelete.length > 0) await tx.personalBest.deleteMany({ where: { id: { in: toDelete } } });
    if (toMove.length > 0) await tx.personalBest.updateMany({ where: { id: { in: toMove } }, data: { swimmerId: canonicalId } });
    return toMove.length;
  }

  /** Inscripciones: una por (prueba, nadador). Si los dos estaban inscriptos en la misma prueba, queda la del principal. */
  private async mergeRegistrations(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const canonicalRegs = await tx.registration.findMany({ where: { swimmerId: canonicalId }, select: { id: true, eventId: true } });
    const dupRegs = await tx.registration.findMany({ where: { swimmerId: duplicateId }, select: { id: true, eventId: true } });
    const canonicalByEvent = indexByKey(canonicalRegs, (r) => r.eventId);
    const toDrop = dupRegs.filter((r) => canonicalByEvent.has(r.eventId));

    if (toDrop.length > 0) {
      // Las asignaciones de andarivel cuelgan de la inscripción: pasan a la del principal si esa
      // no tenía ninguna; si no, se descartan junto con la inscripción repetida.
      const dropIds = toDrop.map((r) => r.id);
      const lanes = await tx.laneAssignment.findMany({ where: { registrationId: { in: dropIds } }, select: { id: true, registrationId: true } });
      const canonicalWithLane = new Set(
        (await tx.laneAssignment.findMany({ where: { registrationId: { in: canonicalRegs.map((r) => r.id) } }, select: { registrationId: true } })).map(
          (l) => l.registrationId,
        ),
      );
      const eventOfDrop = new Map(toDrop.map((r) => [r.id, r.eventId]));
      const lanesToDelete: string[] = [];
      for (const lane of lanes) {
        const target = canonicalByEvent.get(eventOfDrop.get(lane.registrationId) ?? '');
        if (target && !canonicalWithLane.has(target.id)) {
          await tx.laneAssignment.update({ where: { id: lane.id }, data: { registrationId: target.id } });
          canonicalWithLane.add(target.id);
        } else {
          lanesToDelete.push(lane.id);
        }
      }
      if (lanesToDelete.length > 0) await tx.laneAssignment.deleteMany({ where: { id: { in: lanesToDelete } } });
      await tx.registration.deleteMany({ where: { id: { in: dropIds } } });
    }
    return (await tx.registration.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;
  }

  /**
   * Resultados: pasan al principal tal cual (categoría y club congelados no se tocan).
   * Si el duplicado tiene EXACTAMENTE la misma carrera que el principal (misma prueba, mismo
   * tiempo, mismo estado) es la misma carrera cargada dos veces con distinta grafía: se deja
   * una sola. Las marcas, récords y parciales que apuntaban a la repetida se reapuntan.
   * Si el reapunte chocaría con algo que el principal ya tiene, esa carrera se conserva
   * (mejor repetida que perder un récord).
   */
  private async mergeResults(
    tx: Tx,
    canonicalId: string,
    duplicateId: string,
  ): Promise<{ results: number; resultsDeduplicated: number; resultsKeptRepeated: number; discarded: Prisma.InputJsonValue[] }> {
    const raceKey = (r: { eventId: string; finalTime: number | null; status: string }) => `${r.eventId}|${r.finalTime ?? 'null'}|${r.status}`;
    const canonicalResults = await tx.result.findMany({ where: { swimmerId: canonicalId } });
    const dupResults = await tx.result.findMany({ where: { swimmerId: duplicateId } });
    const canonicalByRace = indexByKey(canonicalResults, raceKey);

    const candidates = dupResults.filter((r) => canonicalByRace.has(raceKey(r)));
    let deduplicated = 0;
    let keptRepeated = 0;
    const discarded: Prisma.InputJsonValue[] = [];

    if (candidates.length > 0) {
      const candidateIds = candidates.map((r) => r.id);
      const canonicalTargetIds = candidates.map((r) => canonicalByRace.get(raceKey(r))!.id);

      const [records, canonicalRecords, pbs, canonicalPbs, rankings, splits, canonicalSplits] = [
        await tx.record.findMany({ where: { sourceResultId: { in: candidateIds } }, select: { id: true, sourceResultId: true, scope: true, categoryId: true } }),
        await tx.record.findMany({ where: { sourceResultId: { in: canonicalTargetIds } }, select: { sourceResultId: true, scope: true, categoryId: true } }),
        await tx.personalBest.findMany({ where: { sourceResultId: { in: candidateIds } }, select: { id: true, sourceResultId: true } }),
        await tx.personalBest.findMany({ where: { sourceResultId: { in: canonicalTargetIds } }, select: { sourceResultId: true } }),
        await tx.ranking.findMany({ where: { sourceResultId: { in: candidateIds } }, select: { id: true, sourceResultId: true } }),
        await tx.split.findMany({ where: { resultId: { in: candidateIds } }, select: { id: true, resultId: true } }),
        await tx.split.findMany({ where: { resultId: { in: canonicalTargetIds } }, select: { resultId: true } }),
      ];

      const canonicalRecordKeys = new Set(canonicalRecords.map((r) => `${r.sourceResultId}|${r.scope}|${r.categoryId}`));
      const canonicalPbResults = new Set(canonicalPbs.map((p) => p.sourceResultId));
      const canonicalSplitResults = new Set(canonicalSplits.map((s) => s.resultId));

      for (const dup of candidates) {
        const target = canonicalByRace.get(raceKey(dup))!;
        const recordCollides = records.some((r) => r.sourceResultId === dup.id && canonicalRecordKeys.has(`${target.id}|${r.scope}|${r.categoryId}`));
        const pbCollides = pbs.some((p) => p.sourceResultId === dup.id) && canonicalPbResults.has(target.id);
        if (recordCollides || pbCollides) {
          keptRepeated++;
          continue;
        }

        // Reapuntar lo que colgaba del resultado repetido
        const dupRecords = records.filter((r) => r.sourceResultId === dup.id);
        if (dupRecords.length > 0) {
          await tx.record.updateMany({ where: { sourceResultId: dup.id }, data: { sourceResultId: target.id } });
          for (const r of dupRecords) canonicalRecordKeys.add(`${target.id}|${r.scope}|${r.categoryId}`);
        }
        if (pbs.some((p) => p.sourceResultId === dup.id)) {
          await tx.personalBest.updateMany({ where: { sourceResultId: dup.id }, data: { sourceResultId: target.id } });
          canonicalPbResults.add(target.id);
        }
        if (rankings.some((r) => r.sourceResultId === dup.id)) {
          await tx.ranking.updateMany({ where: { sourceResultId: dup.id }, data: { sourceResultId: target.id } });
        }
        if (splits.some((s) => s.resultId === dup.id)) {
          if (canonicalSplitResults.has(target.id)) await tx.split.deleteMany({ where: { resultId: dup.id } });
          else {
            await tx.split.updateMany({ where: { resultId: dup.id }, data: { resultId: target.id } });
            canonicalSplitResults.add(target.id);
          }
        }

        // Lo que el principal no tenía de ese resultado y el repetido sí (homologación, banderas)
        const carry: Prisma.ResultUpdateInput = {
          ...(dup.homologated && !target.homologated
            ? {
                homologated: true,
                homologatedAt: dup.homologatedAt,
                ...(dup.homologatedBy ? { homologator: { connect: { id: dup.homologatedBy } } } : {}),
              }
            : {}),
          ...(dup.isPb && !target.isPb ? { isPb: true } : {}),
          ...(dup.isRecord && !target.isRecord ? { isRecord: true } : {}),
          ...(dup.place !== null && target.place === null ? { place: dup.place } : {}),
          ...(dup.finaPoints !== null && target.finaPoints === null ? { finaPoints: dup.finaPoints } : {}),
          ...(dup.seedTime !== null && target.seedTime === null ? { seedTime: dup.seedTime } : {}),
        };
        if (Object.keys(carry).length > 0) await tx.result.update({ where: { id: target.id }, data: carry });

        // Queda constancia de lo que se descarta (es la misma carrera que `target`)
        discarded.push({
          id: dup.id, keptAs: target.id, eventId: dup.eventId, finalTime: dup.finalTime, status: dup.status, categoryId: dup.categoryId, clubId: dup.clubId,
          heatId: dup.heatId, lane: dup.lane, homologated: dup.homologated, carriedToKept: Object.keys(carry),
        });
        await tx.result.delete({ where: { id: dup.id } });
        deduplicated++;
      }
    }

    const moved = (await tx.result.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;
    return { results: moved, resultsDeduplicated: deduplicated, resultsKeptRepeated: keptRepeated, discarded };
  }

  /**
   * Rankings: uno por (prueba, pileta, ámbito, temporada, categoría). Si chocan queda el mejor
   * tiempo. Nunca se comparan piletas distintas: la pileta es parte de la clave. Si se descartó
   * alguna fila, las posiciones de ese ranking se renumeran.
   */
  private async mergeRankings(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const [canonical, duplicate] = [
      await tx.ranking.findMany({ where: { swimmerId: canonicalId } }),
      await tx.ranking.findMany({ where: { swimmerId: duplicateId } }),
    ];
    const keyOf = (r: (typeof canonical)[number]) => `${r.eventDefinitionId}|${r.poolLength}|${r.scope}|${r.seasonId ?? 'null'}|${r.categoryId}`;
    const byKey = indexByKey(canonical, keyOf);
    const toDelete: string[] = [];
    const toMove: string[] = [];
    const touched = new Map<string, (typeof canonical)[number]>();
    for (const rk of duplicate) {
      const existing = byKey.get(keyOf(rk));
      if (!existing) toMove.push(rk.id);
      else {
        touched.set(keyOf(rk), rk);
        if (rk.finalTime < existing.finalTime) {
          toDelete.push(existing.id);
          toMove.push(rk.id);
        } else toDelete.push(rk.id);
      }
    }
    if (toDelete.length > 0) await tx.ranking.deleteMany({ where: { id: { in: toDelete } } });
    if (toMove.length > 0) await tx.ranking.updateMany({ where: { id: { in: toMove } }, data: { swimmerId: canonicalId } });

    for (const rk of touched.values()) {
      const rows = await tx.ranking.findMany({
        where: {
          eventDefinitionId: rk.eventDefinitionId,
          poolLength: rk.poolLength,
          gender: rk.gender,
          scope: rk.scope,
          seasonId: rk.seasonId,
          categoryId: rk.categoryId,
        },
        orderBy: { finalTime: 'asc' },
        select: { id: true, position: true },
      });
      for (const [idx, row] of rows.entries()) {
        if (row.position !== idx + 1) await tx.ranking.update({ where: { id: row.id }, data: { position: idx + 1 } });
      }
    }
    return toMove.length;
  }

  /** Historial de posiciones por temporada: una fila por clave. Si chocan, queda la de mejor marca. */
  private async mergeRankingHistory(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const [canonical, duplicate] = [
      await tx.rankingHistory.findMany({ where: { swimmerId: canonicalId } }),
      await tx.rankingHistory.findMany({ where: { swimmerId: duplicateId } }),
    ];
    const keyOf = (r: (typeof canonical)[number]) => `${r.eventDefinitionId}|${r.categoryId}|${r.poolLength}|${r.scope}|${r.seasonId}`;
    const byKey = indexByKey(canonical, keyOf);
    const toDelete: string[] = [];
    const toMove: string[] = [];
    for (const rh of duplicate) {
      const existing = byKey.get(keyOf(rh));
      if (!existing) toMove.push(rh.id);
      else if (rh.bestTimeMs < existing.bestTimeMs) {
        toDelete.push(existing.id);
        toMove.push(rh.id);
      } else toDelete.push(rh.id);
    }
    if (toDelete.length > 0) await tx.rankingHistory.deleteMany({ where: { id: { in: toDelete } } });
    if (toMove.length > 0) await tx.rankingHistory.updateMany({ where: { id: { in: toMove } }, data: { swimmerId: canonicalId } });
    return toMove.length;
  }

  /** Alias: los que el principal ya tiene se descartan, el resto pasa; el nombre del duplicado queda como alias. */
  private async mergeAliases(tx: Tx, canonicalId: string, duplicateId: string, duplicateNameNorm: string): Promise<number> {
    const canonicalAliases = new Set(
      (await tx.swimmerAlias.findMany({ where: { swimmerId: canonicalId }, select: { aliasNormalized: true } })).map((a) => a.aliasNormalized),
    );
    const dupAliases = await tx.swimmerAlias.findMany({ where: { swimmerId: duplicateId }, select: { id: true, aliasNormalized: true } });
    const toDrop = dupAliases.filter((a) => canonicalAliases.has(a.aliasNormalized)).map((a) => a.id);
    if (toDrop.length > 0) await tx.swimmerAlias.deleteMany({ where: { id: { in: toDrop } } });
    const moved = (await tx.swimmerAlias.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;

    if (duplicateNameNorm) {
      await tx.swimmerAlias.upsert({
        where: { swimmerId_aliasNormalized: { swimmerId: canonicalId, aliasNormalized: duplicateNameNorm } },
        create: { swimmerId: canonicalId, aliasNormalized: duplicateNameNorm, source: 'merge' },
        update: {},
      });
    }
    return moved;
  }

  /**
   * Solicitudes de vinculación (historial): pasan al principal. Ninguna cuenta queda vinculada
   * por esto: el duplicado no tenía cuenta (se verificó antes). Hay un índice único parcial
   * (un nadador, una solicitud aprobada): si el principal ya tiene una aprobada, las aprobadas
   * del duplicado se archivan como canceladas.
   */
  private async mergeLinkRequests(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const canonicalApproved = await tx.accountLinkRequest.count({ where: { swimmerId: canonicalId, status: 'approved' } });
    if (canonicalApproved > 0) {
      await tx.accountLinkRequest.updateMany({
        where: { swimmerId: duplicateId, status: 'approved' },
        data: { status: 'cancelled', decisionReason: 'Nadador unificado con otro que ya tenía una vinculación aprobada' },
      });
    }
    return (await tx.accountLinkRequest.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;
  }

  /** Logros: pasan al principal; los idénticos a uno que ya tenía se descartan. */
  private async mergeAchievements(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const keyOf = (a: { type: string; medal: string | null; tournamentId: string | null; eventId: string | null; recordId: string | null; title: string }) =>
      [a.type, a.medal, a.tournamentId, a.eventId, a.recordId, a.title].join('|');
    const canonical = new Set((await tx.athleteAchievement.findMany({ where: { swimmerId: canonicalId } })).map(keyOf));
    const dup = await tx.athleteAchievement.findMany({ where: { swimmerId: duplicateId } });
    const toDrop = dup.filter((a) => canonical.has(keyOf(a))).map((a) => a.id);
    if (toDrop.length > 0) await tx.athleteAchievement.deleteMany({ where: { id: { in: toDrop } } });
    return (await tx.athleteAchievement.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;
  }

  /** Perfil: si el duplicado tiene y el principal no, se transfiere; si los dos tienen, se completan los vacíos. */
  private async mergeProfile(tx: Tx, canonicalId: string, duplicateId: string): Promise<void> {
    const dupProfile = await tx.athleteProfile.findUnique({ where: { swimmerId: duplicateId } });
    if (!dupProfile) return;
    const canonProfile = await tx.athleteProfile.findUnique({ where: { swimmerId: canonicalId } });
    if (!canonProfile) {
      await tx.athleteProfile.update({ where: { id: dupProfile.id }, data: { swimmerId: canonicalId } });
      return;
    }
    const fill: Prisma.AthleteProfileUpdateInput = {
      ...(canonProfile.bio === null && dupProfile.bio !== null ? { bio: dupProfile.bio } : {}),
      ...(canonProfile.photoUrl === null && dupProfile.photoUrl !== null ? { photoUrl: dupProfile.photoUrl } : {}),
      ...(canonProfile.socialLinks === null && dupProfile.socialLinks !== null ? { socialLinks: dupProfile.socialLinks as Prisma.InputJsonValue } : {}),
    };
    await tx.athleteProfile.delete({ where: { id: dupProfile.id } });
    if (Object.keys(fill).length > 0) await tx.athleteProfile.update({ where: { id: canonProfile.id }, data: fill });
  }

  /** Estadísticas: una fila por (nadador, temporada). Son derivadas: si chocan se descarta la del duplicado. */
  private async mergeStatistics(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const canonicalSeasons = new Set(
      (await tx.athleteStatistics.findMany({ where: { swimmerId: canonicalId }, select: { seasonId: true } })).map((s) => s.seasonId ?? 'null'),
    );
    const dup = await tx.athleteStatistics.findMany({ where: { swimmerId: duplicateId }, select: { id: true, seasonId: true } });
    const toDrop = dup.filter((s) => canonicalSeasons.has(s.seasonId ?? 'null')).map((s) => s.id);
    if (toDrop.length > 0) await tx.athleteStatistics.deleteMany({ where: { id: { in: toDrop } } });
    return (await tx.athleteStatistics.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;
  }

  /**
   * Recalcula las filas de estadísticas del principal con las mismas reglas del worker de
   * homologación (resultados homologados y OK): así los contadores reflejan lo unificado.
   */
  private async recomputeStatistics(tx: Tx, swimmerId: string): Promise<void> {
    const rows = await tx.athleteStatistics.findMany({ where: { swimmerId }, select: { id: true, seasonId: true } });
    if (rows.length === 0) return;
    const results = await tx.result.findMany({
      where: { swimmerId, homologated: true, status: 'OK' },
      select: { isPb: true, place: true, event: { select: { tournamentId: true, tournament: { select: { seasonId: true } } } } },
    });
    for (const row of rows) {
      const subset = row.seasonId ? results.filter((r) => r.event.tournament.seasonId === row.seasonId) : results;
      const gold = subset.filter((r) => r.place === 1).length;
      const silver = subset.filter((r) => r.place === 2).length;
      const bronze = subset.filter((r) => r.place === 3).length;
      await tx.athleteStatistics.update({
        where: { id: row.id },
        data: {
          totalEvents: subset.length,
          totalPbs: subset.filter((r) => r.isPb).length,
          totalCompetitions: new Set(subset.map((r) => r.event.tournamentId)).size,
          gold,
          silver,
          bronze,
          totalMedals: gold + silver + bronze,
          computedAt: new Date(),
        },
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type SwimmerRow = {
  id: string; firstName: string; lastName: string; gender: string;
  birthDate: Date | null;
  currentClub: { id: string; name: string; shortName: string } | null;
  _count: { results: number };
};

function toCandidate(s: SwimmerRow): DuplicateSwimmerCandidate {
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    birthDate: s.birthDate ? s.birthDate.toISOString().slice(0, 10) : null,
    currentClub: s.currentClub,
    resultCount: s._count.results,
    score: 0,
    reasons: [],
  };
}

function toSummary(s: SwimmerWithCounts): SwimmerMergeSummary {
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    birthDate: s.birthDate ? s.birthDate.toISOString().slice(0, 10) : null,
    documentId: s.documentId,
    hasAccount: s.user !== null,
    currentClub: s.currentClub,
  };
}
