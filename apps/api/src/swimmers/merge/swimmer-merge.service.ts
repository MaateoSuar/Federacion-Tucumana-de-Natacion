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

    // Regla 6: una cuenta se vincula a un nadador SOLO por AccountLinkRequest aprobado.
    // Borrar un nadador con cuenta la desvincularía en silencio, así que no se permite:
    // el que tiene cuenta debe ser el que queda.
    const [duplicateAccount, canonicalAccount] = await Promise.all([
      this.prisma.user.findFirst({ where: { swimmerId: duplicateId }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { swimmerId: canonicalId }, select: { id: true } }),
    ]);
    if (duplicateAccount && canonicalAccount) {
      throw new BadRequestException(
        'Los dos nadadores tienen una cuenta de usuario vinculada. Resolvé primero las cuentas (vinculaciones) y después unificá.',
      );
    }
    if (duplicateAccount) {
      throw new BadRequestException(
        'El nadador que se va a eliminar tiene una cuenta de usuario vinculada. Unificá al revés: dejá como principal al que tiene la cuenta.',
      );
    }

    const duplicateName = `${duplicate.firstName} ${duplicate.lastName}`;
    const aliasNorm = normalizeText(duplicateName);

    await this.prisma.$transaction(async (tx) => {
      // Qué se movió, para la auditoría (permite reconstruir la unificación)
      const moved: Record<string, number | string[]> = {};

      // 1. Resultados: pasan al canónico tal cual (categoría y club congelados no se tocan)
      moved.results = (await tx.result.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;

      // 2. Inscripciones: una por (prueba, nadador). Si los dos estaban inscriptos en la
      //    misma prueba, queda la del canónico.
      const canonicalRegs = new Set(
        (await tx.registration.findMany({ where: { swimmerId: canonicalId }, select: { eventId: true } })).map((r) => r.eventId),
      );
      const dupRegs = await tx.registration.findMany({ where: { swimmerId: duplicateId }, select: { id: true, eventId: true } });
      const regsToDrop = dupRegs.filter((r) => canonicalRegs.has(r.eventId)).map((r) => r.id);
      if (regsToDrop.length > 0) await tx.registration.deleteMany({ where: { id: { in: regsToDrop } } });
      moved.registrations = (await tx.registration.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } })).count;

      // 3. Mejores marcas: una por (prueba, pileta). Si chocan, queda la mejor.
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

      // 4. Rankings: uno por (prueba, pileta, ámbito, temporada, categoría). Si chocan,
      //    queda el mejor tiempo. Nunca se comparan piletas distintas: la pileta es parte de la clave.
      const dupRankings = await tx.ranking.findMany({ where: { swimmerId: duplicateId } });
      for (const rk of dupRankings) {
        const existing = await tx.ranking.findFirst({
          where: {
            swimmerId: canonicalId,
            eventDefinitionId: rk.eventDefinitionId,
            poolLength: rk.poolLength,
            scope: rk.scope,
            seasonId: rk.seasonId,
            categoryId: rk.categoryId,
          },
        });
        if (!existing) {
          await tx.ranking.update({ where: { id: rk.id }, data: { swimmerId: canonicalId } });
        } else if (rk.finalTime < existing.finalTime) {
          await tx.ranking.delete({ where: { id: existing.id } });
          await tx.ranking.update({ where: { id: rk.id }, data: { swimmerId: canonicalId } });
        } else {
          await tx.ranking.delete({ where: { id: rk.id } });
        }
      }

      // 5. Historial de club
      await tx.swimmerClubHistory.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 6. Récords: TODOS pasan al canónico, también los homologados. Unificar es corregir
      //    la identidad del titular (es la misma persona): no cambia tiempo, estado, vigencia
      //    ni homologación de ningún récord. Sin esto el duplicado no se puede eliminar.
      //    Se auditan los ids movidos.
      const dupRecords = await tx.record.findMany({ where: { swimmerId: duplicateId }, select: { id: true } });
      if (dupRecords.length > 0) {
        await tx.record.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });
      }
      moved.recordIds = dupRecords.map((r) => r.id);

      // 7. Grafías aprendidas de las importaciones
      await tx.externalIdMap.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 8. Alias del duplicado: los que el canónico ya tiene se descartan, el resto pasa.
      const canonicalAliases = new Set(
        (await tx.swimmerAlias.findMany({ where: { swimmerId: canonicalId }, select: { aliasNormalized: true } })).map((a) => a.aliasNormalized),
      );
      const dupAliases = await tx.swimmerAlias.findMany({ where: { swimmerId: duplicateId }, select: { id: true, aliasNormalized: true } });
      const aliasesToDrop = dupAliases.filter((a) => canonicalAliases.has(a.aliasNormalized)).map((a) => a.id);
      if (aliasesToDrop.length > 0) await tx.swimmerAlias.deleteMany({ where: { id: { in: aliasesToDrop } } });
      await tx.swimmerAlias.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 9. El nombre del duplicado queda como alias del canónico (si no es vacío)
      if (aliasNorm) {
        await tx.swimmerAlias.upsert({
          where: { swimmerId_aliasNormalized: { swimmerId: canonicalId, aliasNormalized: aliasNorm } },
          create: { swimmerId: canonicalId, aliasNormalized: aliasNorm, source: 'merge' },
          update: {},
        });
      }

      // 10. Solicitudes de vinculación (historial): pasan al canónico. Ninguna cuenta queda
      //     vinculada por esto: el duplicado no tenía cuenta (se verificó arriba).
      await tx.accountLinkRequest.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 11. Estadísticas: una fila por (nadador, temporada). Son derivadas: si chocan se
      //     descarta la del duplicado (se recalculan al homologar resultados).
      const canonicalStatSeasons = new Set(
        (await tx.athleteStatistics.findMany({ where: { swimmerId: canonicalId }, select: { seasonId: true } })).map((s) => s.seasonId),
      );
      const dupStats = await tx.athleteStatistics.findMany({ where: { swimmerId: duplicateId }, select: { id: true, seasonId: true } });
      const statsToDrop = dupStats.filter((s) => canonicalStatSeasons.has(s.seasonId)).map((s) => s.id);
      if (statsToDrop.length > 0) await tx.athleteStatistics.deleteMany({ where: { id: { in: statsToDrop } } });
      await tx.athleteStatistics.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 12. Logros
      await tx.athleteAchievement.updateMany({ where: { swimmerId: duplicateId }, data: { swimmerId: canonicalId } });

      // 13. Perfil: si el duplicado tiene y el canónico no, se transfiere
      const dupProfile = await tx.athleteProfile.findUnique({ where: { swimmerId: duplicateId } });
      const canonProfile = await tx.athleteProfile.findUnique({ where: { swimmerId: canonicalId } });
      if (dupProfile && !canonProfile) {
        await tx.athleteProfile.update({ where: { id: dupProfile.id }, data: { swimmerId: canonicalId } });
      } else if (dupProfile) {
        await tx.athleteProfile.delete({ where: { id: dupProfile.id } });
      }

      // 14. Eliminar el duplicado
      await tx.swimmer.delete({ where: { id: duplicateId } });

      // 15. Datos que el canónico no tenía y el duplicado sí (no se pisa nada existente).
      //     Va después de borrar el duplicado: el documento es único.
      const inherited = {
        ...(canonical.birthDate === null && duplicate.birthDate !== null ? { birthDate: duplicate.birthDate } : {}),
        ...(canonical.documentId === null && duplicate.documentId !== null ? { documentId: duplicate.documentId } : {}),
        ...(canonical.currentClubId === null && duplicate.currentClubId !== null ? { currentClubId: duplicate.currentClubId } : {}),
      };
      if (Object.keys(inherited).length > 0) {
        await tx.swimmer.update({ where: { id: canonicalId }, data: inherited });
      }

      // 16. Auditar
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'SWIMMER_MERGED',
          entityType: 'swimmer',
          entityId: canonicalId,
          payload: { duplicateId, duplicateName, aliasNorm, moved, inheritedFields: Object.keys(inherited) },
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
