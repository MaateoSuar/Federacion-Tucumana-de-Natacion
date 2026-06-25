# MÓDULO: Ingesta y Transformación de Datos Meet Manager + Sistema de Resultados Moderno
## Federación Tucumana de Natación (FTN) — Especificación funcional para implementación

> **Documento de handoff para desarrollo.** Diseño funcional y de sistema; **sin código** por decisión explícita. Listo para que un desarrollador (o agente) comience la implementación.
> Stack de referencia: ver `ARQUITECTURA.md` (Next.js + NestJS + PostgreSQL + Prisma + Redis/BullMQ + S3).
> Modelo de negocio de referencia: `ESPECIFICACION-FUNCIONAL-v3.md` (autoritativo) y `-v2.md`.

---

## 0. Alcance, principios y nota de compatibilidad

### 0.1 Qué resuelve este módulo
Convertir archivos crudos de Meet Manager en **información deportiva rica**, normalizada, persistida, rankeada y visualizada en una UI moderna — reemplazando la experiencia visual de Meet Manager **sin romper la compatibilidad** con los archivos que los clubes ya producen.

### 0.2 Principios rectores (heredados, no negociables)
1. **`Athlete` ≠ `User`** — el atleta es el registro deportivo oficial; la cuenta es opt-in y se vincula con aprobación administrativa.
2. **Tiempos en milisegundos enteros**; comparables solo dentro de la misma prueba + misma piscina.
3. **Verdad histórica inmutable** — categoría, club y piscina se **congelan** en el resultado.
4. **Récords 25 m y 50 m independientes**; detección automática + **homologación humana obligatoria**.
5. **Edad deportiva al 31 de diciembre** del año de la competencia.
6. **Ranking sobre TODO el histórico homologado**, materializado e incremental (no recalcular todo).
7. **Idempotencia y rollback** en toda ingesta; nada llega a producción sin pasar por staging + revisión.

### 0.3 Nota de compatibilidad de formatos (reconciliación)
- **Este módulo prioriza los exports estructurados de Meet Manager: HY3, CSV y Excel** (estructura de tablas fija, datos variables) — son confiables y traen IDs/edades.
- **Realidad operativa previa:** los clubes hoy entregan PDF al cierre del torneo. El **PDF queda soportado como fallback** (parser por plantilla, menor confiabilidad, ver `ESPECIFICACION-FUNCIONAL-v3.md` §6.2.1) y se impulsa institucionalmente que los clubes adjunten el export estructurado (un clic más en Meet Manager).
- La arquitectura es **agnóstica de formato** (patrón Adapter): HY3/CSV/Excel/PDF son todos "fuentes" que producen el mismo modelo intermedio.

---

## 1. ARQUITECTURA DE INGESTA DE DATOS

### 1.1 Visión general del pipeline

```
            ┌──────────────────────────────────────────────────────────────┐
 Upload ───▶│ ImportJob (async, BullMQ)                                      │
            │                                                                │
            │  1.DETECT ─▶ 2.PARSE ─▶ 3.NORMALIZE ─▶ 4.VALIDATE ─▶ 5.MATCH   │
            │      │          │            │             │            │       │
            │   formato    adapter     modelo único   reglas      atletas/    │
            │  +versión   por formato   (staging)     +warnings   clubes      │
            │                                                                │
            │  6.PREVIEW (humano) ─▶ 7.COMMIT (txn) ─▶ 8.POST-PROCESS ─▶ DONE │
            │       │                     │                 │                 │
            │   admin revisa         tablas oficiales   PB/rankings/records   │
            └──────────────────────────────────────────────────────────────┘
```

Cada etapa es observable: el `ImportJob` guarda estado, métricas y un log de issues consultable desde el panel.

### 1.2 Lectura de archivos (HY3 / CSV / Excel)

| Formato | Naturaleza | Estrategia de lectura |
|---------|-----------|-----------------------|
| **HY3** (Hy-Tek) | Texto plano, líneas con **código de registro** de 2 caracteres al inicio (A1, B1, B2, C1, C2, D0, E0, F0…) y campos por **posición fija** (ancho fijo) | Lectura línea a línea; cada prefijo indica tipo de registro (meet, team, athlete, entry, result, splits). Parser de ancho fijo según el código. |
| **CSV** | Tabla delimitada exportada de Meet Manager o reportes | Lectura por cabecera de columnas + mapeo declarativo a campos del modelo. |
| **Excel (.xlsx)** | Hoja(s) con tablas | Lectura de hoja → filas → mismo mapeo declarativo que CSV. |
| **PDF** (fallback) | Reporte tabular | Parser por plantilla (texto/OCR). Ver v3 §6.2.1. |

> **HY3 es el formato más rico** (trae estructura completa: meet, equipos, atletas, inscripciones, resultados, parciales, descalificaciones). Se recomienda como **formato primario** cuando esté disponible. CSV/Excel suelen traer un subconjunto (a menudo solo resultados).

### 1.3 Detección de estructura y versión de Meet Manager

- **FormatDetector**: inspecciona el archivo (extensión + firma de contenido). HY3 se reconoce por los códigos de registro; CSV/Excel por el conjunto de cabeceras.
- **Perfil de exportación** (`export_profile`): Meet Manager permite configurar qué columnas exporta. Se modela un **catálogo de perfiles/plantillas** que mapea "conjunto de cabeceras conocido" → reglas de parsing. Soportar **múltiples versiones** = agregar un perfil, no tocar el motor.
- Si el archivo no matchea ningún perfil conocido → el job entra en estado `needs_mapping` y el admin puede **mapear columnas manualmente** una vez (se guarda como nuevo perfil reutilizable).

### 1.4 Parsing confiable

- **Tolerante a fallos por fila**: una fila inválida no aborta el archivo; se marca como error y el resto continúa.
- **Tipado y coerción explícita**: tiempos `mm:ss.cc` → entero ms; fechas → ISO; sexo/estado → enums internos.
- **Trazabilidad**: cada registro normalizado guarda `source_line` / `source_row` para diagnóstico.

### 1.5 Manejo de errores de formato

Clasificación de issues (se acumulan en `ImportJob.issues`):
- **FATAL**: archivo ilegible / formato no reconocido / encoding roto → job `failed`, no se procesa.
- **ERROR (fila)**: dato obligatorio faltante o inválido (tiempo no parseable, prueba inexistente) → fila excluida, requiere corrección.
- **WARNING**: dato sospechoso pero usable (tiempo fuera de rango esperado para la edad, club no reconocido) → se permite confirmar tras revisión humana.
- **INFO**: atleta nuevo detectado, club nuevo, récord candidato.

Cada issue lleva: severidad, etapa, mensaje, referencia a la fila/registro origen, y acción sugerida.

### 1.6 Soporte de múltiples versiones de exportación

- Motor **dirigido por configuración** (perfiles/plantillas declarativas), no por código hardcodeado.
- Versionado de perfiles (`export_profiles` con `version`, `detector_signature`, `column_map`).
- Tests de regresión con archivos de ejemplo reales por cada perfil soportado (carpeta de fixtures).

---

## 2. MODELO INTERNO NORMALIZADO (independiente del formato origen)

### 2.1 Modelo intermedio de ingesta (`NormalizedMeet`) — estructura en staging

Estructura en memoria/staging que **todo adapter debe producir**, idéntica sin importar el formato origen:

```
NormalizedMeet
├─ meet:            { name, venue, course(25|50), start_date, end_date, source, external_meet_id }
├─ clubs[]:         { name, short_name, external_team_id }
├─ swimmers[]:      { first_name, last_name, gender, birth_date?, age?, document?, club_ref, external_athlete_id }
├─ events[]:        { stroke, distance, gender, round, category_hint?, event_no, course }
└─ results[]:       { event_ref, swimmer_ref, heat_no, lane_no,
                      final_time_ms, status(OK|DSQ|DNS|DNF), place?,
                      seed_time_ms?, reaction_time?, dsq_code?,
                      splits[]: { distance, cumulative_time_ms } }
```

- Las referencias (`club_ref`, `swimmer_ref`, `event_ref`) son **internas al archivo** (resueltas en la etapa MATCH contra entidades oficiales).
- `external_*_id` preserva los identificadores de Meet Manager para conciliaciones futuras.

### 2.2 Mapeo al modelo oficial (entidades persistidas)

| Campo normalizado | Entidad/columna oficial | Notas |
|-------------------|-------------------------|-------|
| Nadador | `swimmers` (+ `swimmer_club_history`) | matching por DNI/external_id/nombre+nacimiento |
| Club | `clubs` | matching por nombre/short_name/external_team_id |
| Torneo | `tournaments` | `course` → `pool_length` (25/50) |
| Prueba | `events` ← `event_definitions` | mapeo estilo+distancia+sexo a catálogo |
| **Categoría** | `results.category_id` (congelada) | calculada por `resolveCategory(birth_date, season, scope, rule=31dic)` |
| Serie | `heats` | `heat_no` |
| Carril | `lane_assignments` / `results.lane` | `lane_no` |
| Tiempo | `results.final_time` (ms entero) | |
| Estado | `results.status` (OK/DSQ/DNS/DNF) | |
| Fecha | `tournaments.start/end_date`, `results.created_at` | |
| Piscina | `tournaments.pool_length` (25/50) | parte de clave de récords/PB/ranking |

> **Fuente de origen** (`results.source = hy3 | csv | excel | pdf | ftn_manager | manual`) se persiste para trazabilidad y para habilitar histórico mixto.

---

## 3. CAPA DE TRANSFORMACIÓN (ETL)

```
Meet Manager File ──▶ [DETECT] ──▶ [PARSE/Adapter] ──▶ NormalizedMeet (staging)
                                                              │
                                                       [NORMALIZE]
                                                              │  (ms, enums, fechas, categoría)
                                                              ▼
                                                       [VALIDATE] ── issues ──▶ preview
                                                              │
                                                        [MATCH] ── atletas/clubes
                                                              │
                                                    [PREVIEW humano]  ◀── admin
                                                              │ confirm
                                                       [COMMIT txn] ──▶ DATABASE oficial
                                                              │
                                                     [POST-PROCESS] ──▶ PB / rankings / records / achievements / notifs
```

### 3.1 Estrategia de mapping de atletas (cascada por confianza)

1. **DNI / documento exacto** → match fuerte (cuando el formato lo trae).
2. **`external_athlete_id`** ya mapeado de una importación previa del mismo club → match fuerte.
3. **Nombre + apellido + fecha de nacimiento + sexo** exacto → match alto.
4. **Nombre + apellido + año de nacimiento + club** → match medio (requiere confirmación en preview).
5. **Fuzzy** (distancia de edición sobre nombre normalizado) → candidato sugerido, nunca automático.
6. Sin match → **atleta nuevo** (ver 3.3).

Se mantiene `external_id_map` (sistema_origen, external_id, swimmer_id) para que el club, una vez conciliado, se reconozca automáticamente en el futuro.

### 3.2 Detección de duplicados

- **Dentro del archivo**: mismo atleta dos veces en una serie, o mismo resultado repetido → warning.
- **Contra la base**: candidato "nuevo" que se parece mucho a un swimmer existente (fuzzy nombre + nacimiento) → se ofrece "¿es el mismo?" antes de crear.
- **Idempotencia del meet**: clave natural `(external_meet_id | file_hash, event, swimmer, heat, lane)` → reimportar el mismo torneo hace **upsert**, no duplica.

### 3.3 Asociación automática de clubes

1. `external_team_id` mapeado → match fuerte.
2. `short_name` / sigla exacta → match alto.
3. Nombre normalizado exacto → match alto.
4. Fuzzy nombre → sugerencia.
5. Sin match → club nuevo (el admin lo crea o lo vincula a uno existente en el preview).

### 3.4 Manejo de atletas no vinculados

- Un resultado **siempre se asocia al `swimmer` oficial** (creado o matcheado). La existencia de cuenta (`AthleteAccount`) es **independiente**.
- Si el swimmer no tiene cuenta → el resultado igual se persiste y queda disponible para cuando el atleta se registre y se vincule (hereda todo el histórico). Ver §7.
- Atletas creados desde import nacen con `source = import` y sin cuenta.

### 3.5 Commit y rollback

- **COMMIT transaccional**: todo el meet se persiste en una sola transacción; si falla, no queda nada a medias.
- Se registra el **conjunto de filas creadas** por el job → permite **rollback** de un import confirmado por error.
- Tras commit, se emite el evento de dominio `MeetImported` que dispara el post-procesamiento.

---

## 4. SISTEMA DE VISUALIZACIÓN MODERNA

UI en Next.js (SSR/ISR para lo público e indexable). Componentes de datos servidos desde proyecciones precalculadas.

| Vista | Contenido | Fuente |
|-------|-----------|--------|
| **Por prueba** | Tabla de resultados de una prueba: serie/carril, nadador, club, tiempo, parciales, puesto, estado, badges (PB/récord) | `results` ⋈ `events` |
| **Por torneo** | Programa, lista de pruebas, resultados, medallero, récords del torneo, estadísticas | `tournaments` + agregados |
| **Por categoría** | Ranking/resultados filtrados por categoría (Pre A … Mayores / Junior) | `results` + `categories` |
| **Ranking en vivo** | Durante el torneo: resultados aparecen por WebSocket a medida que se cargan/importan | WS sala por prueba/torneo |
| **Highlight de récords** | Resaltado visual cuando un resultado es récord (candidato/homologado) | `records` |
| **Mejores marcas (PB)** | PB del nadador por prueba/piscina, con torneo y fecha de origen | `personal_bests` |
| **Evolución de tiempos** | Gráfico de líneas por prueba (mejor por temporada), mejora total, diferencia vs PB | `athlete_statistics` |

### 4.1 Tiempo real
- "Ranking en vivo" y "vista por prueba en vivo" se alimentan por **WebSocket (Socket.IO)**, sala por `tournament_id`/`event_id`.
- Aplica tanto a carga manual (FTN Manager) como a importación incremental durante el evento.

### 4.2 Rendimiento
- Listas públicas servidas desde **vistas materializadas / tablas de proyección** + cache Redis + ISR/CDN.
- Nada de cálculo pesado en el request: el ranking ya está materializado (§5).

---

## 5. SISTEMA DE RANKING HISTÓRICO (cálculo eficiente)

### 5.1 Tipos de ranking (todos derivados de `results` homologados)

| Ranking | Clave de agrupación | Notas |
|---------|---------------------|-------|
| **Global histórico** | `(event_definition, pool_length, gender)` sobre todo el histórico | modos `best_per_swimmer` (default) y `all_performances` con selector |
| **Por temporada** | `+ season_id` | filtros: año, categoría, sexo, club, piscina, prueba |
| **Por categoría** | `+ category_id` | Top N (default 100) por categoría |
| **Por club** | agregado por `club_id` | puntos por **posición estilo FINA** (9-7-6-5-4-3-2-1, configurable vía `scoring_schemes`) + medallas + récords + nadadores activos |
| **Por prueba** | `(event_definition, pool_length, gender)` | corte por prueba específica |

### 5.2 Estrategia de cálculo incremental (NO recalcular todo)

**Problema:** recomputar el ranking de toda la historia en cada lectura no escala.

**Solución — proyecciones materializadas + invalidación dirigida por evento:**

```
Resultado homologado / importado
        │  emite evento ResultHomologated(event_definition, pool_length, gender, category, season, club)
        ▼
   Worker (BullMQ) encola job de recálculo PARCIAL
        │  recalcula SOLO las proyecciones afectadas por esa tupla:
        ├─ ranking global de ESA prueba/piscina/sexo
        ├─ ranking de ESA temporada/categoría
        ├─ puntos del club afectado
        └─ snapshot RankingHistory de la temporada
        ▼
   Proyecciones actualizadas (materialized views / tablas de ranking)
        ▼
   Lectura web = SELECT directo sobre la proyección (rápido, ya ordenado)
```

- **Materialized views** para rankings de lectura intensiva; refresco incremental por worker, no por request.
- **`RankingHistory`** congela la posición por temporada (snapshot al cierre / recalculado incremental) → habilita "ranking histórico" y "evolución de posición" sin tocar el pasado.
- **`PersonalBest`** cacheado por `(swimmer, event_definition, pool_length)` → actualizado solo si el nuevo tiempo mejora.
- **Cache Redis** sobre las proyecciones para los cortes más consultados (top 100 por categoría, etc.), con invalidación dirigida por la misma tupla del evento.
- **Particionado por temporada** de `results`/`splits` para que las consultas vivas toquen particiones chicas.

---

## 6. DETECCIÓN AUTOMÁTICA DE RÉCORDS

### 6.1 Identidad del récord
Clave completa: `(scope, event_definition_id, category_id, gender, pool_length)`
- `scope ∈ {provincial, nacional}`; `pool_length ∈ {25, 50}` → **récords 25 m y 50 m independientes**.
- Un solo `is_current = true` por clave (índice único parcial).

### 6.2 Cuándo se valida
- **Solo se evalúan resultados homologados.** La importación deja resultados en estado importado; la **homologación** (acción administrativa por prueba o torneo) es la que habilita la evaluación de récords.
- Detección automática post-homologación: si `final_time < record_actual.time` para la clave → se crea un **récord candidato** (`status = pending_homologation`).
- **Publicación NO automática**: un Admin/Super Admin **homologa el récord** explícitamente. Al hacerlo, el anterior pasa a `is_current=false` con `previous_record_id` (cadena histórica).

### 6.3 Flujo

```
Resultado homologado ──▶ evaluar contra récord vigente (misma clave) ──▶ ¿lo supera?
        │ sí
        ▼
  Récord candidato (pending) ──▶ Admin revisa ──▶ homologa ──▶ récord vigente (is_current)
                                                              └─ anterior: is_current=false, previous_record_id
```

- Tipos cubiertos: **récord provincial**, **récord por categoría** (categoría es parte de la clave), **récord por piscina 25/50**.
- Cada récord enlaza `source_result_id`, torneo, fecha, nadador, club y juez/admin homologador (trazabilidad total).

---

## 7. SISTEMA DE VINCULACIÓN DE NADADORES

Un atleta existe sin cuenta (por su histórico). Un usuario crea cuenta y **solicita** vincularse; un Admin aprueba.

### 7.1 Flujo de solicitud y aprobación

```
1. Usuario crea cuenta (AthleteAccount) + verifica email.
2. Usuario busca su atleta (por nombre/DNI/club) y solicita vinculación.
3. Sistema crea AccountLinkRequest(status=pending) + calcula match_confidence (DNI+nacimiento) como AYUDA.
4. Admin FTN revisa: ve datos de la cuenta, del atleta y el score.
5. Admin APRUEBA o RECHAZA (con motivo).
6a. APROBADA  → vínculo activo; el usuario accede a TODO su historial deportivo.
6b. RECHAZADA → sin vínculo; el usuario ve el motivo y puede reintentar.
```

### 7.2 Prevención de duplicados (reglas estrictas)
- **Un atleta ↔ una sola cuenta** (índice único parcial: un único `approved` por `swimmer_id`).
- **Una cuenta ↔ un solo atleta** (un único `approved` por `account_id`).
- Una solicitud `pending` bloquea otra del mismo usuario o sobre el mismo atleta.
- Default: **toda vinculación pasa por revisión humana** (el match automático solo informa, no auto-aprueba).

### 7.3 Auditoría completa
- `AccountLinkRequest` conserva todo el historial (pending/approved/rejected/cancelled, revisor, fecha, motivo) — no se borra.
- Toda acción (crear/aprobar/rechazar/desvincular) se registra en `audit_logs` con actor, timestamp, IP.
- Desvinculación solo por Admin, auditada, libera ambos lados.

---

## 8. UI MODERNA (reemplazo de Meet Manager)

Lenguaje visual: plataforma deportiva profesional (tipo resultados de natación modernos), responsive, accesible.

### 8.1 Patrones de componentes

| Componente | Diseño |
|------------|--------|
| **Tablas de resultados modernas** | Filas claras, sticky header, orden por columna, densidad cómoda, paginación/scroll virtual para pruebas grandes. |
| **Visualización de tiempos** | `mm:ss.cc` legible; parciales (splits) expandibles; columna de **diferencia vs PB** y **vs récord** con signo y color. |
| **Colores por medalla** | 1° oro, 2° plata, 3° bronce (badges/realce de fila); resto neutro. |
| **Indicadores de mejora** | Flecha/चip verde "PB −0.83s", rojo si retrocede; badge "Récord" destacado. |
| **Comparación histórica** | Gráfico de evolución por prueba; comparador entre temporadas y contra récord de categoría. |
| **Highlight de récords** | Banda/realce especial + ícono cuando el resultado es récord (candidato vs homologado diferenciados). |
| **Estados** | DSQ/DNS/DNF con etiqueta clara y tooltip del código de descalificación. |

### 8.2 Vistas clave (rutas)
- `/torneos/[id]` — torneo (pruebas, resultados, medallero, récords, stats).
- `/torneos/[id]/prueba/[eventId]` — resultados de una prueba (con vivo).
- `/rankings` — rankings (global/temporada/categoría/club/prueba) con filtros.
- `/nadadores/[id]` — perfil público (historial, PB, evolución, récords, club actual/anteriores, pasaporte).
- `/records` — récords provinciales por categoría/piscina.

### 8.3 Principios UX
- Lo importante primero (tiempo, puesto, mejora). Cero ruido visual de Meet Manager.
- Todo dato deportivo enlazable y compartible (URLs limpias, SEO).
- Mobile-first: las familias miran desde el teléfono en la pileta.

---

## 9. ESTRATEGIA DE MIGRACIÓN (progresiva, reversible)

| Etapa | Meet Manager | Sistema FTN | Resultado |
|-------|--------------|-------------|-----------|
| **1. Capa superior (lectura)** | Sigue siendo la herramienta de los clubes | **Importa** HY3/CSV/Excel (PDF fallback) y se vuelve el **repositorio histórico + visualización pública** | Cero fricción; valor inmediato sin cambiar hábitos |
| **2. Híbrido** | Cronometraje/pileta | FTN gestiona **inscripciones y seeding**, **exporta** a Meet Manager/cronometraje y **reimporta** resultados | FTN entra en el flujo operativo sin reemplazar todo |
| **3. Nativo (FTN Manager)** | Respaldo/exportación de compatibilidad | Maneja el ciclo completo (torneos→series→resultados→homologación→rankings→récords) | Meet Manager deja de ser necesario, pero la compatibilidad permanece |

- **Nunca se rompe Meet Manager**: import + export bidireccional garantizan reversibilidad.
- Histórico mixto convive gracias a `results.source`.
- El cambio de hábito (entregar export estructurado además del PDF) se impulsa por reglamento, no por imposición técnica.

---

## 10. CONCLUSIÓN ARQUITECTÓNICA

### 10.1 Arquitectura ideal (componentes)

```
┌─────────────── FRONTEND (Next.js) ───────────────┐
│ Vistas públicas (SSR/ISR): torneos, prueba,       │
│ rankings, perfil, récords  +  Panel admin (import,│
│ preview, homologación, vinculaciones)             │
└───────────────┬───────────────────────────────────┘
                │ REST + WebSocket
┌───────────────▼─────────── BACKEND (NestJS, monolito modular) ──────────────┐
│ Módulos:                                                                    │
│  • Ingest/ETL  (FormatDetector, Adapters HY3/CSV/Excel/PDF, Normalizer)     │
│  • Import      (ImportJobs, staging, preview, commit, rollback)             │
│  • Matching    (atletas, clubes, external_id_map, dedupe)                   │
│  • Results / Tournaments / Events / Heats                                   │
│  • Rankings    (proyecciones materializadas, incremental)                   │
│  • Records     (detección + homologación 25/50)                            │
│  • Athlete Accounts + Linking (AccountLinkRequest, auditoría)               │
│  • Statistics / PersonalBest / Achievements                                 │
│  • Realtime (WS), Notifications, Audit                                      │
└───────┬───────────────┬───────────────┬───────────────┬────────────────────┘
        │               │               │               │
   ┌────▼────┐    ┌──────▼─────┐   ┌─────▼──────┐  ┌──────▼──────┐
   │PostgreSQL│   │   Redis    │   │ Worker     │  │  S3 / R2    │
   │(+réplica,│   │ cache +    │   │ (BullMQ):  │  │ archivos    │
   │particion.│   │ colas +    │   │ ETL,rankings│ │ (HY3/PDF,   │
   │ por temp.)│  │ WS backplane│  │ records,PB │  │ docs, fotos)│
   └──────────┘   └────────────┘   └────────────┘  └─────────────┘
```

### 10.2 Flujo de datos completo (extremo a extremo)

```
Club exporta de Meet Manager (HY3/CSV/Excel; PDF fallback)
   │
   ▼ upload al panel FTN
ImportJob ▶ Detect ▶ Parse(Adapter) ▶ Normalize(NormalizedMeet) ▶ Validate ▶ Match(atletas/clubes)
   │
   ▼ PREVIEW (admin revisa nuevos atletas, conflictos, warnings, récords candidatos)
COMMIT transaccional ▶ tablas oficiales (results.source=hy3/csv/…)
   │
   ▼ evento MeetImported / ResultHomologated  (tras homologación)
Worker: actualiza PersonalBest ▶ recalcula Rankings (incremental) ▶ evalúa Récords (candidatos)
        ▶ snapshot RankingHistory ▶ Statistics ▶ Achievements ▶ Notificaciones
   │
   ▼
UI moderna (SSR/ISR + WS en vivo): torneos, pruebas, rankings, récords, perfiles, evolución
   │
   ▼
Atleta crea cuenta ▶ solicita vinculación ▶ Admin aprueba ▶ accede a todo su historial
```

### 10.3 Estrategia escalable a futuro
- **Monolito modular** ahora; el módulo de **tiempo real** o el de **ETL/parsing** son los primeros candidatos a extraerse como servicio si una métrica real lo exige.
- **Particionado por temporada** + **proyecciones materializadas** + **recálculo incremental** soportan décadas de histórico y miles de nadadores en una sola instancia robusta.
- **Adapters de formato** desacoplados → agregar Lenex u otro formato no toca el núcleo.
- **API pública / open data** (récords, rankings) como evolución natural para medios y terceros.

---

## 11. NOTAS DE IMPLEMENTACIÓN (handoff a desarrollo)

> Para quien tome este documento y empiece a codear. **Aún no escribir Prisma sin confirmar las entidades** ya definidas en `ESPECIFICACION-FUNCIONAL-v3.md` §8 y `-v2.md` §8.

### 11.1 Orden de construcción sugerido
1. **Esquema de datos** (Prisma) consolidando entidades de v2 §8, v3 §8 y este doc (NormalizedMeet es transitorio/staging, no necesariamente tabla).
2. **Catálogos maestros**: `event_definitions`, `categories` (12 oficiales + Junior), `seasons`, `scoring_schemes`.
3. **Módulo Ingest/ETL**: FormatDetector + HY3Adapter (primario) → Normalizer → Validate. Empezar por HY3 por ser el más rico; CSV/Excel después; PDF como fallback al final.
4. **ImportJob + staging + PREVIEW + COMMIT/rollback** (con idempotencia por file_hash).
5. **Matching** atletas/clubes + `external_id_map` + dedupe.
6. **Results/Tournaments/Events/Heats** + homologación.
7. **Post-process worker** (BullMQ): PersonalBest → Rankings (incremental) → Records → RankingHistory → Statistics → Achievements.
8. **UI moderna**: vistas de torneo/prueba/ranking/perfil + tiempo real (WS).
9. **Cuentas + vinculación** (AccountLinkRequest) + auditoría.
10. **Export** (Lenex/PDF) y estrategia de migración.

### 11.2 Componentes/interfaces clave a definir en código
- `interface FormatAdapter { detect(file): boolean; parse(file): NormalizedMeet }`
- `resolveCategory(birthDate, season, scope, rule=DEC_31): Category`
- `AthleteMatcher` (cascada de confianza) y `ClubMatcher`.
- `RankingProjectionService.recompute(scopeKeys)` — recálculo incremental por tupla.
- `RecordEvaluator.evaluate(result)` — candidato de récord.
- Eventos de dominio: `MeetImported`, `ResultHomologated`, `RecordBroken`, `NewPB`.

### 11.3 Reglas que NO pueden romperse (tests obligatorios)
- Tiempos siempre en ms entero; nunca comparar 25 vs 50.
- Categoría/club/piscina **congelados** en `results`.
- Récords solo desde resultados **homologados**; publicación con homologación humana.
- Idempotencia: reimportar el mismo meet no duplica.
- Un atleta ↔ una cuenta; toda vinculación auditada.

### 11.4 Supuestos vigentes (confirmados) y pendientes menores
- ✅ Edad al **31/12**; ranking **ambos modos**; puntos club **posición FINA**; récords **25/50 separados**; formato hoy **PDF** (estructurados HY3/CSV/Excel como meta).
- ⏳ Pendientes menores (no bloquean): categoría del ranking por categoría (congelada vs actual), récords nacionales (propios vs referencia CADDA), licencia anual habilitante, puntaje de relevos. Ver `ESPECIFICACION-FUNCIONAL-v3.md` §10.

---
*Documento de arquitectura funcional del módulo de Ingesta + Resultados. Sin código por decisión explícita. Listo para handoff a desarrollo.*
