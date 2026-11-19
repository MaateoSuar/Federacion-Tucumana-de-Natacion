/**
 * Reglas de la unificación que corren SIEMPRE (con mocks, sin base de datos): validaciones,
 * regla 6 (cuentas), confirmación de advertencias y traducción de errores. Los choques de
 * claves únicas y el borrado real se prueban en merge.integration.spec.ts (Postgres real).
 */
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SwimmerMergeService } from './swimmer-merge.service';
import { MERGE_TX_OPTIONS, parseLimit, translateMergeError } from './merge-helpers';

type Row = Record<string, unknown>;

const swimmer = (id: string, over: Row = {}): Row => ({
  id, firstName: 'Nicolas', lastName: 'BABOT', gender: 'M', birthDate: null, documentId: null, currentClubId: null,
  photoUrl: null, currentClub: null, user: null,
  _count: { results: 1, registrations: 0, personalBests: 0, records: 0, rankings: 0, rankingHistory: 0, clubHistory: 0, statistics: 0, achievements: 0, aliases: 0, linkRequests: 0, externalIdMaps: 0 },
  ...over,
});

function setup(rows: Record<string, Row | null>) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    swimmer: { findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(rows[where.id] ?? null)) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    swimmer: tx.swimmer,
  };
  return { service: new SwimmerMergeService(prisma as never), prisma, tx };
}

describe('SwimmerMergeService — validaciones', () => {
  it('abre la transacción con margen de tiempo y bloquea las dos filas antes de decidir', async () => {
    const { service, prisma, tx } = setup({ can: swimmer('can'), dup: null });
    await expect(service.merge('can', 'dup', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), MERGE_TX_OPTIONS);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rechaza unificar un nadador consigo mismo', async () => {
    const { service } = setup({ can: swimmer('can') });
    await expect(service.merge('can', 'can', 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un duplicado que ya no existe da un 404 entendible (doble clic / otro admin)', async () => {
    const { service } = setup({ can: swimmer('can'), dup: null });
    await expect(service.merge('can', 'dup', 'admin')).rejects.toThrow(/ya no existe/);
  });

  it('no unifica nadadores de distinto género', async () => {
    const { service } = setup({ can: swimmer('can'), dup: swimmer('dup', { gender: 'F' }) });
    await expect(service.merge('can', 'dup', 'admin', true)).rejects.toThrow(/distinto género/);
  });

  it('regla 6: no elimina a un nadador con cuenta vinculada, aunque se confirmen las advertencias', async () => {
    const { service } = setup({ can: swimmer('can'), dup: swimmer('dup', { user: { id: 'u1' } }) });
    await expect(service.merge('can', 'dup', 'admin', true)).rejects.toThrow(/cuenta de usuario vinculada/);
  });

  it('regla 6: si los dos tienen cuenta, primero hay que resolver las vinculaciones', async () => {
    const { service } = setup({ can: swimmer('can', { user: { id: 'u0' } }), dup: swimmer('dup', { user: { id: 'u1' } }) });
    await expect(service.merge('can', 'dup', 'admin', true)).rejects.toThrow(/Resolvé primero/);
  });

  it('con advertencias (años de nacimiento distintos) el servidor exige confirmación explícita', async () => {
    const { service } = setup({
      can: swimmer('can', { birthDate: new Date('2009-01-01') }),
      dup: swimmer('dup', { birthDate: new Date('2012-01-01') }),
    });
    await expect(service.merge('can', 'dup', 'admin')).rejects.toThrow(/advertencias/);
  });

  it('la vista previa informa bloqueos y advertencias sin escribir nada', async () => {
    const { service, tx } = setup({
      can: swimmer('can', { _count: { ...(swimmer('can')._count as Row), results: 0 } }),
      dup: swimmer('dup', { user: { id: 'u1' } }),
    });
    const p = await service.preview('can', 'dup');
    expect(p.blockers).toHaveLength(1);
    expect(p.warnings.join(' ')).toMatch(/principal no tiene resultados/);
    expect(p.duplicate.hasAccount).toBe(true);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('translateMergeError', () => {
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'x' });

  it('deja pasar las excepciones HTTP propias', () => {
    expect(() => translateMergeError(new NotFoundException('x'), 'nadador')).toThrow(NotFoundException);
  });

  it('timeout de la transacción → 503 con mensaje claro (antes era un 500 opaco)', () => {
    expect(() => translateMergeError(known('P2028'), 'nadador')).toThrow(ServiceUnavailableException);
  });

  it('otro admin ya cambió el registro (P2025) → 409', () => {
    expect(() => translateMergeError(known('P2025'), 'club')).toThrow(ConflictException);
  });

  it('choque de claves → 409 sin filtrar nombres de columnas ni códigos al cliente', () => {
    try {
      translateMergeError(known('P2002'), 'nadador');
      throw new Error('debía lanzar');
    } catch (e) {
      expect((e as ConflictException).message).not.toMatch(/P2002|_key|target/);
    }
  });

  it('un error cualquiera → 503 genérico, sin stack', () => {
    try {
      translateMergeError(new Error('select * from secreto'), 'club');
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceUnavailableException);
      expect((e as Error).message).not.toMatch(/secreto/);
    }
  });
});

describe('parseLimit', () => {
  it('valores inválidos no vacían la lista', () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit('abc')).toBe(50);
    expect(parseLimit('-3')).toBe(50);
    expect(parseLimit('0')).toBe(50);
  });
  it('acota entre 1 y 200', () => {
    expect(parseLimit('25')).toBe(25);
    expect(parseLimit('99999')).toBe(200);
  });
});
