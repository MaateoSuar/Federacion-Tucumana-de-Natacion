import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeText } from '../../import/matching/fuzzy';
import { findClubDuplicatePairs } from './duplicate-detection';
import { MERGE_TX_OPTIONS, indexByKey, translateMergeError } from './merge-helpers';

export interface DuplicateClubCandidate {
  id: string;
  name: string;
  shortName: string;
  locality: string;
  province: string | null;
  swimmerCount: number;
}

export interface DuplicateClubPair {
  a: DuplicateClubCandidate;
  b: DuplicateClubCandidate;
  score: number;
  reasons: string[];
}

export interface ClubMergeSummary {
  id: string;
  name: string;
  shortName: string;
  locality: string;
  province: string | null;
}

/** Qué pasaría al unificar, sin tocar nada. */
export interface ClubMergePreview {
  canonical: ClubMergeSummary;
  duplicate: ClubMergeSummary;
  willMove: Record<string, number>;
  blockers: string[];
  warnings: string[];
}

export interface ClubMergeResult {
  merged: true;
  canonicalId: string;
  duplicateId: string;
  moved: Record<string, number>;
}

type Tx = Prisma.TransactionClient;

const SUMMARY_SELECT = {
  id: true,
  name: true,
  shortName: true,
  locality: true,
  province: true,
  logoUrl: true,
  foundedYear: true,
  contactEmail: true,
  _count: {
    select: {
      swimmers: true,
      frozenResults: true,
      frozenRegistrations: true,
      records: true,
      clubHistory: true,
      users: true,
      coaches: true,
      tournaments: true,
      affiliations: true,
      aliases: true,
      externalIdMaps: true,
    },
  },
} satisfies Prisma.ClubSelect;

type ClubWithCounts = Prisma.ClubGetPayload<{ select: typeof SUMMARY_SELECT }>;

@Injectable()
export class ClubMergeService {
  constructor(private readonly prisma: PrismaService) {}

  async findDuplicates(limit = 50): Promise<DuplicateClubPair[]> {
    const clubs = await this.prisma.club.findMany({
      select: {
        id: true,
        name: true,
        shortName: true,
        locality: true,
        province: true,
        _count: { select: { swimmers: true } },
      },
    });
    return findClubDuplicatePairs(clubs, limit).map(({ a, b, score, reasons }) => ({
      a: toCandidate(a),
      b: toCandidate(b),
      score,
      reasons,
    }));
  }

  /** Vista previa de la unificación: qué se mueve, qué la impide y qué conviene revisar. */
  async preview(canonicalId: string, duplicateId: string): Promise<ClubMergePreview> {
    const { canonical, duplicate, blockers, warnings } = await this.inspect(this.prisma, canonicalId, duplicateId);
    const c = duplicate._count;
    return {
      canonical: toSummary(canonical),
      duplicate: toSummary(duplicate),
      willMove: {
        swimmers: c.swimmers,
        results: c.frozenResults,
        registrations: c.frozenRegistrations,
        records: c.records,
        clubHistory: c.clubHistory,
        users: c.users,
        coaches: c.coaches,
        tournamentsHosted: c.tournaments,
        affiliations: c.affiliations,
        aliases: c.aliases,
        externalIds: c.externalIdMaps,
      },
      blockers,
      warnings,
    };
  }

  /** Fusiona `duplicateId` dentro de `canonicalId`. Es todo o nada: si algo falla, no se cambia nada. */
  async merge(canonicalId: string, duplicateId: string, adminUserId: string, acknowledgeWarnings = false): Promise<ClubMergeResult> {
    try {
      return await this.prisma.$transaction((tx) => this.mergeInTransaction(tx, canonicalId, duplicateId, adminUserId, acknowledgeWarnings), MERGE_TX_OPTIONS);
    } catch (error) {
      return translateMergeError(error, 'club');
    }
  }

  private async inspect(db: Tx | PrismaService, canonicalId: string, duplicateId: string) {
    if (canonicalId === duplicateId) {
      throw new BadRequestException('El club principal y el duplicado no pueden ser el mismo.');
    }
    const canonical = await db.club.findUnique({ where: { id: canonicalId }, select: SUMMARY_SELECT });
    const duplicate = await db.club.findUnique({ where: { id: duplicateId }, select: SUMMARY_SELECT });
    if (!canonical) throw new NotFoundException('El club principal ya no existe (¿ya fue unificado?). Actualizá la lista.');
    if (!duplicate) throw new NotFoundException('El club duplicado ya no existe (¿ya fue unificado?). Actualizá la lista.');

    const blockers: string[] = [];
    const warnings: string[] = [];

    // La provincia decide qué récords puede batir el club (tucumano / NOA): si difieren,
    // los resultados del duplicado cambian de ámbito al pasar al principal.
    if (canonical.province && duplicate.province && canonical.province !== duplicate.province) {
      warnings.push(
        `Las provincias son distintas (${canonical.province} y ${duplicate.province}): los resultados del duplicado quedarán con la provincia del principal, lo que puede afectar récords tucumanos o del NOA.`,
      );
    }
    if (canonical._count.swimmers === 0 && duplicate._count.swimmers > 0) {
      warnings.push('El club principal no tiene nadadores y el duplicado sí: ¿no será al revés?');
    }
    if (canonical.locality && duplicate.locality && normalizeText(canonical.locality) !== normalizeText(duplicate.locality)) {
      warnings.push('Las localidades son distintas: confirmá que es el mismo club.');
    }

    return { canonical, duplicate, blockers, warnings };
  }

  private async mergeInTransaction(
    tx: Tx,
    canonicalId: string,
    duplicateId: string,
    adminUserId: string,
    acknowledgeWarnings: boolean,
  ): Promise<ClubMergeResult> {
    await tx.$queryRaw`SELECT id FROM clubs WHERE id IN (${canonicalId}, ${duplicateId}) ORDER BY id FOR UPDATE`;
    const { canonical, duplicate, blockers, warnings } = await this.inspect(tx, canonicalId, duplicateId);
    if (blockers.length > 0) throw new BadRequestException(blockers[0]);
    if (warnings.length > 0 && !acknowledgeWarnings) {
      throw new BadRequestException(`Hay advertencias que hay que confirmar antes de unificar: ${warnings.join(' ')}`);
    }
    // Para la auditoría: qué usuarios y roles cambian de club (ganan alcance sobre el club principal)
    const affectedUsers = (await tx.user.findMany({ where: { clubId: duplicateId }, select: { id: true } })).map((u) => u.id);
    const affectedRoles = (await tx.userRoleAssignment.findMany({ where: { clubId: duplicateId }, select: { id: true } })).map((r) => r.id);
    const duplicateSnapshot = await tx.club.findUnique({ where: { id: duplicateId } });

    const aliasNorm = normalizeText(duplicate.name);
    const shortAliasNorm = normalizeText(duplicate.shortName);
    const moved: Record<string, number> = {};
    const reassign = { where: { clubId: duplicateId }, data: { clubId: canonicalId } } as const;

    // Todo lo que apunta al club por su id. Los resultados e inscripciones llevan el club
    // congelado: unificar corrige la identidad del club (es el mismo), no reescribe la historia.
    moved.swimmers = (await tx.swimmer.updateMany({ where: { currentClubId: duplicateId }, data: { currentClubId: canonicalId } })).count;
    moved.clubHistory = (await tx.swimmerClubHistory.updateMany(reassign)).count;
    moved.results = (await tx.result.updateMany(reassign)).count;
    moved.registrations = (await tx.registration.updateMany(reassign)).count;
    moved.records = (await tx.record.updateMany(reassign)).count;
    moved.rankings = (await tx.ranking.updateMany(reassign)).count; // sin FK, pero guarda el club congelado
    moved.externalIds = (await tx.externalIdMap.updateMany(reassign)).count;
    moved.coaches = (await tx.coach.updateMany(reassign)).count;
    moved.users = (await tx.user.updateMany(reassign)).count;
    moved.tournamentsHosted = (await tx.tournament.updateMany({ where: { hostClubId: duplicateId }, data: { hostClubId: canonicalId } })).count;
    moved.scopedRoles = await this.mergeScopedRoles(tx, canonicalId, duplicateId);
    moved.aliases = await this.mergeAliases(tx, canonicalId, duplicateId, [aliasNorm, shortAliasNorm]);
    moved.affiliations = await this.mergeAffiliations(tx, canonicalId, duplicateId);

    // Red de seguridad: users.club_id se pone en NULL en silencio al borrar el club
    if ((await tx.user.count({ where: { clubId: duplicateId } })) > 0) {
      throw new BadRequestException('Mientras se unificaba, un usuario fue asignado al club duplicado. No se cambió nada: volvé a intentar.');
    }

    await tx.club.delete({ where: { id: duplicateId } });

    // Datos que el principal no tenía y el duplicado sí (no se pisa nada existente)
    const inherited: Prisma.ClubUpdateInput = {
      ...(canonical.province === null && duplicate.province !== null ? { province: duplicate.province } : {}),
      ...(canonical.logoUrl === null && duplicate.logoUrl !== null ? { logoUrl: duplicate.logoUrl } : {}),
      ...(canonical.foundedYear === null && duplicate.foundedYear !== null ? { foundedYear: duplicate.foundedYear } : {}),
      ...(canonical.contactEmail === null && duplicate.contactEmail !== null ? { contactEmail: duplicate.contactEmail } : {}),
    };
    if (Object.keys(inherited).length > 0) await tx.club.update({ where: { id: canonicalId }, data: inherited });

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'CLUB_MERGED',
        entityType: 'club',
        entityId: canonicalId,
        payload: {
          duplicateId,
          duplicateName: duplicate.name,
          duplicateShortName: duplicate.shortName,
          aliasNorm,
          moved,
          inheritedFields: Object.keys(inherited),
          warningsAcknowledged: warnings,
          duplicateSnapshot: JSON.parse(JSON.stringify(duplicateSnapshot)) as Prisma.InputJsonValue,
          movedUserIds: affectedUsers,
          movedRoleAssignmentIds: affectedRoles,
        },
      },
    });

    await tx.auditLog.create({
      data: { userId: adminUserId, action: 'CLUB_MERGED_INTO', entityType: 'club', entityId: duplicateId, payload: { canonicalId, duplicateName: duplicate.name } },
    });

    return { merged: true, canonicalId, duplicateId, moved };
  }

  /** Roles acotados al club: único por (usuario, rol, club). Si chocan, queda el del principal. */
  private async mergeScopedRoles(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const canonical = await tx.userRoleAssignment.findMany({ where: { clubId: canonicalId }, select: { userId: true, roleId: true } });
    const existing = new Set(canonical.map((r) => `${r.userId}|${r.roleId}`));
    const dup = await tx.userRoleAssignment.findMany({ where: { clubId: duplicateId }, select: { id: true, userId: true, roleId: true } });
    const toDrop = dup.filter((r) => existing.has(`${r.userId}|${r.roleId}`)).map((r) => r.id);
    if (toDrop.length > 0) await tx.userRoleAssignment.deleteMany({ where: { id: { in: toDrop } } });
    return (await tx.userRoleAssignment.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } })).count;
  }

  /** Alias: los del duplicado que el principal ya tiene se descartan; el nombre y la sigla del duplicado quedan como alias. */
  private async mergeAliases(tx: Tx, canonicalId: string, duplicateId: string, extraAliases: string[]): Promise<number> {
    const canonical = new Set((await tx.clubAlias.findMany({ where: { clubId: canonicalId }, select: { aliasNormalized: true } })).map((a) => a.aliasNormalized));
    const dup = await tx.clubAlias.findMany({ where: { clubId: duplicateId }, select: { id: true, aliasNormalized: true } });
    const toDrop = dup.filter((a) => canonical.has(a.aliasNormalized)).map((a) => a.id);
    if (toDrop.length > 0) await tx.clubAlias.deleteMany({ where: { id: { in: toDrop } } });
    const moved = (await tx.clubAlias.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } })).count;

    for (const aliasNormalized of new Set(extraAliases.filter((a) => a.length > 0))) {
      await tx.clubAlias.upsert({
        where: { clubId_aliasNormalized: { clubId: canonicalId, aliasNormalized } },
        create: { clubId: canonicalId, aliasNormalized, source: 'merge' },
        update: {},
      });
    }
    return moved;
  }

  /** Afiliaciones: una por (club, temporada). Si chocan queda la vigente; si ninguna lo es, la del principal. */
  private async mergeAffiliations(tx: Tx, canonicalId: string, duplicateId: string): Promise<number> {
    const canonical = await tx.affiliation.findMany({ where: { clubId: canonicalId } });
    const bySeason = indexByKey(canonical, (a) => a.seasonId);
    const dup = await tx.affiliation.findMany({ where: { clubId: duplicateId } });
    let moved = 0;
    for (const aff of dup) {
      const existing = bySeason.get(aff.seasonId);
      if (!existing) {
        await tx.affiliation.update({ where: { id: aff.id }, data: { clubId: canonicalId } });
        moved++;
      } else {
        if (existing.status !== 'vigente' && aff.status === 'vigente') {
          await tx.affiliation.update({ where: { id: existing.id }, data: { status: 'vigente', paidAt: aff.paidAt ?? existing.paidAt } });
        }
        await tx.affiliation.delete({ where: { id: aff.id } });
      }
    }
    return moved;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ClubRow = {
  id: string; name: string; shortName: string; locality: string; province: string | null;
  _count: { swimmers: number };
};

function toCandidate(c: ClubRow): DuplicateClubCandidate {
  return {
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    locality: c.locality,
    province: c.province,
    swimmerCount: c._count.swimmers,
  };
}

function toSummary(c: ClubWithCounts): ClubMergeSummary {
  return { id: c.id, name: c.name, shortName: c.shortName, locality: c.locality, province: c.province };
}
