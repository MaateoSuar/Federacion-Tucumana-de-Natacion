import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeText } from '../../import/matching/fuzzy';

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

@Injectable()
export class SwimmerMergeService {
  constructor(private readonly prisma: PrismaService) {}

  async findDuplicates(limit = 50): Promise<DuplicatePair[]> {
    // Trae todos los nadadores activos con sus conteos de resultados
    const swimmers = await this.prisma.swimmer.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        birthDate: true,
        currentClub: { select: { id: true, name: true, shortName: true } },
        _count: { select: { results: true } },
      },
      orderBy: { lastName: 'asc' },
    });

    const pairs: DuplicatePair[] = [];

    // Comparación O(n²) con short-circuit: solo candidatos con mismo género y apellido similar
    for (let i = 0; i < swimmers.length; i++) {
      for (let j = i + 1; j < swimmers.length; j++) {
        const a = swimmers[i];
        const b = swimmers[j];
        if (!a || !b) continue;

        // Filtro rápido: mismo género o uno de los dos sin gender
        if (a.gender !== b.gender) continue;

        const normLastA = normalizeText(a.lastName);
        const normLastB = normalizeText(b.lastName);

        // Apellidos deben compartir al menos 4 caracteres en común
        if (!sharesPrefix(normLastA, normLastB, 4)) continue;

        const { score, reasons } = scoreSwimmerPair(a, b);
        if (score >= 0.6) {
          pairs.push({
            a: toCandidate(a),
            b: toCandidate(b),
            score,
            reasons,
          });
        }
      }
      if (pairs.length >= limit * 3) break; // corte temprano
    }

    // Ordenar por score descendente y retornar los top `limit`
    pairs.sort((x, y) => y.score - x.score);
    return pairs.slice(0, limit);
  }

  async merge(canonicalId: string, duplicateId: string, adminUserId: string): Promise<{ merged: boolean }> {
    if (canonicalId === duplicateId) {
      throw new BadRequestException('El canónico y el duplicado no pueden ser el mismo nadador.');
    }

    const [canonical, duplicate] = await Promise.all([
      this.prisma.swimmer.findUnique({ where: { id: canonicalId } }),
      this.prisma.swimmer.findUnique({ where: { id: duplicateId } }),
    ]);

    if (!canonical) throw new NotFoundException(`Nadador canónico ${canonicalId} no encontrado.`);
    if (!duplicate) throw new NotFoundException(`Nadador duplicado ${duplicateId} no encontrado.`);

    if (canonical.gender !== duplicate.gender) {
      throw new BadRequestException('No se puede fusionar nadadores de distinto género.');
    }

    const duplicateName = `${duplicate.firstName} ${duplicate.lastName}`;
    const aliasNorm = normalizeText(duplicateName);

    await this.prisma.$transaction(async (tx) => {
      // 1. Reasignar resultados
      await tx.result.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 2. Reasignar inscripciones
      await tx.registration.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 3. Reasignar personal bests (si ya existe el mismo (event, pool) en el canónico, mantener el mejor)
      const dupPBs = await tx.personalBest.findMany({ where: { swimmerId: duplicateId } });
      for (const pb of dupPBs) {
        const existing = await tx.personalBest.findUnique({
          where: { swimmerId_eventDefinitionId_poolLength: { swimmerId: canonicalId, eventDefinitionId: pb.eventDefinitionId, poolLength: pb.poolLength } },
        });
        if (!existing || pb.bestTime < existing.bestTime) {
          if (existing) await tx.personalBest.delete({ where: { id: existing.id } });
          await tx.personalBest.update({ where: { id: pb.id }, data: { swimmerId: canonicalId } });
        } else {
          await tx.personalBest.delete({ where: { id: pb.id } });
        }
      }

      // 4. Reasignar rankings (misma lógica: si colisiona, queda el mejor)
      await tx.ranking.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 5. Reasignar historial de club
      await tx.swimmerClubHistory.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 6. Reasignar récords (candidatos pending — los homologados no se tocan)
      await tx.record.updateMany({ where: { swimmerId: duplicateId, status: 'pending_homologation' }, data: { swimmerId: canonicalId } });

      // 7. Reasignar ExternalIdMap
      await tx.externalIdMap.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 8. Reasignar aliases del duplicado al canónico
      await tx.swimmerAlias.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 9. Guardar el nombre del duplicado como alias del canónico
      await tx.swimmerAlias.upsert({
        where: { swimmerId_aliasNormalized: { swimmerId: canonicalId, aliasNormalized: aliasNorm } },
        create: { swimmerId: canonicalId, aliasNormalized: aliasNorm, source: 'merge' },
        update: {},
      });

      // 10. Reasignar solicitudes de vinculación
      await tx.accountLinkRequest.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 11. Reasignar estadísticas
      await tx.athleteStatistics.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 12. Reasignar logros
      await tx.athleteAchievement.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 13. Manejar perfil — si el duplicado tiene perfil y el canónico no, transferir
      const dupProfile = await tx.athleteProfile.findUnique({ where: { swimmerId: duplicateId } });
      const canonProfile = await tx.athleteProfile.findUnique({ where: { swimmerId: canonicalId } });
      if (dupProfile && !canonProfile) {
        await tx.athleteProfile.update({ where: { id: dupProfile.id }, data: { swimmerId: canonicalId } });
      } else if (dupProfile) {
        await tx.athleteProfile.delete({ where: { id: dupProfile.id } });
      }

      // 14. Eliminar el duplicado
      await tx.swimmer.delete({ where: { id: duplicateId } });

      // 15. Auditar
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'SWIMMER_MERGED',
          entityType: 'swimmer',
          entityId: canonicalId,
          payload: { duplicateId, duplicateName, aliasNorm },
        },
      });
    });

    return { merged: true };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sharesPrefix(a: string, b: string, minLen: number): boolean {
  const shorter = a.length < b.length ? a : b;
  if (shorter.length < minLen) return false;
  let common = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (a[i] === b[i]) common++;
  }
  return common >= minLen;
}

type SwimmerRow = {
  id: string; firstName: string; lastName: string; gender: string;
  birthDate: Date | null;
  currentClub: { id: string; name: string; shortName: string } | null;
  _count: { results: number };
};

function scoreSwimmerPair(a: SwimmerRow, b: SwimmerRow): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const normLastA = normalizeText(a.lastName);
  const normLastB = normalizeText(b.lastName);
  const normFirstA = normalizeText(a.firstName);
  const normFirstB = normalizeText(b.firstName);

  // Apellido
  if (normLastA === normLastB) { score += 0.4; reasons.push('apellido idéntico'); }
  else if (normLastA.startsWith(normLastB.slice(0, 5)) || normLastB.startsWith(normLastA.slice(0, 5))) {
    score += 0.25; reasons.push('apellido muy similar');
  }

  // Nombre
  if (normFirstA === normFirstB) { score += 0.3; reasons.push('nombre idéntico'); }
  else if (normFirstA.startsWith(normFirstB.slice(0, 3)) || normFirstB.startsWith(normFirstA.slice(0, 3))) {
    score += 0.15; reasons.push('nombre similar');
  }

  // Año de nacimiento
  if (a.birthDate && b.birthDate) {
    const yearA = a.birthDate.getUTCFullYear();
    const yearB = b.birthDate.getUTCFullYear();
    if (yearA === yearB) { score += 0.2; reasons.push(`mismo año (${yearA})`); }
    else if (Math.abs(yearA - yearB) === 1) { score += 0.1; reasons.push('año de nacimiento ±1'); }
    else score -= 0.2;
  }

  // Mismo club actual
  if (a.currentClub && b.currentClub && a.currentClub.id === b.currentClub.id) {
    score += 0.1; reasons.push('mismo club actual');
  }

  return { score: Math.min(Math.max(score, 0), 1), reasons };
}

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
