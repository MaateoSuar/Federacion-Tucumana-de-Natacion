# Prompts para Sonnet — Construcción guiada de la plataforma FTN

> Secuencia de prompts **listos para copiar y pegar**, uno por milestone, en orden.
> Metodología: ver `GUIA-TRABAJO-CON-SONNET.md`. Specs: `ARQUITECTURA.md`, `ESPECIFICACION-FUNCIONAL-v2.md`, `ESPECIFICACION-FUNCIONAL-v3.md` (autoritativo), `MODULO-INGESTA-RESULTADOS.md`.

---

## Cómo usar este archivo

1. **Un prompt = una conversación nueva con Sonnet.** No mezcles milestones en la misma sesión.
2. Pegás el prompt → Sonnet te muestra un **PLAN** → lo revisás → respondés **"Aprobado, procedé"** (o corregís).
3. Cuando termina: **revisás el diff**, corrés la verificación, y si pasa → **commit**.
4. Recién ahí pasás al siguiente prompt.
5. Si Sonnet pregunta algo, respondé desde los specs; si no está, decidilo vos (no lo dejes asumir).

> **Regla transversal incluida en cada prompt:** plan primero, alcance acotado, verificación verde, no asumir reglas de negocio.

---

## PROMPT 0 — Crear el CLAUDE.md del proyecto (hacelo una sola vez, antes de todo)

```
Estás por trabajar en la plataforma web de la Federación Tucumana de Natación (FTN).
En la raíz del proyecto hay 5 documentos de especificación; leelos completos antes de responder:
- ARQUITECTURA.md (stack y arquitectura técnica)
- ESPECIFICACION-FUNCIONAL-v2.md (perfil digital, importación, pasaporte)
- ESPECIFICACION-FUNCIONAL-v3.md (AUTORITATIVO: rankings, cuentas, decisiones de negocio)
- MODULO-INGESTA-RESULTADOS.md (módulo de ingesta Meet Manager + resultados)
- GUIA-TRABAJO-CON-SONNET.md (metodología de trabajo)

Tarea de esta sesión (SOLO esto): crear un archivo CLAUDE.md en la raíz que sirva como
memoria del proyecto para vos en cada sesión. Debe contener, de forma concisa:
1. Qué es el proyecto (1 párrafo) y links a los 5 documentos.
2. Stack y convenciones (lenguaje, estructura de carpetas, naming).
3. REGLAS INVIOLABLES (no negociables):
   - Tiempos siempre en milisegundos enteros; nunca comparar piscina 25 vs 50.
   - Categoría, club y piscina se CONGELAN en el resultado (verdad histórica inmutable).
   - Edad deportiva = edad al 31 de diciembre del año de la competencia.
   - Récords 25 m y 50 m independientes; solo desde resultados HOMOLOGADOS; publicación con homologación humana.
   - Importación idempotente (reimportar el mismo meet no duplica).
   - Athlete ≠ User: la vinculación pasa por aprobación administrativa y queda auditada.
4. Comandos del proyecto (lint, typecheck, test, build, db:migrate, db:seed) — dejalos como placeholders si aún no existen.
5. Cómo verificar que un cambio funciona.
6. Qué NO hacer sin preguntar: cambiar el esquema de datos aprobado o tomar decisiones de negocio nuevas.

No escribas más código que el CLAUDE.md. Mostrámelo antes de guardarlo para que lo apruebe.
```

---

## PROMPT 1 — Sesión 0: fundaciones del proyecto

```
Contexto: plataforma FTN. Leé y respetá CLAUDE.md y los documentos de spec (sobre todo ARQUITECTURA.md).

Objetivo de esta sesión (SOLO esto): dejar las fundaciones del proyecto listas y verificables.
Incluye:
1. Inicializar el repositorio git y el monorepo con la estructura de ARQUITECTURA.md
   (frontend Next.js App Router + backend NestJS + Prisma), todo en TypeScript.
2. TypeScript en modo estricto, ESLint y Prettier configurados.
3. docker-compose con PostgreSQL y Redis para desarrollo local.
4. .env.example con todas las variables necesarias (sin secretos reales).
5. Testing configurado (un test trivial que pase).
6. CI básico en GitHub Actions: lint + typecheck + test + build.
7. Scripts en package.json: dev, build, lint, typecheck, test, db:migrate, db:seed.

Antes de codear, mostrame un PLAN: estructura de carpetas, dependencias principales y archivos
que vas a crear. Esperá mi aprobación. No asumas decisiones de stack que ya están en ARQUITECTURA.md.

Criterio de terminado: el proyecto levanta con `dev`, y `lint`/`typecheck`/`test`/`build` pasan en verde.
No incluyas features todavía. Dejá actualizado el CLAUDE.md con los comandos reales.
```

---

## PROMPT 2 — M1: Esquema de datos (Prisma)

```
Contexto: plataforma FTN. Respetá CLAUDE.md, ESPECIFICACION-FUNCIONAL-v2.md §8, v3 §8 y MODULO-INGESTA-RESULTADOS.md §2.

Objetivo de esta sesión (SOLO esto): modelar el esquema de datos completo en Prisma.
Incluí TODAS las entidades de los specs: users/roles/permissions, clubs, swimmers,
swimmer_club_history, coaches, seasons, categories, event_definitions, tournaments, events,
heats, registrations, lane_assignments, results, splits, personal_bests, records, rankings,
ranking_history, athlete_account, athlete_profile, account_link_request, athlete_statistics,
athlete_achievements, import_jobs, meet_manager_import, meet_manager_export, scoring_schemes,
tournament_documents, audit_logs, news, media.

Respetá las reglas: tiempos en ms (Int), pool_length como parte de la clave de records/PB/ranking,
campos congelados en results (category_id, club_id, pool_length), índices únicos parciales donde
los specs los piden (un solo record is_current por clave; un solo link approved por swimmer y por account).

Antes de codear, mostrame un PLAN con la lista de modelos y sus relaciones para que lo apruebe.
Si una entidad de los specs es ambigua, PREGUNTAME, no asumas.

Criterio de terminado: `db:migrate` corre sin errores y crea la base; el schema refleja fielmente los specs.
No crees seeds ni lógica todavía, solo el esquema.
```

---

## PROMPT 3 — M2: Catálogos maestros + seed

```
Contexto: plataforma FTN. Respetá CLAUDE.md y ESPECIFICACION-FUNCIONAL-v3.md (§1 categorías, §1.4.1 puntuación).

Objetivo de esta sesión (SOLO esto): poblar los catálogos maestros con un script de seed.
Incluí:
- Las 12 categorías oficiales (Pre A 8 y menores, Pre B 9, Infantil 1 y 2, Menor 1 y 2,
  Cadete 1 y 2, Juvenil 1, Juvenil 2 17-18, Mayores 19+) + Junior (19-21, nacional),
  con code, min_age/max_age (nullables en abiertas), scope y order_no.
- event_definitions: catálogo de pruebas estándar (50/100/200/400/800/1500 según estilo,
  Libre/Espalda/Pecho/Mariposa/Combinado), para piscina 25 y 50.
- seasons (al menos la temporada actual).
- scoring_schemes: esquema de puntuación por posición estilo FINA (9-7-6-5-4-3-2-1).
- roles base (SuperAdmin, Admin, Club, Entrenador, Juez, Nadador) y permisos.

Antes de codear, mostrame el PLAN del seed. Esperá aprobación.

Criterio de terminado: `db:seed` corre, y al consultar la base aparecen las 12 categorías + Junior,
las pruebas y el scoring scheme. Idempotente (correr el seed dos veces no duplica).
```

---

## PROMPT 4 — M3: Autenticación + RBAC

```
Contexto: plataforma FTN. Respetá CLAUDE.md, ESPECIFICACION-FUNCIONAL-v3.md §3 y ARQUITECTURA.md (Auth).

Objetivo de esta sesión (SOLO esto): autenticación y control de acceso por roles.
Incluí: registro, verificación de email, login (JWT access + refresh con rotación),
recuperación de contraseña (token de un solo uso), hashing con argon2/bcrypt, RolesGuard
y decorador @Roles para los 6 roles, y roles "scoped" (acotados a un club).

Antes de codear, mostrame el PLAN (endpoints, guards, flujo de tokens). Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; tests de auth (registro, login, refresh,
recuperación, acceso denegado por rol). Puedo registrarme y loguearme manualmente.
Incluí tests para la regla: un usuario no puede acceder a recursos fuera de su rol/scope.
```

---

## PROMPT 5 — M4: Clubes + Nadadores

```
Contexto: plataforma FTN. Respetá CLAUDE.md y los specs (clubs, swimmers, swimmer_club_history).

Objetivo de esta sesión (SOLO esto): CRUD de clubes y nadadores + panel admin básico.
Incluí: alta/edición/listado de clubes y nadadores, historial de pertenencia nadador-club
por temporada (swimmer_club_history, para club actual y clubes anteriores), validaciones,
y subida de logo de club / foto de nadador a S3 (o storage local en dev).

Antes de codear, mostrame el PLAN (endpoints + pantallas admin). Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; desde la UI admin puedo crear un club,
crear un nadador, asignarlo a un club y ver su historial. Tests de los casos principales.
```

---

## PROMPT 6 — M5: Torneos + Pruebas + Series

```
Contexto: plataforma FTN. Respetá CLAUDE.md y los specs (tournaments, events, heats, lane_assignments).

Objetivo de esta sesión (SOLO esto): gestión de torneos.
Incluí: crear torneo (sede, piscina 25/50, fechas, tipo, ámbito, temporada), agregar pruebas
desde event_definitions (con categoría y sexo), generar series (heats) y carriles, máquina de
estados del torneo (programado → inscripciones_abiertas → cerrado → en_curso → finalizado → homologado),
y carga de documentos del torneo (convocatoria/reglamento PDF a S3 → tournament_documents).

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; puedo crear un torneo completo con pruebas
y series desde la UI, y adjuntar un PDF. La categoría de cada prueba se resuelve por las reglas.
```

---

## PROMPT 7 — M6: Ingesta — HY3Adapter + Normalizer

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md (§1, §2, §3).

Objetivo de esta sesión (SOLO esto): leer un archivo HY3 de Meet Manager y producir el modelo
normalizado intermedio (NormalizedMeet), SIN persistir todavía en tablas oficiales.
Incluí: FormatDetector, interfaz FormatAdapter { detect, parse }, HY3Adapter (parser por código de
registro de ancho fijo: meet, equipos, atletas, inscripciones, resultados, parciales, DSQ),
y el Normalizer (tiempos a ms, enums de estado, fechas, sexo). Manejo de errores por fila
(FATAL/ERROR/WARNING/INFO) sin abortar todo el archivo.

IMPORTANTE: usá el archivo HY3 real de ejemplo que voy a adjuntar como fixture de test. Si no
coincide con lo esperado, ajustá el parser a ese archivo real, no a un formato inventado.

Antes de codear, mostrame el PLAN (estructura de NormalizedMeet, etapas del parser). Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; un test toma el HY3 real y produce un
NormalizedMeet correcto (atletas, pruebas, resultados, parciales). Tiempos en ms enteros.
```

---

## PROMPT 8 — M7: ImportJob + Preview + Commit/Rollback

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md (§1, §3.5).

Objetivo de esta sesión (SOLO esto): el pipeline asíncrono de importación con staging y revisión humana.
Incluí: entidad/flujo ImportJob (estados upload→parse→normalize→validate→match→preview→commit),
ejecución en worker (BullMQ/Redis), staging de los datos normalizados, pantalla de PREVIEW para el
admin (resumen: filas ok/error, warnings, atletas nuevos, récords candidatos), COMMIT transaccional
a tablas oficiales (results.source='hy3'), y ROLLBACK de un import confirmado.
IDEMPOTENCIA por file_hash + clave natural del meet (reimportar no duplica).

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; subo el HY3, veo el preview, confirmo y los
resultados quedan en la base; reimportar el MISMO archivo NO duplica (test obligatorio de idempotencia);
puedo hacer rollback. Reusá el matching del próximo milestone como stub si hace falta.
```

---

## PROMPT 9 — M8: Matching de atletas/clubes + dedupe

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md §3.1–§3.4.

Objetivo de esta sesión (SOLO esto): conciliar atletas y clubes del import contra entidades oficiales,
GARANTIZANDO IDENTIDAD ÚNICA (ver MODULO-INGESTA-RESULTADOS.md §3.6, es el problema central del sistema).
El nombre NUNCA es la identidad: un error de tipeo ("Mateo Suar" vs "Mateeo Suar") no debe crear dos personas.

Incluí:
- Normalización canónica de nombres (trim, mayúsculas, sin tildes, orden apellido/nombre, colapso de espacios).
- AthleteMatcher con cascada de confianza (DNI → external_id → alias conocido → nombre+nacimiento+sexo →
  nombre+año+club → fuzzy → nuevo). ClubMatcher análogo.
- Tablas: swimmer_aliases (variantes de nombre → swimmer canónico), club_aliases, external_id_map.
- ALIAS APRENDIDOS: cuando el admin confirma que una variante corresponde a un swimmer existente, se
  guarda como alias; los imports futuros la reconocen automáticamente (el error se aprende una sola vez).
- Detección de duplicados dentro del archivo y contra la base (fuzzy nombre+nacimiento) → en el preview
  se ofrece "¿es la misma persona que X?" antes de crear.
- FUSIÓN (merge) de nadadores duplicados: reasigna TODO el historial (resultados, PB, récords, medallas)
  del duplicado al canónico, elimina el duplicado, y audita la operación en audit_logs.
- Manejo de atletas nuevos (crear / vincular a existente / descartar desde el preview).
- Los matches medios/bajos SIEMPRE requieren confirmación humana, nunca automáticos.

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; el preview muestra matches fuertes, candidatos a
confirmar y atletas nuevos; tests de: cascada de matching, alias aprendido (reimportar la variante mapea
al canónico sin preguntar), detección de duplicados, y fusión (el merge reasigna el historial completo).
```

---

## PROMPT 10 — M9: Homologación + worker de post-proceso

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md §5, §6 y v3.

Objetivo de esta sesión (SOLO esto): la homologación de resultados y el recálculo derivado.
Incluí: acción de homologar (por prueba o torneo) que marca resultados como homologados; evento de
dominio ResultHomologated; worker (BullMQ) que al homologar actualiza PersonalBest (solo si mejora),
recalcula Rankings de forma INCREMENTAL (solo la tupla afectada), evalúa Récords (genera candidatos),
toma snapshot en RankingHistory, recalcula AthleteStatistics y genera AthleteAchievements (medallas).
Además: deriva/actualiza swimmer_club_history (ver MODULO §3.7) a partir del club CONGELADO de cada
resultado ordenado por fecha —detecta transferencias (Club X → Club Y), cierra el período anterior,
abre el nuevo y refresca swimmers.current_club_id con el club del resultado más reciente. NUNCA reescribe
el club de resultados pasados (verdad histórica inmutable); el historial de clubes es DERIVADO.

Antes de codear, mostrame el PLAN (eventos, jobs, orden de recálculo). Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; al homologar un torneo importado, se actualizan
PB, ranking y se generan candidatos de récord. Test: un resultado mejor que el PB lo actualiza;
récords solo se evalúan sobre resultados homologados.
```

---

## PROMPT 11 — M10: Rankings (proyecciones materializadas)

```
Contexto: plataforma FTN. Respetá CLAUDE.md y ESPECIFICACION-FUNCIONAL-v3.md §1 y MODULO §5.

Objetivo de esta sesión (SOLO esto): los rankings derivados, eficientes y consultables.
Incluí: proyecciones materializadas para ranking global histórico, por temporada, por categoría
(Top N), por club (puntos por posición estilo FINA + medallas + récords + nadadores activos) y por
prueba. Soporte de los DOS modos (best_per_swimmer por defecto, all_performances con selector).
Recálculo incremental por tupla (RankingProjectionService.recompute) disparado desde el worker.
Cache Redis para los cortes más consultados. La "categoría utilizada" es la CONGELADA del resultado.

Antes de codear, mostrame el PLAN (estructura de proyecciones, invalidación). Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; los 5 rankings devuelven datos correctos y
rápidos; el selector de modo funciona; tests del orden por tiempo y del cálculo de puntos de club.
```

---

## PROMPT 12 — M11: Detección y homologación de récords 25/50

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md §6 y v3 §7.3.

Objetivo de esta sesión (SOLO esto): el sistema de récords.
Incluí: RecordEvaluator que, sobre resultados homologados, compara contra el récord vigente de la
clave (scope, event_definition, category, gender, pool_length) y genera candidato (pending) si lo supera;
flujo de homologación humana del récord por Admin (al homologar: anterior is_current=false +
previous_record_id, nuevo is_current=true); récords 25 y 50 totalmente independientes; récords nacionales
solo de referencia (scope=nacional, solo-lectura) mostrados como benchmark con las marcas de Tucumán
debajo; trazabilidad (source_result_id, torneo, fecha, nadador, club, homologador).

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; un tiempo récord genera candidato pendiente;
al homologarlo, queda vigente y el anterior pasa a histórico; tests de: récord solo desde homologado,
25 y 50 independientes, un único is_current por clave.
```

---

## PROMPT 13 — M12: UI moderna de resultados

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md §4, §8.

Objetivo de esta sesión (SOLO esto): la visualización pública moderna (Next.js SSR/ISR).
Incluí las vistas: /torneos/[id] (pruebas, resultados, medallero, récords, stats),
/torneos/[id]/prueba/[eventId] (resultados con parciales expandibles), /rankings (con filtros y
selector de modo), /nadadores/[id] (perfil público: historial, PB, evolución, récords, club
actual/anteriores), /records. Patrones: tablas modernas, tiempos mm:ss.cc, colores por medalla
(oro/plata/bronce), indicadores de mejora (PB −x.xs, vs récord), highlight de récords, estados
DSQ/DNS/DNF con tooltip. Mobile-first, accesible, SEO. Servido desde las proyecciones (sin cálculo pesado en request).

Antes de codear, mostrame el PLAN (rutas, componentes). Esperá aprobación.

Criterio de terminado: typecheck/lint/build verdes; navego torneo→prueba→ranking→perfil y se ve
como plataforma deportiva profesional, con datos del seed/import.
```

---

## PROMPT 14 — M13: Tiempo real (WebSockets)

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md §4.1.

Objetivo de esta sesión (SOLO esto): publicación de resultados en vivo.
Incluí: WebSocket (Socket.IO) con sala por tournament_id/event_id, emisión de actualizaciones al
cargar/importar resultados durante un torneo en_curso, y consumo en la vista de prueba (aparecen
sin recargar). Redis como backplane para escalar horizontal.

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; cargo un tiempo en un torneo en_curso y aparece
en vivo en la vista de la prueba sin refrescar.
```

---

## PROMPT 15 — M14: Cuentas de nadadores + vinculación

```
Contexto: plataforma FTN. Respetá CLAUDE.md y ESPECIFICACION-FUNCIONAL-v3.md §3, §7 y v2 (perfil).

Objetivo de esta sesión (SOLO esto): que un nadador tenga cuenta y la vincule a su atleta.
Incluí: registro de AthleteAccount + verificación email, búsqueda y solicitud de vinculación a un
swimmer, AccountLinkRequest (pending/approved/rejected/cancelled) con match_confidence calculado como
AYUDA, revisión y aprobación/rechazo por Admin (con motivo), reglas estrictas (un atleta ↔ una cuenta;
una cuenta ↔ un atleta; índices únicos parciales), auditoría completa en audit_logs, y acceso del
nadador a su historial al quedar vinculado. AthleteProfile editable (foto, bio, visibilidad).

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; creo cuenta, solicito vínculo, el admin aprueba,
y veo mi historial; tests de las reglas de unicidad y de la auditoría. Toda vinculación pasa por admin.
```

---

## PROMPT 16 — M15: Evolución de tiempos + estadísticas

```
Contexto: plataforma FTN. Respetá CLAUDE.md y ESPECIFICACION-FUNCIONAL-v3.md §5 y v2 §3.

Objetivo de esta sesión (SOLO esto): los gráficos y estadísticas del perfil del nadador.
Incluí: cálculo y visualización de evolución por prueba (mejor tiempo por temporada, mejora total),
mejor marca histórica/anual, última marca, diferencia vs PB y vs competencia anterior; todo separado
por piscina 25/50; servido desde AthleteStatistics precalculado. Gráficos motivacionales (líneas,
badges de PB, comparador entre temporadas y contra récord de categoría).

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; el perfil muestra la evolución correcta con datos
reales; test del cálculo de "mejora total" y "diferencia vs PB".
```

---

## PROMPT 17 — M16: Exportación + compatibilidad

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md §9 y v3 §6.3.

Objetivo de esta sesión (SOLO esto): exportar datos para mantener compatibilidad con Meet Manager.
Incluí: exportación Lenex (entries y results), exportación PDF/HTML de programa, heat sheet y
resultados, y registro en meet_manager_export. La exportación se genera desde el estado homologado.

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; genero un Lenex válido y un PDF de resultados
de un torneo homologado; test de que el export es reproducible.
```

---

## PROMPT 18 — M17: Adapters CSV / Excel / PDF (fallback)

```
Contexto: plataforma FTN. Respetá CLAUDE.md y MODULO-INGESTA-RESULTADOS.md §1.2, §6.2.1.

Objetivo de esta sesión (SOLO esto): soportar los formatos secundarios de importación.
Incluí: CsvAdapter y ExcelAdapter (mapeo declarativo por cabeceras, con perfiles/plantillas
versionadas y mapeo manual de columnas si no se reconoce), y PdfAdapter de fallback (parser por
plantilla sobre el reporte tabular de Meet Manager; matching de confianza media por nombre+edad+club
con revisión humana obligatoria en el preview). Todos producen el mismo NormalizedMeet.

IMPORTANTE: usá archivos CSV/Excel/PDF reales de ejemplo que voy a adjuntar como fixtures.

Antes de codear, mostrame el PLAN. Esperá aprobación.

Criterio de terminado: typecheck/lint/test verdes; importo un CSV y un PDF de ejemplo y entran por
el mismo pipeline; tests por cada adapter con sus fixtures.
```

---

## Cierre — verificación end-to-end (cada 3–4 milestones y al final)

```
Contexto: plataforma FTN. Respetá CLAUDE.md.

Objetivo de esta sesión (SOLO esto): verificación integral, sin features nuevas.
Corré lint, typecheck, tests y build completos y mostrame la salida. Levantá la app y recorré el flujo
end-to-end: importar un torneo (HY3) → preview → confirmar → homologar → ver resultados en la UI →
ver ranking actualizado → ver récord candidato → ver perfil de un nadador con su evolución.
Reportá cualquier inconsistencia o deuda técnica encontrada (NO la arregles sin avisar; listámela
priorizada para que yo decida).
```

---

## Recordatorios finales

- **Adjuntá los fixtures reales** (HY3, y después CSV/Excel/PDF) en los milestones M6, M7 y M17. Es lo que hace que el parser funcione con datos de verdad.
- **Pendientes de v3 §10: TODOS resueltos** (categoría congelada, récords nacionales solo-referencia, licencia bloqueante, relevos doble). Nada que definir antes de M9/M10.
- **Después de cada prompt:** revisás diff → verificás → commit. Nunca encadenes milestones sin revisar.
- Si un milestone resulta demasiado grande para revisar en una pasada, pedile a Sonnet que lo **parta en sub-pasos** y aprobás de a uno.

---
*Secuencia de prompts para construir la plataforma FTN con Sonnet, de forma controlada y verificable.*
