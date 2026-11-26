# Milestones siguientes — Plataforma FTN

> Control hecho el 2026-11-09 sobre los commits `a647fe9` (M0), `4eaf0d6` (M1) y `83e3870` (M2), más el trabajo sin commitear de M4. Complementa a `TRASPASO-SONNET.md`: la metodología, los agentes y la especificación del perfil (§5) siguen valiendo. **Leé `CLAUDE.md` primero.**

---

## 1. Resultado del control

**Calidad:**
- `pnpm lint`, `pnpm typecheck` y `pnpm test` dan verde (302 tests) **con el árbol actual**.
- La migración `20261109143716_add_swimmer_club_aliases` está aplicada.
- **Ojo:** el commit `4eaf0d6` deja lint roto (`admin/unificacion/page.tsx:152`, comillas sin escapar). El arreglo está sin commitear: commitealo.

**Lo que funciona:**
- **M0:**
  - Swagger solo responde en desarrollo.
  - Un entrenador recibe 403 en la subida de imágenes y en la unificación.
  - El token se renueva solo.
- **M1:** la unificación (`/admin/unificacion`, `admin/merge/*`) protegida por rol Admin.
- **M2:** los arreglos de importación.
- **M4 (sin commitear):** `GET /swimmers/:id/progression` responde con la forma de `TRASPASO-SONNET.md` §5.4:
  - mejor marca, último tiempo y deltas;
  - categoría y club congelados del resultado;
  - medallas;
  - 25 m y 50 m separados;
  - 404 si el nadador no existe.

**Pendiente:**
- **M5** (perfil nuevo): no está hecho; `/nadadores/[id]` sigue con el diseño viejo.
- **Push:** hay 3 commits sin subir.
- **Otra sesión trabajando a la vez:** durante el control alguien editó archivos del árbol. Coordiná para que dos sesiones no toquen los mismos archivos.

---

## 2. 🚨 Hallazgos críticos (arreglar antes que cualquier feature)

### C-1. Resultados duplicados y en la prueba del género equivocado — P0
- **Síntoma:**
  - El torneo Catamarca tiene **4.435 resultados para 1.198 nados reales** (×3,7). Por ejemplo, un 50 m espalda de Mateo Ayunta Aybar está guardado 6 veces: 3 en `50E_M` y 3 en `50E_F`.
  - Hay 183 resultados de varones en pruebas femeninas y **68 mejores marcas en pruebas del otro género**. Esto genera tarjetas duplicadas en el perfil.
- **Causa:** `apps/api/src/import/processors/commit.processor.ts:448` asigna los resultados con `r.event_ref === event.event_no`. Meet Manager reutiliza el mismo número de prueba para varias categorías de edad: Catamarca tiene 157 pruebas y solo 62 números. Cada nado se inserta una vez por cada prueba que comparte su número. Esto viola la regla 5 (idempotencia).
- **Récords afectados:** los **26 candidatos a récord en `pending_homologation` son todos falsos** (varones con marcas en pruebas femeninas). **No homologar ninguno**; hay que rechazarlos.
- **Arreglo:**
  1. Que cada resultado normalizado apunte a una prueba única: agregar una clave de prueba única en `NormalizedEvent`/`NormalizedResult` (por ejemplo número + categoría de edad + género, o un índice), asignada por el parser (`pdf-line-parser.ts`) al bloque de categoría donde aparece el resultado. El commit recorre los resultados una sola vez.
  2. Agregar una validación en el commit: si el género del nadador no coincide con el de la prueba (relevos aparte), generar un issue y no insertar.
  3. Agregar un test con el fixture `catamarca-2026.pdf` que verifique:
     - que el número de resultados confirmados es igual al número de nados únicos (1.198);
     - que hay 0 cruces de género;
     - que reconfirmar el mismo archivo no duplica nada.
  4. Reparar los datos locales y de producción:
     1. revertir la importación `cmqy311kq00019e0kkzx58g3l` con el rollback seguro de M2;
     2. reimportar con el arreglo;
     3. rechazar los 26 candidatos;
     4. recalcular las mejores marcas;
     5. revisar con `data-quality-auditor` que no queden cruces.
- **Agentes:** `ingest-specialist`, luego `swim-standards-expert`, luego `rules-guardian`.

### C-2. El detector de duplicados de M1 no usa el puntaje ya probado — P0
- **Qué hace hoy:** `swimmers/merge/swimmer-merge.service.ts:199` y `club-merge.service.ts:146` calculan su propio puntaje con pesos y umbrales fijos en el código (0,6; 0,4…), lo que contradice la regla de no hardcodear.
- **Qué hay que hacer:** usar `scoreSwimmerCandidate` y `scoreClubCandidate` de `import/matching`, con `IMPORT_MATCHING_CONFIG`.
- **Consecuencias de no hacerlo:**
  - no detecta "Mateo Suar" contra "Mateo Rodriguez Suar";
  - encuentra **0 duplicados de clubes**, aunque `CAZU` (41 nadadores) y `Club Azucena` (24) son el mismo club;
  - sugiere unificar **equipos de relevo** entre sí.
- **Arreglo:**
  1. Reutilizar los scorers.
  2. Excluir los pseudo-nadadores de relevo.
  3. Agregar al `club-scorer` la regla de sigla "C" + abreviatura (`CAZU` = Club + AZU…cena), con tests.
- **Agentes:** `identity-matcher` y `rules-guardian`.

### C-3. Equipos de relevo guardados como nadadores — P1 (⚠ consultar esquema)
- **Problema:** `prisma/seed-records.ts:52` crea 89 "nadadores" con apellido "Equipo de Relevo" para los récords de relevo. Ensucian el buscador, la unificación y los conteos.
- **Propuesta:** que el récord de relevo guarde el club y los integrantes como texto o como lista de nadadores reales. Hace falta cambiar el esquema; consultarlo.
- **Contexto:** los otros ~159 nadadores sin resultados son titulares de récords históricos. Son personas reales y no hay que borrarlas.

### C-4. Sin datos de varios torneos
Solo Catamarca tiene resultados reales; Apertura Tucumán es de demo. La progresión del perfil (M5) no se puede ver con datos reales hasta importar más torneos, **después de C-1**. Pedirle a la federación los archivos de torneos anteriores (idealmente Lenex o HY3).

### Menores
- `GET /swimmers/:id/progression?pool=XX` devuelve 500; validar `pool` y devolver 400.
- Commitear el arreglo de lint de `admin/unificacion/page.tsx`.

---

## 3. Orden de los milestones

Cada uno sigue el ciclo de `CLAUDE.md`: plan con `milestone-planner`, aprobación, código, `verifier` + `rules-guardian`, commit.

| # | Milestone | Detalle |
|---|---|---|
| **M2b** | Asignación correcta de resultados a pruebas y reparación de datos | §2 C-1. **Primero, bloquea todo lo demás** |
| **M1b** | Detector de duplicados con los scorers, sin relevos, sigla CAZU | §2 C-2 |
| **M4** | Cerrar el endpoint de progresión: validar `pool`, revisar tests, commit | `TRASPASO-SONNET.md` §5.3-5.4 |
| **M5** | Perfil del nadador con progresión, flechas ▼ verde / ▲ roja, tabs 25/50, mobile | `TRASPASO-SONNET.md` §5.5. `sports-ux-benchmarker`, luego `ui-designer`, luego `ui-reviewer` |
| **M1c** | Relevos fuera de `swimmers` | §2 C-3. ⚠ requiere aprobar cambio de esquema |
| — | Importar torneos históricos | §2 C-4 (datos, no código) |
| **M6** | Puntos World Aquatics | `TRASPASO-SONNET.md` §6 |
| **M7 / M8** | Adaptadores Lenex / HY3 | `TRASPASO-SONNET.md` §6 |
| **M9 en adelante** | Vinculación de cuentas con UI, licencias, marcas mínimas, ranking oficial, inscripciones, scoring, avisos, resultados en vivo… | `TRASPASO-SONNET.md` §6 |

**Criterio para dar por cerrado M2b:**
- Catamarca reimportado con exactamente 1.198 resultados.
- 0 resultados, PBs o récords con cruce de género.
- Los 26 candidatos falsos rechazados.
- El perfil de Mateo Ayunta Aybar sin pruebas duplicadas.
- Reconfirmar el mismo archivo no cambia los conteos.

---

## 4. Informe de `rules-guardian` sobre M0, M1, M2 y M4 — veredicto **BLOQUEANTE**

### Bloqueantes (romper reglas inviolables)
| ID | Regla | Dónde | Problema | Arreglo |
|---|---|---|---|---|
| **R-1** | 4 · nunca publicar récords automáticamente | `homologation/processors/record-evaluator.processor.ts:35-64` + `import/processors/commit.processor.ts:534-540` | El evaluador crea el récord ya `homologated` + `isCurrent` y pasa el vigente a `superseded`. Desde M2 (B-10) eso corre **después de cada importación**: **importar un archivo hoy publica récords solo** | El evaluador crea solo candidatos `pending_homologation` (`isCurrent: false`); el vigente no cambia hasta que el Admin apruebe. Test que lo blinde. **Urgente: no importar archivos hasta arreglarlo** |
| **R-2** | 6 · vinculación auditada | `swimmers/merge/swimmer-merge.service.ts:143-144,162` | Al unificar, borrar el duplicado desvincula en silencio su cuenta de usuario (FK `ON DELETE SET NULL`), sin `AccountLinkRequest` ni auditoría; mueve requests `approved` que ya no aplican | Bloquear la unificación si el duplicado tiene cuenta vinculada, o exigir que el Admin elija qué cuenta queda por el flujo `AccountLinkRequest`. Nunca desvincular por cascada |
| **R-3** | 2 y 3 · congelamiento y edad | `commit.processor.ts:215-218,397-398`; `csv-mapper.ts:344,358` | Si el CSV/Excel no trae fecha, usa `new Date()`: temporada, edad y categoría quedan congeladas mal para siempre. La piscina queda fija en 50 | Sin fecha y piscina confiables no se confirma: el Admin las carga en el upload o el preview |
| **R-4** | 3 · `resolveCategory` DEC_31 | `commit.processor.ts:84-105,474` | B-11 no se cumplió: solo cambió a `getUTCFullYear()`; sigue local, sin `packages/shared`, sin scope, sin tests y adivinando con la edad del archivo | Mover a `packages/shared` con DEC_31, scope y tests. Sin fecha de nacimiento, que lo decida una persona |
| **R-5** | 2 y 4 · congelamiento y récords | `swimmers/merge/club-merge.service.ts:79,85` | La unificación de clubes reescribe `results.club_id` y `records.club_id` de **todos** los récords, homologados incluidos, sin registrar qué filas movió | Pedirle al usuario una excepción documentada a la regla 2 para unificaciones de identidad; auditar los IDs movidos (reversible, §3.6.2); confirmar aparte los récords homologados |

### A revisar
- **M0:**
  - El `ThrottlerGuard` es **global** (10 por minuto en toda la API, `app.module.ts:45,66`). El SSR de Next sale de una sola IP, así que la segunda vista de un perfil en el mismo minuto da 429. Por eso se agregaron `.catch()` en `nadadores/[id]/page.tsx`.
  - Arreglo: límite solo en `auth` con `@Throttle` y `trust proxy` en Railway.
  - El refresh de token (`lib/api.ts:9-27`) dispara varios refresh simultáneos y puede borrar la sesión. Arreglo: compartir una única promesa de refresh.
- **M1:**
  - La migración de alias necesita **aprobación explícita del esquema**. Le falta `created_by` y `source` es texto libre.
  - Los alias todavía no se usan en el matching.
  - La unificación falla con 500 por claves únicas en `rankings`, `athlete_statistics`, `registrations` y `swimmer_aliases`, y no recalcula rankings, estadísticas ni candidatos.
  - Pierde el DNI y la fecha de nacimiento del duplicado.
  - En clubes deja `rankings.club_id` huérfano, pone en NULL `users.club_id` y `tournaments.host_club_id`, falla con `coaches` y guarda un alias vacío.
  - La auditoría no registra las filas movidas.
- **M2:**
  - El rollback sigue sin ser seguro después de B-10: los PB, rankings y récords con FK RESTRICT lo hacen fallar.
  - B-07 no está resuelto: el torneo se llama con un UUID.
  - B-10 es fire-and-forget, y su fallback `'system'` viola la FK `homologated_by`.
- **M4:**
  - DSQ, DNS y DNF desaparecen del historial; la especificación pide listarlos sin que cuenten.
  - Faltan tests de empate de fecha, de zona horaria y de "PB y después empeora".
  - Las etiquetas salen mal porque `strokeName` espera claves en inglés y los datos están en castellano.
  - La medalla puede salir de la serie en vez de la final.
  - `pool` sin validar da 500.
  - Un cast oculta que `finalTime` puede ser `null`.
  - Los tipos están duplicados en la web en vez de vivir en `packages/shared`.

### Orden actualizado
**R-1 (urgente)** → C-1/M2b → R-3 + R-4 → R-2 + R-5 + M1b → throttler → M4 → M5.

---

## 5. Fase de producto: "que la app quede perfecta y hermosa"

> **Regla de entrada:** nada de esta fase arranca antes de R-1 y C-1. No tiene sentido embellecer rankings y perfiles mientras los resultados estén triplicados y los récords se publiquen solos.
>
> Referencia: análisis de **swimrecords.com.ar** (2026-11-10), sitio independiente con datos de CADDA y Hy-Tek: 15.449 nadadores, 199 torneos, 1.570 récords. **No tiene ranking por prueba ni marcas básicas**: las dos funciones de abajo nos diferencian.

### P-1. Líneas de marcas básicas en el ranking ⭐ (pedido del usuario) — ⚠ cambio de esquema
**Qué es:** en el ranking filtrado por prueba, piscina, género y categoría, una o más líneas de corte (por ejemplo, "Básica Nacional CADDA", "Básica para federarse FTN"). Quien está por encima de la línea tiene la marca para eso.

**Datos** (⚠ aprobación). Todo configurable desde el admin; nada hardcodeado:
- `time_standard_sets`:
  - identificación: `id`, `code`, `name` ("Básica Nacional CADDA 2026");
  - presentación: `purpose` (nacional | federación | otro), `color` (token de la paleta), `order_no`;
  - vigencia y origen: `season_id` o `valid_from`/`valid_to`, `source` (CADDA | FTN), `is_active`.
- `time_standards`: `set_id`, `event_definition_id`, `category_id`, `gender`, `pool_length`, `time_ms` (entero). Clave única `(set, prueba, categoría, género, piscina)`.

**Decidido con el usuario (2026-11-10):**
- Cumple la básica quien tiene tiempo **≤ `time_ms`**.
- **El usuario provee las tablas** de CADDA y FTN (PDF o planillas). Se cargan como datos iniciales (seed idempotente) además de la pantalla de admin.

**Reglas:**
- 25 m y 50 m nunca se cruzan.
- Se compara con la **categoría congelada** del resultado.
- Solo cuentan resultados homologados.

**API:**
- `GET /rankings/event` devuelve `standards: [{ setId, name, color, timeMs, qualifiedCount }]` para el filtro aplicado.
- Cada fila trae `meets: [setId…]`.

**Ranking (web):**
- Entre la última fila que cumple y la primera que no, una fila separadora a todo el ancho: línea punteada del color del estándar con la etiqueta centrada `BÁSICA NACIONAL · 1:05.40 · 12 nadadores`.
- Varias líneas apiladas en el orden que corresponda.
- En cada fila, chips de los estándares cumplidos (`NAC`, `FED`).
- Leyenda arriba con toggles para mostrar u ocultar cada línea.
- Sin categoría elegida: no se dibujan líneas (cada categoría tiene su corte); solo los chips por fila según su categoría.
- En celular, la línea es una banda de color con la etiqueta en dos renglones.

**Admin:**
- Pantalla "Marcas básicas": crear o editar conjuntos.
- Carga de tiempos por tabla editable o importando un CSV (prueba, categoría, género, piscina, tiempo `mm:ss.cc` que se convierte a ms en la entrada).
- Vista previa antes de guardar.

**Extensiones (P1):**
- En el perfil, por prueba: "Te faltan **0,85 s** para la Básica Nacional", con barra de progreso, o el chip "¡Básica Nacional lograda!".
- En el panel del entrenador: quién está cerca de cada básica.

**Agentes:** `swim-standards-expert` (cómo publica CADDA sus marcas mínimas), `milestone-planner`, `sports-ux-benchmarker`, `ui-designer`, `ui-reviewer`.

### P-2. Alerta "¡Felicitaciones, bajaste tu tiempo!" ⭐ (pedido del usuario) — ⚠ cambio de esquema chico
**Cuándo:**
- Un nadador con cuenta vinculada inicia sesión o entra a su perfil y hay logros nuevos sin ver, generados al **homologarse** los resultados de un torneo nuevo.
- Nunca por resultados sin homologar.
- Los récords solo después de que un Admin los apruebe.

**Datos** (⚠ aprobación). Reusar `AthleteAchievement`:
- agregar el tipo `personal_best` al enum;
- agregar las columnas `improvement_ms Int?`, `previous_time_ms Int?`, `new_time_ms Int?`, `pool_length` y `seen_at DateTime?`.
- Se genera en el procesador de logros: si el resultado es mejor que la mejor marca previa de la misma prueba y piscina, se crea el logro.
- También se aprovecha para "primera vez que nada esta prueba", medallas y básicas logradas.

**API:**
- `GET /account-link/me/achievements?unseen=true`
- `POST /account-link/me/achievements/seen` (solo el nadador vinculado).

**Diseño:**
- Modal centrado sobre fondo `pool-950/80` con desenfoque, ícono de trofeo o `MedalIcon` animado y una lluvia de confeti suave en colores `aqua`/dorado, que se desactiva con `prefers-reduced-motion`.
- Título: **"¡Felicitaciones, Valentina!"**
- Texto principal: **"Bajaste 0,58 s en 50 m Libre"**. Debajo: `0:32.00 → 0:31.42 · Copa NOA 2026 · nueva mejor marca`, con el tiempo nuevo en `aqua-300` y `▼ -0,58 s` en verde.
- Si hay varias mejoras:
  - las páginas del modal van como tarjetas ("Mejoraste en 3 pruebas"), con puntos de paginación;
  - el cierre muestra un resumen: suma de segundos bajados, medallas y básicas logradas.
- Botones: **"Ver mi progreso"** (lleva a la progresión de esa prueba) y "Cerrar". Ambos marcan como visto.
- Accesible:
  - foco atrapado mientras está abierto;
  - `Esc` cierra;
  - `aria-live` para el texto;
  - tiempos con signo y flecha, nunca solo color.
- Variante liviana: toast en `/nadador` para logros menores, como una primera vez en una prueba.

### P-3. Funciones de swimrecords que nos faltan (priorizadas)
| ID | Función | Prioridad | Notas |
|---|---|---|---|
| S-1 | **Matriz de mejores marcas en el perfil:** por estilo, filas por distancia, columnas 50 m / 25 m, con torneo y fecha en cada celda y secciones plegables con contador | P0 (es parte de M5) | Sale del endpoint de progresión |
| S-2 | **Gráfico de progresión por prueba** con filtros (estilo, distancia, piscina, fechas), tarjeta "Mejor tiempo" y eje Y invertido | P0 (M5) | recharts |
| S-3 | **Barra de pestañas inferior en celular** + panel de filtros con contador | P0 | Resuelve B-15 |
| S-4 | **Podio visual** 2-1-3 con círculos de medalla en cada prueba | P1 | Componente `Podium` con `MedalIcon` |
| S-5 | **Récords vigentes arriba de cada prueba** (provincial + nacional de referencia) | P1 | Por prueba, piscina y categoría |
| S-6 | **Récords y pastillas en el perfil** ("R.P. Menores · 1:05.40") junto a cada mejor marca | P1 | Solo récords homologados |
| S-7 | **"En números"**: pruebas, torneos, podios, pruebas por temporada, estilo principal, edad en el último torneo | P1 | |
| S-8 | **Tabs de categoría por prueba** + buscador de nadador/club dentro del torneo | P1 | Por categoría congelada |
| S-9 | **Historial de récords** (línea de tiempo de los `superseded`) | P1 | |
| S-10 | **Calendario** de próximos torneos con cuenta regresiva y vistas lista/mes | P1 | Torneos `programado` |
| S-11 | **Directorio de atletas** con tarjetas, filtros por club y categoría, y favoritos (localStorage) | P1 | |
| S-12 | **Tiempo de inscripción vs. final** con delta | P2 | El dato existe |
| S-13 | **Compartir en Instagram Stories** (imagen 9:16 con `next/og`) + QR del torneo | P2 | |
| S-14 | **"Reportar un error"** en récords y resultados, con bandeja para el Admin | P2 | |
| S-15 | **Galería de recordistas** | P2 | |
| S-16 | **Guías**: categorías, piletas, cómo leer resultados, glosario (DQ, NT…) | P2 | Contenido estático que lee las categorías de la base |
| S-17 | **Resumen escrito automático** del nadador (bueno para SEO) | P2 | Plantilla sobre los datos |

**Patrones visuales a copiar**, adaptados a la identidad oscura "piscina":
- Titulares en dos tonos con la palabra clave resaltada.
- Buscador grande y redondeado en la portada.
- Barra de filtros fija con un selector segmentado `50 m | 25 m` y chips de filtros activos con "Limpiar (n)".
- Tiempos en monoespaciada negrita.
- Badge dorado para récords y celda resaltada cuando una mejor marca es récord.
- Estados vacíos explicados y bloque "Seguí explorando" al pie.

### P-4. Más ideas propias (más allá de swimrecords)
| ID | Idea | Valor | Prioridad |
|---|---|---|---|
| I-1 | **"Tu torneo en números"**: resumen personal post-torneo (mejores marcas, segundos bajados, medallas, básicas, posición en el ranking) con botón para compartir como historia de Instagram | Viralidad: las familias lo comparten | P1 |
| I-2 | **Metas personales**: el nadador o su entrenador fija un tiempo objetivo por prueba, se muestra la barra de progreso y se celebra al lograrlo (con la alerta P-2) | Motivación | P1 |
| I-3 | **Ranking "los que más mejoraron"** por torneo y temporada (porcentaje y segundos), por categoría | Premia el progreso y no solo al más rápido; ideal para chicos | P1 |
| I-4 | **Insignias y rachas**: "3 torneos seguidos bajando marca", "primera medalla", "nadó los 4 estilos", "primer 400 libre" (tipo `badge` existente) | Gamificación | P1 |
| I-5 | **Panel del entrenador**: sus nadadores con las últimas mejoras, quién está cerca de cada básica y quién empeoró | Herramienta de trabajo real | P1 |
| I-6 | **Seguir nadadores**: padres y familiares siguen perfiles y reciben la alerta P-2 por email o push | Engagement | P1 (M15) |
| I-7 | **Análisis de parciales**: parciales vs. los de su mejor marca, ritmo por tramo | Entrenadores | P2 |
| I-8 | **Distancia al récord**: "a 2,3 s del récord provincial de su categoría" | Motivación | P2 |
| I-9 | **Comparar nadadores** (head-to-head) en la misma prueba y piscina | Curiosidad | P2 |
| I-10 | **Modo pantalla gigante** para el torneo (resultados en vivo en TV, autoscroll) | Torneos presenciales | P2 |
| I-11 | **Curriculum deportivo en PDF** del nadador (para becas o pases) | Utilidad | P2 |
| I-12 | **Pasaporte digital con QR** (spec v2) con estado de licencia | Pendiente de la spec | P2 |

### P-5. Orden sugerido de la fase de producto
1. S-3 (menú en celular).
2. **M5 completo** = S-1 + S-2 + las flechas ▼/▲ de `TRASPASO-SONNET.md` §5.5.
3. **P-1** (líneas de básicas).
4. **P-2** (alerta de felicitación).
5. I-3 + I-4.
6. S-4 + S-5 + S-6.
7. I-1 + S-13.
8. I-2 + I-5.
9. Resto P2.

### P-6. Reparto entre modelos
Fable 5.2 es el modelo más capaz, con un costo por token de aproximadamente el doble que Opus 5.5.
- **Fable:** lo correctness-critical y multi-archivo:
  - R-1 (publicación automática de récords);
  - C-1 + reparación de datos;
  - R-2 a R-5 (unificación y categorías);
  - el diseño de datos de P-1 y P-2;
  - M5, que es la pantalla más compleja.
- **Sonnet 5.5 u Opus 5.5:** pantallas y componentes más rutinarios (S-4 a S-17, I-1 a I-4).
- **Revisores** (`verifier`, `rules-guardian`, `ui-reviewer`): modelos más baratos.
- **Coordinación:** **un solo escritor por conjunto de archivos**, cada sesión en su propio worktree o rama. Durante el control de ayer había otra sesión editando el mismo árbol, así que no repetirlo.
