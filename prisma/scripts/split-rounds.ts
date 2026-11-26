/**
 * Separa la jornada de pruebas (clasificatorio, mañana) de la final (tarde) en los torneos YA cargados,
 * sin reimportarlos. Hasta ahora el importador juntaba las dos jornadas en un mismo evento por prueba.
 *
 * Regla (FTN, 25/11/2026): si un nadador vuelve a nadar la misma prueba en otra jornada del mismo archivo,
 * el último nado es la final y los anteriores son clasificatorios (ver resolve-result-rounds.ts).
 *
 * Cómo funciona: relee los PDF de la copia del Drive, decide qué nados son clasificatorios, los empareja
 * con los resultados de la base (estilo, distancia, género, serie, carril y tiempo) y los pasa a un evento
 * "clasificatorio" de la misma prueba y nivel. No toca tiempos, categorías ni clubes de los resultados
 * (regla 2): solo cambia a qué evento y serie pertenecen. Los nados ambiguos o sin pareja no se mueven.
 *
 * Es idempotente: los que ya están en un evento clasificatorio no se vuelven a mover.
 *
 * Uso (por defecto SOLO MUESTRA qué haría):
 *   DATABASE_URL=... npx ts-node-transpile-only -P apps/api/tsconfig.json prisma/scripts/split-rounds.ts --root C:\ruta\ftn-drive-copia
 *   ... --only "San Luis"          (solo torneos cuyo nombre contenga ese texto)
 *   ... --min-swims 10             (por defecto 10: menos nados de jornada de pruebas que eso = no es un torneo de dos jornadas)
 *   ... --max-ambiguous 0.1        (por defecto 10%: más ambiguos que eso = datos duplicados, el torneo no se toca)
 *   ... --apply                    (escribe; contra una base que no es local exige FTN_CONFIRM_APPLY=yes)
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { planTournaments, scanDrive } from '../../apps/api/src/import/drive-loader/drive-scan';
import { MeetManagerPdfAdapter } from '../../apps/api/src/ingest/adapters/meet-manager-pdf/meet-manager-pdf-adapter';
import { BASE_ROUND, findPhantomFinals, resolveResultRounds } from '../../apps/api/src/import/rounds/resolve-result-rounds';
import { matchSwims, type StoredSwim, type SwimKeyParts } from '../../apps/api/src/import/rounds/match-existing-swims';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const root = arg('--root');
const only = arg('--only')?.toLowerCase();
// Un torneo con jornada de pruebas + final tiene decenas de nadadores repitiendo prueba; uno o dos casos
// sueltos son repeticiones accidentales del archivo y no se tocan.
const minSwims = Number(arg('--min-swims') ?? '10');
const prisma = new PrismaClient();

const maxAmbiguousRatio = Number(arg('--max-ambiguous') ?? '0.1');
if (!Number.isFinite(minSwims) || !Number.isFinite(maxAmbiguousRatio)) {
  throw new Error('--min-swims y --max-ambiguous deben ser números');
}

interface Totals { skippedTournaments: number; tournaments: number; wanted: number; matched: number; alreadyDone: number; unmatched: number; ambiguous: number; moved: number }

async function main() {
  if (!root) throw new Error('Falta --root <carpeta de la copia del Drive>');
  const url = process.env['DATABASE_URL'] ?? '';
  const host = url ? new URL(url).host : '(sin DATABASE_URL)';
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  console.log(`${apply ? 'APLICANDO' : 'SIMULACRO'} contra ${host}`);
  if (apply && !isLocal && process.env['FTN_CONFIRM_APPLY'] !== 'yes') {
    throw new Error('La base no es local: para aplicar hace falta FTN_CONFIRM_APPLY=yes (y un backup/branch previo).');
  }

  const files = await scanDrive(root);
  const plan = planTournaments(files);
  const adapter = new MeetManagerPdfAdapter();
  const totals: Totals = { skippedTournaments: 0, tournaments: 0, wanted: 0, matched: 0, alreadyDone: 0, unmatched: 0, ambiguous: 0, moved: 0 };

  for (const t of plan.tournaments) {
    if (only && !t.name.toLowerCase().includes(only)) continue;
    const dbTournament = await prisma.tournament.findFirst({ where: { name: t.name }, select: { id: true, name: true } });
    if (!dbTournament) { console.log(`- ${t.name}: no está en la base, se omite`); continue; }

    // 1) Nados clasificatorios según los PDF del torneo
    const wanted: SwimKeyParts[] = [];
    for (const f of t.files) {
      const meet = await adapter.parse(readFileSync(f.absPath), f.fileName);
      const eventByKey = new Map(meet.events.map((e) => [e.event_key, e]));
      const genderByRef = new Map(meet.swimmers.map((s) => [s.external_athlete_id, s.gender]));
      const changed = resolveResultRounds(meet);
      const phantoms = findPhantomFinals(meet);
      for (const result of meet.results) {
        const ev = eventByKey.get(result.event_key);
        if (!ev || ev.is_relay || phantoms.has(result)) continue;
        // Ronda efectiva: la que decide la regla o, si no cambia, la que dice el archivo (Eliminatorias = clasificatorio)
        if ((changed.get(result) ?? BASE_ROUND[ev.round]) !== 'clasificatorio') continue;
        const gender = genderByRef.get(result.swimmer_ref);
        if (!gender) continue;
        wanted.push({ stroke: ev.stroke, distance: ev.distance, gender, heatNo: result.heat_no, lane: result.lane_no, finalTimeMs: result.final_time_ms });
      }
    }
    if (wanted.length < minSwims) {
      console.log(`- ${t.name}: ${wanted.length} nados de jornada de pruebas (menos de ${minSwims}): no es un torneo con dos jornadas, no se toca`);
      continue;
    }

    // 2) Resultados que hay en la base
    const rows = await prisma.result.findMany({
      where: { event: { tournamentId: dbTournament.id, eventDefinition: { isRelay: false } } },
      select: {
        id: true, eventId: true, heatId: true, lane: true, finalTime: true,
        swimmer: { select: { gender: true } },
        heat: { select: { heatNumber: true } },
        event: { select: { round: true, eventDefinition: { select: { stroke: true, distance: true } } } },
      },
    });
    const stored: StoredSwim[] = rows.map((r) => ({
      resultId: r.id, stroke: r.event.eventDefinition.stroke, distance: r.event.eventDefinition.distance,
      gender: r.swimmer.gender, heatNo: r.heat?.heatNumber ?? 0, lane: r.lane, finalTimeMs: r.finalTime,
    }));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const outcome = matchSwims(wanted, stored);
    const toMove = outcome.matchedResultIds.filter((id) => byId.get(id)!.event.round !== 'clasificatorio');
    const alreadyDone = outcome.matchedResultIds.length - toMove.length;
    console.log(
      `- ${t.name}: clasificatorios en el PDF ${wanted.length} · a mover ${toMove.length} · ya movidos ${alreadyDone} · sin pareja ${outcome.unmatched} · ambiguos ${outcome.ambiguous}`,
    );
    // Muchos ambiguos = la base tiene nados duplicados (el lector leía dos veces la tabla de eliminatorias de
    // los puestos que no pasaron a la final). Mover solo una parte dejaría el torneo a medias: no se toca.
    if (outcome.ambiguous > wanted.length * maxAmbiguousRatio) {
      console.log(`    ! demasiados ambiguos (${outcome.ambiguous} de ${wanted.length}): probable duplicado de datos viejos; este torneo no se toca (requiere limpiar duplicados o reimportar)`);
      totals.skippedTournaments++;
      continue;
    }
    totals.tournaments++;
    totals.wanted += wanted.length;
    totals.matched += toMove.length;
    totals.alreadyDone += alreadyDone;
    totals.unmatched += outcome.unmatched;
    totals.ambiguous += outcome.ambiguous;

    // 3) Aplicar
    if (apply && toMove.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          const newEventByOld = new Map<string, string>();
          const newHeatByKey = new Map<string, string>();
          const groups = new Map<string, { eventId: string; heatId: string | null; heatNumber: number | null; ids: string[] }>();
          for (const id of toMove) {
            const r = byId.get(id)!;
            const k = `${r.eventId}|${r.heatId ?? ''}`;
            const g = groups.get(k) ?? { eventId: r.eventId, heatId: r.heatId, heatNumber: r.heat?.heatNumber ?? null, ids: [] };
            g.ids.push(id);
            groups.set(k, g);
          }
          const touchedOldEvents = new Set<string>();
          for (const g of groups.values()) {
            let newEventId = newEventByOld.get(g.eventId);
            if (!newEventId) {
              const old = await tx.event.findUniqueOrThrow({ where: { id: g.eventId } });
              const existing = await tx.event.findFirst({
                where: { tournamentId: old.tournamentId, eventDefinitionId: old.eventDefinitionId, level: old.level, round: 'clasificatorio' },
                select: { id: true },
              });
              newEventId = existing
                ? existing.id
                : (await tx.event.create({
                    data: {
                      tournamentId: old.tournamentId, eventDefinitionId: old.eventDefinitionId, categoryId: old.categoryId,
                      round: 'clasificatorio', orderNo: old.orderNo, dayNumber: old.dayNumber, level: old.level, status: old.status,
                    },
                    select: { id: true },
                  })).id;
              newEventByOld.set(g.eventId, newEventId);
            }
            let newHeatId: string | null = null;
            if (g.heatNumber !== null) {
              const hk = `${newEventId}|${g.heatNumber}`;
              newHeatId = newHeatByKey.get(hk) ?? null;
              if (!newHeatId) {
                const existingHeat = await tx.heat.findUnique({ where: { eventId_heatNumber: { eventId: newEventId, heatNumber: g.heatNumber } }, select: { id: true } });
                newHeatId = existingHeat
                  ? existingHeat.id
                  : (await tx.heat.create({ data: { eventId: newEventId, heatNumber: g.heatNumber }, select: { id: true } })).id;
                newHeatByKey.set(hk, newHeatId);
              }
            }
            await tx.result.updateMany({ where: { id: { in: g.ids } }, data: { eventId: newEventId, heatId: newHeatId } });
            touchedOldEvents.add(g.eventId);
            totals.moved += g.ids.length;
          }
          // Series que quedaron sin ningún resultado en los eventos de los que se sacaron nados
          await tx.heat.deleteMany({
            where: { eventId: { in: [...touchedOldEvents] }, results: { none: {} }, laneAssignments: { none: {} } },
          });
          await tx.auditLog.create({
            data: {
              action: 'RESULTS_ROUND_SPLIT',
              entityType: 'tournament',
              entityId: dbTournament.id,
              payload: { moved: toMove.length, tournament: dbTournament.name, rule: 'nado repetido en otra jornada = final' },
            },
          });
        },
        { timeout: 300_000, maxWait: 30_000 },
      );
      console.log(`    ✔ ${toMove.length} nados pasados a clasificatorio`);
    }
  }

  console.log(`\nTotal: ${totals.tournaments} torneos (${totals.skippedTournaments} omitidos por ambiguos) · a mover ${totals.matched} · ya movidos ${totals.alreadyDone} · sin pareja ${totals.unmatched} · ambiguos ${totals.ambiguous}${apply ? ` · movidos ${totals.moved}` : ''}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
