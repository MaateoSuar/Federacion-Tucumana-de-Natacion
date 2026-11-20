/**
 * Lanzador de la carga masiva de torneos desde la copia local del Drive.
 * La lógica vive en apps/api/src/import/drive-loader (para que la cubran lint, typecheck y tests).
 *
 * Desde apps/api:
 *   pnpm exec ts-node-transpile-only -P tsconfig.json ../../prisma/scripts/load-drive-tournaments.ts \
 *     --root C:\ruta\ftn-drive-copia --dry-run
 *
 * Opciones: --root <carpeta> (obligatoria) · --dry-run · --folder Nacionales,NOA,Tucuman · --year 2025
 *           --only <texto del nombre> · --out <carpeta del informe> · --homologate-non-provincial
 *           --name-from archivo|encabezado (por defecto archivo)
 *           --probe-rehash <N> (prueba de idempotencia con otro hash sobre los primeros N archivos)
 *
 * Solo corre contra una base local (DATABASE_URL en localhost). Ver cli.ts.
 */
import { main } from '../../apps/api/src/import/drive-loader/cli';

main(process.argv.slice(2)).then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
