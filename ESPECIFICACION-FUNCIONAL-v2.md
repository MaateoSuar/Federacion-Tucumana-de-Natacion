# Especificación Funcional Detallada — v2
## Federación Tucumana de Natación (FTN)

> Complemento de `ARQUITECTURA.md`. Especificación para validar ANTES de generar Prisma.
> Versión 2.0 — Categorías oficiales + Perfil Digital + Evolución de Marcas + Importación Meet Manager + FTN Manager + Compatibilidad + Pasaporte Digital + nuevas entidades.
> Estado: Propuesta para validación.

---

## 1. Categorías oficiales FTN (modelo de datos)

### 1.1 Tabla oficial

| Categoría | Edad | Ámbito | Código interno |
|-----------|------|--------|----------------|
| Pre A | 8 años y menores | Provincial | `PRE_A` |
| Pre B | 9 años | Provincial | `PRE_B` |
| Infantil 1 | 10 años | Provincial | `INF_1` |
| Infantil 2 | 11 años | Provincial | `INF_2` |
| Menor 1 | 12 años | Provincial | `MEN_1` |
| Menor 2 | 13 años | Provincial | `MEN_2` |
| Cadete 1 | 14 años | Provincial | `CAD_1` |
| Cadete 2 | 15 años | Provincial | `CAD_2` |
| Juvenil 1 | 16 años | Provincial | `JUV_1` |
| Juvenil 2 | 17 y 18 años | Provincial | `JUV_2` |
| Mayores | 19 años o más | Provincial | `MAY` |
| Junior | 19 a 21 años | **Nacional** | `JUN` |

### 1.2 Reglas de negocio de categorización

- **Regla de edad:** la categoría se determina por la **edad cumplida al 31 de diciembre del año de la competencia** (criterio estándar FINA/CADDA para natación; debe confirmarse con la FTN si usan otra fecha de corte). Por eso la categoría **no es un campo fijo del nadador**, sino una función de `(fecha_nacimiento, año_temporada)`.
- **Implicancia de diseño:** la categoría es **derivada/calculada**, no almacenada de forma rígida en el nadador. Se computa en el momento de la inscripción y se **congela en la inscripción y en el resultado** (`category_id` en `registrations` y `results`) para preservar la verdad histórica. Si las reglas cambian a futuro, los resultados pasados conservan la categoría con la que compitieron.
- **Superposición de ámbitos:** un nadador de 20 años es `Mayores` a nivel provincial y `Junior` a nivel nacional simultáneamente. Por eso la categoría tiene un campo `scope` (`provincial` | `nacional`) y un mismo nadador puede mapear a categorías distintas según el ámbito del torneo.
- **Pre A es abierta hacia abajo** (8 y menores): el límite inferior es nulo.
- **Mayores es abierta hacia arriba** (19+): el límite superior es nulo.
- **Junior (nacional)** se solapa con Mayores; ambas se calculan según el ámbito del torneo.

### 1.3 Entidad `categories` (revisada)

`id, code, name, min_age, max_age (nullable), scope (provincial|nacional), order_no, is_active, valid_from_season_id, valid_to_season_id (nullable)`

- `min_age` / `max_age` nullable para categorías abiertas.
- `valid_from/to_season_id`: **versionado temporal** de categorías. Si la FTN cambia los rangos en 2030, se crea una nueva versión sin destruir la histórica. Garantiza que un resultado de 2026 siga vinculado a la definición de categoría vigente entonces.

**Función de dominio** `resolveCategory(birthDate, season, scope) → category`: encapsula la regla de edad. Única fuente de verdad; usada por inscripciones, importación y récords.

---

## 2. Módulo: PERFIL DIGITAL DEL NADADOR

Permite que cada nadador tenga **cuenta propia**, separada del registro deportivo administrado por la federación/club.

### 2.1 Concepto clave: separación atleta ↔ cuenta

Se distinguen tres entidades:
- **`swimmers`** (ya existe): el **registro deportivo oficial**, creado y administrado por la FTN/club. Existe aunque el nadador nunca cree una cuenta. Fuente de verdad de marcas, resultados y récords.
- **`AthleteAccount`**: la **cuenta de acceso** (credenciales) que un nadador (o su tutor) crea para autenticarse.
- **`AthleteProfile`**: la **capa de perfil/preferencias** que el nadador gestiona (foto, bio, visibilidad pública, redes, configuración).

> Razón de la separación: el dato deportivo es propiedad de la federación y debe existir y ser confiable sin depender de que el atleta se registre. La cuenta es opt-in. Un atleta puede batir récords durante años sin tener cuenta; el día que se registra, su cuenta se **vincula** al `swimmer` existente y "hereda" todo su historial.

### 2.2 Registro de usuario

Flujo de auto-registro con **vinculación al atleta existente**:

1. El nadador ingresa: nombre, apellido, **documento (DNI)**, fecha de nacimiento, email, contraseña.
2. El sistema busca un `swimmer` que coincida por **`document_id` + fecha de nacimiento** (clave de matching fuerte).
3. **Casos de matching:**
   - **Match único y confiable** → se crea `AthleteAccount` en estado `pending_verification`, vinculada al `swimmer`. Se envía email de verificación.
   - **Match ambiguo o sin match** → la cuenta se crea pero queda en estado `unlinked`; se genera una **solicitud de vinculación** que un Admin/Club debe aprobar manualmente (evita suplantación).
   - **Menor de edad** → el registro requiere datos del **tutor/responsable** y consentimiento; cuenta marcada `is_minor = true` con flujo de consentimiento parental.
4. **Verificación de email** obligatoria para activar la cuenta.
5. Una vez verificada y vinculada → estado `active`.

**Regla anti-fraude:** un `swimmer` solo puede vincularse a **una** `AthleteAccount` activa. Intentar registrar un atleta ya vinculado dispara flujo de "¿olvidaste tu cuenta?" / recuperación, no una segunda cuenta.

### 2.3 Vinculación automática

- **Matching automático** por `(document_id, birth_date)` exacto → vinculación inmediata sujeta a verificación de email.
- **Matching asistido**: si el documento coincide pero el nombre difiere levemente (tipeo), se ofrece confirmación y se registra para revisión.
- **Vinculación manual**: Club o Admin pueden vincular/desvincular una cuenta a un swimmer desde el panel (con `audit_log`).
- **Token de invitación** (opcional, recomendado): el club puede generar un enlace/código de invitación para un nadador de su plantel; al registrarse con ese token, la vinculación es automática y de máxima confianza.

### 2.4 Inicio de sesión

- Email + contraseña → JWT (access token corto + refresh token).
- Refresh token rotativo, almacenado de forma segura (httpOnly cookie).
- Opcional fase posterior: login social / OAuth, 2FA para cuentas con rol elevado.
- Bloqueo por intentos fallidos (rate limiting) + registro en `audit_logs`.

### 2.5 Recuperación de contraseña

- Solicitud por email → genera **token de un solo uso** con expiración corta (p.ej. 30 min), almacenado hasheado.
- Email con enlace de reseteo. Al usarlo, se invalida el token y se cierran las sesiones activas (revocación de refresh tokens).
- Política de contraseñas y hashing con **bcrypt/argon2**.

### 2.6 Perfil deportivo personal — vistas del nadador

Todas estas vistas son **derivadas del registro oficial** (`results`, `records`, `personal_bests`), no editables por el atleta:

| Vista | Fuente de datos | Descripción |
|-------|-----------------|-------------|
| Historial de competencias | `tournaments` ⋈ `registrations` | Todos los torneos en los que participó, por temporada. |
| Historial de resultados | `results` ⋈ `events` | Cada resultado: tiempo, prueba, posición, estado. |
| Evolución de tiempos | `results` agregados por prueba | Serie temporal de marcas por prueba (ver §3). |
| Récords personales (PB) | `personal_bests` | Mejor marca por prueba/piscina. |
| Récords provinciales | `records` (scope=provincial) | Récords vigentes/históricos que posee el atleta. |
| Ranking actual | `rankings` (temporada activa) | Posición vigente por prueba/categoría. |
| Ranking histórico | `ranking_history` | Posiciones en temporadas pasadas. |
| Medallas obtenidas | `athlete_achievements` | Oro/plata/bronce por torneo/prueba. |
| Participaciones por temporada | `registrations` agregadas | Nº de torneos/pruebas por temporada. |
| Comparativas anuales | `athlete_statistics` | Año vs año: mejoras, volumen, medallas. |
| Mejores marcas (PB) | `personal_bests` | Tabla completa de PB con fecha y torneo de origen. |
| Estadísticas automáticas | `athlete_statistics` | Métricas calculadas (ver §3 y §10). |

### 2.7 Reglas de privacidad

- El perfil **deportivo** (resultados, récords) es información de competencia y por defecto **público** (transparencia federativa), salvo perfil de menor que puede limitarse.
- Los **datos personales** (email, teléfono, documento) son **privados** y nunca se exponen públicamente.
- El nadador controla la **visibilidad del perfil público** (`AthleteProfile.public_visibility`): puede activar/desactivar foto, bio y redes. Los resultados oficiales permanecen visibles por ser registro deportivo.

---

## 3. Módulo: EVOLUCIÓN DE MARCAS

Sistema analítico y motivacional sobre la base de `results` (todos los tiempos en **milisegundos enteros**).

### 3.1 Métricas a calcular

| Métrica | Definición | Cómo se calcula |
|---------|-----------|-----------------|
| Mejor tiempo histórico | PB absoluto por prueba+piscina | `MIN(final_time)` sobre todos los resultados OK del atleta en esa prueba/piscina |
| Mejor tiempo por temporada | PB de la temporada | `MIN(final_time)` filtrado por `season_id` |
| Mejor tiempo por prueba | PB por cada prueba del catálogo | agrupado por `event_definition_id` + `pool_length` |
| Evolución año a año | serie de PB por temporada | secuencia de "mejor tiempo por temporada" ordenada |
| Diferencia vs competencia anterior | delta con el último resultado de la misma prueba | `final_time_actual − final_time_anterior` |
| Diferencia vs PB | delta con la mejor marca | `final_time_actual − PB` (negativo = nuevo PB) |

### 3.2 Reglas de comparación

- Las comparaciones son **siempre dentro de la misma prueba y misma longitud de piscina** (25m vs 50m no son comparables directamente). La clave de comparación es `(event_definition_id, pool_length, gender)`.
- Un tiempo en piscina de 25m (corta) y 50m (larga) se guardan y rankean por separado.
- Para comparar pruebas distintas (motivacional/multidisciplina) se usa el **puntaje World Aquatics (FINA)**, normalizado.
- **Detección de nuevo PB:** al homologar un resultado, si `final_time < PB_actual` → se actualiza `personal_bests`, se marca el resultado como `is_pb = true` y se dispara notificación motivacional.

### 3.3 Visualizaciones propuestas (motivacionales)

- **Gráfico de líneas** de evolución del tiempo por prueba (eje X = fecha, eje Y = tiempo invertido para que "más abajo = mejor" sea intuitivo, o invertido para que subir = mejorar).
- **Hitos / badges**: "Nuevo PB", "Bajó de 1:00 en 100 Libre", "Top 3 provincial", rachas de mejora.
- **Tarjeta de progreso por temporada**: mejora total acumulada, % de mejora, pruebas con PB nuevo.
- **Comparador**: superponer dos temporadas o el atleta vs el récord de su categoría.
- **Proyección de tendencia** (fase avanzada): regresión simple sobre los últimos N resultados.

> Estas visualizaciones se sirven desde `athlete_statistics` (precalculadas por worker) para no recalcular en cada carga.

---

## 4. Módulo: IMPORTACIÓN DESDE MEET MANAGER

Meet Manager (Hy-Tek) es el estándar de facto que usan los clubes. La estrategia respeta ese flujo actual.

### 4.1 Formatos de Meet Manager

| Formato | Extensión | Uso |
|---------|-----------|-----|
| **SD3 / Hy-Tek Sports Data Interchange** | `.sd3`, `.hy3`, `.cl2` | Intercambio de inscripciones y resultados (estándar de la industria, USA Swimming) |
| **Backup de meet** | `.zip` (mdb) | Respaldo completo del meet en Access |
| **Lenex** | `.lef`, `.lxf` (xml) | Estándar internacional (World Aquatics/Europa); Meet Manager exporta/importa |
| **Reportes** | `.pdf`, `.htm`, `.cl` | Resultados publicables |

**Estrategia recomendada:** soportar **Lenex (.lef/.lxf)** como formato primario (es XML estructurado, estándar internacional, bien documentado) y **Hy-Tek SD3/HY3** como secundario (lo que más exportan los clubes argentinos con Meet Manager). Lenex evita parsear el formato propietario binario de Hy-Tek.

### 4.2 Pipeline de importación (asíncrono, vía `ImportJobs`)

```
1. UPLOAD      → club/admin sube archivo → se crea ImportJob (status=uploaded)
2. PARSE       → worker parsea (Lenex XML / SD3) → estructura normalizada en staging
3. VALIDATE    → validaciones automáticas (ver 4.3) → reporte de issues
4. MATCH       → asociar atletas y pruebas a entidades existentes (ver 4.4/4.5)
5. PREVIEW     → el admin revisa un PREVIEW con: nuevos atletas, conflictos, récords detectados
6. CONFIRM     → admin aprueba → commit transaccional a tablas oficiales
7. POST-PROCESS→ recalcular PB, rankings, récords; emitir eventos de dominio
8. REPORT      → MeetManagerImport queda con resumen (filas ok/error, entidades creadas)
```

- **Idempotencia**: cada import lleva un hash del archivo y un `external_meet_id`; re-importar el mismo meet no duplica resultados (upsert por clave natural `meet+event+swimmer+heat`).
- **Staging**: los datos pasan primero por tablas/estructura de staging; nunca se escribe directo a producción sin pasar validación + confirmación.
- **Rollback**: un import confirmado puede revertirse (se guarda el conjunto de filas creadas para deshacer).

### 4.3 Validación automática

- Estructura del archivo (schema Lenex/SD3 válido).
- Coherencia de pruebas: estilo/distancia/género existen en el catálogo `event_definitions`.
- Tiempos plausibles (no negativos, dentro de rangos razonables por prueba/edad → flag de "tiempo sospechoso").
- Longitud de piscina declarada (25/50).
- Estados válidos (OK/DSQ/DNS/DNF).
- Edad del atleta coherente con la categoría de la prueba.
- Detección de duplicados (mismo atleta dos veces en una serie).

Cada issue se clasifica como **error** (bloquea esa fila) o **warning** (permite confirmar con revisión).

### 4.4 Asociación a atletas existentes (matching)

Estrategia de matching en cascada por confianza:
1. **Documento (DNI)** exacto → match fuerte.
2. **Hy-Tek/Lenex athlete ID** previamente mapeado (`external_id`) → match fuerte.
3. **Nombre + apellido + fecha de nacimiento + género** exacto → match alto.
4. **Nombre + apellido + año de nacimiento + club** → match medio (requiere confirmación).
5. Sin match → candidato a **atleta nuevo**.

Se mantiene una tabla de **mapeo de IDs externos** (`external_id` por sistema de origen) para que futuras importaciones del mismo club reconozcan automáticamente a los atletas ya conciliados.

### 4.5 Detección de atletas nuevos

- Los no-matcheados se listan en el PREVIEW como **"Atletas nuevos"**.
- El admin puede: **crear** el swimmer nuevo, **vincular manualmente** a uno existente (resolver duplicado), o **descartar**.
- Al crear, se guarda el `external_id` para futuras conciliaciones.
- Regla anti-duplicados: el sistema advierte si un "nuevo" se parece mucho a un existente (fuzzy match por nombre+nacimiento).

### 4.6 Detección automática de récords

- Tras el commit, el worker evalúa cada resultado contra `records` vigentes para su `(event_definition, category, gender, pool_length, scope)`.
- Si `final_time < record_actual.time` → se crea un **récord candidato** (`status = pending_homologation`).
- Los récords **no se publican automáticamente**: requieren **homologación** por Admin/Super Admin (regla federativa). Esto preserva el control humano sobre la oficialidad.
- Al homologar, el récord anterior se marca `is_current = false` con vínculo `previous_record_id`, y el nuevo `is_current = true`.

---

## 5. Módulo: FTN MANAGER (sistema propio de gestión de competencias)

Sistema para, progresivamente, **reemplazar Meet Manager** con un flujo nativo en la plataforma.

### 5.1 Capacidades

| Capacidad | Descripción |
|-----------|-------------|
| Crear torneos | Definir sede, fechas, piscina (25/50), tipo, ámbito (provincial/nacional), temporada. |
| Crear pruebas | Seleccionar del catálogo `event_definitions`: estilo, distancia, género, categoría, ronda. |
| Generar series (heats) | Sembrado automático por marca de inscripción (seeding). |
| Generar carriles (lanes) | Asignación de andariveles según patrón estándar (serpentina, centrado por velocidad). |
| Gestionar inscripciones | Apertura/cierre, validación de marcas mínimas, cupos, plazos. |
| Cargar resultados | Manual por juez, o desde cronometraje electrónico en tiempo real. |
| Homologar resultados | Validación oficial → habilita récords/rankings. |
| Generar rankings | Automático tras homologación (vistas materializadas + worker). |
| Generar récords | Detección + homologación de récords. |

### 5.2 Algoritmo de seeding (sembrado)

1. Tomar inscripciones aceptadas de la prueba con su `entry_time`.
2. Ordenar por tiempo (más rápido primero); inscriptos sin marca van al final (orden aleatorio o por club).
3. Distribuir en series llenando desde la **última serie hacia la primera** (los más rápidos en la última serie = "serie estelar").
4. Dentro de cada serie, asignar andariveles desde el centro hacia afuera (carril 4 el más rápido, luego 5, 3, 6, 2, 7, 1, 8) — patrón estándar.
5. Configurable: nº de andariveles (6/8/10), modo de seeding (clasificatorio vs final directa).

### 5.3 Flujo de competencia en vivo

- Estados del torneo: `programado → inscripciones_abiertas → cerrado → en_curso → finalizado → homologado`.
- Durante `en_curso`: jueces cargan tiempos por serie → publicación en vivo por WebSockets → al cerrar la prueba se consolidan posiciones.
- Homologación por prueba o por torneo completo. Solo lo homologado alimenta récords y rankings oficiales.

### 5.4 Relación con la importación

FTN Manager y la importación de Meet Manager **escriben en las mismas tablas oficiales** (`events`, `results`, etc.). La importación es simplemente otra "fuente de origen" (`source = meet_manager_import | ftn_manager | manual`). Esto permite la **transición gradual**: algunos torneos por importación, otros nativos, conviviendo en el mismo histórico.

---

## 6. Módulo: COMPATIBILIDAD CON MEET MANAGER

### 6.1 Importación (entrada)
- Formatos soportados: **Lenex (.lef/.lxf)** primario, **Hy-Tek SD3/HY3** secundario. (Ver §4.1.)
- Mapeo de catálogos: tabla de equivalencias entre códigos de prueba Hy-Tek/Lenex y `event_definitions` FTN.

### 6.2 Exportación (salida) — `MeetManagerExport`
La plataforma debe poder **exportar** para no romper el ecosistema actual:
- **Lenex** de inscripciones (entries) → para clubes/torneos que aún usan Meet Manager.
- **Lenex** de resultados → para intercambio con CADDA/torneos nacionales.
- **Listas de inscripción / programa (heat sheet)** en PDF.
- **Resultados** en PDF/HTML publicables.
- **Export SD3** (fase posterior, si algún actor lo exige).

### 6.3 Estrategia de transición (3 etapas)

| Etapa | Estado | Descripción |
|-------|--------|-------------|
| **1. Coexistencia** | MM es la fuente, FTN importa | Los clubes siguen usando Meet Manager; la FTN **importa** resultados a la plataforma. Cero fricción. La plataforma se vuelve el repositorio histórico/público. |
| **2. Híbrido** | FTN Manager para inscripciones y seeding, MM/cronometraje para la pileta | La FTN gestiona inscripciones y siembra en la plataforma, **exporta Lenex** al sistema de cronometraje, y **reimporta** resultados. |
| **3. Nativo** | FTN Manager end-to-end | La plataforma maneja todo el ciclo; Meet Manager queda como opción de respaldo/exportación para compatibilidad externa. |

> Principio rector: **nunca obligar a un club a cambiar de un día para el otro.** La compatibilidad bidireccional (import + export Lenex) es lo que habilita una migración sin dolor y reversible.

---

## 7. Módulo: PASAPORTE DIGITAL DEL NADADOR

Credencial deportiva digital verificable.

### 7.1 Contenido
- **Perfil público opcional** (controlado por `AthleteProfile.public_visibility`).
- Foto, nombre, categoría vigente (calculada), género.
- **Club actual** + **clubes anteriores** (desde `swimmer_club_history`).
- **Récords** que posee (provinciales/nacionales).
- **Mejores marcas (PB)** destacadas.
- **Código QR** que apunta a una URL pública verificable (`/pasaporte/{token}`).
- **Credencial digital** con estado de **licencia/afiliación vigente** por temporada.

### 7.2 Reglas y seguridad
- El **QR** codifica un **token público no adivinable** (no el id interno), de modo que la URL es verificable pero no enumerable.
- La credencial muestra **vigencia** (válida solo si la afiliación de la temporada está activa) → útil para **acreditación en sede** de torneos.
- Estado: `vigente` (afiliación activa) | `vencida` | `suspendida`.
- El perfil público respeta la privacidad de menores (datos limitados).
- Verificación: escanear el QR muestra una página oficial de la FTN que confirma identidad, club y licencia — **fuente de verdad contra credenciales falsificadas.**
- Posible firma/sello digital (fase avanzada) para anti-falsificación.

---

## 8. NUEVAS ENTIDADES — modelo de datos detallado

### 8.1 `AthleteAccount` (cuenta de acceso del nadador)
**Propósito:** credenciales y estado de la cuenta auto-gestionada.
`id, email (unique), password_hash, swimmer_id (FK, nullable hasta vincular), status (pending_verification|active|unlinked|suspended), is_minor, guardian_name, guardian_email, email_verified_at, last_login_at, created_at, updated_at`
- **Relación:** `AthleteAccount (1) ──? (1) swimmers` (una cuenta vincula a un atleta; un atleta tiene como máximo una cuenta activa).
- **Reglas:** vinculación por `(document_id, birth_date)`; verificación de email obligatoria; un swimmer no puede tener dos cuentas activas.

### 8.2 `AthleteProfile` (perfil/preferencias gestionado por el atleta)
**Propósito:** capa editable por el nadador (no toca el registro deportivo).
`id, swimmer_id (FK, unique), bio, photo_url, social_links (jsonb), public_visibility (bool), passport_public_token (unique), preferences (jsonb), updated_at`
- **Relación:** `AthleteProfile (1) ──(1) swimmers`.
- **Reglas:** `passport_public_token` alimenta el QR del pasaporte; `public_visibility` controla exposición pública.

### 8.3 `PersonalBest` (mejor marca, derivada/cacheada)
**Propósito:** mejor marca por nadador/prueba/piscina; acelera perfil y rankings.
`id, swimmer_id (FK), event_definition_id (FK), pool_length (25|50), best_time (ms), source_result_id (FK), achieved_at, season_id, fina_points, updated_at`
- **Relación:** `swimmers (1) ──< (N) PersonalBest`; `PersonalBest (N) ──(1) event_definitions`; `PersonalBest (1) ──(1) results` (origen).
- **Reglas:** clave única `(swimmer_id, event_definition_id, pool_length)`. Se actualiza por evento de dominio `ResultHomologated` solo si el nuevo tiempo mejora el vigente.

### 8.4 `RankingHistory` (ranking histórico por temporada)
**Propósito:** congelar la posición del atleta en cada temporada (el ranking vigente vive en `rankings`).
`id, swimmer_id (FK), event_definition_id (FK), category_id (FK), gender, pool_length, scope (provincial|nacional), season_id (FK), position, best_time (ms), fina_points, snapshot_date`
- **Relación:** `swimmers (1) ──< (N) RankingHistory`.
- **Reglas:** snapshot al cierre de temporada (o recalculado incrementalmente). Permite "ranking histórico" del perfil sin recomputar el pasado.

### 8.5 `AthleteStatistics` (estadísticas precalculadas)
**Propósito:** métricas agregadas para el perfil (evita recalcular en cada visita).
`id, swimmer_id (FK), season_id (FK, nullable=histórico global), total_competitions, total_events, total_pbs, gold, silver, bronze, total_medals, best_fina_points, improvement_pct, computed_at`
- **Relación:** `swimmers (1) ──< (N) AthleteStatistics` (una fila por temporada + una global).
- **Reglas:** recalculadas por worker tras homologaciones; sirven comparativas anuales y tarjetas de progreso.

### 8.6 `AthleteAchievements` (logros y medallas)
**Propósito:** registro de medallas, récords y badges motivacionales.
`id, swimmer_id (FK), type (medal|record|badge|milestone), medal (gold|silver|bronze|null), tournament_id (FK, nullable), event_id (FK, nullable), record_id (FK, nullable), title, description, achieved_at`
- **Relación:** `swimmers (1) ──< (N) AthleteAchievements`.
- **Reglas:** medallas derivadas de `results.place` (1/2/3) en finales; badges generados por reglas (nuevo PB, bajó de cierto umbral, etc.).

### 8.7 `ImportJobs` (trabajos de importación genéricos)
**Propósito:** orquestar y auditar cualquier importación asíncrona.
`id, source (meet_manager|lenex|csv|manual), file_url, file_hash, status (uploaded|parsing|validating|matching|preview|confirmed|failed|rolled_back), uploaded_by (FK users), tournament_id (FK, nullable), total_rows, ok_rows, error_rows, warnings (jsonb), created_at, finished_at`
- **Relación:** `users (1) ──< (N) ImportJobs`; `ImportJobs (1) ──(1) MeetManagerImport` (detalle específico).
- **Reglas:** idempotencia por `file_hash`; conserva el set de filas creadas para rollback.

### 8.8 `MeetManagerImport` (detalle específico de import MM/Lenex)
**Propósito:** metadata propia del formato Meet Manager / Lenex.
`id, import_job_id (FK), format (lenex|sd3|hy3), external_meet_id, meet_name, meet_course (SCM|LCM), parsed_payload (jsonb staging), new_swimmers_count, matched_swimmers_count, records_detected_count, mapping (jsonb), created_at`
- **Relación:** `MeetManagerImport (1) ──(1) ImportJobs`.
- **Reglas:** guarda mapeo de IDs externos→internos; mantiene staging antes del commit.

### 8.9 `MeetManagerExport` (exportaciones generadas)
**Propósito:** registrar artefactos exportados para compatibilidad.
`id, format (lenex|sd3|pdf|html), scope (entries|results|heat_sheet), tournament_id (FK), file_url, generated_by (FK users), created_at`
- **Relación:** `tournaments (1) ──< (N) MeetManagerExport`.
- **Reglas:** export reproducible desde el estado homologado del torneo.

### 8.10 Diagrama de relaciones (entidades nuevas)

```
users (1) ──< (N) ImportJobs (1) ──(1) MeetManagerImport
tournaments (1) ──< (N) MeetManagerExport
tournaments (1) ──< (N) ImportJobs

swimmers (1) ──? (1) AthleteAccount        [cuenta opt-in]
swimmers (1) ──(1) AthleteProfile          [perfil/preferencias]
swimmers (1) ──< (N) PersonalBest (N) ──(1) event_definitions
swimmers (1) ──< (N) RankingHistory (N) ──(1) seasons
swimmers (1) ──< (N) AthleteStatistics (N) ──(1) seasons
swimmers (1) ──< (N) AthleteAchievements
PersonalBest (1) ──(1) results            [resultado de origen]
AthleteAchievements (N) ──? (1) records
results (1) ──? (1) records               [un resultado puede originar récord]
```

---

## 9. Reglas de negocio transversales (resumen)

1. **El registro deportivo (`swimmers`/`results`) es la fuente de verdad**; cuentas y perfiles son capas opt-in que lo consumen.
2. **Categoría = función derivada** de `(fecha_nacimiento, año, ámbito)`, congelada en inscripción/resultado para verdad histórica.
3. **Tiempos en milisegundos enteros**; comparaciones solo dentro de misma prueba + misma piscina.
4. **Récords nunca se publican automáticamente**: detección automática + homologación humana obligatoria.
5. **Importación y FTN Manager comparten tablas oficiales** vía campo `source`; habilita transición gradual.
6. **Idempotencia y rollback** en toda importación (hash de archivo + staging).
7. **Vinculación atleta↔cuenta** por documento+nacimiento, con verificación y control anti-suplantación.
8. **Privacidad:** datos personales privados; datos de competencia públicos por defecto (con resguardo a menores).
9. **Eventos de dominio** (`ResultHomologated`, `RecordBroken`, `NewPB`) recalculan PB, rankings, estadísticas, logros y disparan notificaciones — desacoplado vía worker/colas.
10. **Pasaporte digital** verificable por QR con token público no enumerable + estado de licencia vigente.

---

## 10. Pipeline de cálculo (orden de recálculo tras homologar)

```
ResultHomologated (evento)
   │
   ├─> Actualizar PersonalBest        (si mejora)  → marca is_pb, dispara NewPB
   ├─> Evaluar récord                 (si supera)  → crea record candidato (pending)
   ├─> Recalcular Rankings            (prueba/categoría afectada) → materialized view
   ├─> Snapshot RankingHistory        (al cierre de temporada)
   ├─> Recalcular AthleteStatistics   (del atleta + temporada)
   ├─> Generar AthleteAchievements    (medallas/badges según reglas)
   └─> Notificaciones                 (atleta, club, federación)
```

Todo el pipeline corre en **worker asíncrono (BullMQ/Redis)**; la homologación responde rápido y el cómputo pesado ocurre en segundo plano.

---

## 11. Puntos a validar con la FTN antes de generar Prisma

1. **Fecha de corte de edad** para categorías: ¿31/12 del año, o fecha del torneo? (asumido 31/12).
2. **Marcas mínimas**: ¿existen para inscripción provincial, o solo nacional?
3. **Formato de récords**: ¿se llevan por piscina 25 y 50 por separado? (asumido sí).
4. **Junior nacional**: ¿la FTN gestiona récords nacionales o solo replica los de CADDA?
5. **Meet Manager**: ¿qué formato exportan hoy los clubes — SD3, HY3 o Lenex? (define prioridad del parser).
6. **Cuentas de menores**: ¿se permiten con tutor, o solo el club gestiona a menores?
7. **Afiliación/licencia**: ¿es anual por temporada y condiciona la habilitación a competir? (asumido sí).

---
*Especificación funcional v2 — para validación previa al modelado Prisma. No incluye código por decisión explícita.*
