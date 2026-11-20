import { ConflictException, HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// La transacción de Prisma corta a los 5 s por defecto. Unificar un nadador con cientos de
// resultados sobre una base remota (Neon) tarda más: la transacción se cerraba a mitad de
// camino y el pedido terminaba en error. Se le da margen holgado.
export const MERGE_TX_OPTIONS = { maxWait: 20_000, timeout: 120_000 } as const;

const logger = new Logger('Merge');

/** Indexa por clave (si la clave se repite queda el primero). */
export function indexByKey<T>(items: T[], keyOf: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

/**
 * Convierte un error inesperado de la base en un mensaje claro para el administrador.
 * Las excepciones HTTP propias (400/404) pasan tal cual.
 */
export function translateMergeError(error: unknown, entity: 'nadador' | 'club'): never {
  if (error instanceof HttpException) throw error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(`Fallo al unificar ${entity} (${error.code}): ${error.message}`);
    if (error.code === 'P2028' || error.code === 'P2034') {
      throw new ServiceUnavailableException(
        'La base de datos tardó demasiado o hubo un choque con otra operación. No se cambió nada: probá de nuevo en unos segundos.',
      );
    }
    if (error.code === 'P2025') {
      throw new ConflictException('Otro administrador ya unificó o cambió estos registros. Actualizá la lista y revisá el resultado.');
    }
    if (error.code === 'P2002' || error.code === 'P2003' || error.code === 'P2014') {
      // El detalle técnico queda solo en el log del servidor
      throw new ConflictException(`No se pudo unificar: el ${entity} tiene datos relacionados que chocan con el principal. No se cambió nada.`);
    }
  }

  logger.error(`Fallo inesperado al unificar ${entity}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  throw new ServiceUnavailableException(
    'No se pudo unificar por un error inesperado. No se cambió nada: probá de nuevo y, si se repite, avisá al equipo técnico.',
  );
}

/** `limit` de la query: entero entre 1 y 200 (por defecto 50). Un valor inválido no vacía la lista. */
export function parseLimit(raw: string | undefined, fallback = 50): number {
  const parsed = raw === undefined ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 200);
}
