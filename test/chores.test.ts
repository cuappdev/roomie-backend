import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signUp } from './helpers.js';

type Client = Awaited<ReturnType<typeof signUp>>;
type Turn = {
  id: number;
  dueOn: string;
  status: string;
  assignee: { netid: string };
};

/** Monday, Nov 9 2026, 10am in Ithaca: the week shown in the Chores design. */
const NOW = new Date('2026-11-09T15:00:00Z');

let leah: Client, selena: Client, melissa: Client, houseId: number;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);

  leah = await signUp('lk452');
  selena = await signUp('sc2291');
  melissa = await signUp('mv384');
  const house = (await leah.post('/houses', { name: 'The Linden Loft' })).body
    .house;
  houseId = house.id;
  await selena.post('/houses/join', { inviteCode: house.inviteCode });
  await melissa.post('/houses/join', { inviteCode: house.inviteCode });
});

afterEach(() => {
  vi.useRealTimers();
});

const createChore = async (body: object, as: Client = leah) => {
  const res = await as.post(`/houses/${houseId}/chores`, body);
  expect(res.status).toBe(201);
  return res.body.chore;
};

const turns = async (as: Client, query: string): Promise<Turn[]> => {
  const res = await as.get(`/houses/${houseId}/chore-assignments?${query}`);
  expect(res.status).toBe(200);
  return res.body.assignments;
};

const who = (ts: Turn[]) => ts.map((t) => `${t.dueOn} ${t.assignee.netid}`);

describe('creating chores', () => {
  it('matches the "Coming up" preview in the design', async () => {
    const chore = await createChore({
      title: 'Clean bathroom',
      frequency: 'WEEKLY',
      startsOn: '2026-11-15',
      rotation: [melissa.id, leah.id, selena.id],
    });
    expect(chore).toMatchObject({
      title: 'Clean bathroom',
      allowSwaps: true,
      reminderHour: 18,
      rotation: [{ netid: 'mv384' }, { netid: 'lk452' }, { netid: 'sc2291' }],
    });
    expect(who(chore.comingUp)).toEqual([
      '2026-11-15 mv384',
      '2026-11-22 lk452',
      '2026-11-29 sc2291',
    ]);
  });

  it('only rotates people who live in the house', async () => {
    const stranger = await signUp('xx111');
    const res = await leah.post(`/houses/${houseId}/chores`, {
      title: 'Dishes',
      frequency: 'DAILY',
      startsOn: '2026-11-09',
      rotation: [leah.id, stranger.id],
    });
    expect(res.status).toBe(400);
  });

  it('validates the body', async () => {
    const res = await leah.post(`/houses/${houseId}/chores`, {
      title: '',
      frequency: 'HOURLY',
      startsOn: 'tomorrow',
      rotation: [leah.id, leah.id],
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'body.frequency',
      'body.rotation',
      'body.startsOn',
      'body.title',
    ]);
  });
});

describe('the week view', () => {
  it('shows everyone’s turns, with status, and filters to "me"', async () => {
    await createChore({
      title: 'Wipe kitchen counters',
      frequency: 'EVERY_OTHER_DAY',
      startsOn: '2026-11-09',
      rotation: [leah.id, selena.id],
    });
    await createChore({
      title: 'Take out trash & recycling',
      frequency: 'WEEKLY',
      startsOn: '2026-11-12',
      rotation: [leah.id, selena.id, melissa.id],
    });

    const week = await turns(leah, 'from=2026-11-09&to=2026-11-15');
    expect(who(week)).toEqual([
      '2026-11-09 lk452',
      '2026-11-11 sc2291',
      '2026-11-12 lk452',
      '2026-11-13 lk452',
      '2026-11-15 sc2291',
    ]);
    expect(week[0]!.status).toBe('DUE_TODAY');
    expect(week[1]!.status).toBe('UPCOMING');

    const mine = await turns(leah, 'from=2026-11-09&to=2026-11-15&assignee=me');
    expect(mine.every((t) => t.assignee.netid === 'lk452')).toBe(true);

    // Reading the same range again doesn't duplicate anything.
    expect(await turns(leah, 'from=2026-11-09&to=2026-11-15')).toHaveLength(5);
  });

  it('includes overdue turns when asked', async () => {
    await createChore({
      title: 'Clean bathroom',
      frequency: 'DAILY',
      startsOn: '2026-11-07',
      rotation: [melissa.id],
    });
    const today = await turns(
      melissa,
      'from=2026-11-09&to=2026-11-09&includeOverdue=true',
    );
    expect(today.map((t) => `${t.dueOn} ${t.status}`)).toEqual([
      '2026-11-07 OVERDUE',
      '2026-11-08 OVERDUE',
      '2026-11-09 DUE_TODAY',
    ]);
  });

  it('rejects huge or backwards ranges', async () => {
    const res1 = await leah.get(
      `/houses/${houseId}/chore-assignments?from=2026-01-01&to=2026-12-31`,
    );
    const res2 = await leah.get(
      `/houses/${houseId}/chore-assignments?from=2026-11-15&to=2026-11-09`,
    );
    expect([res1.status, res2.status]).toEqual([400, 400]);
  });
});

describe('completing, swapping, stats', () => {
  it('ticks a turn off, undoes it, and counts it in "Done this month"', async () => {
    await createChore({
      title: 'Trash',
      frequency: 'DAILY',
      startsOn: '2026-11-09',
      rotation: [leah.id, selena.id],
    });
    const [first] = await turns(leah, 'from=2026-11-09&to=2026-11-09');

    const done = await leah.post(
      `/houses/${houseId}/chore-assignments/${first!.id}/complete`,
    );
    expect(done.body.assignment).toMatchObject({
      status: 'DONE',
      completedBy: { netid: 'lk452' },
      canSwap: false,
    });

    // Melissa covers Selena's turn tomorrow; it counts for Melissa.
    const [second] = await turns(leah, 'from=2026-11-10&to=2026-11-10');
    await melissa.post(
      `/houses/${houseId}/chore-assignments/${second!.id}/complete`,
    );

    const stats = await leah.get(`/houses/${houseId}/chores/stats`);
    expect(stats.body.month).toBe('2026-11');
    expect(
      stats.body.members.map((m: { user: { netid: string }; done: number }) => [
        m.user.netid,
        m.done,
      ]),
    ).toEqual([
      ['lk452', 1],
      ['sc2291', 0],
      ['mv384', 1],
    ]);

    const undone = await leah.delete(
      `/houses/${houseId}/chore-assignments/${first!.id}/complete`,
    );
    expect(undone.body.assignment.status).toBe('DUE_TODAY');
  });

  it('swaps turns of the same chore', async () => {
    await createChore({
      title: 'Vacuum',
      frequency: 'WEEKLY',
      startsOn: '2026-11-12',
      rotation: [leah.id, selena.id],
    });
    const [a, b] = await turns(leah, 'from=2026-11-09&to=2026-11-22');
    expect(who([a!, b!])).toEqual(['2026-11-12 lk452', '2026-11-19 sc2291']);

    // Melissa holds neither turn.
    const nope = await melissa.post(
      `/houses/${houseId}/chore-assignments/${a!.id}/swap`,
      {
        withAssignmentId: b!.id,
      },
    );
    expect(nope.status).toBe(403);

    const res = await leah.post(
      `/houses/${houseId}/chore-assignments/${a!.id}/swap`,
      {
        withAssignmentId: b!.id,
      },
    );
    expect(res.status).toBe(200);
    expect(who(await turns(leah, 'from=2026-11-09&to=2026-11-22'))).toEqual([
      '2026-11-12 sc2291',
      '2026-11-19 lk452',
    ]);
  });

  it('respects "Allow swaps" being off', async () => {
    await createChore({
      title: 'Vacuum',
      frequency: 'WEEKLY',
      startsOn: '2026-11-12',
      rotation: [leah.id, selena.id],
      allowSwaps: false,
    });
    const [a, b] = await turns(leah, 'from=2026-11-09&to=2026-11-22');
    const res = await leah.post(
      `/houses/${houseId}/chore-assignments/${a!.id}/swap`,
      {
        withAssignmentId: b!.id,
      },
    );
    expect(res.status).toBe(403);
  });
});

describe('editing chores', () => {
  it('reordering the rotation makes the new first person go next', async () => {
    const chore = await createChore({
      title: 'Bathroom',
      frequency: 'WEEKLY',
      startsOn: '2026-11-15',
      rotation: [melissa.id, leah.id, selena.id],
    });
    const res = await leah.patch(`/houses/${houseId}/chores/${chore.id}`, {
      rotation: [selena.id, melissa.id],
    });
    expect(who(res.body.chore.comingUp)).toEqual([
      '2026-11-15 sc2291',
      '2026-11-22 mv384',
      '2026-11-29 sc2291',
    ]);
  });

  it('changing the schedule keeps finished turns', async () => {
    const chore = await createChore({
      title: 'Counters',
      frequency: 'DAILY',
      startsOn: '2026-11-07',
      rotation: [leah.id, selena.id],
    });
    const past = await turns(leah, 'from=2026-11-07&to=2026-11-08');
    await leah.post(
      `/houses/${houseId}/chore-assignments/${past[0]!.id}/complete`,
    );

    const res = await leah.patch(`/houses/${houseId}/chores/${chore.id}`, {
      frequency: 'WEEKLY',
      startsOn: '2026-11-10',
    });
    expect(res.status).toBe(200);
    expect(who(res.body.chore.comingUp)).toEqual([
      '2026-11-10 lk452',
      '2026-11-17 sc2291',
      '2026-11-24 lk452',
    ]);

    const history = await turns(leah, 'from=2026-11-07&to=2026-11-17');
    expect(history.map((t) => `${t.dueOn} ${t.status}`)).toEqual([
      '2026-11-07 DONE',
      '2026-11-08 OVERDUE',
      '2026-11-10 UPCOMING',
      '2026-11-17 UPCOMING',
    ]);
  });

  it('a new schedule cannot start in the past', async () => {
    const chore = await createChore({
      title: 'Counters',
      frequency: 'DAILY',
      startsOn: '2026-11-09',
      rotation: [leah.id],
    });
    const res = await leah.patch(`/houses/${houseId}/chores/${chore.id}`, {
      frequency: 'WEEKLY',
      startsOn: '2026-11-01',
    });
    expect(res.status).toBe(400);
  });

  it('deleting a chore removes it and its upcoming turns', async () => {
    const chore = await createChore({
      title: 'Counters',
      frequency: 'DAILY',
      startsOn: '2026-11-09',
      rotation: [leah.id],
    });
    expect(
      (await leah.delete(`/houses/${houseId}/chores/${chore.id}`)).status,
    ).toBe(204);
    expect((await leah.get(`/houses/${houseId}/chores`)).body.chores).toEqual(
      [],
    );
    expect(await turns(leah, 'from=2026-11-09&to=2026-11-15')).toEqual([]);
  });
});

describe('when someone leaves', () => {
  it('drops them from the rotation and carries on with whoever was next', async () => {
    await createChore({
      title: 'Bathroom',
      frequency: 'WEEKLY',
      startsOn: '2026-11-15',
      rotation: [melissa.id, leah.id, selena.id],
    });
    // Melissa was up first; she moves out.
    await melissa.delete(`/houses/${houseId}/members/me`);

    const res = await leah.get(`/houses/${houseId}/chores`);
    const [chore] = res.body.chores;
    expect(chore.rotation.map((u: { netid: string }) => u.netid)).toEqual([
      'lk452',
      'sc2291',
    ]);
    expect(who(chore.comingUp)).toEqual([
      '2026-11-15 lk452',
      '2026-11-22 sc2291',
      '2026-11-29 lk452',
    ]);
  });
});

describe('access', () => {
  it('hides other houses’ chores', async () => {
    const chore = await createChore({
      title: 'Bathroom',
      frequency: 'WEEKLY',
      startsOn: '2026-11-15',
      rotation: [leah.id],
    });
    const outsider = await signUp('xx111');
    await outsider.post('/houses', { name: 'Elsewhere' });
    expect(
      (await outsider.get(`/houses/${houseId}/chores/${chore.id}`)).status,
    ).toBe(404);
  });
});
