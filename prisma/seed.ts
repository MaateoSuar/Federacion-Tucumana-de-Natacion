import { PrismaClient, CategoryScope, Gender, ScoringSchemeType } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function d(iso: string): Date {
  return new Date(iso);
}

// ─── Datos maestros ──────────────────────────────────────────────────────────

const CATEGORIES: Array<{
  code: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  scope: CategoryScope;
  orderNo: number;
}> = [
  { code: 'PRE_A', name: 'Pre A',      minAge: null, maxAge: 8,    scope: 'provincial', orderNo: 1  },
  { code: 'PRE_B', name: 'Pre B',      minAge: 9,    maxAge: 9,    scope: 'provincial', orderNo: 2  },
  { code: 'INF_1', name: 'Infantil 1', minAge: 10,   maxAge: 10,   scope: 'provincial', orderNo: 3  },
  { code: 'INF_2', name: 'Infantil 2', minAge: 11,   maxAge: 11,   scope: 'provincial', orderNo: 4  },
  { code: 'MEN_1', name: 'Menor 1',    minAge: 12,   maxAge: 12,   scope: 'provincial', orderNo: 5  },
  { code: 'MEN_2', name: 'Menor 2',    minAge: 13,   maxAge: 13,   scope: 'provincial', orderNo: 6  },
  { code: 'CAD_1', name: 'Cadete 1',   minAge: 14,   maxAge: 14,   scope: 'provincial', orderNo: 7  },
  { code: 'CAD_2', name: 'Cadete 2',   minAge: 15,   maxAge: 15,   scope: 'provincial', orderNo: 8  },
  { code: 'JUV_1', name: 'Juvenil 1',  minAge: 16,   maxAge: 16,   scope: 'provincial', orderNo: 9  },
  { code: 'JUV_2', name: 'Juvenil 2',  minAge: 17,   maxAge: 18,   scope: 'provincial', orderNo: 10 },
  { code: 'MAY',   name: 'Mayores',    minAge: 19,   maxAge: null, scope: 'provincial', orderNo: 11 },
  // Categoría nacional — solo para uso como referencia en récords nacionales
  { code: 'JUN',   name: 'Junior',     minAge: 19,   maxAge: 21,   scope: 'nacional',   orderNo: 12 },
];

// Stroke codes usados en los codes de EventDefinition
type StrokeDef = { stroke: string; code: string; distances: number[] };

const STROKES: StrokeDef[] = [
  { stroke: 'libre',      code: 'L',  distances: [50, 100, 200, 400, 800, 1500] },
  { stroke: 'espalda',    code: 'E',  distances: [50, 100, 200] },
  { stroke: 'pecho',      code: 'P',  distances: [50, 100, 200] },
  { stroke: 'mariposa',   code: 'MA', distances: [50, 100, 200] },
  { stroke: 'combinado',  code: 'C',  distances: [100, 200, 400] },
];

const RELAY_DEFS: Array<{ stroke: string; eventCode: string; distance: number; label: string }> = [
  { stroke: 'relevo_libre',      eventCode: '4x100RL', distance: 400,  label: '4x100 Libre' },
  { stroke: 'relevo_libre',      eventCode: '4x200RL', distance: 800,  label: '4x200 Libre' },
  { stroke: 'relevo_combinado',  eventCode: '4x100RC', distance: 400,  label: '4x100 Combinado' },
];

const GENDERS: Gender[] = ['M', 'F'];

function buildEventDefinitions(): Array<{
  code: string;
  stroke: string;
  distance: number;
  gender: Gender;
  isRelay: boolean;
  description: string;
}> {
  const defs: ReturnType<typeof buildEventDefinitions> = [];

  // Individuales
  for (const { stroke, code, distances } of STROKES) {
    for (const distance of distances) {
      for (const gender of GENDERS) {
        defs.push({
          code: `${distance}${code}_${gender}`,
          stroke,
          distance,
          gender,
          isRelay: false,
          description: `${distance}m ${stroke} — ${gender === 'M' ? 'Masculino' : 'Femenino'}`,
        });
      }
    }
  }

  // Relevos
  for (const relay of RELAY_DEFS) {
    for (const gender of GENDERS) {
      defs.push({
        code: `${relay.eventCode}_${gender}`,
        stroke: relay.stroke,
        distance: relay.distance,
        gender,
        isRelay: true,
        description: `${relay.label} — ${gender === 'M' ? 'Masculino' : 'Femenino'}`,
      });
    }
  }

  return defs;
}

const SEASONS = [
  { year: 2025, startDate: d('2025-01-01'), endDate: d('2025-12-31'), isActive: false },
  { year: 2026, startDate: d('2026-01-01'), endDate: d('2026-12-31'), isActive: true },
];

const SCORING_SCHEME = {
  name: 'FINA Puntos por Posición',
  type: 'placement' as ScoringSchemeType,
  config: { points: [9, 7, 6, 5, 4, 3, 2, 1], relay_multiplier: 2, min_competitors: 1 },
  isActive: true,
};

const ROLES: Array<{ name: string; description: string }> = [
  { name: 'Super Administrador', description: 'Acceso total al sistema' },
  { name: 'Administrador FTN',   description: 'Gestión operativa de la federación' },
  { name: 'Delegado de Club',    description: 'Representante de un club afiliado' },
  { name: 'Entrenador',          description: 'Entrenador de nadadores de un club' },
  { name: 'Juez',                description: 'Juez de competencia — carga de tiempos' },
  { name: 'Nadador',             description: 'Atleta con cuenta personal' },
];

const PERMISSIONS: Array<{ resource: string; action: string }> = [
  { resource: 'tournament',    action: 'create' },
  { resource: 'tournament',    action: 'read' },
  { resource: 'tournament',    action: 'update' },
  { resource: 'result',        action: 'homologate' },
  { resource: 'result',        action: 'read' },
  { resource: 'result',        action: 'create' },
  { resource: 'record',        action: 'homologate' },
  { resource: 'record',        action: 'read' },
  { resource: 'swimmer',       action: 'create' },
  { resource: 'swimmer',       action: 'read' },
  { resource: 'swimmer',       action: 'update' },
  { resource: 'club',          action: 'manage' },
  { resource: 'import',        action: 'execute' },
  { resource: 'account_link',  action: 'approve' },
  { resource: 'ranking',       action: 'read' },
  { resource: 'profile',       action: 'edit_own' },
];

// Mapa: nombre de rol → lista de permisos que recibe
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  'Super Administrador': PERMISSIONS.map(p => `${p.resource}:${p.action}`),
  'Administrador FTN': [
    'tournament:create', 'tournament:read', 'tournament:update',
    'result:homologate', 'result:read', 'result:create',
    'record:homologate', 'record:read',
    'swimmer:create', 'swimmer:read', 'swimmer:update',
    'club:manage',
    'import:execute',
    'account_link:approve',
    'ranking:read',
    'profile:edit_own',
  ],
  'Delegado de Club': [
    'tournament:read',
    'result:read',
    'record:read',
    'swimmer:create', 'swimmer:read', 'swimmer:update',
    'ranking:read',
  ],
  'Entrenador': [
    'tournament:read',
    'result:read',
    'record:read',
    'swimmer:read',
    'ranking:read',
  ],
  'Juez': [
    'tournament:read',
    'result:read', 'result:create',
    'record:read',
    'ranking:read',
  ],
  'Nadador': [
    'tournament:read',
    'result:read',
    'record:read',
    'swimmer:read',
    'ranking:read',
    'profile:edit_own',
  ],
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('▶ Seeding FTN — catálogos maestros...');

  // 1. Categorías
  console.log('  → Categorías...');
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { code: cat.code },
      update: {
        name:    cat.name,
        minAge:  cat.minAge,
        maxAge:  cat.maxAge,
        scope:   cat.scope,
        orderNo: cat.orderNo,
      },
      create: {
        code:    cat.code,
        name:    cat.name,
        minAge:  cat.minAge,
        maxAge:  cat.maxAge,
        scope:   cat.scope,
        orderNo: cat.orderNo,
      },
    });
  }
  console.log(`     ${CATEGORIES.length} categorías OK`);

  // 2. Event definitions
  console.log('  → Pruebas (event_definitions)...');
  const eventDefs = buildEventDefinitions();
  for (const def of eventDefs) {
    await prisma.eventDefinition.upsert({
      where: { code: def.code },
      update: {
        stroke:      def.stroke,
        distance:    def.distance,
        gender:      def.gender,
        isRelay:     def.isRelay,
        description: def.description,
      },
      create: {
        code:        def.code,
        stroke:      def.stroke,
        distance:    def.distance,
        gender:      def.gender,
        isRelay:     def.isRelay,
        description: def.description,
      },
    });
  }
  console.log(`     ${eventDefs.length} pruebas OK`);

  // 3. Temporadas
  console.log('  → Temporadas...');
  for (const season of SEASONS) {
    await prisma.season.upsert({
      where: { year: season.year },
      update: {
        startDate: season.startDate,
        endDate:   season.endDate,
        isActive:  season.isActive,
      },
      create: {
        year:      season.year,
        startDate: season.startDate,
        endDate:   season.endDate,
        isActive:  season.isActive,
      },
    });
  }
  console.log(`     ${SEASONS.length} temporadas OK`);

  // 4. Scoring scheme (ScoringScheme.name no tiene @unique → findFirst + create)
  console.log('  → Scoring scheme...');
  const existingScheme = await prisma.scoringScheme.findFirst({
    where: { name: SCORING_SCHEME.name },
  });
  if (!existingScheme) {
    await prisma.scoringScheme.create({
      data: {
        name:     SCORING_SCHEME.name,
        type:     SCORING_SCHEME.type,
        config:   SCORING_SCHEME.config,
        isActive: SCORING_SCHEME.isActive,
      },
    });
  } else {
    await prisma.scoringScheme.update({
      where: { id: existingScheme.id },
      data: {
        type:     SCORING_SCHEME.type,
        config:   SCORING_SCHEME.config,
        isActive: SCORING_SCHEME.isActive,
      },
    });
  }
  console.log('     1 scoring scheme OK');

  // 5. Roles
  console.log('  → Roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: { name: role.name, description: role.description },
    });
  }
  console.log(`     ${ROLES.length} roles OK`);

  // 6. Permisos
  console.log('  → Permisos...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: perm.resource, action: perm.action } },
      update: {},
      create: { resource: perm.resource, action: perm.action, name: `${perm.resource}:${perm.action}` },
    });
  }
  console.log(`     ${PERMISSIONS.length} permisos OK`);

  // 7. Asignación rol → permisos
  console.log('  → Asignación rol-permisos...');
  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    for (const key of permKeys) {
      const [resource, action] = key.split(':');
      const perm = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource, action } },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  console.log('     Asignaciones OK');

  console.log('✅ Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
