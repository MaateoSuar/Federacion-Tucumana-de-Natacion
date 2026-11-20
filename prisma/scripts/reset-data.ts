/**
 * Deja la base "en cero" para los datos de competencia (torneos, pruebas, resultados, nadadores,
 * clubes, récords derivados, rankings, mejores marcas, importaciones), conservando la
 * configuración: usuarios/cuentas, roles y permisos, categorías, definiciones de prueba,
 * temporadas, marcas básicas (time standards) y esquemas de puntos.
 *
 * Uso (desde la raíz del repo, con DATABASE_URL en localhost):
 *   node --env-file=.env --require ts-node/register prisma/scripts/reset-data.ts --confirm
 *
 * Opciones:
 *   --confirm                 Obligatoria. Sin ella solo muestra los conteos actuales y sale.
 *   --wipe-official-records   También borra la Tabla Oficial de Récords cargada con seed-records
 *                             (por defecto se conserva, junto con los nadadores y clubes que figuran
 *                             en ella: sin eso los récords quedarían sin titular).
 *   --allow-remote-db         Permite una base que no sea localhost; exige además FTN_ALLOW_REMOTE_DB=yes.
 *                             Pensado para producción, solo con el OK del responsable.
 *
 * Qué se conserva en los récords: los que NO vienen de un resultado (source_result_id nulo, es decir
 * la tabla oficial). Si un récord derivado de un resultado había reemplazado a uno oficial, el oficial
 * vuelve a quedar vigente. Los audit_logs no se borran (son un registro histórico); se agrega una
 * entrada DATA_RESET.
 *
 * Los archivos subidos en disco (apps/api/uploads) no se tocan.
 */
import { PrismaClient } from '@prisma/client';

type Counts = Record<string, number>;

const TABLES = [
  'user', 'role', 'permission', 'category', 'eventDefinition', 'season', 'timeStandardSet', 'timeStandard', 'scoringScheme',
  'tournament', 'event', 'heat', 'registration', 'laneAssignment', 'result', 'split',
  'swimmer', 'club', 'swimmerAlias', 'clubAlias', 'swimmerClubHistory', 'athleteProfile', 'affiliation', 'coach', 'accountLinkRequest', 'swimmerClaimCode',
  'personalBest', 'ranking', 'rankingHistory', 'record', 'athleteStatistics', 'athleteAchievement',
  'importJob', 'meetManagerImport', 'externalIdMap', 'tournamentDayFile', 'tournamentDocument', 'meetManagerExport', 'auditLog',
] as const;

const KEEP_TABLES = new Set(['user', 'role', 'permission', 'category', 'eventDefinition', 'season', 'timeStandardSet', 'timeStandard', 'scoringScheme', 'auditLog']);

function assertLocalDatabase(allowRemote: boolean): string {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL no está definida.');
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (!local && !(allowRemote && process.env['FTN_ALLOW_REMOTE_DB'] === 'yes')) {
    throw new Error(
      `La base apunta a "${host}", que no es local. Este script solo corre contra localhost ` +
        '(para otra base: --allow-remote-db y FTN_ALLOW_REMOTE_DB=yes, con el OK del responsable).',
    );
  }
  return `${host}${new URL(url).pathname}`;
}

async function count(prisma: PrismaClient): Promise<Counts> {
  const db = prisma as unknown as Record<string, { count: () => Promise<number> }>;
  const out: Counts = {};
  for (const t of TABLES) out[t] = await (db[t] as { count: () => Promise<number> }).count();
  return out;
}

function print(title: string, c: Counts, other?: Counts): void {
  console.log(`\n${title}`);
  console.log('tabla'.padEnd(24) + (other ? 'antes'.padStart(10) + 'después'.padStart(10) : 'filas'.padStart(10)) + '   ');
  for (const t of TABLES) {
    const mark = KEEP_TABLES.has(t) ? ' (se conserva)' : '';
    console.log(t.padEnd(24) + (other ? String(other[t]).padStart(10) + String(c[t]).padStart(10) : String(c[t]).padStart(10)) + mark);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const wipeOfficial = args.includes('--wipe-official-records');
  const database = assertLocalDatabase(args.includes('--allow-remote-db'));

  const prisma = new PrismaClient();
  try {
    console.log(`Base: ${database}`);
    const before = await count(prisma);
    print('Conteos actuales', before);

    if (!confirm) {
      console.log('\nNo se borró nada: falta --confirm.');
      return;
    }

    const summary: Record<string, number> = {};
    await prisma.$transaction(
      async (tx) => {
        // 1. Récords: los derivados de un resultado se van; el oficial que reemplazaron vuelve a regir.
        let keepSwimmerIds: string[] = [];
        let keepClubIds: string[] = [];
        if (wipeOfficial) {
          await tx.athleteAchievement.deleteMany();
          summary['records'] = (await tx.record.deleteMany()).count;
        } else {
          const derived = await tx.record.findMany({
            where: { sourceResultId: { not: null } },
            select: { id: true, previousRecordId: true },
          });
          const derivedIds = new Set(derived.map((r) => r.id));
          // Récords oficiales que un derivado (o una cadena de derivados) había reemplazado
          const officialRoots = [
            ...new Set(
              derived
                .map((r) => r.previousRecordId)
                .filter((id): id is string => id !== null && !derivedIds.has(id)),
            ),
          ];
          await tx.athleteAchievement.deleteMany();
          // Cualquier récord oficial que quede apuntando a uno derivado pierde ese vínculo
          await tx.record.updateMany({ where: { previousRecordId: { in: [...derivedIds] } }, data: { previousRecordId: null } });
          summary['records'] = (await tx.record.deleteMany({ where: { sourceResultId: { not: null } } })).count;
          // Recién ahora (el índice único admite un solo vigente por clave) vuelve a regir el oficial
          summary['officialRecordsRestoredAsCurrent'] = (
            await tx.record.updateMany({
              where: { id: { in: officialRoots }, isCurrent: false, status: 'superseded' },
              data: { isCurrent: true, status: 'homologated' },
            })
          ).count;
          const kept = await tx.record.findMany({ select: { swimmerId: true, clubId: true } });
          keepSwimmerIds = [...new Set(kept.map((r) => r.swimmerId))];
          keepClubIds = [...new Set(kept.map((r) => r.clubId))];
        }

        // 2. Derivados de resultados
        await tx.athleteStatistics.deleteMany();
        await tx.rankingHistory.deleteMany();
        await tx.personalBest.deleteMany();
        summary['rankings'] = (
          await tx.ranking.deleteMany({ where: { OR: [{ sourceResultId: { not: null } }, { swimmerId: { notIn: keepSwimmerIds } }] } })
        ).count;

        // 3. Competencia
        await tx.split.deleteMany();
        await tx.laneAssignment.deleteMany();
        await tx.registration.deleteMany();
        summary['results'] = (await tx.result.deleteMany()).count;
        await tx.heat.deleteMany();
        await tx.event.deleteMany();
        await tx.tournamentDayFile.deleteMany();
        await tx.tournamentDocument.deleteMany();
        await tx.meetManagerExport.deleteMany();
        await tx.meetManagerImport.deleteMany();
        await tx.importJob.deleteMany();
        summary['tournaments'] = (await tx.tournament.deleteMany()).count;
        await tx.externalIdMap.deleteMany();

        // 4. Nadadores y clubes (se conservan solo los de la tabla oficial de récords)
        await tx.swimmerAlias.deleteMany({ where: { swimmerId: { notIn: keepSwimmerIds } } });
        await tx.clubAlias.deleteMany({ where: { clubId: { notIn: keepClubIds } } });
        await tx.swimmerClubHistory.deleteMany({ where: { OR: [{ swimmerId: { notIn: keepSwimmerIds } }, { clubId: { notIn: keepClubIds } }] } });
        await tx.athleteProfile.deleteMany({ where: { swimmerId: { notIn: keepSwimmerIds } } });
        await tx.accountLinkRequest.deleteMany({ where: { swimmerId: { notIn: keepSwimmerIds } } });
        await tx.swimmerClaimCode.deleteMany({ where: { swimmerId: { notIn: keepSwimmerIds } } });
        await tx.affiliation.deleteMany({ where: { clubId: { notIn: keepClubIds } } });
        await tx.coach.deleteMany({ where: { clubId: { notIn: keepClubIds } } });

        // Las cuentas se conservan: se les suelta el vínculo con lo que se borra
        summary['usersUnlinkedFromSwimmer'] = (
          await tx.user.updateMany({ where: { swimmerId: { not: null, notIn: keepSwimmerIds } }, data: { swimmerId: null } })
        ).count;
        summary['usersUnlinkedFromClub'] = (
          await tx.user.updateMany({ where: { clubId: { not: null, notIn: keepClubIds } }, data: { clubId: null } })
        ).count;
        // Un rol con alcance de club que apunta a un club borrado se elimina (si se soltara el club pasaría a ser global)
        summary['scopedRoleAssignmentsRemoved'] = (
          await tx.userRoleAssignment.deleteMany({ where: { clubId: { not: null, notIn: keepClubIds } } })
        ).count;
        await tx.swimmer.updateMany({ where: { currentClubId: { not: null, notIn: keepClubIds } }, data: { currentClubId: null } });

        summary['swimmers'] = (await tx.swimmer.deleteMany({ where: { id: { notIn: keepSwimmerIds } } })).count;
        summary['clubs'] = (await tx.club.deleteMany({ where: { id: { notIn: keepClubIds } } })).count;

        await tx.auditLog.create({
          data: {
            userId: null,
            action: 'DATA_RESET',
            entityType: 'System',
            entityId: 'reset-data',
            payload: { database, wipeOfficialRecords: wipeOfficial, deleted: summary },
          },
        });
      },
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );

    const after = await count(prisma);
    print('Conteos después', after, before);
    console.log('\nResumen de lo borrado/ajustado:', JSON.stringify(summary, null, 2));
    console.log(
      '\nNota: si la API usa Redis, borrá también las claves de caché "ranking:*" para no ver rankings viejos.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
