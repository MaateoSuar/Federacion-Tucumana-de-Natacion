# Plataforma Digital — Federación Tucumana de Natación (FTN)
## Documento de Arquitectura Técnica y Funcional

> Versión 1.0 — Documento base para inicio de desarrollo
> Autor: Software Architecture Team
> Estado: Propuesta para aprobación

---

## 0. Resumen ejecutivo

La FTN necesita una plataforma web que reemplace los procesos manuales (planillas de inscripción, resultados en PDF, récords en Excel) por un sistema integrado que gestione el ciclo completo de la natación federada provincial: clubes, nadadores, torneos, inscripciones, resultados, récords, rankings y estadísticas históricas.

El sistema se concibe inspirado en **FESDA** (sistema de gestión deportiva acuática usado en Argentina) pero con tecnología moderna, foco en datos históricos de largo plazo y publicación de resultados en tiempo real.

**Recomendación arquitectónica central:** Monolito modular con **Next.js (App Router) + NestJS + PostgreSQL + Prisma**, desplegado en contenedores. Esta combinación maximiza velocidad de entrega del MVP, minimiza costo operativo para una federación, y deja una ruta de evolución clara hacia separación de servicios sólo donde el crecimiento lo justifique.

---

## 1. Stack tecnológico propuesto

| Capa | Tecnología elegida | Alternativas evaluadas |
|------|-------------------|------------------------|
| **Frontend** | Next.js 14+ (App Router) + React + TypeScript | React SPA (Vite), Angular, Astro |
| **UI / Estilos** | TailwindCSS + shadcn/ui + Radix | MUI, Chakra, Bootstrap |
| **Backend / API** | NestJS (Node.js + TypeScript) | Express puro, Fastify, Django, Spring Boot |
| **Base de datos** | PostgreSQL 16 | MongoDB, MySQL/MariaDB |
| **ORM** | Prisma | TypeORM, Drizzle, Sequelize |
| **Cache / colas / tiempo real** | Redis + WebSockets (Socket.IO) | Memcached, polling |
| **Autenticación** | JWT (access + refresh) propio sobre NestJS, o Auth.js/Clerk | Sesiones server-side, Auth0 |
| **Almacenamiento de archivos** | S3-compatible (AWS S3 / Cloudflare R2 / Supabase Storage) | Filesystem local, BLOB en DB |
| **Hosting frontend** | Vercel (o contenedor en VPS) | Netlify, Cloudflare Pages |
| **Hosting backend + DB** | Railway / Render / VPS (Hetzner, DigitalOcean) con Docker | Heroku, AWS ECS, bare metal |
| **Búsqueda** (fase avanzada) | PostgreSQL Full-Text → Meilisearch | Elasticsearch, Algolia |
| **Observabilidad** | Sentry + Grafana/Prometheus + logs estructurados (Pino) | Datadog, New Relic |
| **CI/CD** | GitHub Actions | GitLab CI, CircleCI |

**TypeScript de extremo a extremo** es una decisión transversal: un único lenguaje en frontend, backend y scripts reduce el costo cognitivo del equipo, permite compartir tipos (DTOs, modelos) y acelera el onboarding — crítico en un proyecto con recursos acotados como el de una federación.

---

## 2. Justificación de decisiones (comparativas)

### 2.1 PostgreSQL vs MongoDB → **PostgreSQL**

El dominio de una federación es **intensamente relacional y transaccional**: un resultado pertenece a una serie, que pertenece a una prueba, que pertenece a un torneo; un nadador pertenece a un club en una temporada; un récord referencia un resultado específico. Estas relaciones, junto a la necesidad de integridad referencial estricta (no puede existir un resultado sin nadador), favorecen un motor relacional.

| Criterio | PostgreSQL | MongoDB |
|----------|-----------|---------|
| Integridad referencial | Nativa (FK, constraints) | Manual en aplicación |
| Consultas analíticas (rankings, históricos) | SQL + window functions, CTEs | Aggregation pipeline (más limitado/verboso) |
| Transacciones ACID multi-tabla | Maduras y de primera clase | Soportadas pero con fricción |
| Flexibilidad de esquema | JSONB para campos semi-estructurados | Total |
| Datos históricos por años | Particionado, índices, materialized views | Menos natural para analítica |

PostgreSQL además ofrece **JSONB**, así que la flexibilidad de documentos (metadatos de torneos, configuración variable) sigue disponible sin renunciar a las garantías relacionales. Para rankings y estadísticas, las **window functions** (`RANK()`, `ROW_NUMBER()`, `PARTITION BY`) son exactamente la herramienta correcta — algo que en MongoDB resulta forzado.

**Veredicto:** PostgreSQL es la elección obvia para este dominio. MongoDB resolvería peor el 80% de las consultas centrales.

### 2.2 NestJS vs Express → **NestJS**

| Criterio | NestJS | Express |
|----------|--------|---------|
| Estructura | Opinado, modular, escalable | Libre — cada equipo inventa la suya |
| TypeScript | First-class | Add-on |
| Inyección de dependencias | Nativa | Manual |
| Organización por módulos | Ideal para "monolito modular" | Requiere disciplina externa |
| Curva de aprendizaje | Media | Baja |
| Testing, validación, guards, interceptors | Integrados | Librerías sueltas |

Express es excelente para microservicios pequeños o prototipos, pero un sistema con ~10 dominios funcionales (torneos, resultados, clubes, récords…) se beneficia enormemente de la **modularidad impuesta por NestJS**. Sus módulos mapean 1:1 con los módulos de negocio de este documento, lo que hace que la arquitectura "monolito modular" sea casi automática. Los guards y decoradores resuelven limpiamente el sistema de roles (RBAC).

**Veredicto:** NestJS. La estructura que impone es un activo, no una restricción, para un proyecto que vivirá muchos años y cambiará de manos.

### 2.3 Next.js vs React tradicional (SPA) → **Next.js**

| Criterio | Next.js | React SPA (Vite) |
|----------|---------|------------------|
| SEO (sitio institucional, noticias, resultados públicos) | Excelente (SSR/SSG) | Pobre sin esfuerzo extra |
| Rendimiento percibido | SSR + streaming | Carga JS completa primero |
| Páginas públicas indexables | Nativo | Requiere SSR manual |
| Panel admin (privado) | Funciona igual | Funciona igual |
| Imágenes optimizadas, routing, caching | Integrado | Manual |

La FTN tiene una **cara pública** (institucional, noticias, torneos, resultados, récords, rankings) que **debe posicionar en buscadores y cargar rápido**. Para esto el SSR/SSG de Next.js es decisivo: un resultado de torneo o un récord provincial debe ser indexable por Google. La parte privada (panel admin) podría ser una SPA, pero unificar todo en Next.js evita mantener dos proyectos.

**Veredicto:** Next.js. El componente público SEO-dependiente inclina la balanza sin discusión.

### 2.4 Monolito modular vs Microservicios → **Monolito modular**

| Criterio | Monolito modular | Microservicios |
|----------|------------------|----------------|
| Complejidad operativa | Baja | Alta (orquestación, red, observabilidad) |
| Costo de infraestructura | Bajo | Alto |
| Velocidad de desarrollo inicial | Alta | Baja |
| Equipo necesario | Pequeño | Grande, especializado |
| Transacciones cross-dominio | Triviales | Sagas, eventual consistency |
| Escalabilidad selectiva | Limitada | Granular |

Para una federación provincial con un equipo pequeño, **los microservicios serían una sobre-ingeniería costosa**. El volumen (miles de nadadores, no millones) no lo justifica. La estrategia correcta es un **monolito modular**: una sola base de código NestJS organizada en módulos con fronteras claras (cada módulo expone interfaces, no toca tablas de otros módulos directamente). Esto da el 90% de los beneficios de los microservicios (separación de responsabilidades) sin su costo operativo.

**Ruta de evolución:** si en el futuro un componente necesita escalar independientemente (p.ej. el motor de resultados en vivo durante un torneo nacional, o un servicio de generación de PDFs/reportes), se extrae ese módulo a un servicio separado. La modularidad previa hace que esa extracción sea de bajo riesgo.

**Veredicto:** Monolito modular ahora; extracción quirúrgica de servicios sólo cuando una métrica real lo demande.

---

## 3. Modelo de negocio y funcionalidades

### 3.1 Propuesta de valor
Centralizar y digitalizar todo el ciclo competitivo de la natación tucumana, ofreciendo:
- A la **federación**: gestión, trazabilidad, datos históricos y reportería.
- A los **clubes**: inscripciones online, gestión de su plantel, seguimiento de nadadores.
- A los **nadadores/familias**: perfil deportivo, marcas personales, evolución, rankings.
- Al **público**: información institucional, resultados y récords en tiempo real.

### 3.2 Funcionalidades principales (cara pública)
- **Home institucional**: misión, autoridades, comisión directiva, contacto, calendario.
- **Noticias**: CMS con categorías, portada, imágenes, destacados.
- **Torneos**: calendario, fixture, reglamentos, programa de pruebas (heat sheet).
- **Inscripciones**: portal para que clubes inscriban nadadores en pruebas, con validación de marcas mínimas y plazos.
- **Resultados**: por torneo/prueba/serie, con tiempos, posiciones, parciales, descalificaciones, y publicación en vivo.
- **Clubes afiliados**: directorio, estado de afiliación, plantel.
- **Nadadores**: perfil público con marcas personales (PB) por prueba, historial, club, categoría.
- **Récords provinciales y nacionales**: tablas por género/categoría/prueba/piscina (25m/50m), con vínculo al resultado que lo originó.
- **Rankings**: top-N por prueba/categoría/temporada, generados automáticamente desde resultados.
- **Estadísticas**: evolución histórica, medallero por club, participación, comparativas.

### 3.3 Funcionalidades administrativas (privadas)
- Gestión de afiliaciones (clubes, nadadores, licencias por temporada).
- Creación y configuración de torneos y pruebas.
- Carga y homologación de resultados (manual o import desde cronometraje).
- Validación automática de récords al homologar resultados.
- Aprobación de inscripciones, control de cupos y marcas mínimas.
- Gestión de usuarios y roles.
- Reportes y exportaciones (PDF/Excel): programas, resultados, certificados.

---

## 4. Roles del sistema (RBAC)

Modelo de control de acceso basado en roles con permisos granulares. Un usuario tiene uno o más roles; algunos roles están **vinculados a una entidad** (un Entrenador/Club pertenece a un Club específico).

| Rol | Alcance | Permisos clave |
|-----|---------|----------------|
| **Super Administrador FTN** | Global | Control total: usuarios, roles, configuración del sistema, todo lo de Admin. Único que gestiona récords nacionales y parámetros globales. |
| **Administrador FTN** | Global (operativo) | Crear/gestionar torneos, homologar resultados, aprobar afiliaciones, validar récords provinciales, publicar noticias. No gestiona roles del sistema. |
| **Club (Delegado de Club)** | Su propio club | Gestionar su plantel de nadadores, inscribir en torneos, ver resultados de sus nadadores, actualizar datos del club. |
| **Entrenador** | Su(s) club(es)/equipo | Ver y analizar marcas de sus nadadores, proponer inscripciones, ver rankings y estadísticas. Permisos de lectura ampliada + propuesta. |
| **Juez / Oficial** | Torneos asignados | Cargar resultados/tiempos, registrar descalificaciones (DSQ), validar series. Acceso al módulo de competencia durante el evento. |
| **Nadador** | Su propio perfil | Ver su perfil, marcas personales, historial, rankings, inscripciones. Actualizar datos personales (sujeto a aprobación). |
| **Público (anónimo)** | Solo lectura pública | Ver home, noticias, resultados, récords, rankings, perfiles públicos. |

**Notas de diseño:**
- Roles modelados con tabla `roles` + `permissions` + `user_roles` (RBAC clásico), no como un enum rígido, para permitir crecer.
- Roles "scoped": `user_roles` puede incluir `club_id` para acotar el alcance (un Delegado sólo administra su club).
- En NestJS se implementa con `@Roles()` decorator + `RolesGuard` + verificación de scope.

---

## 5. Modelo de base de datos

### 5.1 Entidades principales

**Identidad y acceso**
- `users` — credenciales, email, estado, último acceso.
- `roles`, `permissions`, `role_permissions`, `user_roles` — RBAC.

**Organización deportiva**
- `clubs` — clubes afiliados (nombre, sigla, localidad, estado de afiliación, logo).
- `affiliations` — afiliación de un club por temporada (estado, fecha, cuota).
- `swimmers` — nadadores (datos personales, fecha de nacimiento, género, documento).
- `swimmer_club_history` — historial de pertenencia nadador↔club por temporada (transferencias).
- `coaches` — entrenadores, vinculados a club(es).
- `seasons` — temporadas (año, fechas, estado).
- `categories` — categorías oficiales FTN por edad (ver tabla oficial en `ESPECIFICACION-FUNCIONAL-v2.md`, §1). Provincial: Pre A → Mayores. Nacional añade Junior.

**Competencia**
- `tournaments` — torneos (nombre, sede, piscina 25/50m, fechas, tipo, estado).
- `events` — pruebas dentro de un torneo (estilo, distancia, género, categoría, ronda).
- `event_definitions` — catálogo maestro de pruebas (50 Libre, 100 Espalda, etc.) reutilizable.
- `heats` (series) — series de una prueba (número, hora estimada).
- `registrations` (inscripciones) — inscripción de un nadador a una prueba (marca de inscripción, estado).
- `lane_assignments` — asignación de andarivel por nadador en una serie (seeding).
- `results` — resultado por nadador/prueba (tiempo final, posición, estado: OK/DSQ/DNS/DNF).
- `splits` — parciales de un resultado (cada 25/50m).

**Marcas, récords y rankings**
- `personal_bests` — mejor marca (PB) por nadador/prueba/piscina (derivada, cacheada).
- `records` — récords provinciales/nacionales (ámbito, prueba, categoría, género, piscina, marca, nadador, fecha, resultado de origen, estado vigente/superado).
- `rankings` — vista/tabla materializada de rankings por prueba/categoría/temporada.

**Contenido y soporte**
- `news` — noticias (título, slug, cuerpo, portada, categoría, estado, autor, fecha).
- `media` / `files` — referencias a archivos en S3 (logos, fotos, PDFs, reglamentos).
- `audit_logs` — auditoría de acciones administrativas.
- `notifications` — notificaciones a usuarios.

### 5.2 Relaciones y cardinalidades (resumen)

```
clubs (1) ──< (N) swimmer_club_history (N) >── (1) swimmers
clubs (1) ──< (N) coaches
clubs (1) ──< (N) affiliations (N) >── (1) seasons

tournaments (1) ──< (N) events
event_definitions (1) ──< (N) events           [catálogo reutilizado]
events (1) ──< (N) heats
events (1) ──< (N) registrations (N) >── (1) swimmers
heats (1) ──< (N) lane_assignments (N) >── (1) registrations
events (1) ──< (N) results (N) >── (1) swimmers
results (1) ──< (N) splits

swimmers (1) ──< (N) personal_bests
results (1) ──? (1) records          [un resultado puede originar un récord]
categories (1) ──< (N) events
categories (1) ──< (N) records

users (1) ──< (N) user_roles (N) >── (1) roles
roles (N) >──< (N) permissions   (via role_permissions)
users (1) ──? (1) swimmers        [un nadador puede tener cuenta]
users (1) ──? (1) coaches
users (1) ──? (1) clubs (delegado)
```

Leyenda: `1` = uno, `N` = muchos, `?` = cero-o-uno (opcional).

### 5.3 Campos principales (tablas clave)

**swimmers**
`id, first_name, last_name, document_id, birth_date, gender, nationality, current_club_id, photo_url, status, user_id?, created_at, updated_at`

**clubs**
`id, name, short_name, locality, logo_url, founded_year, contact_email, status (afiliado/suspendido/baja), created_at`

**tournaments**
`id, name, host_club_id, venue, pool_length (25|50), start_date, end_date, type (provincial/nacional/promocional), status (programado/en_curso/finalizado/homologado), season_id`

**events**
`id, tournament_id, event_definition_id, stroke (libre/espalda/pecho/mariposa/combinado), distance, gender, category_id, round (clasif/final), order_no, status`

**registrations**
`id, event_id, swimmer_id, club_id, entry_time (marca inscripción en ms), status (pendiente/aceptada/rechazada), created_at`

**results**
`id, event_id, swimmer_id, heat_id, lane, final_time (ms), place, status (OK/DSQ/DNS/DNF), points (FINA), is_record (bool), homologated (bool), created_at`

**records**
`id, scope (provincial|nacional), event_definition_id, category_id, gender, pool_length, time (ms), swimmer_id, club_id, record_date, source_result_id, is_current (bool), previous_record_id?`

**news**
`id, title, slug, excerpt, body (rich text), cover_url, category, author_id, status (borrador/publicada), published_at`

> **Decisión de modelado:** todos los tiempos se almacenan en **milisegundos como entero** (`final_time INT`), nunca como string "01:02.34". Esto hace triviales las comparaciones, ordenamientos, rankings y validación de récords. El formateo a `mm:ss.cc` ocurre sólo en presentación.

---

## 6. Módulos del sistema y sus relaciones

Cada módulo es un módulo NestJS con su controlador, servicio y repositorio. Las dependencias fluyen en una dirección clara para evitar acoplamiento circular.

```
┌─────────────────────────────────────────────────────────────┐
│                    MÓDULOS DE LA PLATAFORMA                   │
└─────────────────────────────────────────────────────────────┘

  [Auth/Users]  ← base, del que dependen todos (identidad + RBAC)
       │
       ├──> [Clubs] ──> [Swimmers] ──> [Coaches]
       │
       ├──> [Seasons & Categories]  (datos maestros)
       │
       ├──> [Tournaments] ──> [Events] ──> [Heats] ──> [Registrations]
       │                                         │
       │                                         └──> [Results] ──> [Splits]
       │
       ├──> [Records]   (escucha eventos de Results)
       ├──> [Rankings]  (deriva de Results)        ──── motor analítico
       ├──> [Statistics](deriva de Results+Records)
       │
       ├──> [News/CMS]
       ├──> [Media/Storage]
       └──> [Notifications] [Audit] [Reports]   (transversales)
```

**Relaciones clave entre módulos:**
- **Results es el corazón del sistema.** Cuando se homologa un resultado, emite un evento de dominio (`ResultHomologated`) que disparan:
  - **Records** → evalúa si supera un récord vigente.
  - **Rankings** → invalida/recalcula el ranking afectado.
  - **Personal Bests** → actualiza la mejor marca del nadador.
  - **Statistics** → marca métricas como recalculables.
  - **Notifications** → avisa al club/nadador/federación.
- Este patrón de **eventos de dominio internos** (event emitter de NestJS) mantiene los módulos desacoplados sin necesidad de microservicios.

---

## 7. Arquitectura escalable

Objetivos: miles de nadadores, historial de décadas, rankings automáticos, estadísticas históricas y resultados en vivo.

### 7.1 Datos históricos de largo plazo
- **Particionado de tablas** pesadas (`results`, `splits`, `registrations`) **por temporada/año** en PostgreSQL. Las consultas de una temporada activa tocan una partición pequeña; el histórico permanece accesible pero no penaliza el día a día.
- **Índices compuestos** dirigidos a las consultas reales: `(event_definition_id, category_id, gender, pool_length, final_time)` para rankings y récords.
- **Archivo en frío**: temporadas muy antiguas pueden moverse a particiones de solo lectura o a un esquema de archivo.

### 7.2 Rankings y estadísticas automáticos
- **Vistas materializadas** (`materialized views`) para rankings y agregados estadísticos, refrescadas de forma incremental tras la homologación de resultados (no en cada lectura).
- El cálculo se dispara por **eventos de dominio** + un **worker de cola (BullMQ/Redis)**: homologar un resultado encola un job que recalcula sólo los rankings afectados. Esto desacopla el costo del cálculo de la petición del usuario.
- Lectura de rankings/estadísticas servida desde **cache (Redis)** con invalidación dirigida.

### 7.3 Resultados en tiempo real
- Durante un torneo, los jueces cargan tiempos (manual o import desde sistema de cronometraje tipo Omega/Quantum AQ via archivo `.lif`/`.cl`).
- El backend publica actualizaciones por **WebSockets (Socket.IO)** a una sala por torneo/prueba; el público ve resultados aparecer en vivo sin recargar.
- Si el volumen de espectadores crece, esta capa en tiempo real es el primer candidato a **extraerse como servicio independiente** y escalar horizontalmente con Redis pub/sub como backplane.

### 7.4 Escalabilidad de infraestructura
- **Backend stateless** detrás de balanceador → escala horizontal (réplicas).
- **PostgreSQL** con réplica de lectura para consultas pesadas (estadísticas, reportes) separadas de la escritura.
- **CDN** (Cloudflare) para assets, imágenes y páginas estáticas/ISR de Next.js.
- **Cache en capas**: CDN → Redis → DB.
- **Capacidad real**: estas técnicas soportan holgadamente decenas de miles de nadadores y millones de resultados históricos en una sola instancia robusta de PostgreSQL; no se requieren microservicios para este volumen.

### 7.5 Diagrama de arquitectura de despliegue

```
            ┌──────────────┐
   Público──┤  Cloudflare  │  (CDN + WAF + DNS)
            └──────┬───────┘
                   │
        ┌──────────▼───────────┐
        │   Next.js (Vercel/   │   ← Frontend SSR/SSG/ISR
        │   contenedor)        │
        └──────────┬───────────┘
                   │ REST / WS
        ┌──────────▼───────────┐
        │   NestJS API         │   ← Monolito modular (réplicas)
        │   (Docker)           │
        └───┬─────────┬────┬───┘
            │         │    │
   ┌────────▼──┐ ┌────▼─┐ ┌▼──────────┐
   │PostgreSQL │ │Redis │ │ S3 / R2   │
   │(+réplica) │ │cache │ │ archivos  │
   └───────────┘ │+colas│ └───────────┘
                 └──────┘
        ┌──────────────────┐
        │ Worker (BullMQ)  │  ← rankings, récords, reportes, emails
        └──────────────────┘
```

---

## 8. Funcionalidades innovadoras (diferenciales)

Más allá de lo que ofrece un sistema tradicional como FESDA:

1. **Perfil deportivo del nadador con evolución visual** — gráficos de progresión de marcas por prueba a lo largo de los años, proyección de tendencia, comparación con récords de su categoría.
2. **Puntaje FINA/World Aquatics automático** — cada resultado convertido a puntos para comparar pruebas distintas de forma objetiva (ranking de "mejor nadador" multidisciplina).
3. **Inscripción inteligente con validación de marcas mínimas** — el sistema bloquea/advierte si el nadador no cumple la marca mínima de la prueba, y sugiere pruebas elegibles según sus PB.
4. **Resultados en vivo + notificaciones push** — familias y clubes reciben aviso cuando su nadador termina una prueba o bate un récord/PB.
5. **Detección automática de récords** — al homologar, el sistema identifica y propone récords provinciales/nacionales batidos, con flujo de validación.
6. **Pasaporte digital del nadador (QR)** — credencial verificable con licencia vigente, foto, club y categoría; útil para acreditación en sede.
7. **Dashboard analítico para clubes y entrenadores** — rendimiento del plantel, comparativas, identificación de talentos, planificación de inscripciones.
8. **Heat sheet y seeding automáticos** — generación automática del programa de series sembrando por marcas de inscripción (serpentina/seeding estándar).
9. **API pública / open data** — endpoints abiertos de récords y rankings para medios, apps de terceros y transparencia.
10. **Calendario unificado con sincronización** (iCal/Google Calendar) de torneos y plazos de inscripción.
11. **Medallero y estadísticas históricas interactivas** — comparativas entre clubes, temporadas, evolución de participación femenina/masculina, etc.
12. **Marca de agua / homologación con trazabilidad** — cada récord enlaza al resultado, torneo, serie y juez que lo validó (transparencia y auditoría).

---

## 9. Roadmap de desarrollo

### Fase 1 — MVP (núcleo funcional)
**Objetivo:** digitalizar el ciclo básico y publicar resultados.
- Auth + RBAC (Super Admin, Admin, Club, Nadador).
- Gestión de clubes y nadadores (afiliaciones por temporada).
- Datos maestros: temporadas, categorías, catálogo de pruebas.
- Creación de torneos y pruebas.
- Inscripciones online (club inscribe nadadores).
- Carga manual de resultados + homologación.
- Cálculo de Personal Bests.
- Páginas públicas: home institucional, noticias básicas, torneos, resultados.
- Hosting, CI/CD, backups.

### Fase 2 — Récords, rankings y estadísticas
- Detección automática y gestión de **récords provinciales y nacionales**.
- **Rankings automáticos** por prueba/categoría/temporada (vistas materializadas + worker).
- **Estadísticas** e históricos básicos.
- Puntaje FINA automático.
- CMS de noticias completo.
- Perfil público enriquecido del nadador (evolución de marcas).
- Roles Entrenador y Juez.

### Fase 3 — Tiempo real y experiencia avanzada
- **Resultados en vivo** (WebSockets) y publicación durante torneos.
- Import desde sistemas de cronometraje (`.lif`/`.cl`).
- **Heat sheet / seeding automático**.
- Notificaciones push y por email.
- Dashboard analítico para clubes y entrenadores.
- Validación de marcas mínimas en inscripción.

### Fase 4 — Innovación y ecosistema
- Pasaporte digital del nadador (QR + credencial).
- API pública / open data.
- App móvil (PWA o nativa) para nadadores y familias.
- Integraciones (calendario, pagos de afiliación/inscripción online).
- Búsqueda avanzada (Meilisearch).
- Extracción de servicio de tiempo real / reportes si las métricas lo exigen.
- Analítica predictiva / detección de talentos.

---

## 10. Decisiones de arquitectura (registro)

| # | Decisión | Justificación |
|---|----------|---------------|
| ADR-01 | Monolito modular en NestJS | Equipo pequeño, volumen moderado, velocidad de entrega; evolución a servicios sólo bajo demanda real. |
| ADR-02 | PostgreSQL como base de datos | Dominio relacional/transaccional; window functions para rankings; JSONB para flexibilidad. |
| ADR-03 | Prisma como ORM | DX y type-safety superiores, migraciones declarativas, integración TypeScript. |
| ADR-04 | Next.js (App Router) en frontend | SEO de páginas públicas, SSR/ISR, un solo proyecto para público y admin. |
| ADR-05 | TypeScript end-to-end | Un lenguaje, tipos compartidos, menor costo cognitivo. |
| ADR-06 | Tiempos en milisegundos (entero) | Comparación, orden, rankings y récords triviales y exactos. |
| ADR-07 | Eventos de dominio internos (NestJS EventEmitter + BullMQ) | Desacoplar Results de Records/Rankings/Stats sin microservicios. |
| ADR-08 | RBAC con roles+permisos scoped | Flexibilidad de roles, alcance por club, crecimiento sin refactor. |
| ADR-09 | Almacenamiento S3-compatible | Escalable, barato, desacoplado del servidor de aplicación. |
| ADR-10 | Vistas materializadas + cache Redis para analítica | Lectura rápida sin recalcular en cada request. |

---

### Próximos pasos sugeridos
1. Validar reglas de negocio específicas de la FTN (categorías por edad, marcas mínimas, formato de récords).
2. Definir identidad visual y wireframes del sitio público y panel.
3. Inicializar el monorepo (Next.js + NestJS + Prisma) y el esquema inicial de base de datos.
4. Configurar entorno (Docker, CI/CD, base de datos, storage) y arrancar Fase 1.

---
*Documento base — sujeto a revisión con las autoridades y referentes técnicos de la Federación Tucumana de Natación.*
