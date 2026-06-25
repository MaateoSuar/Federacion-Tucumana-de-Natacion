# Especificación Funcional Definitiva — v3
## Federación Tucumana de Natación (FTN) — Producto base

> Documento autoritativo. Consolida y supersede `ESPECIFICACION-FUNCIONAL-v2.md` en los módulos aquí tratados.
> Complementa `ARQUITECTURA.md` (stack y arquitectura técnica).
> Estado: **Para validación final antes de generar Prisma.**
> Cambios v3: Módulo Rankings (núcleo), Página de Torneos, Sistema de Cuentas con aprobación administrativa, Perfil, Evolución de Tiempos, Compatibilidad Meet Manager flexible, y validación de reglas de negocio (edad deportiva SIN asumir, récords 25/50 separados).

---

## 0. Principios rectores (no negociables del producto)

1. **`Athlete` ≠ `User`.** El atleta es el registro deportivo oficial (existe por el histórico de competencias); la cuenta es una identidad de acceso opt-in. Se vinculan por un proceso controlado.
2. **El ranking se construye sobre TODOS los resultados homologados existentes**, sin límite de temporada.
3. **La verdad histórica es inmutable.** Categoría, club y piscina con que se compitió se congelan en el resultado.
4. **Tiempos en milisegundos enteros**; comparables solo dentro de misma prueba + misma longitud de piscina.
5. **Récords independientes para piscina de 25 m y 50 m.** (Confirmado por la FTN.)
6. **La edad deportiva se calcula al 31 de diciembre** del año de la competencia (decisión FTN confirmada — §7.1). El motor queda igualmente parametrizable.
7. **Importación multi-formato flexible**: la arquitectura no se ata a un único formato. **Realidad operativa actual: los clubes solo entregan PDF de resultados al final de cada torneo** (§6, §7.2) — esto define la estrategia de importación.

---

## 1. MÓDULO RANKINGS (núcleo)

El ranking es una **proyección de lectura** derivada de `results` homologados. Se materializa (no se recalcula por request) y se invalida por evento de dominio al homologar.

### 1.0 Decisión de modelado central: ¿qué es "una posición en el ranking"?

Un ranking ordena **performances** (tiempos). La pregunta clave es la **unidad de fila**:
- **Modo "mejor por nadador" (recomendado por defecto):** una fila por nadador = su mejor tiempo en esa prueba/piscina/ámbito. Es el ranking "clásico" (quién es el más rápido). El ejemplo del pedido (Juan 24.15, Mateo 24.30) corresponde a este modo: distintos nadadores.
- **Modo "todas las performances":** una fila por cada resultado (un mismo nadador puede aparecer varias veces). Útil para "mejores marcas de la historia" incluyendo repeticiones.

> **DECISIÓN CONFIRMADA (FTN): soportar AMBOS con selector.** El sistema expone un parámetro `mode` (`best_per_swimmer` | `all_performances`); el default de las páginas públicas es `best_per_swimmer` y el usuario puede cambiar a `all_performances` desde la UI.

### 1.1 Ranking General Histórico

- Construido sobre **todos los resultados homologados de toda la historia** (sin filtro de temporada).
- Clave de agrupación: `(event_definition_id, pool_length, gender)`. Una tabla de ranking **por prueba, por piscina, por sexo**.
- Columnas a mostrar (según el ejemplo del pedido):

| # | Campo | Origen |
|---|-------|--------|
| Posición | `RANK()` por `final_time` asc | calculado |
| Nadador | `swimmers.first_name + last_name` | swimmer congelado |
| Club | club con el que compitió ese resultado | `results.club_id` (congelado) |
| Tiempo | `final_time` formateado | `results` |
| Fecha | fecha de la prueba | `events`/`tournaments` |
| Torneo | nombre del torneo | `tournaments` |
| Piscina | 25 / 50 | `tournaments.pool_length` |
| Categoría utilizada | categoría **congelada** del resultado | `results.category_id` |
| Año | año de la temporada/torneo | `seasons` |

> **Nota sobre "Categoría utilizada":** es la categoría con la que el nadador compitió en ese momento (congelada), NO su categoría actual. Esto preserva la verdad histórica (un récord de cuando era Infantil 1 sigue figurando como Infantil 1 aunque hoy sea Mayor).

### 1.2 Ranking por Temporada

- Mismo motor, filtrado por `season_id` (año).
- **Filtros disponibles:** Año · Categoría · Sexo · Club · Piscina (25/50) · Prueba.
- Todos los filtros combinables (AND). El ranking se reordena dentro del subconjunto.

### 1.3 Ranking por Categoría

- "Top N" (configurable, default 100) por categoría: *Top 100 Infantil 1*, *Top 100 Menor 2*, etc.
- **Decisión a validar (§7.4):** ¿la categoría del ranking es la **congelada** (con la que compitió) o la **actual** (recalculada a la edad de hoy)? Por defecto se usa la **congelada** para coherencia con el histórico; un modo alternativo "ranking por categoría actual" puede ofrecerse para ver a los nadadores en su categoría vigente esta temporada.

### 1.4 Ranking por Club

Tabla agregada por club. Columnas:

| Campo | Definición |
|-------|-----------|
| Club | `clubs.name` |
| Puntos acumulados | suma de puntos según **sistema de puntuación** (ver §1.4.1) |
| Nadadores activos | nadadores del club con al menos 1 resultado en el período |
| Medallas | conteo de oro/plata/bronce (`athlete_achievements`) |
| Récords | récords vigentes en poder de nadadores del club |

#### 1.4.1 Sistema de puntuación de clubes — DECISIÓN CONFIRMADA: **por posición (estilo FINA)**

> **Resuelto por la FTN:** los puntos se asignan **por puesto**: 1°=9, 2°=7, 3°=6, 4°=5, 5°=4, 6°=3, 7°=2, 8°=1 (esquema FINA clásico, configurable por cantidad de carriles/relevos).

- El esquema se modela como **configuración versionada** (`scoring_schemes`, `type=placement`), no hardcodeada, para que la FTN ajuste la tabla de puntos sin tocar código.
- **Pendiente menor de afinar:** puntaje de relevos (suele ser el doble) y si las pruebas con menos de 8 competidores recortan la tabla. Lo dejamos parametrizable.
- El ranking de club es **derivado** y recalculable.

### 1.5 Ranking Personal (vista del nadador)

Para el atleta vinculado:
- **Posición actual** por cada prueba (en histórico y en temporada vigente).
- **Evolución histórica** de su posición (de `RankingHistory`, snapshot por temporada).
- **Mejor ranking alcanzado** (mejor posición histórica por prueba).
- **Ranking por prueba** (todas sus pruebas con su posición actual).

### 1.6 Materialización y rendimiento

- Vistas materializadas / tablas de proyección por `(event_definition, pool_length, gender, scope)` para histórico, y por `(+season)` para temporada.
- `RankingHistory` guarda el **snapshot por temporada** (posición congelada al cierre), alimentando "ranking histórico" y "evolución de posición" sin recomputar el pasado.
- Recalculo incremental por worker al homologar (solo se invalida la prueba/categoría afectada).

---

## 2. MÓDULO PÁGINA DE TORNEOS

### 2.1 Próximos Torneos
Lista de torneos en estado `programado` / `inscripciones_abiertas` / `cerrado`. Muestra:
- Nombre · Fecha · Lugar · Estado · **Convocatoria (PDF)** · **Reglamento (PDF)**.
- Los PDF se modelan como `tournament_documents` (ver §8.3), almacenados en S3.

### 2.2 Torneos Finalizados
Torneos en estado `finalizado` / `homologado`. Acceso a:
- **Resultados** (por prueba/serie).
- **Series** (heat sheets).
- **Récords obtenidos** en ese torneo.
- **Estadísticas** del torneo (participación, medallero, mejores marcas).

### 2.3 Buscador Avanzado
Filtros combinables: Año · Club organizador · Piscina (25/50) · Tipo de torneo · Estado.
- Implementado sobre índices de `tournaments`; búsqueda full-text por nombre (Postgres FTS → Meilisearch en fase avanzada).

---

## 3. SISTEMA DE CUENTAS DE NADADORES (Athlete ≠ User)

### 3.1 Modelo conceptual

```
User (cuenta de acceso)  ──(solicitud aprobada por Admin)──>  Athlete (swimmer oficial)
        1                                                          1
```

- `User` / `AthleteAccount`: identidad de acceso (email, password). Existe sin atleta.
- `Athlete` / `swimmers`: registro deportivo oficial. Existe sin cuenta.
- La unión es **explícita, solicitada y aprobada por un administrador**.

### 3.2 Flujo de vinculación (con aprobación administrativa)

```
1. El usuario crea una cuenta (registro + verificación de email).
2. El usuario solicita vincularse a un atleta existente (lo busca por nombre/DNI/club).
3. El sistema genera una SOLICITUD (AccountLinkRequest, status=pending).
   └─ El sistema adjunta un "score de confianza" automático (match por DNI+nacimiento)
      como AYUDA para el admin, pero NO vincula automáticamente.
4. Un Administrador FTN revisa la solicitud (ve datos del usuario y del atleta + score).
5. El administrador APRUEBA o RECHAZA (con motivo).
6a. Si APRUEBA → la cuenta queda vinculada; el usuario accede a todo su historial.
6b. Si RECHAZA → la cuenta sigue sin vincular; el usuario ve el motivo y puede reintentar.
```

### 3.3 Reglas de negocio (estrictas)

- **Un atleta solo puede estar vinculado a una cuenta** (constraint único `swimmer_id` en vinculación activa).
- **Una cuenta solo puede controlar un atleta** (constraint único `account_id`).
- **Una solicitud pendiente bloquea** otra solicitud del mismo usuario o sobre el mismo atleta.
- **Historial de aprobaciones y rechazos**: cada solicitud conserva estado, revisor, fecha y motivo (no se borra; queda como registro).
- **Auditoría**: toda acción (crear/aprobar/rechazar/desvincular) se registra en `audit_logs` con actor, timestamp e IP.
- **Desvinculación**: solo un Admin puede desvincular (p.ej. error de identidad); queda auditado y libera ambos lados.
- **Menores de edad**: la solicitud puede requerir datos/consentimiento del tutor; el club puede iniciar/avalar la solicitud.

### 3.4 Entidad `AccountLinkRequest` (nueva)

`id, account_id (FK AthleteAccount), swimmer_id (FK swimmers), status (pending|approved|rejected|cancelled), match_confidence (0-100), requested_at, reviewed_by (FK users), reviewed_at, decision_reason, created_at`
- **Relaciones:** `AthleteAccount (1) ──< (N) AccountLinkRequest`; `swimmers (1) ──< (N) AccountLinkRequest`. (Múltiples solicitudes históricas, pero **solo una `approved` activa por lado**.)
- **Índices únicos parciales:** un solo `approved` por `swimmer_id` y un solo `approved` por `account_id`.

---

## 4. PERFIL DEL NADADOR (cuenta vinculada)

Una vez vinculado, el usuario ve (todo derivado del registro oficial, no editable como dato deportivo):
- **Historial completo** de competencias y resultados.
- **Récords personales (PB)** por prueba y piscina (25/50 separados).
- **Ranking actual** (temporada vigente) y **ranking histórico** (posición por temporada).
- **Mejoras de tiempo** (ver §5).
- **Estadísticas** automáticas (`athlete_statistics`).
- **Club actual** y **clubes anteriores** (`swimmer_club_history`).
- **Medallas** y logros (`athlete_achievements`).
- **Participaciones** por temporada.

La capa editable por el atleta (foto, bio, visibilidad, pasaporte público) vive en `AthleteProfile` (ver v2 §8.2 y Pasaporte v2 §7).

---

## 5. EVOLUCIÓN DE TIEMPOS (gráficos automáticos)

### 5.1 Por prueba — año a año
Ejemplo (50 Libre, piscina 50 m):
```
2023 → 28.31
2024 → 27.15
2025 → 26.48
Mejora total: −1.83 s   (mejor temporada vs primera)
```
- Serie = **mejor tiempo por temporada** para `(swimmer, event_definition, pool_length)`.
- "Mejora total" = `best_time(primera_temporada) − best_time(última_temporada)`.
- Se grafica por separado para 25 m y 50 m (no se mezclan).

### 5.2 Métricas adicionales por prueba
- **Mejor marca histórica** (PB absoluto).
- **Mejor marca anual** (PB de cada temporada).
- **Última marca** (resultado más reciente).
- **Diferencia contra PB** = `última_marca − PB` (negativo ⇒ nuevo PB).
- **Diferencia vs competencia anterior** = delta con el resultado inmediatamente previo.

Todo precalculado en `athlete_statistics` y servido a los gráficos. Visualizaciones motivacionales: líneas de evolución, badges de PB, comparador entre temporadas y contra el récord de categoría.

---

## 6. COMPATIBILIDAD CON MEET MANAGER (multi-formato flexible)

### 6.0 Realidad operativa (CONFIRMADA por la FTN)

> **Hoy los clubes solo entregan a la FTN un PDF de resultados al final de cada torneo.** No comparten el archivo estructurado (Lenex/SD3/backup) que Meet Manager *sí puede* generar.

Esto tiene dos consecuencias de diseño:
1. El **camino de importación realista a corto plazo es el PDF** (semi-estructurado, menos confiable).
2. Existe una **mejora de altísimo retorno y bajo costo**: pedir a los clubes que, además del PDF, exporten **un clic más** desde Meet Manager el archivo estructurado (Lenex `.lef`/`.lxf`, SD3/HY3, o el backup `.zip`/`.mdb`). Eso convierte la importación en confiable y automática. **Recomendación: estandarizar este pedido en el reglamento de torneos.**

### 6.1 Estrategia de doble vía

| Vía | Cuándo | Confiabilidad | Uso |
|-----|--------|---------------|-----|
| **A. Estructurado (Lenex/SD3/backup)** | Going-forward, si se logra el cambio de hábito (§6.0) | Alta — datos limpios, splits, IDs | Importación automática ideal |
| **B. PDF (parser)** | Realidad actual + **backlog histórico** de años de PDFs | Media — requiere validación y revisión humana | Digitalizar el archivo existente y torneos donde solo haya PDF |
| **C. Carga manual / CSV** | Torneos chicos o filas que el parser no resuelve | Total (humano) | Fallback universal |
| **D. FTN Manager nativo** | Etapa final | Total (origen propio) | Elimina la dependencia |

### 6.2 Arquitectura de importación agnóstica de formato

No se asume un único formato. Patrón **Adapter/Strategy**:

```
ImportJob (archivo) ──> FormatDetector ──> [Adapter específico] ──> Modelo normalizado (staging)
                                              ├─ PdfAdapter      (.pdf MeetManager)   ← prioridad real actual
                                              ├─ LenexAdapter    (.lef/.lxf)
                                              ├─ HytekSD3Adapter  (.sd3/.hy3/.cl2)
                                              ├─ CsvAdapter      (.csv plantilla FTN)
                                              └─ (futuro) otros
```

- Cada adapter implementa una **interfaz común** (`parse() → NormalizedMeet`). Agregar un formato = agregar un adapter, sin tocar el pipeline.
- El **modelo normalizado intermedio** (meet → events → entries/results → splits) desacopla el origen de las tablas oficiales.

### 6.2.1 PdfAdapter — diseño específico (camino realista actual)

Los reportes de resultados de Meet Manager tienen un **layout tabular consistente** (encabezado de prueba → serie → carril, nombre, club, edad, marca de inscripción, tiempo final, puesto). Esto permite un parser por plantilla, no IA genérica:

1. **Extracción de texto**: si el PDF es digital (texto seleccionable) → extracción directa de texto+coordenadas (rápido y exacto). Si es escaneado → **OCR** (fase posterior, menor confianza).
2. **Parser por plantilla**: reconoce los patrones del reporte Meet Manager (regex/posicional por columnas) y arma el modelo normalizado.
3. **Validación reforzada** (§ pipeline v2 4.3): por la menor confiabilidad del PDF, el umbral de warnings es más estricto y la **revisión humana en el PREVIEW es obligatoria** antes de confirmar.
4. **Conciliación de atletas** por nombre+edad+club (el PDF no trae DNI ni IDs) → matching de confianza media, con confirmación. Aquí los **falsos positivos son el riesgo principal**, por eso el preview muestra cada match propuesto.

> Limitación honesta: el PDF no trae documento ni identificadores únicos → el matching es más débil que con Lenex/SD3. Por eso la vía estructurada (§6.0) sigue siendo la meta, y el PDF es el puente para operar ya y digitalizar el histórico.

### 6.3 Formatos soportados (prioridad REAL, ajustada a la FTN)
1. **PDF Meet Manager (.pdf)** — lo que la FTN recibe hoy. Primer adapter a construir (MVP de importación).
2. **Lenex (.lef/.lxf)** — meta de confiabilidad; impulsar su entrega por los clubes.
3. **Hy-Tek SD3 / HY3** — alternativa estructurada equivalente.
4. **CSV plantilla FTN** — fallback de carga manual estructurada.

### 6.3 Exportación
- **Lenex** (entries y results) → intercambio con Meet Manager / cronometraje / CADDA.
- **PDF/HTML** → programas, heat sheets y resultados publicables.
- **SD3** → fase posterior si algún actor externo lo requiere.

### 6.4 Migración progresiva (reversible, 3 etapas)
| Etapa | Quién hace qué |
|-------|----------------|
| **1. Coexistencia** | Clubes usan Meet Manager; FTN **importa** a la plataforma (repositorio histórico/público). |
| **2. Híbrido** | FTN Manager gestiona inscripciones/seeding y **exporta Lenex** al cronometraje; **reimporta** resultados. |
| **3. Nativo** | FTN Manager end-to-end; Meet Manager queda como respaldo/exportación de compatibilidad. |

Import y FTN Manager escriben en las mismas tablas oficiales (campo `source`), permitiendo histórico mixto y transición sin obligar a nadie a cambiar de golpe.

---

## 7. VALIDACIÓN DE REGLAS DE NEGOCIO

### 7.1 Edad deportiva — DECISIÓN CONFIRMADA: **edad al 31 de diciembre**

> **Resuelto por la FTN:** la categoría se determina por la edad cumplida al **31 de diciembre del año de la competencia** (estándar FINA/World Aquatics). El motor `resolveCategory(...)` queda igualmente parametrizable por si cambia a futuro. La categoría resuelta se **congela** en inscripción y resultado.

Análisis comparativo que respaldó la decisión:

| Criterio | Cómo funciona | Ventajas | Desventajas |
|----------|---------------|----------|-------------|
| **Edad al 31 de diciembre** (edad que cumple en el año) | Categoría = edad que tendrá/tuvo al 31/12 del año de la competencia | Estándar FINA/World Aquatics y de la mayoría de federaciones; el nadador mantiene **una sola categoría todo el año** (coherencia en rankings anuales); simple de comunicar | Un nadador puede competir "adelantado" parte del año (compite en su categoría aunque aún no cumplió los años) |
| **Edad al inicio de temporada** | Categoría = edad al 1° día de la temporada | Categoría estable durante toda la temporada deportiva (no calendario); útil si la temporada cruza el cambio de año | Menos estándar; requiere definir con precisión el inicio de temporada; puede diferir de los nacionales (riesgo de incompatibilidad con CADDA) |
| **Edad al día del torneo** | Categoría = edad exacta el día que compite | Máxima exactitud biológica; "justo" caso a caso | El nadador **puede cambiar de categoría a mitad de temporada** → rompe la coherencia de rankings anuales y complica récords y comparativas; muy poco usado en natación |

**Recomendación técnica (a confirmar):** *Edad al 31 de diciembre* — es el estándar de natación, da una categoría estable por año (clave para rankings históricos y récords) y maximiza compatibilidad con torneos nacionales. Pero el diseño deja el criterio **parametrizable** por si la FTN usa otro.

> Implicancia: la función `resolveCategory(birthDate, season, scope, rule)` recibe la regla como parámetro. La categoría resuelta se **congela** en inscripción y resultado.

### 7.2 Formato Meet Manager — CONFIRMADO: hoy llegan **solo PDF**
Resuelto (§6): arquitectura multi-adapter, con **PdfAdapter como primer adapter** (realidad actual de la FTN) + impulso a la entrega de archivos estructurados (Lenex/SD3) como meta de confiabilidad. Ver §6.0–§6.3.

### 7.3 Récords — modelo 25 m y 50 m independientes (confirmado)

Un récord se identifica por la tupla completa:
`(scope, event_definition_id, category_id, gender, pool_length)`
- `pool_length ∈ {25, 50}` es **parte de la clave del récord** → existen récords separados e independientes para piscina corta (25 m) y larga (50 m).
- Cada récord referencia el resultado de origen, fecha, nadador, club y récord previo (cadena histórica).
- Reglas: detección automática + **homologación humana obligatoria**; al homologar uno nuevo, el anterior pasa a `is_current=false` con `previous_record_id`.
- Se mantienen tablas de récords **provinciales** (FTN) y **nacionales** (referencia CADDA) — ver §7 en pregunta abierta sobre alcance nacional.

**Entidad `records` (clave revisada):**
`id, scope (provincial|nacional), event_definition_id, category_id, gender, pool_length (25|50), time_ms, swimmer_id, club_id, record_date, source_result_id, is_current, previous_record_id (nullable), homologated_by, homologated_at`
- Índice único parcial: un solo `is_current=true` por `(scope, event_definition_id, category_id, gender, pool_length)`.

---

## 8. NUEVAS / ACTUALIZADAS ENTIDADES (delta v3)

### 8.1 `AccountLinkRequest` — ver §3.4 (nueva).
### 8.2 `scoring_schemes` (nueva) — esquema de puntuación versionado
`id, name, type (placement|fina_points|mixed), config (jsonb: tabla de puntos por posición), valid_from_season_id, valid_to_season_id, is_active`
- Usado por el Ranking por Club (§1.4). Recalculable.

### 8.3 `tournament_documents` (nueva) — adjuntos de torneo
`id, tournament_id (FK), type (convocatoria|reglamento|programa|resultados|otros), title, file_url, mime_type, uploaded_by, created_at`
- **Relación:** `tournaments (1) ──< (N) tournament_documents`. Alimenta Próximos/Finalizados (§2).

### 8.4 `RankingHistory` (actualizada) — snapshot por temporada
`id, swimmer_id, event_definition_id, category_id, gender, pool_length, scope, season_id, position, best_time_ms, fina_points, snapshot_date`
- Soporta Ranking Personal histórico y "mejor ranking alcanzado" (§1.5).

### 8.5 `records` (actualizada) — clave con `pool_length` — ver §7.3.

### 8.6 Mapa de relaciones (delta v3)

```
AthleteAccount (1) ──< (N) AccountLinkRequest (N) ──(1) swimmers
                                 │ reviewed_by
                                 └──(1) users (admin)

tournaments (1) ──< (N) tournament_documents
scoring_schemes (1) ──< (N) [aplicado a] rankings de club   [config]

swimmers (1) ──< (N) RankingHistory (N) ──(1) seasons
results (1) ──? (1) records   [origen, con pool_length en la clave del récord]
```

---

## 9. Impacto en módulos (mapa actualizado)

```
[Auth/Users] ──> [AccountLinkRequest] ──(aprobación Admin)──> [swimmers]
[Results (homologados)] ──┬─> [Rankings] (histórico, temporada, categoría, club, personal)
                          ├─> [Records] (25/50 separados, homologación)
                          ├─> [PersonalBest] / [Evolución de tiempos]
                          ├─> [AthleteStatistics] / [Achievements]
                          └─> [RankingHistory] (snapshot por temporada)
[Tournaments] ──> [tournament_documents] (convocatoria/reglamento PDF)
[ImportJobs] ──(multi-adapter)──> [tablas oficiales] (source=meet_manager|ftn_manager|manual)
[scoring_schemes] ──(config)──> [Ranking por Club]
```

---

## 10. ESTADO DE DECISIONES

### ✅ Resueltas (todas confirmadas)
1. **Edad deportiva:** edad al **31 de diciembre** del año. §7.1.
2. **Formato Meet Manager:** hoy llegan **solo PDF** → `PdfAdapter` fallback; **HY3 primario** por ser el más rico. §6.
3. **Unidad del ranking histórico:** **ambos modos con selector** (default mejor-por-nadador). §1.0.
4. **Puntuación de clubes:** **por posición estilo FINA** (9-7-6-5-4-3-2-1), configurable. §1.4.1.
5. **Récords:** 25 m y 50 m **independientes**. §7.3.
6. **Categoría del ranking por categoría:** **congelada** (canónica/default) + modo alternativo "categoría actual". §1.3.
7. **Récords nacionales:** la FTN **NO los homologa**; son **referencia** (`scope=nacional`, solo-lectura). **Funcionalidad asociada:** en las vistas de récord/ranking se muestra arriba el **récord nacional (mejor tiempo) como benchmark** y **debajo las marcas de Tucumán** para comparar a los nadadores provinciales contra él. §7.3.
8. **Afiliación/licencia:** anual por temporada y **condición HABILITANTE BLOQUEANTE** para competir. Sin licencia vigente → no se puede inscribir (validación dura en inscripciones) y la credencial del pasaporte figura **"vencida"**. §7 (Pasaporte) y módulo de inscripciones.
9. **Aprobación de cuentas:** **siempre revisión humana** (Admin). El match por DNI+nacimiento es solo score informativo, nunca auto-aprueba. §3.2.
10. **Puntaje de relevos y tablas recortadas:** relevos = **doble** (estándar FINA); pruebas con <8 competidores **no recortan** la grilla (se asignan puntos a los puestos existentes). Todo configurable en `scoring_schemes`. §1.4.1.

### 🏗️ Decisiones de arquitectura de datos (resueltas con el equipo de desarrollo)
- **A1 — Auth unificada:** **una sola tabla `users`** para la autenticación de todos los roles (JWT + refresh). "AthleteAccount" = un `user` con rol NADADOR vinculado a un `swimmer` vía **`users.swimmer_id` (nullable, 1:1)**, seteado al aprobar un `AccountLinkRequest`. Campos de menor/tutor (`is_minor`, `guardian_*`) como columnas nullable en `users`. `AthleteProfile` se mantiene como extensión del **swimmer** (no de la cuenta). Unicidad: un swimmer ↔ una cuenta.
- **A2 — Staging de importación:** el `NormalizedMeet` se persiste como **JSONB** en `meet_manager_import.parsed_payload` (no en memoria, no en tablas de staging separadas). El archivo original queda en S3. Habilita preview diferido y worker asíncrono.

---
*Especificación funcional v3 — modelo base de la FTN. Decisiones núcleo resueltas; pendientes menores en §10 no bloquean el modelado. No incluye código por decisión explícita.*
