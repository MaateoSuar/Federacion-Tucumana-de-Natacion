/**
 * Borra los resultados duplicados que dejó el lector viejo en los PDF de Eliminatorias + Finales (Parque Roca,
 * Nacionales): la tabla de los puestos que no pasaron a la final se leyó dos veces, con el mismo nadador, serie,
 * carril y tiempo. Después de esto, split-rounds.ts ya puede separar la jornada de pruebas de esos torneos sin
 * ambigüedades. Detalle de la regla en apps/api/src/import/rounds/find-duplicate-swims.ts.
 *
 * Seguridad:
 *  - Por defecto SOLO MUESTRA qué haría.
 *  - Nunca borra un resultado referenciado por una marca personal, un récord o un ranking, ni uno homologado:
 *    esos se informan como "bloqueados".
 *  - Tampoco borra filas marcadas isPb/isRecord.
 *  - Se conserva una fila de cada grupo (la que tiene parciales, si alguna los tiene).
 *  - Borra primero los parciales (splits) de las filas que elimina, todo en una transacción por torneo, y deja
 *    en audit_logs (DUPLICATE_RESULTS_REMOVED) un snapshot completo de lo borrado (filas y parciales, por grupo)
 *    para poder reconstruirlo. El simulacro muestra una muestra de grupos (--details los muestra todos) y avisa
 *    si las copias de un grupo difieren en puesto, estado, categoría o club.
 *
 * Uso:
 *   DATABASE_URL=... npx ts-node-transpile-only -P apps/api/tsconfig.json prisma/scripts/dedupe-duplicate-swims.ts
 *   ... --only "Parque Roca"      (solo torneos cuyo nombre contenga ese texto)
 *   ... --details                 (lista todos los grupos duplicados en vez de una muestra)
 *   ... --apply                   (escribe; contra una base que no es local exige FTN_CONFIRM_APPLY=yes)
 */
import { PrismaClient } from '@prisma/client';
import { findDuplicateSwims, type StoredResultRow } from '../../apps/api/src/import/rounds/find-duplicate-swims';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const only = arg('--only')?.toLowerCase();
const showDetails = process.argv.includes('--details');
const prisma = new PrismaClient();

async function main() {
  const url = process.env['DATABASE_URL'] ?? '';
  const host = url ? new URL(url).host : '(sin DATABASE_URL)';
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  console.log(`${apply ? 'APLICANDO' : 'SIMULACRO'} contra ${host}`);
  if (apply && !isLocal && process.env['FTN_CONFIRM_APPLY'] !== 'yes') {
    throw new Error('La base no es local: para aplicar hace falta FTN_CONFIRM_APPLY=yes (y un backup/branch previo).');
  }

  const tournaments = await prisma.tournament.findMany({ select: { id: true, name: true }, orderBy: { startDate: 'asc' } });
  let totalRemoved = 0;
  let totalBlocked = 0;

  for (const t of tournaments) {
    if (only && !t.name.toLowerCase().includes(only)) continue;

    const results = await prisma.result.findMany({
      where: { event: { tournamentId: t.id, eventDefinition: { isRelay: false } }, finalTime: { not: null } },
      select: {
        id: true, swimmerId: true, eventId: true, lane: true, finalTime: true, place: true, status: true,
        categoryId: true, clubId: true, homologated: true, isPb: true, isRecord: true,
        heat: { select: { heatNumber: true } },
        event: { select: { eventDefinitionId: true, level: true } },
        _count: { select: { splits: true } },
      },
    });
    if (results.length === 0) continue;
    const byId = new Map(results.map((r) => [r.id, r]));

    // Candidatas: solo las filas que comparten clave con otra; después se mira quién las referencia
    const draft = findDuplicateSwims(
      results.map((r) => ({
        id: r.id, swimmerId: r.swimmerId, eventId: r.eventId, eventDefinitionId: r.event.eventDefinitionId, level: r.event.level,
        heatNo: r.heat?.heatNumber ?? null, lane: r.lane, finalTime: r.finalTime, splitCount: r._count.splits,
        protectedRow: false,
      })),
    );
    if (draft.length === 0) continue;

    const candidateIds = draft.flatMap((g) => [g.keep, ...g.remove]);
    const [pbs, records, rankings] = await Promise.all([
      prisma.personalBest.findMany({ where: { sourceResultId: { in: candidateIds } }, select: { sourceResultId: true } }),
      prisma.record.findMany({ where: { sourceResultId: { in: candidateIds } }, select: { sourceResultId: true } }),
      prisma.ranking.findMany({ where: { sourceResultId: { in: candidateIds } }, select: { sourceResultId: true } }),
    ]);
    const referenced = new Set([...pbs, ...records, ...rankings].map((r) => r.sourceResultId));
    // Marcadas como PB/récord, homologadas o referenciadas por otra tabla: nunca se borran
    const flagged = new Set(results.filter((r) => r.homologated || r.isPb || r.isRecord).map((r) => r.id));

    const rows: StoredResultRow[] = results.map((r) => ({
      id: r.id, swimmerId: r.swimmerId, eventId: r.eventId, eventDefinitionId: r.event.eventDefinitionId, level: r.event.level,
      heatNo: r.heat?.heatNumber ?? null, lane: r.lane, finalTime: r.finalTime, splitCount: r._count.splits,
      protectedRow: referenced.has(r.id) || flagged.has(r.id),
    }));
    const groups = findDuplicateSwims(rows);
    const toRemove = groups.flatMap((g) => g.remove);
    const blocked = groups.flatMap((g) => g.blocked);
    totalRemoved += toRemove.length;
    totalBlocked += blocked.length;

    // Avisa si las copias de un grupo difieren en puesto, estado, categoría o club (no deberían)
    const sameFields = (a: string, b: string) => {
      const x = byId.get(a)!;
      const y = byId.get(b)!;
      return x.place === y.place && x.status === y.status && x.categoryId === y.categoryId && x.clubId === y.clubId;
    };
    const differing = groups.filter((g) => g.remove.some((id) => !sameFields(g.keep, id)));
    console.log(
      `- ${t.name}: ${groups.length} nados duplicados · a borrar ${toRemove.length} · bloqueados (protegidos) ${blocked.length}` +
        (differing.length > 0 ? ` · ⚠ ${differing.length} grupos con copias que difieren en puesto/estado/categoría/club` : ''),
    );

    // Detalle revisable de lo que se borraría (todo con --details; si no, una muestra)
    const describe = (id: string) => {
      const r = byId.get(id)!;
      return { id: r.id, swimmerId: r.swimmerId, eventId: r.eventId, heat: r.heat?.heatNumber ?? null, lane: r.lane, finalTime: r.finalTime, place: r.place, status: r.status, categoryId: r.categoryId, clubId: r.clubId, splits: r._count.splits };
    };
    for (const g of showDetails ? groups : groups.slice(0, 3)) {
      const k = describe(g.keep);
      console.log(`    · nadador ${k.swimmerId} serie ${k.heat} carril ${k.lane} tiempo ${k.finalTime} ms → se conserva ${g.keep}, se borra ${g.remove.join(', ')}`);
    }
    if (!showDetails && groups.length > 3) console.log(`    · … ${groups.length - 3} grupos más (--details para verlos todos)`);

    if (apply && toRemove.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          // Snapshot completo de lo que se borra (filas y parciales), para poder reconstruirlo desde audit_logs
          const splits = await tx.split.findMany({ where: { resultId: { in: toRemove } } });
          const splitsByResult = new Map<string, typeof splits>();
          for (const s of splits) splitsByResult.set(s.resultId, [...(splitsByResult.get(s.resultId) ?? []), s]);
          const snapshot = groups
            .filter((g) => g.remove.length > 0)
            .map((g) => ({
              keep: g.keep,
              removed: g.remove.map((id) => ({ ...describe(id), splitRows: (splitsByResult.get(id) ?? []).map((s) => ({ distance: s.distance, cumulativeTime: s.cumulativeTime })) })),
            }));
          await tx.split.deleteMany({ where: { resultId: { in: toRemove } } });
          await tx.result.deleteMany({ where: { id: { in: toRemove } } });
          const CHUNK = 100; // un audit log por tanda de grupos, para no armar un payload gigante
          for (let i = 0; i < snapshot.length; i += CHUNK) {
            await tx.auditLog.create({
              data: {
                action: 'DUPLICATE_RESULTS_REMOVED',
                entityType: 'tournament',
                entityId: t.id,
                payload: {
                  tournament: t.name,
                  reason: 'copia de la tabla de eliminatorias leída como final',
                  part: `${Math.floor(i / CHUNK) + 1}/${Math.ceil(snapshot.length / CHUNK)}`,
                  groups: snapshot.slice(i, i + CHUNK),
                },
              },
            });
          }
        },
        { timeout: 300_000, maxWait: 30_000 },
      );
      console.log(`    ✔ ${toRemove.length} duplicados borrados`);
    }
  }

  console.log(`\nTotal: a borrar ${totalRemoved} · bloqueados ${totalBlocked}${apply ? '' : ' (simulacro: no se escribió nada)'}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
