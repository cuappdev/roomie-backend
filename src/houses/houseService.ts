import { removeFromRotations } from '../chores/choreService.js';
import { Prisma } from '../generated/prisma/client.js';
import type { HouseFeature, LivingType } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../utils/AppError.js';
import { parseDate, todayIn } from '../utils/dates.js';
import { makeInviteCode, normalizeInviteCode } from '../utils/inviteCode.js';
import { publicUserSelect } from '../utils/selects.js';

type Tx = Prisma.TransactionClient;

export interface HouseInput {
  name?: string;
  color?: string;
  livingType?: LivingType;
  address?: string | null;
  unit?: string | null;
  leaseEndsOn?: string | null;
  timezone?: string;
  features?: HouseFeature[];
}

const toHouseData = (input: HouseInput) => ({
  ...input,
  leaseEndsOn:
    input.leaseEndsOn === undefined
      ? undefined
      : input.leaseEndsOn === null
        ? null
        : parseDate(input.leaseEndsOn),
  features: input.features ? [...new Set(input.features)] : undefined,
});

const isUniqueViolation = (err: unknown, field: string) =>
  err instanceof Prisma.PrismaClientKnownRequestError &&
  err.code === 'P2002' &&
  JSON.stringify(err.meta ?? {}).includes(field);

const assertNotInHouse = async (tx: Tx, userId: number) => {
  const membership = await tx.houseMember.findUnique({ where: { userId } });
  if (membership) {
    throw new ConflictError('You are already in a house. Leave it first.');
  }
};

/** Retries a few times in the rare case two houses draw the same invite code. */
const withUniqueInviteCode = async <T>(
  houseName: string,
  fn: (code: string) => Promise<T>,
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(makeInviteCode(houseName));
    } catch (err) {
      if (attempt < 5 && isUniqueViolation(err, 'inviteCode')) continue;
      throw err;
    }
  }
};

const createInvites = async (
  tx: Tx,
  houseId: number,
  invitedById: number,
  netids: string[],
) => {
  const memberNetids = new Set(
    (
      await tx.houseMember.findMany({
        where: { houseId },
        select: { user: { select: { netid: true } } },
      })
    ).map((m) => m.user.netid),
  );
  const toInvite = [...new Set(netids)].filter((n) => !memberNetids.has(n));

  for (const netid of toInvite) {
    // Re-inviting someone who declined or was revoked turns the invite back on.
    await tx.houseInvite.upsert({
      where: { houseId_netid: { houseId, netid } },
      create: { houseId, netid, invitedById },
      update: { status: 'PENDING', invitedById, respondedAt: null },
    });
  }
  // TODO: email/push the invitee ("They'll get an email to join").
};

export const getHouse = async (houseId: number) => {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    include: {
      members: {
        orderBy: { joinedAt: 'asc' },
        select: {
          role: true,
          joinedAt: true,
          user: { select: publicUserSelect },
        },
      },
      invites: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, netid: true, createdAt: true },
      },
    },
  });
  if (!house) throw new NotFoundError('House not found.');

  const { createdById: _c, members, leaseEndsOn, ...rest } = house;
  return {
    ...rest,
    leaseEndsOn: leaseEndsOn?.toISOString().slice(0, 10) ?? null,
    members: members.map(({ user, role, joinedAt }) => ({
      ...user,
      role,
      joinedAt,
    })),
    pendingInvites: house.invites,
  };
};

export const createHouse = async (
  userId: number,
  input: HouseInput & { name: string; inviteNetids: string[] },
) => {
  const { inviteNetids, ...fields } = input;
  const houseId = await withUniqueInviteCode(fields.name, (inviteCode) =>
    prisma.$transaction(async (tx) => {
      await assertNotInHouse(tx, userId);
      const house = await tx.house.create({
        data: {
          ...toHouseData(fields),
          name: fields.name,
          inviteCode,
          createdById: userId,
        },
      });
      await tx.houseMember.create({
        data: { houseId: house.id, userId, role: 'OWNER' },
      });
      await createInvites(tx, house.id, userId, inviteNetids);
      return house.id;
    }),
  );
  return getHouse(houseId);
};

export const updateHouse = async (houseId: number, input: HouseInput) => {
  await prisma.house.update({
    where: { id: houseId },
    data: toHouseData(input),
  });
  return getHouse(houseId);
};

export const regenerateInviteCode = async (houseId: number) => {
  const house = await prisma.house.findUniqueOrThrow({
    where: { id: houseId },
  });
  await withUniqueInviteCode(house.name, (inviteCode) =>
    prisma.house.update({ where: { id: houseId }, data: { inviteCode } }),
  );
  return getHouse(houseId);
};

export const inviteToHouse = async (
  houseId: number,
  invitedById: number,
  netids: string[],
) => {
  await prisma.$transaction((tx) =>
    createInvites(tx, houseId, invitedById, netids),
  );
  return getHouse(houseId);
};

export const revokeInvite = async (houseId: number, inviteId: number) => {
  const { count } = await prisma.houseInvite.updateMany({
    where: { id: inviteId, houseId, status: 'PENDING' },
    data: { status: 'REVOKED', respondedAt: new Date() },
  });
  if (count === 0) throw new NotFoundError('Invite not found.');
};

const addMember = async (
  tx: Tx,
  houseId: number,
  userId: number,
  netid: string,
) => {
  await assertNotInHouse(tx, userId);
  await tx.houseMember.create({ data: { houseId, userId, role: 'MEMBER' } });
  // Joining by any route settles any invite this house had sent them.
  await tx.houseInvite.updateMany({
    where: { houseId, netid, status: 'PENDING' },
    data: { status: 'ACCEPTED', respondedAt: new Date() },
  });
};

export const joinByCode = async (
  userId: number,
  netid: string,
  code: string,
) => {
  const house = await prisma.house.findUnique({
    where: { inviteCode: normalizeInviteCode(code) },
  });
  if (!house) throw new NotFoundError('No house with that invite code.');
  await prisma.$transaction((tx) => addMember(tx, house.id, userId, netid));
  return getHouse(house.id);
};

export const respondToInvite = async (
  userId: number,
  netid: string,
  inviteId: number,
  accept: boolean,
) => {
  const invite = await prisma.houseInvite.findFirst({
    where: { id: inviteId, netid, status: 'PENDING' },
  });
  if (!invite) throw new NotFoundError('Invite not found.');

  if (!accept) {
    await prisma.houseInvite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    return null;
  }
  await prisma.$transaction((tx) =>
    addMember(tx, invite.houseId, userId, netid),
  );
  return getHouse(invite.houseId);
};

/**
 * Leaving (or being removed):
 *  - their future, unfinished chore turns are dropped and they leave every rotation
 *  - their "I'll get it" claims on the shopping list are released
 *  - ownership passes to the longest-standing member; the last one out deletes the house
 * Done chores and bought items stay in the history.
 */
export const removeMember = async (
  houseId: number,
  actor: { userId: number; role: string },
  targetUserId: number,
) => {
  const leavingSelf = targetUserId === actor.userId;
  if (!leavingSelf && actor.role !== 'OWNER') {
    throw new BadRequestError('Only the owner can remove someone else.');
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.houseMember.findUnique({
      where: { userId: targetUserId },
    });
    if (!target || target.houseId !== houseId) {
      throw new NotFoundError('Member not found.');
    }

    const house = await tx.house.findUniqueOrThrow({
      where: { id: houseId },
    });
    await removeFromRotations(
      tx,
      houseId,
      targetUserId,
      todayIn(house.timezone),
    );
    await tx.shoppingItem.updateMany({
      where: { houseId, claimedById: targetUserId, status: 'NEEDED' },
      data: { claimedById: null },
    });

    await tx.houseMember.delete({ where: { userId: targetUserId } });

    const others = await tx.houseMember.findMany({
      where: { houseId },
      orderBy: { joinedAt: 'asc' },
    });
    if (others.length === 0) {
      await tx.house.delete({ where: { id: houseId } });
    } else if (target.role === 'OWNER') {
      await tx.houseMember.update({
        where: { id: others[0]!.id },
        data: { role: 'OWNER' },
      });
    }
  });
};
