import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed vacío por ahora — se completará en Milestone de datos maestros
  // eslint-disable-next-line no-console
  console.log('Seed ejecutado (vacío en Sesión 0)');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
