import { describe, expect, it } from 'vitest';

import { signUp } from './helpers.js';

const createLoft = async (
  owner: Awaited<ReturnType<typeof signUp>>,
  extra = {},
) => {
  const res = await owner.post('/houses', {
    name: 'The Linden Loft',
    color: '#8B5A34',
    livingType: 'OFF_CAMPUS',
    address: '112 Linden Ave',
    unit: 'Apt 3B',
    leaseEndsOn: '2027-05-31',
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.house;
};

describe('creating a house', () => {
  it('creates the house with the creator as owner and invites by NetID', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah, { inviteNetids: ['SC2291', 'mv384'] });

    expect(house).toMatchObject({
      name: 'The Linden Loft',
      leaseEndsOn: '2027-05-31',
      livingType: 'OFF_CAMPUS',
      features: [
        'BILLS',
        'CHORES',
        'SHOPPING',
        'CALENDAR',
        'STORAGE',
        'MOODBOARD',
      ],
      members: [{ netid: 'lk452', role: 'OWNER' }],
    });
    expect(house.inviteCode).toMatch(/^LOFT-\d{4}$/);
    expect(house.pendingInvites.map((i: { netid: string }) => i.netid)).toEqual(
      ['sc2291', 'mv384'],
    );
    expect(house).not.toHaveProperty('createdById');

    const me = await leah.get('/users/me');
    expect(me.body.house).toMatchObject({ id: house.id, role: 'OWNER' });
  });

  it('rejects bad NetIDs and dates', async () => {
    const leah = await signUp('lk452');
    const res = await leah.post('/houses', {
      name: 'X',
      inviteNetids: ['not a netid'],
      leaseEndsOn: '2027-13-45',
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.data)).toEqual(
      expect.arrayContaining(['body.inviteNetids.0', 'body.leaseEndsOn']),
    );
  });

  it('only allows one house per person', async () => {
    const leah = await signUp('lk452');
    await createLoft(leah);
    const res = await leah.post('/houses', { name: 'Second' });
    expect(res.status).toBe(409);
  });
});

describe('joining', () => {
  it('shows pending invites at login and joins on accept', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah, { inviteNetids: ['sc2291'] });

    const selena = await signUp('sc2291');
    const session = await selena.post('/auth/login');
    expect(session.body.house).toBeNull();
    expect(session.body.pendingInvites).toHaveLength(1);
    expect(session.body.pendingInvites[0]).toMatchObject({
      house: {
        id: house.id,
        name: 'The Linden Loft',
        members: [{ netid: 'lk452' }],
      },
      invitedBy: { netid: 'lk452' },
    });

    const inviteId = session.body.pendingInvites[0].id;
    const accepted = await selena.post(`/invites/${inviteId}/accept`);
    expect(accepted.status).toBe(200);
    expect(
      accepted.body.house.members.map((m: { netid: string }) => m.netid),
    ).toEqual(['lk452', 'sc2291']);
    expect(accepted.body.house.pendingInvites).toEqual([]);
  });

  it('joins with an invite code, case-insensitive', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah);
    const melissa = await signUp('mv384');
    const res = await melissa.post('/houses/join', {
      inviteCode: house.inviteCode.toLowerCase(),
    });
    expect(res.status).toBe(200);
    expect(res.body.house.members).toHaveLength(2);
  });

  it('declined invites disappear; other people cannot use your invite', async () => {
    const leah = await signUp('lk452');
    await createLoft(leah, { inviteNetids: ['sc2291'] });
    const selena = await signUp('sc2291');
    const melissa = await signUp('mv384');
    const inviteId = (await selena.get('/users/me')).body.pendingInvites[0].id;

    expect((await melissa.post(`/invites/${inviteId}/accept`)).status).toBe(
      404,
    );
    expect((await selena.post(`/invites/${inviteId}/decline`)).status).toBe(
      204,
    );
    expect((await selena.get('/users/me')).body.pendingInvites).toEqual([]);
  });

  it('owner can revoke invites and rotate the code', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah, { inviteNetids: ['sc2291'] });
    const inviteId = house.pendingInvites[0].id;
    expect(
      (await leah.delete(`/houses/${house.id}/invites/${inviteId}`)).status,
    ).toBe(204);

    const rotated = await leah.post(`/houses/${house.id}/invite-code`);
    expect(rotated.body.house.inviteCode).not.toBe(house.inviteCode);

    const melissa = await signUp('mv384');
    expect(
      (await melissa.post('/houses/join', { inviteCode: house.inviteCode }))
        .status,
    ).toBe(404);
  });
});

describe('house access', () => {
  it('hides houses from non-members', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah);
    const stranger = await signUp('xx111');
    expect((await stranger.get(`/houses/${house.id}`)).status).toBe(404);
    expect(
      (await stranger.patch(`/houses/${house.id}`, { name: 'Mine' })).status,
    ).toBe(404);
  });

  it('members can edit settings; only the owner rotates the code', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah);
    const selena = await signUp('sc2291');
    await selena.post('/houses/join', { inviteCode: house.inviteCode });

    const edited = await selena.patch(`/houses/${house.id}`, {
      features: ['CHORES', 'SHOPPING'],
    });
    expect(edited.body.house.features).toEqual(['CHORES', 'SHOPPING']);
    expect((await selena.post(`/houses/${house.id}/invite-code`)).status).toBe(
      403,
    );
  });
});

describe('leaving', () => {
  it('passes ownership on and deletes the house when the last person leaves', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah);
    const selena = await signUp('sc2291');
    await selena.post('/houses/join', { inviteCode: house.inviteCode });

    expect((await leah.delete(`/houses/${house.id}/members/me`)).status).toBe(
      204,
    );
    const after = await selena.get(`/houses/${house.id}`);
    expect(after.body.house.members).toEqual([
      expect.objectContaining({ netid: 'sc2291', role: 'OWNER' }),
    ]);

    expect((await selena.delete(`/houses/${house.id}/members/me`)).status).toBe(
      204,
    );
    expect((await selena.get('/users/me')).body.house).toBeNull();
  });

  it('only the owner can remove someone else', async () => {
    const leah = await signUp('lk452');
    const house = await createLoft(leah);
    const selena = await signUp('sc2291');
    const melissa = await signUp('mv384');
    await selena.post('/houses/join', { inviteCode: house.inviteCode });
    await melissa.post('/houses/join', { inviteCode: house.inviteCode });

    expect(
      (await selena.delete(`/houses/${house.id}/members/${melissa.id}`)).status,
    ).toBe(400);
    expect(
      (await leah.delete(`/houses/${house.id}/members/${melissa.id}`)).status,
    ).toBe(204);
  });
});
