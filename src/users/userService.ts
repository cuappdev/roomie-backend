import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';
import { meSelect, publicUserSelect } from '../utils/selects.js';

/** The signed-in user, their house (if any), and invites waiting for them. */
export const getSession = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...meSelect,
      membership: {
        select: {
          role: true,
          house: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
  if (!user) throw new NotFoundError('User not found.');

  const { membership, ...me } = user;

  const pendingInvites = membership
    ? []
    : await prisma.houseInvite.findMany({
        where: { netid: me.netid, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          house: {
            select: {
              id: true,
              name: true,
              color: true,
              members: { select: { user: { select: publicUserSelect } } },
            },
          },
          invitedBy: { select: publicUserSelect },
        },
      });

  return {
    user: me,
    house: membership ? { ...membership.house, role: membership.role } : null,
    pendingInvites: pendingInvites.map(({ house, ...invite }) => ({
      ...invite,
      house: {
        id: house.id,
        name: house.name,
        color: house.color,
        members: house.members.map((m) => m.user),
      },
    })),
  };
};
