# Traspaso — Plataforma FTN → sesión de desarrollo con Sonnet

> Documento de traspaso escrito el 2026-11-09. Contiene: estado real de la app, inventario, bugs verificados, el pedido prioritario del usuario (perfil del nadador con progresión), un roadmap de mejoras basado en un estudio de plataformas de natación existentes, y cómo trabajar con los agentes del proyecto.
>
> **Leé primero `CLAUDE.md`** (reglas inviolables y metodología). Este documento no las reemplaza: las aplica.

---

## 0. Cómo usar este documento (instrucciones para Sonnet)

1. **Un milestone por vez.** Elegí el siguiente de la sección 6 en orden. Para cada uno:
   1. Corré el agente `milestone-planner` (o armá el plan vos) → mostrá archivos a crear/modificar, decisiones, cambios de esquema y criterio de verificación.
   2. **Esperá aprobación explícita del usuario** ("Aprobado, procedé"). Todo cambio en `prisma/schema.prisma` requiere aprobación aparte.
   3. Implementá solo lo aprobado. Tests primero cuando sea lógica de dominio.
   4. Corré `verifier` (lint + typecheck + test) y `rules-guardian` (reglas inviolables + alcance). Para UI, además `ui-reviewer` y verificación en el navegador (preview "FTN Full Stack (Turbo)" de `.claude/launch.json`).
   5. Commit chico y verde, con mensaje en el estilo del repo (`feat(modulo): ...`, `fix(modulo): ...`).
2. **Si algo no está en la spec, preguntá.** Las preguntas abiertas están en la sección 8.
3. **Nunca:** comparar 25 m con 50 m, recalcular categoría/club/piscina de un resultado, publicar récords sin homologación humana, vincular identidades (nadador↔usuario, nadador↔nadador) sin acción de Admin auditada, hardcodear puntajes/categorías/umbrales.
4. **Usuarios demo** para probar en local: ver `prisma/seed-demo.ts` (admin, entrenador y nadador). No copies las contraseñas a otros archivos.
5. **Antes de empezar**, mirá `git status`. Al cerrar este documento quedaban **sin commitear** los cambios del milestone "decisiones del Admin en el preview" (sección 2.2) más 3 agentes nuevos y este archivo. Si siguen sin commitear: corré `verifier`, y si está en verde, commitealos primero.

---

## 1. Qué es la app (30 segundos)

Plataforma web de la **Federación Tucumana de Natación**. Reemplaza planillas y PDFs por un sistema integrado: clubes, nadadores, torneos, resultados, récords, rankings y estadísticas. Su núcleo es la **importación de resultados de Meet Manager** (hoy sobre todo PDF), normalizados a un modelo propio, con detección de récords y perfiles públicos de nadadores. Los nadadores son en su mayoría **menores de edad**.

Monorepo pnpm + Turbo:

| Parte | Tecnología |
|---|---|
| `apps/api` | NestJS 10, Prisma 5, PostgreSQL 16, BullMQ + Redis 7, socket.io, pdf-parse, xlsx, argon2, Jest |
| `apps/web` | Next.js 14 (App Router), React 18, Tailwind 3, recharts. **No** tiene shadcn/Radix instalado aunque `CLAUDE.md` lo menciona |
| `packages/shared` | Enums y tipos compartidos (Vitest configurado, sin tests) |
| Infra | `docker-compose.yml` (postgres + redis), Dockerfiles para Railway, 8 migraciones |

Comandos: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:seed`, `pnpm db:seed:demo`. Ojo: `pnpm db:migrate` ejecuta `migrate deploy` (no `migrate dev` como dice `CLAUDE.md`); para crear migraciones usá `pnpm prisma migrate dev --schema=prisma/schema.prisma`.

---

## 2. Estado actual

### 2.1 Qué funciona

- **Público:** home, lista y detalle de torneos (pruebas, archivos por jornada, medallas), resultados por prueba con parciales y websocket, rankings por prueba y por club, récords provinciales y nacionales (referencia), perfil público del nadador (PBs, resultados, estadísticas, evolución por temporada, historial de clubes).
- **Admin** (`/admin`, solo ADMIN/SUPER_ADMIN): clubes, nadadores, torneos (estado, documentos, archivos por jornada, generación de series), récords (edición manual + homologación de candidatos), importación de archivos con preview.
- **Importación:** PDF de Meet Manager (resultados y sembrados), CSV y Excel → `NormalizedMeet` en staging (JSONB) → preview → commit transaccional → rollback.
- **Récords:** detección automática → candidato `pending_homologation` → aprobación del Admin. 25 m y 50 m independientes. Nacionales read-only.
- **Exportación** Lenex y PDF/HTML de torneos (admin).
- **Tests:** 25 suites, ~280 tests en verde en la API.

### 2.2 Lo que se hizo en la última sesión

1. **Agentes del proyecto** en `.claude/agents/` (ver sección 7).
2. **Matching de nombres por palabras** (commit `ba1448d`). Nadadores y clubes escritos distinto ("Mateo Rodriguez" / "Mateo Rodriguez Suar" / "Mateo Suar"; "Club Azucena" / "Azucena Club" / "Azucena" / sigla "CAT") se comparan palabra por palabra, sin importar orden, con tolerancia a tipeos, abreviaturas e iniciales, y con señales de género (descarta), año de nacimiento y club. El preview muestra hasta 3 candidatos con puntaje y motivo. Pesos ajustables vía `IMPORT_MATCHING_CONFIG` (`apps/api/src/import/matching/match-config.ts`).
3. **Decisiones del Admin en el preview** (sin commitear al escribir esto):
   - `PATCH /import/:id/matches`: el Admin elige un candidato o "es nuevo" para cada match dudoso.
   - El commit usa esas decisiones (ya no re-busca por nombre exacto, que fusionaba homónimos) y rechaza si hay pendientes.
   - Si otra importación confirmada después del análisis creó a esa persona, el commit re-analiza, actualiza el preview y pide revisar en vez de duplicar.
   - **Aprendizaje (solo PDF):** cada grafía confirmada queda en `external_id_map` y la próxima vez se reconoce sola. La clave del PDF es `apellido|nombre|club|género` (`pdf-line-parser.ts:408`): un homónimo exacto del mismo club y género quedaría vinculado solo — riesgo conocido y aceptado.
   - Auditoría de cada decisión en `audit_logs`. Rollback borra lo aprendido.
   - Todos los endpoints de `/import` exigen rol ADMIN/SUPER_ADMIN (antes cualquier usuario logueado podía confirmar o revertir importaciones).

### 2.3 Datos locales

418 nadadores, 36 clubes, ~4.400 resultados, 561 récords, 1.232 PBs, 0 afiliaciones. **Hay duplicados reales** (ver bug B-09): son el bloqueante principal del perfil del nadador.

---

## 3. Inventario técnico

### 3.1 API (`apps/api/src`) — endpoints

| Módulo | Público | Protegido |
|---|---|---|
| `auth` | register, verify-email, login, forgot/reset-password | refresh (jwt-refresh), logout, me (JWT) |
| `clubs` | `GET /clubs`, `GET /clubs/:id` | POST/PATCH/DELETE (ADMIN) |
| `swimmers` | `GET /swimmers`, `/:id`, `/:id/club-history`, `/:id/personal-bests`, `/:id/results`, `/:id/statistics`, `/:id/time-evolution`, `/:id/profile` | POST/PATCH/DELETE y `/:id/club-assignment` (ADMIN); `PATCH /:id/profile` (nadador vinculado o admin) |
| `tournaments` | catálogos (`event-definitions`, `categories`, `seasons`), torneos, eventos, resultados, heats, documentos, archivos por jornada | alta/edición, estado (finalizar homologa), eventos, split-day, heats, documentos (ADMIN) |
| `import` | — | todo ADMIN: upload, estado, preview, `PATCH matches`, commit, rollback |
| `rankings` | `GET /rankings/event`, `/rankings/club` | — |
| `records` | `GET /records`, `/records/national` | candidates, homologate, edición manual (ADMIN) |
| `homologation` | — | `PATCH /results/:id/homologate` (ADMIN, sin UI); cola BullMQ con procesadores de PB, logros, estadísticas y evaluador de récords |
| `export` | — | Lenex, PDF, history (ADMIN) |
| `account-link` | — | nadador: solicitar/ver/cancelar; admin: listar/aprobar/rechazar |
| `storage` | — | `POST /upload/image` (cualquier usuario con JWT ⚠) |
| `results-gateway` | websocket `/results` (`join-event`, `results:updated`, `tournament:updated`) | — |

Swagger en `/api/docs` (expuesto también en producción ⚠).

### 3.2 Web (`apps/web/src/app`)

- **Públicas:** `/`, `/torneos`, `/torneos/[id]`, `/torneos/[id]/prueba/[eventId]`, `/rankings`, `/records`, `/nadadores/[id]`.
- **Login y roles:** `/login`; `/nadador` (redirige al perfil vinculado o dice "solicitá la vinculación" sin UI para hacerlo); `/entrenador` (dashboard del club); `/entrenador/nadadores/nuevo` (falla con 403).
- **Admin:** `/admin/clubes(+nuevo,[id])`, `/admin/nadadores(+nuevo,[id])`, `/admin/torneos(+nuevo,[id])`, `/admin/records`, `/admin/import`, `/admin/import/[jobId]/preview`.
- **Faltan páginas de:** aprobación de vinculaciones, licencias/afiliaciones, inscripciones, scoring, temporadas/categorías, auditoría, usuarios, unificación de duplicados.
- **Compartidos:** `AuthGuard`, `NavBar`, `DatePicker`, `ImageUpload`, `SwimmerEvolutionChart`, `swimmer/SwimmerCarousel`, `ui/MedalIcon`, `ui/RecordBadge`, `ui/StatusBadge`; `hooks/useResultsSocket`; `lib/api.ts`, `lib/auth.tsx`, `lib/formatTime.ts`, `lib/search.ts`.
- **Identidad visual:** tema oscuro "piscina" (paleta `pool`/`aqua` en `tailwind.config.ts`), Inter, animaciones `wave`/`float`/`shimmer`. El panel admin usa un tema claro.

### 3.3 Esquema (Prisma)

- **En uso:** User, Club, Season, Category, Swimmer, SwimmerClubHistory, AthleteProfile, AccountLinkRequest, EventDefinition, Tournament, Event, Heat, LaneAssignment, Result, Split, PersonalBest, Record, Ranking, AthleteStatistics, AthleteAchievement, ScoringScheme, TournamentDocument, TournamentDayFile, ImportJob, MeetManagerImport, ExternalIdMap, MeetManagerExport, AuditLog.
- **Definidos pero sin uso en código:** Role/Permission/RolePermission/UserRoleAssignment (los guards usan `user.primaryRole`), **Affiliation** (licencia bloqueante no implementada), Coach, RankingHistory, News, Media. `Registration` casi sin uso (no hay inscripciones).

### 3.4 Spec vs. implementación

| Feature de la spec | Estado |
|---|---|
| Licencia anual bloqueante + pasaporte "vencida" (v3) | ❌ No implementado |
| Pasaporte digital (v2) | ❌ No implementado |
| Inscripciones online | ❌ No implementado |
| `resolveCategory` DEC_31 en `packages/shared` | ⚠ A medias: función local en `commit.processor.ts:73-94`, ignora `CategoryScope`, usa la edad del archivo cuando falta fecha, `getFullYear()` con zona horaria |
| Récords con homologación humana | ✅ |
| Homologación de resultados | ⚠ Automática al finalizar un torneo; el commit de importación crea el torneo ya `finalizado` y **no dispara** la homologación (verificar) |
| Scoring relevos doble, configurable | ⚠ Fallback hardcodeado `[9,7,6,5,4,3,2,1]` en `rankings.service.ts:175` |
| Rankings, perfil, PBs, logros, estadísticas | ✅ (perfil sin progresión por torneo: ver sección 5) |
| Exportación Lenex / PDF | ✅ (solo admin) |
| Resultados en vivo | ⚠ Websocket existe, solo emite al confirmar una importación |
| Archivos en S3 | ❌ Disco local `uploads/` (se pierde en cada redeploy de Railway) |
| Emails (verificación, recupero) | ❌ Stub |
| RBAC granular por permisos | ❌ Tablas sin uso |
| HY3 / SD3 | ❌ Se acepta la extensión pero no hay adaptador |

### 3.5 Tests faltantes

`tournaments.service` (transiciones, heats, split-day), `storage`, `results.gateway`, adaptador Excel, `format-detector`, `normalizer`, `import.processor` end-to-end, `resolveCategory` (DEC_31 + zona horaria), procesador de estadísticas, **cero tests en `apps/web`**, cero en `packages/shared`, sin e2e de API.

---

## 4. Bugs y deuda técnica verificados (arreglar en este orden)

> **Decisión de la federación (2026-11-09):** publicar los datos de los nadadores menores no es un problema. No hay que restringir nombre, fecha de nacimiento, club, fotos ni resultados en las vistas públicas.

### P0 — seguridad
| ID | Bug | Dónde | Arreglo |
|---|---|---|---|
| B-01 | *(Opcional, consultar)* `GET /swimmers` público permite **buscar por DNI** y devuelve el DNI | `swimmers.service.ts:76` | Si la federación lo pide: quitar solo el DNI de la respuesta pública y la búsqueda por DNI. El resto de los datos se publica |
| B-02 | Swagger expuesto en producción | `main.ts:32` | Solo si `NODE_ENV !== 'production'` |
| B-03 | Sin rate limit en login / forgot-password | `auth` | `@nestjs/throttler` en esos endpoints |
| B-04 | `POST /upload/image` acepta cualquier usuario autenticado | `storage.controller.ts:56` | Rol ADMIN (o dueño del perfil para su foto), validar tipo y tamaño |
| B-05 | Archivos en disco local en Railway (se pierden) | `storage`, `import.service.ts:22` | S3/R2 con las variables `S3_*` ya previstas. **Consultar** proveedor |

### P0 — funcionales
| ID | Bug | Dónde | Arreglo |
|---|---|---|---|
| B-06 | Ningún CSV se puede confirmar: `start_date: ''` → año `NaN` → Prisma falla | `csv-mapper.ts:358`, `commit.processor.ts` | Pedir fecha/nombre/piscina del torneo en el upload cuando el formato no los trae (CSV/Excel), o validar en el preview y bloquear con mensaje claro |
| B-07 | Nombre del torneo CSV = ruta del archivo en disco | `csv-mapper.ts:355` | Usar el nombre original del archivo o el que cargue el Admin |
| B-08 | La web no refresca el token: sesión cortada a los 15 min | `lib/auth.tsx` | Interceptor en `apiFetch` que use `/auth/refresh` ante 401 y reintente una vez |
| B-09 | **Duplicados en la base**: "CAZU"/"Club Azucena", 33 clubes con sigla = nombre, nadadores repetidos ×3 (p. ej. Alessandro Marsilli, Ezequiel Natanael Romero, Sofia Belen Flores Breslauer, Franco Daniel Cagna, Constanza Antonella Suarez), "Juan Cruz SOLORZANO SANCHO"/"Solorazano Sancho" | datos | Milestone M1 (herramienta de unificación). **Bloquea el perfil del nadador** |
| B-10 | Importaciones no disparan homologación (torneo creado ya `finalizado`) → resultados podrían no entrar a rankings/PBs | `commit.processor.ts:396` | Verificar; si se confirma, encolar `homologateTournament` tras el commit o crear el torneo en `en_curso` y finalizar explícitamente |
| B-11 | Categoría: `getFullYear()` en hora local sobre fechas UTC (nacidos el 1/1 caen en el año anterior) y edad del archivo en vez de DEC_31 | `commit.processor.ts:73-94,212` | Mover `resolveCategory` a `packages/shared` con `getUTCFullYear`, scope y tests |
| B-12 | Entrenador: alta de nadador siempre 403; accesos "Importar resultados" y "Ver todos" van a `/admin` | `entrenador/nadadores/nuevo/page.tsx:70`, `entrenador/page.tsx:235,252` | **Consultar** si el entrenador puede dar altas (¿pendientes de aprobación?). Quitar o redirigir links |
| B-13 | Selector de temporadas vacío en ficha de nadador (admin) | `admin/nadadores/[id]/page.tsx:67` (llama `/seasons?limit=20`, la ruta es `/tournaments/seasons` y devuelve array) | Corregir URL y forma de respuesta |
| B-14 | Vinculación usuario↔nadador sin UI | `account-link` | Milestone M7 |

### P1 — UX y deuda
| ID | Bug | Dónde |
|---|---|---|
| B-15 | Home sin menú en mobile (`hidden md:flex`) | `app/page.tsx:38,50` |
| B-16 | Panel admin no responsive (737 px en viewport de 375) | `admin/layout.tsx` |
| B-17 | Contraste bajo en textos secundarios (tarjetas de torneo, footer), dato de piscina casi invisible | `app/page.tsx:136-148,225` |
| B-18 | Error de API en home se muestra como "no hay torneos" | `app/page.tsx:22-27` |
| B-19 | Rollback falla por FK si otra importación usó nadadores/clubes creados | `commit.processor.ts` rollback |
| B-20 | `ClubMatcher` paso 2 busca `shortName = ''` si viene vacío | `club-matcher.ts:44-46` |
| B-21 | Scoring fallback hardcodeado | `rankings.service.ts:175` |
| B-22 | HY3 aceptado sin adaptador | `import.controller.ts` `ALLOWED_EXTENSIONS` |
| B-23 | Config: `turbo dev --parallel` deprecado, `version` obsoleto en docker-compose, falta `CORS_ORIGIN` en `.env.example`, falta `outputs` de test en `turbo.json` | raíz |
| B-24 | `PATCH /import/:id/matches` lee-modifica-escribe JSON sin lock (riesgo bajo) | `import.service.ts` |

---

## 5. ⭐ Prioridad del usuario: Perfil del nadador con progresión

> Pedido textual del usuario: que todos los nadadores tengan cargados sus torneos bajo el mismo nombre, y un perfil con **todos sus resultados y torneos**, **remarcando su mejor tiempo en cada prueba**, con **seguimiento de cuánto bajó respecto de su mejor tiempo de torneo a torneo**, y que aparezca **el tiempo del último torneo con una flecha roja si subió (y cuánto) o verde si bajó (y cuánto)**. **Que quede estéticamente estructurado y lindo.**

### 5.1 Prerrequisito: identidad única (M1)
El perfil solo sirve si cada nadador tiene un único registro. Antes de construirlo: herramienta de **unificación de duplicados** (M1) + el matching de importación que ya existe (sección 2.2). Correr `data-quality-auditor` para obtener la lista de duplicados.

### 5.2 Qué existe hoy
- `GET /swimmers/:id/personal-bests` lee la tabla `PersonalBest` (por prueba y piscina, la mantiene `homologation/processors/personal-best.processor.ts`).
- `GET /swimmers/:id/time-evolution` agrupa **por temporada** (año), no por torneo (`swimmers.service.ts:~300-352`).
- `apps/web/src/app/nadadores/[id]/page.tsx` + `components/SwimmerEvolutionChart.tsx` muestran PBs y evolución anual.
- **Falta:** progresión torneo a torneo, comparación con el PB vigente en cada momento, último tiempo con delta, línea de tiempo de torneos.

### 5.3 Reglas de cálculo (no negociables)
- Cada **(prueba, piscina)** es una serie independiente: **25 m y 50 m nunca se mezclan** ni se comparan.
- Solo resultados con `status = OK`, tiempo no nulo y **homologados** (DSQ/DNS/DNF se listan en el historial pero no cuentan para PB ni deltas).
- Si en un torneo nadó la misma prueba más de una vez (serie + final), el valor del torneo es **el mejor de ese torneo**; se puede mostrar el detalle al expandir.
- Orden cronológico por fecha del torneo (`tournament.startDate`, y si empata, `event.orderNo`).
- Para cada torneo `t` en la serie:
  - `time_t` = mejor tiempo del torneo.
  - `deltaVsPrevious_t = time_t − time_{t−1}` (vs. el torneo anterior de esa prueba/piscina).
  - `pbBefore_t` = mejor tiempo **antes** de `t`; `deltaVsPb_t = time_t − pbBefore_t`.
  - `isPb_t = time_t < pbBefore_t` (o primer registro).
- **Último torneo:** `time_last`, `deltaVsPrevious_last`, `deltaVsPb_last`.
- **Mejora acumulada:** `firstTime − currentPb`.
- Todo en **milisegundos enteros**; el formateo `mm:ss.cc` y `±s.cc` solo en el frontend (`lib/formatTime.ts`).
- Categoría y club que se muestran en cada fila son los **congelados en el resultado**, no los actuales.

### 5.4 API (sin cambios de esquema)
Nuevo endpoint público `GET /swimmers/:id/progression?pool=P25|P50` (el DTO no expone datos sensibles) que devuelve:

```ts
interface SwimmerProgression {
  swimmerId: string;
  events: Array<{
    eventDefinitionId: string;
    label: string;            // "100 m Libre"
    stroke: string;
    distance: number;
    pool: 'P25' | 'P50';
    personalBest: { timeMs: number; tournamentId: string; tournamentName: string; date: string; worldAquaticsPoints: number | null };
    last: {
      timeMs: number; tournamentId: string; tournamentName: string; date: string;
      deltaVsPreviousMs: number | null;   // negativo = bajó (mejoró)
      deltaVsPbMs: number | null;         // vs. PB vigente ANTES de ese torneo
      isPb: boolean;
    };
    totalImprovementMs: number | null;    // primer tiempo − PB actual
    history: Array<{
      tournamentId: string; tournamentName: string; date: string;
      timeMs: number; deltaVsPreviousMs: number | null; deltaVsPbMs: number | null; isPb: boolean;
      categoryName: string; clubName: string;   // congelados en el resultado
      place: number | null; medal: 'gold' | 'silver' | 'bronze' | null;
    }>;
  }>;
  tournaments: Array<{ tournamentId: string; name: string; date: string; pool: 'P25' | 'P50'; events: number; pbs: number; medals: { gold: number; silver: number; bronze: number } }>;
}
```

- Implementar en `swimmers.service.ts` como función pura `buildProgression(results)` testeada aparte (`swimmers/progression.ts` + `progression.spec.ts`), y el servicio solo consulta y delega.
- Una sola query por nadador (results + event + eventDefinition + tournament + category + club), sin N+1.
- Puntos World Aquatics: `null` hasta el milestone M6 (tabla de tiempos base configurable).
- **Tests mínimos:** serie + final en el mismo torneo; PB que se rompe y después empeora; primera marca (deltas `null`); 25 y 50 m no se cruzan; DSQ no cuenta; empate de fecha; zona horaria.

### 5.5 Diseño (correr `sports-ux-benchmarker` antes y `ui-designer` para construir)
Inspiración: SwimCloud (perfil con PBs, progresión e historial), World Aquatics (ficha de atleta), Strava (progreso personal). Respetar la identidad oscura "piscina".

**Estructura de la página `/nadadores/[id]`:**

```
┌───────────────────────────────────────────────────────────────┐
│ [foto]   VALENTINA GARCÍA                        Club Azucena  │
│          Menor 2 · 2013 · F           [25 m | 50 m]  (tabs)    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │ 14     │ │ 9      │ │ 6      │ │ -4.32 s│                   │
│  │torneos │ │ pruebas│ │ PBs año│ │ mejora │                   │
│  └────────┘ └────────┘ └────────┘ └────────┘                   │
├───────────────────────────────────────────────────────────────┤
│ MEJORES MARCAS (25 m)                                          │
│ ┌──────────────┬──────────┬──────────────────┬───────────────┐ │
│ │ Prueba       │ Mejor    │ Último torneo    │ Tendencia     │ │
│ ├──────────────┼──────────┼──────────────────┼───────────────┤ │
│ │ 50 Libre     │ 0:31.42★ │ 0:31.42  ▼ -0.58 │ ╲__╱‾╲__ spark│ │
│ │              │ Copa NOA │ Copa NOA · 10/26 │               │ │
│ │ 100 Espalda  │ 1:18.90  │ 1:20.15  ▲ +1.25 │ ‾╲_╱‾ spark   │ │
│ └──────────────┴──────────┴──────────────────┴───────────────┘ │
│  ▼ verde = bajó el tiempo (mejoró) · ▲ rojo = subió · ★ = PB   │
├───────────────────────────────────────────────────────────────┤
│ PROGRESIÓN · 50 Libre (al tocar una fila)                      │
│  gráfico de línea: tiempo por torneo (eje Y invertido: más     │
│  abajo = más rápido), puntos PB destacados, línea del PB       │
│  vigente escalonada; tooltip con torneo, fecha, delta          │
│  tabla debajo: Torneo · Fecha · Tiempo · vs anterior · vs PB   │
├───────────────────────────────────────────────────────────────┤
│ TORNEOS (línea de tiempo)                                      │
│  ● Copa NOA · 10/2026 · 25 m · 5 pruebas · 2 PB · 🥇1 🥈1     │
│  ● Provincial · 08/2026 · 50 m · 4 pruebas · 1 PB · 🥉1       │
└───────────────────────────────────────────────────────────────┘
```

**Reglas visuales:**
- **Delta:** flecha + signo + color, **nunca solo color** (accesibilidad). Bajó: `▼ -0.58 s` verde (`text-emerald-400`, con fondo `emerald-500/10`). Subió: `▲ +1.25 s` rojo (`text-rose-400`, fondo `rose-500/10`). Igual: `= 0.00` gris. Formato `±s.cc` (o `±m:ss.cc` si ≥ 60 s). Icono con `aria-label` ("bajó 0,58 segundos").
- **PB:** estrella/insignia "MP" (mejor personal) con el `RecordBadge`/estilo existente; si el último torneo fue PB, chip "¡Nueva mejor marca!" con animación `shimmer` sutil (respetar `prefers-reduced-motion`).
- **Tabs 25 m / 50 m** arriba: cambia toda la página; recordar la elección en `localStorage` (con try/catch).
- **Sparkline** por fila (recharts, sin ejes) y gráfico grande al expandir, con eje Y invertido (abajo = más rápido) y tooltip.
- Tiempos en fuente tabular (`tabular-nums`), alineados a la derecha.
- **Mobile (375 px):** las filas de la tabla pasan a tarjetas: prueba + mejor marca arriba, último tiempo + delta abajo, sparkline a lo ancho. Sin scroll horizontal.
- **Estados:** cargando (skeleton con `shimmer`), sin resultados en esa piscina ("Todavía no nadó en pileta de 50 m"), error con reintento.
- **Comparación (P2):** botón "Comparar con…" (otro nadador, misma prueba y piscina).

**Criterio de verificación:** un nadador con ≥3 torneos en una prueba muestra PB correcto, último tiempo con flecha y delta correctos (verificados a mano contra la base), 25/50 separados, se ve bien en 375 px y escritorio, `ui-reviewer` sin hallazgos graves.

---

## 6. Roadmap de milestones (en orden)

> Basado en el estudio de plataformas (sección 9). Cada milestone: plan → aprobación → código → `verifier` + `rules-guardian` → commit. Los cambios de esquema están marcados ⚠ **requiere aprobación**.

### Fase 0 — Cerrar lo pendiente
- **M0.** Commitear el milestone "decisiones del Admin" si sigue sin commitear (sección 0.5). Arreglar B-02 a B-04 (seguridad) y B-08 (refresh de sesión). B-01 solo si la federación lo pide.

### Fase 1 — Identidad y datos confiables (base de todo)
- **M1. Unificación de duplicados (nadadores y clubes).** Pantalla admin "Posibles duplicados" alimentada por `swimmer-scorer`/`club-scorer` (los mismos del matching), con detalle lado a lado (resultados, torneos, club, año). Acción **"Unificar"**: elegir registro canónico, mover resultados/PBs/historial/`external_id_map`/vinculaciones al canónico en una transacción, conservar el nombre absorbido como alias, recalcular PBs y récords afectados (los récords ya homologados no se tocan sin homologación humana), auditar todo. Nunca automático. ⚠ Probablemente requiere tabla `swimmer_aliases`/`club_aliases` (prevista en `MODULO-INGESTA-RESULTADOS.md` §3.6) — **consultar**.
- **M2. Arreglos de importación:** B-06/B-07 (CSV), B-10 (homologación tras importar), B-11 (`resolveCategory` a `packages/shared`), B-19 (rollback seguro: no borrar nadadores/clubes usados por otros imports), B-20, B-22.

### Fase 2 — El perfil del nadador ⭐
- **M4. Endpoint de progresión** (sección 5.4) con tests.
- **M5. Rediseño del perfil** (sección 5.5). Primero `sports-ux-benchmarker`, después `ui-designer`, cierre con `ui-reviewer`.
- **M6. Puntos World Aquatics.** P = floor(1000 × (B/T)³) con tiempos base por año, género, piscina y prueba, cargados como configuración (⚠ tabla `points_base_times`; fuente: worldaquatics.com/swimming/points, base = récord mundial vigente, corte 31/08 para 25 m y 31/12 para 50 m). Mostrar puntos en perfil, resultados y "mejor nadador del torneo".

### Fase 3 — Importación robusta
- **M7. Adaptador Lenex (`.lef`/`.lxf`)** como formato preferido, con el PDF como respaldo. Lenex trae IDs de atleta y licencia estables → matching exacto. `swim-standards-expert` valida contra Lenex 3.0. Fixtures reales en `__tests__/fixtures/`. **Consultar** si el Meet Manager que usan exporta Lenex; si no, M8.
- **M8. Adaptador HY3 / SD3 (SDIF v3).** Formato nativo de Hy-Tek, más confiable que el PDF.
- **M9. Vinculación de cuentas con UI** (B-14): pantalla del nadador para solicitar (con búsqueda de su perfil) y bandeja del Admin para aprobar/rechazar, sobre el backend `account-link` ya existente.

### Fase 4 — Competencia
- **M10. Licencias / afiliación anual bloqueante** (spec v3): modelo `Affiliation` ya existe sin uso. Estado del nadador por temporada, "vencida" en el pasaporte, bloqueo de inscripción. **Consultar** relación con la LUN de CADDA.
- **M11. Marcas mínimas y etiquetas.** Conjuntos de estándares por temporada, categoría, género, piscina y prueba (⚠ tablas `time_standard_sets`/`time_standards`). Etiquetas en resultados y perfil ("Marca básica CADDA Menor 2"). Cálculo en lectura, 25/50 nunca cruzados.
- **M12. Ranking oficial con ventana configurable** (estilo Ranking Oficial CADDA: marcas homologadas dentro de N meses antes de una fecha de corte), por piscina.
- **M13. Inscripciones online** (entrenador inscribe a su club): tiempo de inscripción autocompletado con la mejor marca homologada, bloqueo sin licencia vigente, límites de pruebas por categoría y por jornada y fecha límite configurables por torneo, exportación a Lenex/HY3 para cargar en Meet Manager.
- **M14. Scoring configurable completo:** `scoring_schemes` JSONB con 9-7-6-5-4-3-2-1, relevos doble, bonificación por récord, puntaje doble con marca básica, invitados que no suman (como el reglamento CADDA 2026). Eliminar el fallback hardcodeado (B-21).

### Fase 5 — Experiencia y comunidad
- **M15. Seguir nadadores y avisos:** padres/nadadores siguen perfiles y reciben aviso (email o web push vía BullMQ) cuando hay resultados nuevos, una mejor marca, una marca mínima o un récord homologado.
- **M16. Resultados en vivo** prueba por prueba (importación incremental durante el torneo + websocket existente), marcados "extraoficiales" hasta homologar.
- **M17. Planillas públicas** de series e inscriptos por jornada.
- **M18. Pases de club con aprobación** (club de origen → FTN), auditados; el club de los resultados ya congelados no cambia.
- **M19. Estadísticas de club:** medallero histórico, marcas mínimas por temporada, nadadores activos, evolución.
- **M20. UX general:** B-15 a B-18 (menú mobile, admin responsive, contraste, estados de error), PWA instalable.
- **M21. Infra:** S3/R2 (B-05), emails reales, B-23, tests de `apps/web` (al menos componentes de formato de tiempo y del perfil), e2e de API para importación.

### P2 / ideas
Comparación head-to-head, premio por suma de dos pruebas (CADDA), exportar récords y estándares a Lenex, puntaje de temporada tipo IMX, modo offline de planillas.

---

## 7. Agentes del proyecto (`.claude/agents/`)

> Se cargan al **abrir una sesión nueva** de Claude Code en este repo. Invocarlos por nombre (p. ej. "usá el agente verifier").

| Agente | Tipo | Cuándo |
|---|---|---|
| `milestone-planner` | Flujo, solo lectura | Al iniciar cada milestone: produce el plan para aprobar |
| `verifier` | Flujo, solo lectura | Antes de cada commit: lint + typecheck + test |
| `rules-guardian` | Flujo, solo lectura | Antes de cada commit: reglas inviolables y alcance |
| `security-reviewer` | Flujo, solo lectura | Antes de deployar o al tocar auth, roles, uploads, datos personales |
| `ingest-specialist` | Dominio | Lectura de PDF/HY3/CSV/Lenex de Meet Manager |
| `identity-matcher` | Dominio | Matching y duplicados de nadadores/clubes |
| `data-quality-auditor` | Dominio, solo lectura | Informe de duplicados y datos incompletos en la base |
| `swim-standards-expert` | Dominio, solo lectura | Validar contra Lenex, HY3/SD3, puntos World Aquatics, reglas de récords y categorías |
| `swim-platform-benchmarker` | Producto, solo lectura | Antes de planear una feature: cómo la resuelven SwimCloud, SwimRankings, Meet Mobile, Swimify, World Aquatics, CADDA |
| `sports-ux-benchmarker` | Estética, solo lectura | Antes de construir una pantalla: patrones de UI de apps deportivas de referencia |
| `ui-designer` | Estética | Construir/rediseñar pantallas de `apps/web` |
| `ui-reviewer` | Estética, solo lectura | Auditoría visual/UX después de cambios de frontend |

**Flujo típico de una feature de producto:** `swim-platform-benchmarker` → `milestone-planner` → (aprobación) → implementación (+ `ingest-specialist`/`identity-matcher` si aplica) → `swim-standards-expert` si toca estándares → `sports-ux-benchmarker` → `ui-designer` → `ui-reviewer` → `verifier` + `rules-guardian` → commit.

---

## 8. Preguntas de negocio abiertas (para la federación)

1. ¿Qué versión de Meet Manager usan los torneos y puede exportar **Lenex** o **HY3**? (define M7/M8).
2. ¿Pueden cargar el **DNI** del nadador en el campo de ID de Meet Manager? (matching exacto).
3. **Padrón de federados:** ¿qué datos trae (DNI, fecha de nacimiento, club) y en qué formato? ¿Cada cuánto se actualiza?
4. ¿La licencia FTN es la misma que la LUN de CADDA o es aparte? ¿Qué pasa con resultados de nadadores sin licencia?
5. ¿Los entrenadores pueden dar de alta nadadores (con aprobación) o solo el Admin?
6. ¿Qué **marcas mínimas** usan (CADDA, propias) y para qué torneos?
7. ¿Ventana del ranking oficial (12 meses, temporada, otra)?
8. ¿Los resultados se homologan automáticamente al finalizar un torneo o con revisión? (hoy: automático).
9. ¿Proveedor de almacenamiento (S3, Cloudflare R2, Supabase) y de email?

Ya decidido: los datos de los nadadores menores se publican sin restricciones (sección 4).

---

## 9. Resumen del estudio de plataformas (fuentes)

| Función | Referencia | Fuente |
|---|---|---|
| Perfil con PBs, progresión e historial; marcas solo de archivos oficiales | SwimCloud | https://www.gomotionapp.com/team/nytta/page/for-parents/swim-cloud · https://support.swimcloud.com/hc/en-us/articles/115007665388 |
| Resultados en vivo con parciales | SwimCloud, Swimify | https://support.swimcloud.com/hc/en-us/articles/33274641724563-Live-Results · https://swimify.com |
| Base de datos y rankings alimentados por Lenex; inscripción online | SwimRankings / Splash | http://swimrankings.net · https://wiki.swimrankings.net/index.php/Meet_Manager:Online_Entries |
| Lenex obligatorio en el calendario oficial; pases con carta de baja | Swiss Aquatics | https://www.swiss-aquatics.ch/wp-content/uploads/2025/09/3.1_d_Wettkampfreglement-Schwimmen_gueltig-ab-1.9.2025.pdf |
| Flujo de inscripciones Team Manager ↔ Meet Manager; favoritos | Hy-Tek / Meet Mobile | https://hytek.active.com/swimming-management-software.html · https://www.gomotionapp.com/team/gscfsc/page/parent-resources/meet-mobile |
| Estándares por piscina; avisos de próxima prueba | SwimTopia | https://www.swimtopia.com/manage-time-standards/ |
| Estándares motivacionales B…AAAA, búsqueda de tiempos | USA Swimming | https://usaswimming.org/times |
| Puntos P = 1000 × (B/T)³, tiempos base | World Aquatics | https://www.worldaquatics.com/swimming/points |
| Pases digitales aprobados por la federación provincial | Swimming Canada | https://www.swimming.ca/content/uploads/2024/05/Request-Swimmer-Transfer-from-another-club-ASSA-Pilot-05112024.pdf |
| Categorías por año de nacimiento, LUN, límites de pruebas, puntaje 9-7-6-5-4-3-2-1, relevos doble, bonificación por récord, marca básica en ranking oficial | CADDA (Nacional Infantiles y Menores 2026) | https://cadda.org.ar/wp-content/uploads/2026/04/REGLAMENTO-CAMPEONATO-NACIONAL-INFANTILES-Y-MENORES-2026.pdf |
| Formato SDIF (SD3/CL2) | USMS | https://www.usms.org/admin/sdifv3f.txt |

No se pudo verificar: comparación head-to-head en SwimCloud, cómo muestra SwimRankings los puntos, el ranking online de CADDA. No se encontraron resultados oficiales publicados por la FTN en la web (oportunidad: la plataforma sería la primera fuente pública).
