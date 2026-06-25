# Guía de trabajo con Sonnet — Construcción controlada de la plataforma FTN

> Cómo dirigir a un agente de código (Sonnet) para que construya la plataforma FTN de forma **controlable, incremental y verificable**, evitando que "se vaya de las manos".
> Basado en `ARQUITECTURA.md`, `ESPECIFICACION-FUNCIONAL-v2/v3.md` y `MODULO-INGESTA-RESULTADOS.md`.

---

## 0. Las 10 reglas de oro (leé esto primero)

1. **Un objetivo por conversación.** Nunca "construime la plataforma". Sí: "construime el módulo de catálogos y dejalo con tests pasando". Sesiones cortas y enfocadas = control.
2. **Plan antes de código, siempre.** Pedile a Sonnet que primero te muestre un **plan** y la lista de archivos que va a tocar. Lo aprobás, recién ahí codea. (En Claude Code: *plan mode*.)
3. **Trabajá en rebanadas verticales, no horizontales.** Mejor "una prueba importada y visible en pantalla" que "toda la capa de base de datos". Cada rebanada debe poder **correrse y verse funcionar**.
4. **Definí "terminado" antes de empezar.** Cada milestone tiene un criterio objetivo: *compila + typecheck + tests verdes + lo veo funcionar*. Si no se puede verificar, no está terminado.
5. **El agente debe poder verificarse solo.** Configurá desde el día 1: TypeScript estricto, ESLint/Prettier, tests, y comandos `lint`/`typecheck`/`test`/`build`. Así Sonnet detecta sus propios errores sin que vos seas el compilador.
6. **Los documentos son la fuente de verdad.** Pedile que **lea y respete** los specs, que no re-invente decisiones ya tomadas. Si algo no está en los docs, que **pregunte**, no que asuma.
7. **Revisá cada diff. No aceptes a ciegas.** Leé lo que cambió. Si algo no entendés, pedí que te lo explique. Tu revisión es el principal mecanismo de control de calidad.
8. **Commit por cada incremento que funciona.** Un commit chico y verde por milestone. Si el siguiente paso rompe algo, volvés atrás sin perder nada.
9. **Tests como barandas para las reglas que no pueden romperse.** Tiempos en ms, categoría congelada, récords solo homologados, idempotencia de import. Esas reglas se blindan con tests, no con buena voluntad.
10. **Datos reales y datos semilla.** Conseguí un HY3/PDF real para el parser y creá *seed data* para que la UI tenga algo que mostrar. Sin datos, no podés verificar nada.

---

## 1. Por qué incremental y no "todo de una"

Un agente al que le pedís todo junto:
- toma 50 decisiones implícitas que no ves,
- mezcla 30 archivos en un diff imposible de revisar,
- y cuando algo falla, no sabés en qué de las 50 cosas se equivocó.

Un agente al que le pedís **una cosa verificable a la vez**:
- vos validás cada pieza antes de seguir,
- el contexto se mantiene chico y preciso,
- y los errores se atrapan temprano, cuando cuesta poco arreglarlos.

> Regla práctica: si no podés **revisar el diff en 10 minutos** y **verificar que funciona en 5**, el milestone era demasiado grande. Partilo.

---

## 2. Setup inicial (Sesión 0 — fundaciones)

Antes de cualquier feature. Objetivo: dejar el terreno preparado para que todo lo demás sea verificable.

**Qué pedirle a Sonnet (en este orden, puede ser una sola sesión):**
1. Inicializar el repositorio y el monorepo (Next.js + NestJS + Prisma) según `ARQUITECTURA.md`.
2. Configurar **TypeScript estricto**, ESLint, Prettier.
3. Configurar **PostgreSQL + Redis** locales (docker-compose) y variables de entorno (`.env.example`).
4. Configurar **testing** (Jest/Vitest) con un test trivial que pase.
5. Crear el archivo **`CLAUDE.md`** del proyecto (ver §3).
6. Configurar **CI básico** (GitHub Actions: lint + typecheck + test + build).
7. Scripts en package.json: `dev`, `build`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`.

**Definición de terminado:** el proyecto levanta (`dev`), `lint`/`typecheck`/`test`/`build` pasan en verde, y hay un commit inicial.

> No avances a features hasta que esto esté sólido. Es el cimiento que hace verificable todo lo demás.

---

## 3. El archivo CLAUDE.md (memoria del proyecto para el agente)

Creá un `CLAUDE.md` en la raíz. El agente lo lee automáticamente en cada sesión. Debe contener:
- **Qué es el proyecto** (1 párrafo) y links a los 4 documentos de spec.
- **Stack y convenciones** (lenguaje, estructura de carpetas, naming).
- **Reglas inviolables** (las de §0.10 de este doc / §11.3 del módulo): tiempos en ms, categoría congelada, récords solo homologados, idempotencia, atleta↔cuenta.
- **Comandos** para lint/test/typecheck/build/migrate/seed.
- **Cómo verificar** que un cambio funciona.
- **Qué NO hacer** sin preguntar (cambiar el esquema de datos aprobado, tomar decisiones de negocio nuevas).

Mantenelo corto y actualizado. Es lo que evita que Sonnet "olvide" las reglas entre sesiones.

---

## 4. Secuencia de construcción (milestone por milestone)

Mapeada al orden de `MODULO-INGESTA-RESULTADOS.md` §11.1. **Una conversación por milestone.** Cada uno: objetivo → qué pedir → cómo verificar.

| # | Milestone | Objetivo (qué debe quedar funcionando) | Cómo lo verificás |
|---|-----------|----------------------------------------|-------------------|
| **M1** | **Esquema de datos (Prisma)** | Todas las entidades de v2 §8 + v3 §8 modeladas; migración corre; DB se crea | `db:migrate` ok; revisás el schema contra los specs |
| **M2** | **Catálogos maestros + seed** | `event_definitions`, `categories` (12 + Junior), `seasons`, `scoring_schemes` cargados por seed | `db:seed` ok; consultás y ves las 12 categorías |
| **M3** | **Auth + RBAC** | Registro/login/recuperación; roles (SuperAdmin, Admin, Club, Nadador) | Tests de auth; login manual funciona |
| **M4** | **CRUD Clubes + Nadadores** | Alta/edición; `swimmer_club_history`; panel admin básico | Creás un club y un nadador desde la UI |
| **M5** | **Torneos + Pruebas + Series** | Crear torneo, pruebas, heats; estados | Creás un torneo de prueba completo |
| **M6** | **Ingesta: HY3Adapter + Normalizer** | Sube un HY3 real → produce `NormalizedMeet` → validación | Test con HY3 fixture real; ves el modelo normalizado |
| **M7** | **ImportJob + Preview + Commit/Rollback** | Pipeline async con staging, preview, idempotencia | Importás 2 veces el mismo archivo, no duplica |
| **M8** | **Matching atletas/clubes + dedupe** | Cascada de confianza; atletas nuevos; external_id_map | Preview muestra matches y nuevos correctamente |
| **M9** | **Homologación + post-process worker** | PersonalBest → Rankings (incremental) → Records → Stats | Homologás y se actualizan PB/ranking/récord |
| **M10** | **Rankings (proyecciones)** | Global/temporada/categoría/club/prueba; ambos modos | Ves rankings correctos y rápidos |
| **M11** | **Detección de récords 25/50** | Candidatos + homologación humana | Un tiempo récord genera candidato pendiente |
| **M12** | **UI moderna de resultados** | Vistas torneo/prueba/ranking/perfil; colores medalla; PB/mejora | Navegás y ves resultados como plataforma pro |
| **M13** | **Tiempo real (WS)** | Resultados en vivo por torneo | Cargás un tiempo y aparece sin recargar |
| **M14** | **Cuentas de nadadores + vinculación** | AccountLinkRequest + aprobación admin + auditoría | Solicitás vínculo, admin aprueba, ves historial |
| **M15** | **Evolución de tiempos + estadísticas** | Gráficos por prueba, mejora total, vs PB | Perfil muestra evolución correcta |
| **M16** | **Export (Lenex/PDF) + compatibilidad** | Exportar resultados/inscripciones | Generás un export válido |
| **M17** | **CSV/Excel/PDF adapters** | Formatos secundarios y fallback | Importás un CSV y un PDF de ejemplo |

> Podés reordenar, pero **respetá las dependencias**: M1→M2 antes que todo; M6/M7/M8 antes de M9; M9/M10 antes de la UI de rankings.

---

## 5. Plantilla de prompt (copiá y adaptá en cada milestone)

```
Contexto: estás trabajando en la plataforma FTN. Leé y respetá:
- ARQUITECTURA.md, ESPECIFICACION-FUNCIONAL-v3.md (autoritativo) y MODULO-INGESTA-RESULTADOS.md.
- CLAUDE.md (reglas inviolables del proyecto).

Objetivo de esta sesión (SOLO esto): <MILESTONE Mx — descripción puntual>.

Antes de codear:
1. Mostrame un PLAN: qué archivos vas a crear/modificar y por qué.
2. Listá las decisiones que vas a tomar. Si alguna no está en los specs, PREGUNTAME, no asumas.

Espero tu plan para aprobarlo. No escribas código todavía.

Criterio de terminado:
- typecheck + lint + tests en verde.
- <criterio de verificación concreto del milestone>.
- Tests para las reglas que no pueden romperse que apliquen a este milestone.

No toques nada fuera del alcance de este milestone. Si descubrís algo que habría que
cambiar en otro lado, anotámelo al final en vez de hacerlo.
```

**Después del plan:** lo revisás, ajustás, y respondés *"Aprobado, procedé"* (o corregís). **Después del código:** revisás el diff, corrés la verificación, y si pasa → commit.

---

## 6. Cómo mantener el control durante la sesión

- **Plan mode primero.** No dejes que empiece a escribir sin haberte mostrado el plan.
- **Pedile que corra la verificación él mismo** (`test`, `typecheck`) y te muestre la salida antes de declarar "listo".
- **Revisá el diff completo.** Buscá: ¿tocó archivos fuera de alcance? ¿inventó una decisión de negocio? ¿hay lógica sin test?
- **Preguntá "por qué" ante lo no obvio.** "¿Por qué elegiste X acá?" — si la respuesta es débil, pedí que lo rehaga.
- **Commit chico y verde** por milestone. Mensaje claro. Nunca commitees algo que no verificaste.
- **Si se desvía, frenalo.** "Eso queda fuera del milestone, anotalo y volvé al objetivo."

---

## 7. Errores comunes y cómo evitarlos

| Síntoma | Causa | Antídoto |
|---------|-------|----------|
| Diff gigante imposible de revisar | Milestone demasiado grande | Partilo en rebanadas verticales más chicas |
| "Funciona" pero rompe otra cosa | No hay tests ni verificación | Definí "terminado" con tests + verificación manual |
| El agente reinventa decisiones ya tomadas | No leyó/recordó los specs | CLAUDE.md + "respetá los documentos, preguntá si falta algo" |
| Asume reglas de negocio nuevas | Prompt ambiguo | "Si no está en los specs, preguntá, no asumas" |
| Cambios fuera de alcance | Falta de límites | "No toques nada fuera de este milestone" |
| El parser HY3 falla con archivos reales | Se probó con datos inventados | Conseguí un HY3/PDF real como fixture |
| UI vacía, no se puede verificar | No hay datos | Seed data desde M2 |
| Se acumula deuda y nada anda end-to-end | Capas horizontales sin integrar | Rebanadas verticales que se ven funcionar |

---

## 8. Insumos que conviene tener listos antes de arrancar

- ✅ Los 4 documentos de spec (ya están).
- ⏳ **Un HY3 real** de un torneo de la FTN (clave para M6). Si no hay HY3, un CSV/Excel/PDF real.
- ⏳ **Logos de clubes** y algunos datos reales para el seed (hace la verificación más realista).
- ⏳ Decidir los **pendientes menores** de v3 §10 antes de M9/M10 (categoría del ranking, récords nacionales, licencia, relevos).
- ⏳ Credenciales de **hosting/DB/S3** para cuando llegues al deploy.

---

## 9. Ritmo recomendado

- **No más de 1–2 milestones por sesión de trabajo.** Después de cada uno: revisar, verificar, commit, descanso. La calidad cae cuando encadenás muchos sin revisar.
- **Cerrá cada milestone del todo** (verde + commit) antes del siguiente. Nada de "lo termino después".
- **Cada 3–4 milestones**, corré la app entera de punta a punta para confirmar que el conjunto sigue sano.

---

## Resumen en una línea

> **Plan → aprobás → código acotado → verificás → commit.** Un objetivo verificable por sesión, los specs como ley, tests para lo crítico, y revisás cada diff. Así Sonnet construye rápido y vos no perdés el control.

---
*Guía de trabajo con Sonnet — metodología de construcción controlada para la plataforma FTN.*
