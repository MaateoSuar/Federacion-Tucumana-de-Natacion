# CLAUDE.md — Plataforma FTN

> Leé este archivo completo antes de cualquier tarea. Es la memoria del proyecto.

## Qué es este proyecto

Plataforma web para la **Federación Tucumana de Natación (FTN)** que reemplaza planillas manuales, PDFs de resultados y récords en Excel por un sistema integrado. Gestiona el ciclo completo de natación federada: clubes, nadadores, torneos, inscripciones, resultados, récords, rankings y estadísticas históricas. El módulo central importa archivos de Meet Manager (HY3/CSV/Excel, PDF como fallback), los normaliza a un modelo propio y los muestra en una interfaz moderna tipo plataforma deportiva profesional, con detección automática de récords y perfiles para nadadores.

## Documentos de especificación (fuente de verdad — leerlos antes de responder)

| Documento | Contenido |
|-----------|-----------|
| [`ARQUITECTURA.md`](ARQUITECTURA.md) | Stack, arquitectura técnica, módulos, decisiones ADR |
| [`ESPECIFICACION-FUNCIONAL-v2.md`](ESPECIFICACION-FUNCIONAL-v2.md) | Perfil digital del nadador, importación, pasaporte digital |
| [`ESPECIFICACION-FUNCIONAL-v3.md`](ESPECIFICACION-FUNCIONAL-v3.md) | **AUTORITATIVO.** Rankings, cuentas, decisiones de negocio confirmadas |
| [`MODULO-INGESTA-RESULTADOS.md`](MODULO-INGESTA-RESULTADOS.md) | Pipeline de ingesta Meet Manager + sistema de resultados moderno |
| [`GUIA-TRABAJO-CON-SONNET.md`](GUIA-TRABAJO-CON-SONNET.md) | Metodología de trabajo: plan → aprobación → código → verificación |

Si algo no está en estos documentos, **preguntá, no asumas**.

---

## Stack y convenciones

**Lenguaje:** TypeScript estricto en todo (frontend, backend, scripts). Un solo lenguaje.

**Estructura del monorepo:**
```
/
├── apps/
│   ├── web/          # Next.js 14+ App Router (frontend público + panel admin)
│   └── api/          # NestJS (monolito modular, backend)
├── packages/
│   └── shared/       # Tipos compartidos, DTOs, enums, constantes de dominio
├── prisma/           # schema.prisma + migraciones + seeds
├── docker-compose.yml
└── CLAUDE.md
```

**Convenciones de código:**
- Archivos y carpetas: `kebab-case`.
- Clases y tipos: `PascalCase`. Variables y funciones: `camelCase`. Constantes y enums: `UPPER_SNAKE_CASE`.
- Módulos NestJS: un módulo por dominio (`clubs`, `swimmers`, `tournaments`, `results`, `records`, `rankings`, `import`, `auth`, etc.).
- Cada módulo tiene: `*.module.ts`, `*.controller.ts`, `*.service.ts`, y si aplica `*.repository.ts` y `*.spec.ts`.
- Rutas Next.js: App Router con `page.tsx` por segmento. Componentes en `components/`, hooks en `hooks/`.
- UI: TailwindCSS + shadcn/ui + Radix.
- Tiempos: **siempre en milisegundos enteros** (`number`). El formateo a `mm:ss.cc` ocurre solo en presentación.

---

## REGLAS INVIOLABLES (no negociables)

Estas reglas se blindan con tests. Nunca modificarlas sin aprobación explícita.

1. **Tiempos en milisegundos enteros.** Nunca strings (`"01:02.34"`), nunca floats. Nunca comparar ni rankear resultados de piscina de 25 m contra 50 m. Son universos separados.

2. **Categoría, club y piscina se CONGELAN en el resultado.** `results.category_id`, `results.club_id` y `tournaments.pool_length` se graban al momento de la inscripción/homologación y nunca se recalculan. La verdad histórica es inmutable.

3. **Edad deportiva = edad al 31 de diciembre del año de la competencia.** La función `resolveCategory(birthDate, seasonYear, scope)` usa esta regla. Parametrizable, pero el default es DEC_31.

4. **Récords de 25 m y 50 m son independientes.** La clave de un récord es `(scope, event_definition_id, category_id, gender, pool_length)`. Solo se evalúan récords sobre resultados **homologados**. **Decisión del 13/11/2026 (reemplaza la homologación humana previa):** cuando un resultado homologado supera al récord vigente, el récord **se actualiza solo** (el nuevo queda vigente, el anterior pasa a `superseded`). Si fue un error, un Admin lo **vuelve al anterior** desde el panel de récords (`PATCH /records/:id/revert`). Toda actualización automática y toda vuelta atrás queda en `audit_logs`. El récord anterior nunca se borra al ser superado.

5. **Importación idempotente.** Reimportar el mismo meet no duplica datos. Clave natural de idempotencia: `(external_meet_id | file_hash, event, swimmer, heat, lane)`. Usar upsert.

6. **Athlete ≠ User.** Un `swimmer` existe sin cuenta. Un `user` con rol NADADOR se vincula a un `swimmer` via `users.swimmer_id` (nullable), que se setea **únicamente** cuando un Admin aprueba un `AccountLinkRequest`. Toda vinculación queda auditada en `audit_logs`. Un swimmer ↔ una sola cuenta activa (índice único parcial).

**Reglas de negocio adicionales confirmadas:**
- `AthleteProfile` cuelga del `swimmer`, no del `user`. Existe aunque no haya cuenta.
- `NormalizedMeet` (staging) se persiste como JSONB en `meet_manager_import.parsed_payload`. El archivo original va a S3.
- Récords nacionales (`scope=nacional`) son **read-only de referencia**; la FTN no los homologa. Se muestran como benchmark sobre las marcas provinciales.
- Licencia/afiliación anual es **condición habilitante bloqueante**: sin licencia vigente, el nadador no puede inscribirse. El pasaporte figura como "vencida".
- Scoring de relevos = doble. Tablas con <8 competidores no se recortan (puntos solo a los puestos que existan). Todo en `scoring_schemes` JSONB, nada hardcodeado.

---

## Comandos del proyecto

```bash
# Desarrollo
pnpm dev              # Levanta web (puerto 3000) + api (puerto 3001) en paralelo via Turbo

# Calidad de código (deben pasar en verde antes de cada commit)
pnpm lint             # ESLint en todo el monorepo
pnpm typecheck        # tsc --noEmit en web + api + shared
pnpm test             # Jest (api) + Vitest (shared) — unit + integration tests
pnpm build            # Build de producción via Turbo (web + api)

# Base de datos
pnpm db:migrate       # prisma migrate dev --schema=prisma/schema.prisma
pnpm db:migrate:prod  # prisma migrate deploy --schema=prisma/schema.prisma
pnpm db:seed          # ts-node prisma/seed.ts
pnpm db:studio        # Prisma Studio en http://localhost:5555
pnpm db:reset         # prisma migrate reset (solo desarrollo — borra todo)

# Docker (infra local)
docker compose up -d  # Levanta PostgreSQL 16 (5432) + Redis 7 (6379)
docker compose --profile tools up -d  # + Adminer en http://localhost:8080
```

**Prerequisitos para desarrollo local:**
- Node.js >= 20, pnpm >= 9
- Docker Desktop corriendo
- Copiar `.env.example` a `.env` y completar secretos

---

## Cómo verificar que un cambio funciona

Un milestone está terminado **solo si se cumplen los tres:**

1. **`pnpm lint && pnpm typecheck && pnpm test` pasan en verde** (sin errores, sin `any` escapados).
2. **El criterio de verificación específico del milestone pasa** (definido al inicio de cada sesión).
3. **Se revisó el diff** y no hay archivos tocados fuera del alcance del milestone.

Para verificar manualmente: `pnpm dev` levanta la app y se puede navegar/probar el flujo específico del milestone.

---

## Metodología de trabajo (obligatoria)

Seguir siempre este ciclo:

```
1. PLAN primero → mostrar qué archivos se van a crear/modificar y qué decisiones se toman.
2. Esperar aprobación explícita ("Aprobado, procedé") antes de escribir código.
3. Código acotado al milestone → solo lo que fue aprobado.
4. Verificación propia → correr lint + typecheck + test y mostrar la salida.
5. Commit chico y verde por milestone.
```

---

## Agentes del proyecto (`.claude/agents/`)

| Agente | Tipo | Cuándo usarlo |
|--------|------|---------------|
| `milestone-planner` | Flujo (solo lectura) | Al iniciar cualquier feature: produce el plan para aprobar (paso 1 de la metodología). |
| `verifier` | Flujo (solo lectura) | Antes de cada commit y al cerrar un milestone: lint + typecheck + test (paso 4). |
| `rules-guardian` | Flujo (solo lectura) | Antes de cada commit, junto con `verifier`: diff contra reglas inviolables y alcance. |
| `ingest-specialist` | Dominio | Problemas de lectura de PDF/HY3/CSV de Meet Manager y normalización. |
| `identity-matcher` | Dominio | Matching de nadadores/clubes escritos distinto entre archivos; duplicados. |
| `data-quality-auditor` | Dominio (solo lectura) | Después de importaciones grandes: informe de nadadores/clubes duplicados y datos incompletos en la base. |
| `security-reviewer` | Flujo (solo lectura) | Antes de deployar o al tocar auth, roles, endpoints de admin, subida de archivos o datos personales. |
| `swim-platform-benchmarker` | Producto (solo lectura) | Antes de planear una feature: cómo la resuelven SwimCloud, SwimRankings, Meet Mobile, Swimify, World Aquatics, etc. |
| `sports-ux-benchmarker` | Estética (solo lectura) | Antes de que `ui-designer` construya una pantalla: patrones de UI de apps deportivas de referencia. |
| `swim-standards-expert` | Dominio (solo lectura) | Validar contra estándares: Lenex, HY3/SD3, puntos World Aquatics, reglas de récords y categorías. |
| `ui-designer` | Estética | Crear o rediseñar pantallas de `apps/web` con la identidad visual FTN. |
| `ui-reviewer` | Estética (solo lectura) | Auditoría visual/UX después de cambios de frontend. |

Un commit se hace solo si `verifier` está en verde y `rules-guardian` da **OK**.

---

## Qué NO hacer sin preguntar

- **Cambiar el esquema de datos aprobado** (tablas, columnas, tipos, relaciones, índices) sin consultar.
- **Tomar decisiones de negocio nuevas**: si algo no está en los documentos de spec, preguntar.
- **Tocar archivos fuera del alcance del milestone en curso**: si se detecta algo para mejorar en otro lado, anotarlo al final del mensaje, nunca hacerlo directamente.
- **Auto-aprobar vinculaciones**: el AccountLinkRequest siempre requiere acción humana. (Los récords sí se actualizan solos desde el 13/11/2026: ver regla 4.)
- **Comparar tiempos de piscinas distintas** o recalcular una categoría/club ya congelados en un resultado.
- **Hardcodear** puntos de scoring, esquemas de categorías o cualquier parámetro que deba ser configurable.
