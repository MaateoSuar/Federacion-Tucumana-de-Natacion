import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeText } from '../../import/matching/fuzzy';

export interface DuplicateClubCandidate {
  id: string;
  name: string;
  shortName: string;
  locality: string;
  swimmerCount: number;
}

export interface DuplicateClubPair {
  a: DuplicateClubCandidate;
  b: DuplicateClubCandidate;
  score: number;
  reasons: string[];
}

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
        _count: { select: { swimmers: true } },
      },
      orderBy: { name: 'asc' },
    });

    const pairs: DuplicateClubPair[] = [];

    for (let i = 0; i < clubs.length; i++) {
      for (let j = i + 1; j < clubs.length; j++) {
        const a = clubs[i];
        const b = clubs[j];
        if (!a || !b) continue;

        const { score, reasons } = scoreClubPair(a, b);
        if (score >= 0.6) {
          pairs.push({ a: toCandidate(a), b: toCandidate(b), score, reasons });
        }
      }
    }

    pairs.sort((x, y) => y.score - x.score);
    return pairs.slice(0, limit);
  }

  async merge(canonicalId: string, duplicateId: string, adminUserId: string): Promise<{ merged: boolean }> {
    if (canonicalId === duplicateId) {
      throw new BadRequestException('El canónico y el duplicado no pueden ser el mismo club.');
    }

    const [canonical, duplicate] = await Promise.all([
      this.prisma.club.findUnique({ where: { id: canonicalId } }),
      this.prisma.club.findUnique({ where: { id: duplicateId } }),
    ]);

    if (!canonical) throw new NotFoundException(`Club canónico ${canonicalId} no encontrado.`);
    if (!duplicate) throw new NotFoundException(`Club duplicado ${duplicateId} no encontrado.`);

    const aliasNorm = normalizeText(duplicate.name);
    const shortAliasNorm = normalizeText(duplicate.shortName);

    await this.prisma.$transaction(async (tx) => {
      // 1. Reasignar nadadores con club actual = duplicado
      await tx.swimmer.updateMany({ where: { currentClubId: duplicateId }, data: { currentClubId: canonicalId } });

      // 2. Reasignar historial de club
      await tx.swimmerClubHistory.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } });

      // 3. Reasignar resultados congelados
      await tx.result.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } });

      // 4. Reasignar inscripciones
      await tx.registration.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } });

      // 5. Reasignar récords
      await tx.record.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } });

      // 6. Reasignar ExternalIdMap
      await tx.externalIdMap.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } });

      // 7. Reasignar aliases del duplicado
      await tx.clubAlias.updateMany({ where: { clubId: duplicateId }, data: { clubId: canonicalId } });

      // 8. Guardar nombre y sigla del duplicado como alias
      await tx.clubAlias.upsert({
        where: { clubId_aliasNormalized: { clubId: canonicalId, aliasNormalized: aliasNorm } },
        create: { clubId: canonicalId, aliasNormalized: aliasNorm, source: 'merge' },
        update: {},
      });
      if (shortAliasNorm !== aliasNorm) {
        await tx.clubAlias.upsert({
          where: { clubId_aliasNormalized: { clubId: canonicalId, aliasNormalized: shortAliasNorm } },
          create: { clubId: canonicalId, aliasNormalized: shortAliasNorm, source: 'merge' },
          update: {},
        });
      }

      // 9. Reasignar afiliaciones (si colisiona, eliminar la del duplicado)
      const dupAffiliations = await tx.affiliation.findMany({ where: { clubId: duplicateId } });
      for (const aff of dupAffiliations) {
        const exists = await tx.affiliation.findUnique({
          where: { clubId_seasonId: { clubId: canonicalId, seasonId: aff.seasonId } },
        });
        if (!exists) {
          await tx.affiliation.update({ where: { id: aff.id }, data: { clubId: canonicalId } });
        } else {
          await tx.affiliation.delete({ where: { id: aff.id } });
        }
      }

      // 10. Eliminar el club duplicado
      await tx.club.delete({ where: { id: duplicateId } });

      // 11. Auditar
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'CLUB_MERGED',
          entityType: 'club',
          entityId: canonicalId,
          payload: { duplicateId, duplicateName: duplicate.name, aliasNorm },
        },
      });
    });

    return { merged: true };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ClubRow = {
  id: string; name: string; shortName: string; locality: string;
  _count: { swimmers: number };
};

function scoreClubPair(a: ClubRow, b: ClubRow): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const normNameA = normalizeText(a.name);
  const normNameB = normalizeText(b.name);
  const normShortA = normalizeText(a.shortName);
  const normShortB = normalizeText(b.shortName);

  // Nombre idéntico
  if (normNameA === normNameB) { score += 0.6; reasons.push('nombre idéntico'); }
  // Sigla idéntica
  else if (normShortA === normShortB && normShortA.length >= 2) { score += 0.5; reasons.push('sigla idéntica'); }
  // Nombre contiene al otro
  else if (normNameA.includes(normNameB.slice(0, 6)) || normNameB.includes(normNameA.slice(0, 6))) {
    score += 0.35; reasons.push('nombre parcialmente coincidente');
  }

  // Sigla igual a nombre del otro
  if (normShortA === normNameB || normShortB === normNameA) {
    score += 0.3; reasons.push('sigla = nombre del otro');
  }

  // Localidad igual
  if (normalizeText(a.locality) === normalizeText(b.locality)) {
    score += 0.1; reasons.push('misma localidad');
  }

  return { score: Math.min(Math.max(score, 0), 1), reasons };
}

function toCandidate(c: ClubRow): DuplicateClubCandidate {
  return {
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    locality: c.locality,
    swimmerCount: c._count.swimmers,
  };
}
