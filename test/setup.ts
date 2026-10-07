import { afterAll, beforeEach } from 'vitest';

import { prisma } from '../src/prisma.js';

if (!process.env.DATABASE_URL?.includes('test')) {
  throw new Error(`Refusing to run tests against ${process.env.DATABASE_URL}`);
}

/** Wipe every table before each test. */
beforeEach(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
