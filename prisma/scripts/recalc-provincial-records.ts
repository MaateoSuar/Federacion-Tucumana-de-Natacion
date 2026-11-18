/**
 * Recalcula los récords tucumanos derivados de resultados con las reglas vigentes:
 * solo clubes de Tucumán, y el récord vive en la categoría oficial (Infantiles ... Mayores).
 *
 *  1. Borra los récords derivados (source_result_id no nulo); el récord oficial que habían
 *     reemplazado vuelve a quedar vigente. La Tabla Oficial no se toca.
 *  2. Vuelve a evaluar, en orden de fecha, los resultados homologados de torneos provinciales.
 *
 * Desde apps/api:
 *   pnpm exec ts-node-transpile-only -P tsconfig.json ../../prisma/scripts/recalc-provincial-records.ts [--allow-remote-db]
 *
 * Corre contra localhost; para otra base hace falta --allow-remote-db y FTN_ALLOW_REMOTE_DB=yes.
 */
import { PrismaClient } from '@prisma/client';
import { RecordEvaluatorProcessor } from '../../apps/api/src/homologation/processors/record-evaluator.processor';

const TUCUMAN_PROVINCE = 'Tucumán';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL no está definida.');
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  const allowRemote = process.argv.includes('--allow-remote-db') && process.env['FTN_ALLOW_REMOTE_DB'] === 'yes';
  if (!local && !allowRemote) throw new Error(`La base apunta a "${host}", que no es local (ver --allow-remote-db).`);
  console.log(`Base: ${host}${new URL(url).pathname}`);

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const derived = await tx.record.findMany({
        where: { sourceResultId: { not: null } },
        select: { id: true, previousRecordId: true, sourceResultId: true },
      });
      const derivedIds = new Set(derived.map((r) => r.id));
      const officialRoots = [
        ...new Set(derived.map((r) => r.previousRecordId).filter((id): id is string => id !== null && !derivedIds.has(id))),
      ];
      await tx.athleteAchievement.deleteMany({ where: { recordId: { in: [...derivedIds] } } });
      await tx.record.updateMany({ where: { previousRecordId: { in: [...derivedIds] } }, data: { previousRecordId: null } });
      await tx.record.deleteMany({ where: { sourceResultId: { not: null } } });
      const restored = await tx.record.updateMany({
        where: { id: { in: officialRoots }, isCurrent: false, status: 'superseded' },
        data: { isCurrent: true, status: 'homologated' },
      });
      await tx.result.updateMany({ where: { isRecord: true }, data: { isRecord: false } });
      // Mantenimiento excepcional aprobado por el usuario (18/11/2026): queda registrado.
      await tx.auditLog.create({
        data: {
          userId: null,
          action: 'RECORDS_RECALCULATED',
          entityType: 'Record',
          entityId: 'provincial',
          payload: {
            motivo: 'Récord tucumano solo con clubes de Tucumán y en categorías oficiales (decisión del 18/11/2026)',
            derivedDeleted: derived.length,
            officialRestored: restored.count,
          },
        },
      });
      console.log(`Récords derivados borrados: ${derived.length} · oficiales restaurados: ${restored.count}`);
    }, { timeout: 120_000 });

    // Solo los que el evaluador aceptaría (club de Tucumán); el resto se descartaría igual.
    const results = await prisma.result.findMany({
      where: {
        homologated: true,
        status: 'OK',
        finalTime: { not: null },
        club: { province: TUCUMAN_PROVINCE },
        event: { tournament: { scope: 'provincial' } },
      },
      select: {
        id: true, swimmerId: true, clubId: true, categoryId: true, finalTime: true, place: true, eventId: true,
        event: {
          select: {
            eventDefinitionId: true,
            eventDefinition: { select: { gender: true } },
            tournament: { select: { id: true, name: true, startDate: true, poolLength: true, seasonId: true } },
          },
        },
      },
    });
    results.sort((a, b) => a.event.tournament.startDate.getTime() - b.event.tournament.startDate.getTime());
    console.log(`Resultados a evaluar: ${results.length}`);

    const evaluator = new RecordEvaluatorProcessor(prisma as never);
    let done = 0;
    for (const r of results) {
      const t = r.event.tournament;
      await evaluator.process({
        resultId: r.id,
        swimmerId: r.swimmerId,
        clubId: r.clubId,
        eventDefinitionId: r.event.eventDefinitionId,
        poolLength: t.poolLength === 'P25' ? 25 : 50,
        categoryId: r.categoryId,
        gender: r.event.eventDefinition.gender as 'M' | 'F',
        seasonId: t.seasonId,
        finalTimeMs: r.finalTime as number,
        tournamentId: t.id,
        tournamentName: t.name,
        eventId: r.eventId,
        place: r.place,
        resultDate: t.startDate.toISOString(),
        homologatedBy: 'recalculo',
      });
      if (++done % 500 === 0) console.log(`  ${done}/${results.length}`);
    }

    const out = await prisma.record.groupBy({
      by: ['isCurrent'],
      where: { scope: 'provincial', sourceResultId: { not: null } },
      _count: true,
    });
    console.log('Récords derivados tras recalcular:', JSON.stringify(out));
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
