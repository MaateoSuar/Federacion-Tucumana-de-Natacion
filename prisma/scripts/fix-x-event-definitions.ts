/**
 * Pasa a la definición de prueba correcta (M o F) los eventos que quedaron colgados de una
 * definición individual con código "_X" (género desconocido al importar, que se guardaba con
 * género M). Con dos definiciones "50MA_M" y "50MA_X", el ranking de la web tomaba a veces la
 * vacía y mostraba "mariposa sin tiempos".
 *
 * Regla: el género sale de los nadadores de los resultados del evento. Si todos son del mismo
 * género, el evento pasa a la definición de ese género (se reutiliza el evento equivalente del
 * mismo torneo y nivel si ya existe). Si hay de los dos géneros, no se toca y se informa.
 *
 * Uso (por defecto SOLO MUESTRA qué haría):
 *   DATABASE_URL=... npx ts-node prisma/scripts/fix-x-event-definitions.ts
 *   DATABASE_URL=... npx ts-node prisma/scripts/fix-x-event-definitions.ts --apply
 */
import { PrismaClient, type Gender } from '@prisma/client';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const xDefs = await prisma.eventDefinition.findMany({ where: { isRelay: false, code: { endsWith: '_X' } } });
  console.log(`${apply ? 'APLICANDO' : 'SIMULACRO'} — definiciones individuales "_X": ${xDefs.length}`);

  const summary = { repointed: 0, merged: 0, skippedMixed: 0, resultsMoved: 0, emptyEventsLeft: 0 };

  for (const xDef of xDefs) {
    const events = await prisma.event.findMany({
      where: { eventDefinitionId: xDef.id },
      include: { results: { select: { id: true, heatId: true, swimmer: { select: { gender: true } } } }, _count: { select: { registrations: true } } },
    });

    for (const ev of events) {
      if (ev.results.length === 0) {
        summary.emptyEventsLeft++; // sin resultados: no estorba, se deja
        continue;
      }
      const genders = new Set(ev.results.map((r) => r.swimmer.gender));
      if (genders.size !== 1) {
        summary.skippedMixed++;
        console.log(`  ! evento ${ev.id} (${xDef.code}) tiene nadadores de ${[...genders].join('/')}: no se toca`);
        continue;
      }
      const gender = [...genders][0] as Gender;
      const target = await prisma.eventDefinition.findFirst({
        where: { stroke: xDef.stroke, distance: xDef.distance, gender, isRelay: false, NOT: { code: { endsWith: '_X' } } },
      });
      if (!target) {
        console.log(`  ! no hay definición ${xDef.stroke} ${xDef.distance} ${gender}: se omite ${ev.id}`);
        continue;
      }

      const existing = await prisma.event.findFirst({
        where: { tournamentId: ev.tournamentId, eventDefinitionId: target.id, level: ev.level, NOT: { id: ev.id } },
        select: { id: true },
      });

      if (!existing) {
        console.log(`  → evento ${ev.id}: ${xDef.code} → ${target.code} (${ev.results.length} resultados)`);
        if (apply) await prisma.event.update({ where: { id: ev.id }, data: { eventDefinitionId: target.id } });
        summary.repointed++;
        summary.resultsMoved += ev.results.length;
        continue;
      }

      // Ya hay un evento equivalente en el torneo: los resultados pasan a él (y sus series, por número)
      console.log(`  ⇒ evento ${ev.id}: se junta con ${existing.id} (${target.code}), ${ev.results.length} resultados`);
      if (apply) {
        await prisma.$transaction(async (tx) => {
          const heatMap = new Map<string, string>();
          const heats = await tx.heat.findMany({ where: { eventId: ev.id } });
          for (const h of heats) {
            const same = await tx.heat.findUnique({ where: { eventId_heatNumber: { eventId: existing.id, heatNumber: h.heatNumber } } });
            heatMap.set(h.id, same ? same.id : (await tx.heat.create({ data: { eventId: existing.id, heatNumber: h.heatNumber, scheduledAt: h.scheduledAt } })).id);
          }
          for (const [oldHeat, newHeat] of heatMap) {
            await tx.result.updateMany({ where: { eventId: ev.id, heatId: oldHeat }, data: { heatId: newHeat } });
          }
          await tx.result.updateMany({ where: { eventId: ev.id }, data: { eventId: existing.id } });
          // Inscripciones: una por (prueba, nadador); si ya existe en el destino se descarta la repetida
          const destRegs = new Set((await tx.registration.findMany({ where: { eventId: existing.id }, select: { swimmerId: true } })).map((r) => r.swimmerId));
          const srcRegs = await tx.registration.findMany({ where: { eventId: ev.id }, select: { id: true, swimmerId: true } });
          for (const r of srcRegs) {
            if (destRegs.has(r.swimmerId)) {
              await tx.laneAssignment.deleteMany({ where: { registrationId: r.id } });
              await tx.registration.delete({ where: { id: r.id } });
            } else {
              await tx.registration.update({ where: { id: r.id }, data: { eventId: existing.id } });
            }
          }
          await tx.athleteAchievement.updateMany({ where: { eventId: ev.id }, data: { eventId: existing.id } });
          await tx.laneAssignment.deleteMany({ where: { heatId: { in: heats.map((h) => h.id) } } });
          await tx.heat.deleteMany({ where: { eventId: ev.id } });
          await tx.event.delete({ where: { id: ev.id } });
        });
      }
      summary.merged++;
      summary.resultsMoved += ev.results.length;
    }
  }

  // Marcas básicas: el seed las colgó de la definición "_X" (la última del mapa con ese género).
  // Pasan a la definición real del mismo estilo y distancia; si ya existe la misma, queda la que estaba.
  for (const xDef of xDefs) {
    const real = await prisma.eventDefinition.findFirst({
      where: { stroke: xDef.stroke, distance: xDef.distance, gender: xDef.gender, isRelay: false, NOT: { code: { endsWith: '_X' } } },
    });
    const standards = await prisma.timeStandard.findMany({ where: { eventDefinitionId: xDef.id } });
    if (!real || standards.length === 0) continue;
    const existing = await prisma.timeStandard.findMany({ where: { eventDefinitionId: real.id }, select: { setId: true, categoryId: true, gender: true, poolLength: true } });
    const taken = new Set(existing.map((t) => [t.setId, t.categoryId, t.gender, t.poolLength].join('|')));
    const movable = standards.filter((t) => !taken.has([t.setId, t.categoryId, t.gender, t.poolLength].join('|')));
    console.log(`  marcas básicas ${xDef.code} → ${real.code}: ${movable.length} pasan, ${standards.length - movable.length} ya estaban`);
    if (apply) {
      if (movable.length > 0) await prisma.timeStandard.updateMany({ where: { id: { in: movable.map((t) => t.id) } }, data: { eventDefinitionId: real.id } });
      await prisma.timeStandard.deleteMany({ where: { eventDefinitionId: xDef.id } });
    }
  }

  // Definiciones "_X" que quedaron sin ningún uso: se eliminan para que no vuelvan a confundir
  if (apply) {
    for (const xDef of xDefs) {
      const [events, records, pbs, rankings, history, standards] = await Promise.all([
        prisma.event.count({ where: { eventDefinitionId: xDef.id } }),
        prisma.record.count({ where: { eventDefinitionId: xDef.id } }),
        prisma.personalBest.count({ where: { eventDefinitionId: xDef.id } }),
        prisma.ranking.count({ where: { eventDefinitionId: xDef.id } }),
        prisma.rankingHistory.count({ where: { eventDefinitionId: xDef.id } }),
        prisma.timeStandard.count({ where: { eventDefinitionId: xDef.id } }),
      ]);
      if (events + records + pbs + rankings + history + standards === 0) {
        await prisma.eventDefinition.delete({ where: { id: xDef.id } });
        console.log(`  ✓ definición ${xDef.code} eliminada (sin uso)`);
      }
    }
  }

  console.log('Resumen:', summary);
  if (!apply) console.log('(simulacro: no se cambió nada; usar --apply para ejecutar)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
