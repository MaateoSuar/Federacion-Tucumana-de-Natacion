import type { ConnectionOptions } from 'bullmq';

/**
 * Convierte REDIS_URL en opciones de conexión para BullMQ.
 * Respeta usuario, contraseña, base y TLS (`rediss://`), que los Redis gestionados
 * (Render Key Value, Upstash, etc.) exigen. Antes solo se tomaban host y puerto.
 */
export function bullConnectionFromUrl(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const db = url.pathname.replace('/', '');
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(db ? { db: parseInt(db, 10) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
