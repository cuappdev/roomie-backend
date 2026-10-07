/**
 * Demo data matching the Figma designs: The Linden Loft with Leah, Selena and Melissa.
 * Run with `npm run db:seed` (wipes the database first, so never point it at prod).
 * Then sign in locally as `Bearer dev:lk452`, `dev:sc2291` or `dev:mv384`.
 */
import 'dotenv/config';

import { prisma } from '../src/prisma.js';
import { todayIn } from '../src/utils/dates.js';

const TZ = 'America/New_York';

const main = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production.');
  }

  await prisma.$executeRawUnsafe(
    'TRUNCATE "User", "House" RESTART IDENTITY CASCADE',
  );

  const person = (netid: string, name: string, major: string) =>
    prisma.user.create({
      data: {
        firebaseUid: `dev-${netid}`,
        netid,
        email: `${netid}@cornell.edu`,
        name,
        major,
      },
    });
  const leah = await person('lk452', 'Leah Kim', 'Info Science');
  const selena = await person('sc2291', 'Selena Chen', 'Info Science');
  const melissa = await person(
    'mv384',
    'Melissa Velasquez',
    'Computer Science',
  );
  await prisma.user.update({
    where: { id: melissa.id },
    data: { presence: 'AWAY' },
  });

  const house = await prisma.house.create({
    data: {
      name: 'The Linden Loft',
      color: '#8B5A34',
      inviteCode: 'LOFT-4827',
      address: '112 Linden Ave',
      unit: 'Apt 3B',
      leaseEndsOn: new Date('2027-05-31T00:00:00Z'),
      timezone: TZ,
      createdById: leah.id,
      members: {
        create: [
          { userId: leah.id, role: 'OWNER' },
          { userId: selena.id },
          { userId: melissa.id },
        ],
      },
    },
  });

  const today = todayIn(TZ);
  const chore = (
    title: string,
    frequency: 'DAILY' | 'EVERY_OTHER_DAY' | 'WEEKLY',
    rotation: number[],
  ) =>
    prisma.chore.create({
      data: {
        houseId: house.id,
        title,
        frequency,
        startsOn: today,
        createdById: leah.id,
        rotation: {
          create: rotation.map((userId, position) => ({ userId, position })),
        },
      },
    });
  await chore('Take out trash & recycling', 'WEEKLY', [
    leah.id,
    selena.id,
    melissa.id,
  ]);
  await chore('Wipe kitchen counters', 'EVERY_OTHER_DAY', [leah.id, selena.id]);
  await chore('Vacuum living room', 'WEEKLY', [selena.id, melissa.id, leah.id]);
  await chore('Clean bathroom', 'WEEKLY', [melissa.id, leah.id, selena.id]);

  const item = (
    name: string,
    addedById: number,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.shoppingItem.create({
      data: { houseId: house.id, name, addedById, ...extra },
    });
  await item('Eggs (dozen)', melissa.id);
  await item('Oat milk', leah.id, { claimedById: selena.id });
  await item('Dish soap', selena.id, { category: 'HOUSEHOLD' });
  await item('Trash bags', leah.id, {
    category: 'HOUSEHOLD',
    claimedById: leah.id,
  });
  const bought = {
    status: 'BOUGHT' as const,
    boughtById: leah.id,
    boughtAt: new Date(),
  };
  await item('Apples', leah.id, { ...bought, priceCents: 429 });
  await item('Whole milk', leah.id, { ...bought, priceCents: 399 });
  await item('Paper towels', leah.id, {
    ...bought,
    priceCents: 649,
    category: 'HOUSEHOLD',
  });

  console.log(
    `Seeded "${house.name}" (id ${house.id}, code ${house.inviteCode}).`,
  );
  console.log('Sign in with Bearer dev:lk452 / dev:sc2291 / dev:mv384');
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
