/**
 * Pruebas de integración de la unificación de nadadores y clubes contra una base Postgres REAL.
 * Los mocks no detectaban los choques de claves únicas ni las claves foráneas (el borrado del
 * duplicado fallaba con error 500 en producción), así que acá se usa la base de verdad.
 *
 * Se activan solo si existe MERGE_TEST_DATABASE_URL (una base DESCARTABLE con las migraciones
 * aplicadas; se vacía en cada corrida). Ejemplo:
 *   docker exec ftn_postgres psql -U ftn -d postgres -c "CREATE DATABASE ftn_merge_test"
 *   DATABASE_URL=postgresql://ftn:***@localhost:5432/ftn_merge_test npx prisma migrate deploy --schema=../../prisma/schema.prisma
 *   MERGE_TEST_DATABASE_URL=postgresql://ftn:***@localhost:5432/ftn_merge_test pnpm --filter api test merge.integration
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { SwimmerMergeService } from './swimmer-merge.service';
import { ClubMergeService } from './club-merge.service';
import { MERGE_TX_OPTIONS } from './merge-helpers';

const url = process.env.MERGE_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

// Vaciar y recrear los datos base en cada test tarda; el tiempo por defecto (5 s) es corto.
jest.setTimeout(60_000);

suite('unificación contra Postgres real', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prisma = db as unknown as PrismaService;
  const swimmers = new SwimmerMergeService(prisma);
  const clubs = new ClubMergeService(prisma);

  // Datos base compartidos (se recrean en cada test)
  let seasonId: string;
  let categoryId: string;
  let adminId: string;
  let clubA: string;
  let clubB: string;
  let tournamentId: string;
  let defs: string[];
  let events: string[];
  let seq = 0;
  const uid = (p: string) => `${p}-${++seq}`;

  async function wipe() {
    // Orden inverso a las dependencias; TRUNCATE ... CASCADE vacía todo lo que cuelga.
    await db.$executeRawUnsafe(
      `TRUNCATE users, seasons, categories, event_definitions, clubs, swimmers, roles RESTART IDENTITY CASCADE`,
    );
  }

  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    await wipe();
    const season = await db.season.create({ data: { year: 2026, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } });
    seasonId = season.id;
    categoryId = (await db.category.create({ data: { code: 'JUV', name: 'Juveniles', minAge: 15, maxAge: 16 } })).id;
    adminId = (await db.user.create({ data: { email: uid('admin') + '@t.ar', passwordHash: 'x', firstName: 'Ad', lastName: 'Min', primaryRole: 'ADMIN' } })).id;
    clubA = (await db.club.create({ data: { name: 'Club Atlético Azucena', shortName: 'CAZU', locality: 'Tucumán', province: 'Tucumán' } })).id;
    clubB = (await db.club.create({ data: { name: 'Azucena', shortName: 'AZU', locality: 'Tucumán' } })).id;
    tournamentId = (
      await db.tournament.create({
        data: { name: 'Torneo', poolLength: 'P25', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-02'), type: 'provincial', seasonId, hostClubId: clubA },
      })
    ).id;
    defs = [];
    events = [];
    for (const [i, distance] of [50, 100, 200].entries()) {
      const def = await db.eventDefinition.create({ data: { code: `${distance}L_M`, stroke: 'libre', distance, gender: 'M' } });
      defs.push(def.id);
      events.push((await db.event.create({ data: { tournamentId, eventDefinitionId: def.id, categoryId, orderNo: i + 1 } })).id);
    }
  });

  const newSwimmer = (over: Partial<{ firstName: string; lastName: string; gender: 'M' | 'F'; documentId: string; birthDate: Date; currentClubId: string }> = {}) =>
    db.swimmer.create({ data: { firstName: 'Mateo', lastName: 'Suar', gender: 'M', ...over } });

  const newResult = (swimmerId: string, eventIdx: number, finalTime: number | null, over: Record<string, unknown> = {}) =>
    db.result.create({
      data: { eventId: events[eventIdx]!, swimmerId, clubId: clubA, categoryId, finalTime, status: 'OK', ...over },
    });

  // ═══════════════════════════════════════════════════════════════════════════
  describe('nadadores', () => {
    it('unifica un nadador con TODO lo que le cuelga (incluido el historial de rankings que bloqueaba el borrado)', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer({ firstName: 'Mateo Andres', documentId: '40111222', birthDate: new Date('2010-03-04') });

      // principal
      const canR1 = await newResult(can.id, 0, 30000);
      await db.personalBest.create({ data: { swimmerId: can.id, eventDefinitionId: defs[0]!, poolLength: 'P25', bestTime: 30000, achievedAt: new Date(), sourceResultId: canR1.id } });
      await db.ranking.create({ data: { swimmerId: can.id, eventDefinitionId: defs[0]!, poolLength: 'P25', gender: 'M', scope: 'provincial', seasonId, categoryId, clubId: clubA, position: 2, finalTime: 30000, computedAt: new Date() } });
      await db.rankingHistory.create({ data: { swimmerId: can.id, eventDefinitionId: defs[0]!, categoryId, gender: 'M', poolLength: 'P25', scope: 'provincial', seasonId, position: 2, bestTimeMs: 30000, snapshotDate: new Date() } });
      await db.registration.create({ data: { eventId: events[0]!, swimmerId: can.id, clubId: clubA, categoryId } });
      await db.athleteStatistics.create({ data: { swimmerId: can.id, seasonId, totalEvents: 99, computedAt: new Date() } });
      await db.swimmerAlias.create({ data: { swimmerId: can.id, aliasNormalized: 'mateo suar' } });
      await db.athleteProfile.create({ data: { swimmerId: can.id } });

      // duplicado: misma carrera cargada dos veces (con parciales y un récord), otra prueba, una tercera homologada
      const dupSame = await newResult(dup.id, 0, 30000, { homologated: true, homologatedAt: new Date(), homologatedBy: adminId, isPb: true });
      await db.split.create({ data: { resultId: dupSame.id, distance: 25, cumulativeTime: 14000 } });
      const dupR2 = await newResult(dup.id, 1, 70000);
      const dupR3 = await newResult(dup.id, 2, 150000, { homologated: true });
      const rec = await db.record.create({
        data: {
          scope: 'provincial', eventDefinitionId: defs[0]!, categoryId, gender: 'M', poolLength: 'P25', timeMs: 30000, swimmerId: dup.id, clubId: clubA,
          recordDate: new Date(), sourceResultId: dupSame.id, status: 'homologated', isCurrent: true,
        },
      });
      await db.personalBest.create({ data: { swimmerId: dup.id, eventDefinitionId: defs[0]!, poolLength: 'P25', bestTime: 29000, achievedAt: new Date() } }); // mejor que la del principal
      await db.personalBest.create({ data: { swimmerId: dup.id, eventDefinitionId: defs[1]!, poolLength: 'P25', bestTime: 70000, achievedAt: new Date(), sourceResultId: dupR2.id } });
      await db.ranking.create({ data: { swimmerId: dup.id, eventDefinitionId: defs[0]!, poolLength: 'P25', gender: 'M', scope: 'provincial', seasonId, categoryId, clubId: clubA, position: 1, finalTime: 29000, computedAt: new Date() } });
      await db.ranking.create({ data: { swimmerId: dup.id, eventDefinitionId: defs[1]!, poolLength: 'P25', gender: 'M', scope: 'provincial', seasonId: null, categoryId, clubId: clubA, position: 1, finalTime: 70000, computedAt: new Date() } });
      await db.rankingHistory.create({ data: { swimmerId: dup.id, eventDefinitionId: defs[0]!, categoryId, gender: 'M', poolLength: 'P25', scope: 'provincial', seasonId, position: 1, bestTimeMs: 29000, snapshotDate: new Date() } });
      await db.rankingHistory.create({ data: { swimmerId: dup.id, eventDefinitionId: defs[1]!, categoryId, gender: 'M', poolLength: 'P25', scope: 'provincial', seasonId, position: 3, bestTimeMs: 70000, snapshotDate: new Date() } });
      const dupReg = await db.registration.create({ data: { eventId: events[0]!, swimmerId: dup.id, clubId: clubA, categoryId } });
      await db.registration.create({ data: { eventId: events[1]!, swimmerId: dup.id, clubId: clubA, categoryId } });
      const heat = await db.heat.create({ data: { eventId: events[0]!, heatNumber: 1 } });
      await db.laneAssignment.create({ data: { heatId: heat.id, registrationId: dupReg.id, lane: 4 } });
      await db.swimmerClubHistory.create({ data: { swimmerId: dup.id, clubId: clubA, seasonId, startDate: new Date('2026-01-01'), isActive: true } });
      await db.externalIdMap.create({ data: { sourceSystem: 'hy3', externalId: 'X-1', swimmerId: dup.id } });
      await db.athleteStatistics.create({ data: { swimmerId: dup.id, seasonId, totalEvents: 5, computedAt: new Date() } });
      await db.athleteStatistics.create({ data: { swimmerId: dup.id, seasonId: null, totalEvents: 7, computedAt: new Date() } });
      await db.swimmerAlias.create({ data: { swimmerId: dup.id, aliasNormalized: 'mateo suar' } }); // choca
      await db.swimmerAlias.create({ data: { swimmerId: dup.id, aliasNormalized: 'mateito' } });
      await db.athleteProfile.create({ data: { swimmerId: dup.id, bio: 'Nadador de Azucena' } });
      await db.athleteAchievement.create({ data: { swimmerId: dup.id, type: 'record', recordId: rec.id, title: 'Récord provincial', achievedAt: new Date() } });
      const u1 = await db.user.create({ data: { email: 'u1@t.ar', passwordHash: 'x', firstName: 'U', lastName: 'Uno' } });
      const u2 = await db.user.create({ data: { email: 'u2@t.ar', passwordHash: 'x', firstName: 'U', lastName: 'Dos' } });
      await db.accountLinkRequest.create({ data: { userId: u1.id, swimmerId: can.id, status: 'approved' } });
      await db.accountLinkRequest.create({ data: { userId: u2.id, swimmerId: dup.id, status: 'approved' } }); // índice único parcial

      const res = await swimmers.merge(can.id, dup.id, adminId);

      expect(res.merged).toBe(true);
      expect(await db.swimmer.findUnique({ where: { id: dup.id } })).toBeNull();

      // resultados: la carrera repetida se descartó, las otras dos pasaron
      const results = await db.result.findMany({ where: { swimmerId: can.id }, orderBy: { finalTime: 'asc' } });
      expect(results.map((r) => r.finalTime)).toEqual([30000, 70000, 150000]);
      expect(res.moved).toMatchObject({ results: 2, resultsDeduplicated: 1, resultsKeptRepeated: 0 });
      expect(await db.result.findUnique({ where: { id: dupSame.id } })).toBeNull();
      // la homologación y la bandera de PB del descartado pasaron al que quedó
      const kept = results.find((r) => r.id === canR1.id)!;
      expect(kept.homologated).toBe(true);
      expect(kept.isPb).toBe(true);
      expect(await db.result.count({ where: { id: dupR3.id, swimmerId: can.id } })).toBe(1);
      // los parciales del descartado pasaron al que quedó
      expect(await db.split.count({ where: { resultId: canR1.id } })).toBe(1);

      // el récord quedó intacto, con el principal como titular y apuntando al resultado que quedó
      const record = await db.record.findUniqueOrThrow({ where: { id: rec.id } });
      expect(record).toMatchObject({ swimmerId: can.id, sourceResultId: canR1.id, status: 'homologated', isCurrent: true, timeMs: 30000 });

      // mejores marcas: queda la mejor por (prueba, pileta)
      const pbs = await db.personalBest.findMany({ where: { swimmerId: can.id }, orderBy: { bestTime: 'asc' } });
      expect(pbs.map((p) => p.bestTime)).toEqual([29000, 70000]);

      // rankings: uno por clave, el mejor tiempo, y las posiciones renumeradas
      const rankings = await db.ranking.findMany({ where: { swimmerId: can.id }, orderBy: { finalTime: 'asc' } });
      expect(rankings.map((r) => r.finalTime)).toEqual([29000, 70000]);
      const rankingHistory = await db.rankingHistory.findMany({ where: { swimmerId: can.id }, orderBy: { bestTimeMs: 'asc' } });
      expect(rankingHistory.map((r) => r.bestTimeMs)).toEqual([29000, 70000]);

      // inscripciones: una por prueba; el andarivel de la repetida pasó a la del principal
      const regs = await db.registration.findMany({ where: { swimmerId: can.id } });
      expect(regs.map((r) => r.eventId).sort()).toEqual([events[0], events[1]].sort());
      const lane = await db.laneAssignment.findFirstOrThrow({ where: { heatId: heat.id } });
      expect(regs.map((r) => r.id)).toContain(lane.registrationId);

      // estadísticas recalculadas (no los 99 inventados) y sin filas del duplicado
      expect(await db.athleteStatistics.count({ where: { swimmerId: can.id } })).toBe(2);
      const stat = await db.athleteStatistics.findFirstOrThrow({ where: { swimmerId: can.id, seasonId } });
      expect(stat.totalEvents).toBe(2); // las dos homologadas OK (la de 30000 y la de 150000)

      // alias: el choque se descartó, el resto pasó y el nombre del duplicado quedó
      const aliases = (await db.swimmerAlias.findMany({ where: { swimmerId: can.id } })).map((a) => a.aliasNormalized).sort();
      expect(aliases).toEqual(['mateito', 'mateo andres suar', 'mateo suar']);

      // perfil: el principal tenía vacío, se completó con el del duplicado
      expect(await db.athleteProfile.count({ where: { swimmerId: can.id } })).toBe(1);
      expect((await db.athleteProfile.findUniqueOrThrow({ where: { swimmerId: can.id } })).bio).toBe('Nadador de Azucena');

      // solicitudes: la aprobada del duplicado se archivó como cancelada (una sola aprobada por nadador)
      const reqs = await db.accountLinkRequest.findMany({ where: { swimmerId: can.id } });
      expect(reqs).toHaveLength(2);
      expect(reqs.filter((r) => r.status === 'approved')).toHaveLength(1);

      expect(await db.externalIdMap.count({ where: { swimmerId: can.id } })).toBe(1);
      expect(await db.swimmerClubHistory.count({ where: { swimmerId: can.id } })).toBe(1);
      expect(await db.athleteAchievement.count({ where: { swimmerId: can.id } })).toBe(1);

      // hereda lo que no tenía
      const final = await db.swimmer.findUniqueOrThrow({ where: { id: can.id } });
      expect(final.documentId).toBe('40111222');
      expect(final.birthDate?.toISOString().slice(0, 10)).toBe('2010-03-04');

      // auditoría
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'SWIMMER_MERGED', entityId: can.id } });
      expect(audit.userId).toBe(adminId);
      expect(audit.payload).toMatchObject({ duplicateId: dup.id, moved: { resultsDeduplicated: 1 } });
    });

    it('si la misma carrera repetida ya es récord también en el principal, se conserva (no se pierde ningún récord)', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer();
      const canR = await newResult(can.id, 0, 30000);
      const dupR = await newResult(dup.id, 0, 30000);
      const mk = (swimmerId: string, sourceResultId: string, isCurrent: boolean) =>
        db.record.create({
          data: { scope: 'provincial', eventDefinitionId: defs[0]!, categoryId, gender: 'M', poolLength: 'P25', timeMs: 30000, swimmerId, clubId: clubA, recordDate: new Date(), sourceResultId, status: 'homologated', isCurrent },
        });
      await mk(can.id, canR.id, true);
      await mk(dup.id, dupR.id, false);

      const res = await swimmers.merge(can.id, dup.id, adminId);

      expect(res.moved).toMatchObject({ results: 1, resultsDeduplicated: 0, resultsKeptRepeated: 1 });
      expect(await db.result.count({ where: { swimmerId: can.id } })).toBe(2);
      expect(await db.record.count({ where: { swimmerId: can.id } })).toBe(2);
    });

    it('resultados distintos en la misma prueba (preliminar y final) se conservan todos', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer();
      await newResult(can.id, 0, 31000);
      await newResult(dup.id, 0, 30500);
      await swimmers.merge(can.id, dup.id, adminId);
      expect(await db.result.count({ where: { swimmerId: can.id } })).toBe(2);
    });

    it('NO unifica si el duplicado tiene cuenta vinculada, y no cambia nada', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer();
      await newResult(dup.id, 0, 30000);
      await db.user.create({ data: { email: 'n@t.ar', passwordHash: 'x', firstName: 'N', lastName: 'N', swimmerId: dup.id } });

      await expect(swimmers.merge(can.id, dup.id, adminId)).rejects.toBeInstanceOf(BadRequestException);
      expect(await db.swimmer.findUnique({ where: { id: dup.id } })).not.toBeNull();
      expect(await db.result.count({ where: { swimmerId: dup.id } })).toBe(1);
      expect(await db.auditLog.count({ where: { action: 'SWIMMER_MERGED' } })).toBe(0);
    });

    it('si el que tiene cuenta es el principal, la cuenta sigue vinculada a él', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer();
      await newResult(dup.id, 0, 30000);
      const user = await db.user.create({ data: { email: 'n@t.ar', passwordHash: 'x', firstName: 'N', lastName: 'N', swimmerId: can.id } });

      await swimmers.merge(can.id, dup.id, adminId, true);

      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).swimmerId).toBe(can.id);
      expect(await db.result.count({ where: { swimmerId: can.id } })).toBe(1);
    });

    it('rechaza consigo mismo, distinto género o inexistente (404 claro), y no deja nada a medias', async () => {
      const can = await newSwimmer();
      const girl = await newSwimmer({ gender: 'F' });
      await expect(swimmers.merge(can.id, can.id, adminId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(swimmers.merge(can.id, girl.id, adminId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(swimmers.merge(can.id, 'no-existe', adminId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(swimmers.merge('no-existe', can.id, adminId)).rejects.toBeInstanceOf(NotFoundException);
      expect(await db.swimmer.count()).toBe(2);
    });

    it('una unificación repetida (doble clic) da un 404 entendible y no rompe nada', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer();
      await swimmers.merge(can.id, dup.id, adminId);
      await expect(swimmers.merge(can.id, dup.id, adminId)).rejects.toThrow(/ya no existe/);
      expect(await db.swimmer.count()).toBe(1);
    });

    it('el principal no pierde datos propios: solo hereda lo que le falta', async () => {
      const can = await newSwimmer({ documentId: '111', birthDate: new Date('2009-01-01'), currentClubId: clubA });
      const dup = await newSwimmer({ documentId: '222', birthDate: new Date('2010-01-01'), currentClubId: clubB });
      await swimmers.merge(can.id, dup.id, adminId, true);
      const final = await db.swimmer.findUniqueOrThrow({ where: { id: can.id } });
      expect(final).toMatchObject({ documentId: '111', currentClubId: clubA });
      expect(final.birthDate?.toISOString().slice(0, 10)).toBe('2009-01-01');
    });

    it('con advertencias exige confirmación explícita del servidor, y deja constancia completa en la auditoría', async () => {
      const can = await newSwimmer({ birthDate: new Date('2009-01-01') });
      const dup = await newSwimmer({ birthDate: new Date('2012-01-01'), documentId: '999' });
      const r = await newResult(dup.id, 0, 30000);
      await db.record.create({ data: { scope: 'provincial', eventDefinitionId: defs[0]!, categoryId, gender: 'M', poolLength: 'P25', timeMs: 30000, swimmerId: dup.id, clubId: clubA, recordDate: new Date(), sourceResultId: r.id, status: 'homologated', isCurrent: true } });

      await expect(swimmers.merge(can.id, dup.id, adminId)).rejects.toThrow(/advertencias/);
      expect(await db.swimmer.count()).toBe(2);

      await swimmers.merge(can.id, dup.id, adminId, true);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'SWIMMER_MERGED', entityId: can.id } });
      const payload = audit.payload as { duplicateSnapshot: { id: string; documentId: string }; movedIds: { results: string[]; records: string[] }; warningsAcknowledged: string[] };
      expect(payload.duplicateSnapshot).toMatchObject({ id: dup.id, documentId: '999' });
      expect(payload.movedIds.results).toEqual([r.id]);
      expect(payload.movedIds.records).toHaveLength(1);
      expect(payload.warningsAcknowledged.length).toBeGreaterThan(0);
      // y se puede encontrar buscando por el id del duplicado
      expect(await db.auditLog.count({ where: { action: 'SWIMMER_MERGED_INTO', entityId: dup.id } })).toBe(1);
    });

    it('la vista previa cuenta lo que se mueve, avisa lo raro y marca lo que bloquea, sin cambiar nada', async () => {
      const can = await newSwimmer({ birthDate: new Date('2009-01-01'), currentClubId: clubA });
      const dup = await newSwimmer({ birthDate: new Date('2012-01-01'), currentClubId: clubB });
      await newResult(dup.id, 0, 30000);
      await newResult(dup.id, 1, 70000);
      await db.user.create({ data: { email: 'n@t.ar', passwordHash: 'x', firstName: 'N', lastName: 'N', swimmerId: dup.id } });

      const p = await swimmers.preview(can.id, dup.id);

      expect(p.willMove.results).toBe(2);
      expect(p.blockers).toHaveLength(1);
      expect(p.warnings.join(' ')).toMatch(/nacimiento/);
      expect(p.warnings.join(' ')).toMatch(/clubes actuales/);
      expect(p.warnings.join(' ')).toMatch(/principal no tiene resultados/);
      expect(p.duplicate.hasAccount).toBe(true);
      expect(await db.swimmer.count()).toBe(2);
    });

    it('usa una transacción con margen de tiempo (la de 5 s por defecto se cerraba a mitad de camino sobre Neon)', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer();
      const spy = jest.spyOn(db, '$transaction');
      await swimmers.merge(can.id, dup.id, adminId);
      expect(spy).toHaveBeenCalledWith(expect.any(Function), MERGE_TX_OPTIONS);
      expect(MERGE_TX_OPTIONS.timeout).toBeGreaterThanOrEqual(60_000);
      spy.mockRestore();
    });

    it('un nadador con cientos de resultados se unifica entero', async () => {
      const can = await newSwimmer();
      const dup = await newSwimmer();
      const evs = [];
      for (let i = 0; i < 300; i++) evs.push({ tournamentId, eventDefinitionId: defs[0]!, categoryId, orderNo: 100 + i });
      await db.event.createMany({ data: evs });
      const all = await db.event.findMany({ where: { orderNo: { gte: 100 } } });
      await db.result.createMany({ data: all.map((e, i) => ({ eventId: e.id, swimmerId: dup.id, clubId: clubA, categoryId, finalTime: 30000 + i, status: 'OK' as const })) });
      const res = await swimmers.merge(can.id, dup.id, adminId, true);
      expect(res.moved.results).toBe(300);
      expect(await db.result.count({ where: { swimmerId: can.id } })).toBe(300);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  describe('clubes', () => {
    it('unifica un club con TODO lo que le cuelga (usuarios, entrenadores, sede, roles, alias, afiliaciones, rankings)', async () => {
      const can = await db.club.create({ data: { name: 'Club Principal', shortName: 'CP', locality: 'Tucumán' } });
      const dup = await db.club.create({
        data: { name: 'Principal', shortName: 'PRI', locality: 'Tucumán', province: 'Tucumán', logoUrl: 'logo.png', foundedYear: 1950, contactEmail: 'c@c.ar' },
      });
      const s = await newSwimmer({ currentClubId: dup.id });
      const result = await db.result.create({ data: { eventId: events[0]!, swimmerId: s.id, clubId: dup.id, categoryId, finalTime: 30000, status: 'OK' } });
      await db.registration.create({ data: { eventId: events[0]!, swimmerId: s.id, clubId: dup.id, categoryId } });
      await db.swimmerClubHistory.create({ data: { swimmerId: s.id, clubId: dup.id, seasonId, startDate: new Date('2026-01-01'), isActive: true } });
      await db.record.create({ data: { scope: 'provincial', eventDefinitionId: defs[0]!, categoryId, gender: 'M', poolLength: 'P25', timeMs: 30000, swimmerId: s.id, clubId: dup.id, recordDate: new Date(), sourceResultId: result.id, status: 'homologated', isCurrent: true } });
      await db.ranking.create({ data: { swimmerId: s.id, eventDefinitionId: defs[0]!, poolLength: 'P25', gender: 'M', scope: 'provincial', seasonId, categoryId, clubId: dup.id, position: 1, finalTime: 30000, computedAt: new Date() } });
      await db.externalIdMap.create({ data: { sourceSystem: 'hy3', externalId: 'CLUB-1', clubId: dup.id } });
      await db.coach.create({ data: { clubId: dup.id, firstName: 'Co', lastName: 'Ach' } });
      const manager = await db.user.create({ data: { email: 'm@t.ar', passwordHash: 'x', firstName: 'M', lastName: 'M', clubId: dup.id } });
      await db.tournament.create({ data: { name: 'Sede', hostClubId: dup.id, poolLength: 'P25', startDate: new Date(), endDate: new Date(), type: 'provincial', seasonId } });
      const role = await db.role.create({ data: { name: 'CLUB_DELEGATE' } });
      await db.userRoleAssignment.create({ data: { userId: manager.id, roleId: role.id, clubId: dup.id } });
      await db.userRoleAssignment.create({ data: { userId: manager.id, roleId: role.id, clubId: can.id } }); // choca al mover
      await db.clubAlias.create({ data: { clubId: can.id, aliasNormalized: 'principal' } }); // choca
      await db.clubAlias.create({ data: { clubId: dup.id, aliasNormalized: 'principal' } });
      await db.clubAlias.create({ data: { clubId: dup.id, aliasNormalized: 'club princ' } });
      await db.affiliation.create({ data: { clubId: can.id, seasonId, status: 'vencida' } });
      await db.affiliation.create({ data: { clubId: dup.id, seasonId, status: 'vigente', paidAt: new Date('2026-02-01') } }); // choca, gana la vigente

      const res = await clubs.merge(can.id, dup.id, adminId, true);

      expect(res.merged).toBe(true);
      expect(await db.club.findUnique({ where: { id: dup.id } })).toBeNull();
      expect((await db.swimmer.findUniqueOrThrow({ where: { id: s.id } })).currentClubId).toBe(can.id);
      expect((await db.result.findUniqueOrThrow({ where: { id: result.id } })).clubId).toBe(can.id);
      expect(await db.registration.count({ where: { clubId: can.id } })).toBe(1);
      expect(await db.swimmerClubHistory.count({ where: { clubId: can.id } })).toBe(1);
      expect(await db.record.count({ where: { clubId: can.id } })).toBe(1);
      expect(await db.ranking.count({ where: { clubId: can.id } })).toBe(1);
      expect(await db.externalIdMap.count({ where: { clubId: can.id } })).toBe(1);
      expect(await db.coach.count({ where: { clubId: can.id } })).toBe(1);
      expect((await db.user.findUniqueOrThrow({ where: { id: manager.id } })).clubId).toBe(can.id);
      expect(await db.tournament.count({ where: { hostClubId: can.id } })).toBe(1); // la sede del duplicado
      expect(await db.userRoleAssignment.count({ where: { clubId: can.id } })).toBe(1);
      const aliases = (await db.clubAlias.findMany({ where: { clubId: can.id } })).map((a) => a.aliasNormalized).sort();
      expect(aliases).toEqual(['club princ', 'pri', 'principal']);
      const aff = await db.affiliation.findMany({ where: { clubId: can.id } });
      expect(aff).toHaveLength(1);
      expect(aff[0]).toMatchObject({ status: 'vigente' });

      // hereda lo que el principal no tenía
      expect(await db.club.findUniqueOrThrow({ where: { id: can.id } })).toMatchObject({ province: 'Tucumán', logoUrl: 'logo.png', foundedYear: 1950, contactEmail: 'c@c.ar' });
      expect(await db.auditLog.count({ where: { action: 'CLUB_MERGED', entityId: can.id } })).toBe(1);
    });

    it('rechaza consigo mismo e inexistentes; una repetición da 404 claro', async () => {
      await expect(clubs.merge(clubA, clubA, adminId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(clubs.merge(clubA, 'no-existe', adminId)).rejects.toBeInstanceOf(NotFoundException);
      await clubs.merge(clubA, clubB, adminId).catch(() => undefined);
    });

    it('la vista previa avisa si las provincias difieren, sin cambiar nada', async () => {
      const salta = await db.club.create({ data: { name: 'Salta Nada', shortName: 'SN', locality: 'Salta', province: 'Salta' } });
      const p = await clubs.preview(clubA, salta.id);
      expect(p.warnings.join(' ')).toMatch(/provincias son distintas/);
      expect(await db.club.count()).toBe(3);
    });
  });
});
