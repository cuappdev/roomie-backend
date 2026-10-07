import { beforeEach, describe, expect, it } from 'vitest';

import { signUp } from './helpers.js';

type Client = Awaited<ReturnType<typeof signUp>>;
let leah: Client, selena: Client, melissa: Client, base: string;

beforeEach(async () => {
  leah = await signUp('lk452');
  selena = await signUp('sc2291');
  melissa = await signUp('mv384');
  const house = (await leah.post('/houses', { name: 'The Linden Loft' })).body
    .house;
  await selena.post('/houses/join', { inviteCode: house.inviteCode });
  await melissa.post('/houses/join', { inviteCode: house.inviteCode });
  base = `/houses/${house.id}/shopping-items`;
});

const add = async (as: Client, name: string, category?: string) => {
  const res = await as.post(base, { name, ...(category && { category }) });
  expect(res.status).toBe(201);
  return res.body.item;
};

describe('shopping list', () => {
  it('adds items and shows who added them', async () => {
    const eggs = await add(melissa, 'Eggs (dozen)');
    expect(eggs).toMatchObject({
      name: 'Eggs (dozen)',
      category: 'GROCERIES',
      status: 'NEEDED',
      addedBy: { netid: 'mv384' },
      claimedBy: null,
    });
    expect(eggs).not.toHaveProperty('houseId');

    await add(selena, 'Dish soap', 'HOUSEHOLD');
    const list = await leah.get(base);
    expect(list.body.needed.map((i: { name: string }) => i.name)).toEqual([
      'Eggs (dozen)',
      'Dish soap',
    ]);

    const household = await leah.get(`${base}?category=HOUSEHOLD`);
    expect(household.body.needed).toHaveLength(1);
  });

  it('"I\'ll get it" claims and unclaims', async () => {
    const soap = await add(selena, 'Dish soap', 'HOUSEHOLD');
    const claimed = await leah.post(`${base}/${soap.id}/claim`);
    expect(claimed.body.item.claimedBy).toMatchObject({ netid: 'lk452' });
    const unclaimed = await leah.delete(`${base}/${soap.id}/claim`);
    expect(unclaimed.body.item.claimedBy).toBeNull();
  });

  it('buying moves items to "Bought" and totals what you can split', async () => {
    const apples = await add(leah, 'Apples');
    const milk = await add(leah, 'Whole milk');
    const towels = await add(leah, 'Paper towels', 'HOUSEHOLD');
    const eggs = await add(melissa, 'Eggs');

    await leah.post(`${base}/${apples.id}/buy`, { priceCents: 429 });
    await leah.post(`${base}/${milk.id}/buy`, { priceCents: 399 });
    await leah.post(`${base}/${towels.id}/buy`); // price added later
    await leah.patch(`${base}/${towels.id}`, { priceCents: 649 });
    await selena.post(`${base}/${eggs.id}/buy`, { priceCents: 500 });

    const list = (await leah.get(base)).body;
    expect(list.needed).toEqual([]);
    expect(list.bought).toHaveLength(4);
    expect(list.bought[0]).toMatchObject({
      status: 'BOUGHT',
      boughtBy: expect.any(Object),
    });
    // The design's "Split $14.77 as a bill": only Leah's priced purchases.
    expect(list.billable).toEqual({
      itemIds: expect.arrayContaining([apples.id, milk.id, towels.id]),
      totalCents: 1477,
    });
    expect(list.billable.itemIds).toHaveLength(3);
  });

  it('buying clears the claim, and can be undone', async () => {
    const soap = await add(selena, 'Dish soap');
    await leah.post(`${base}/${soap.id}/claim`);
    const bought = await leah.post(`${base}/${soap.id}/buy`, {
      priceCents: 300,
    });
    expect(bought.body.item).toMatchObject({
      claimedBy: null,
      boughtBy: { netid: 'lk452' },
    });
    expect((await leah.post(`${base}/${soap.id}/buy`)).status).toBe(400);

    const undone = await leah.delete(`${base}/${soap.id}/buy`);
    expect(undone.body.item).toMatchObject({
      status: 'NEEDED',
      boughtBy: null,
      priceCents: null,
    });
  });

  it('validates prices as whole cents', async () => {
    const soap = await add(selena, 'Dish soap');
    const res = await leah.post(`${base}/${soap.id}/buy`, { priceCents: 3.5 });
    expect(res.status).toBe(400);
  });

  it('deletes items', async () => {
    const soap = await add(selena, 'Dish soap');
    expect((await leah.delete(`${base}/${soap.id}`)).status).toBe(204);
    expect((await leah.get(base)).body.needed).toEqual([]);
  });

  it('releases claims when someone moves out', async () => {
    const soap = await add(selena, 'Dish soap');
    await melissa.post(`${base}/${soap.id}/claim`);
    const houseId = base.split('/')[2];
    await melissa.delete(`/houses/${houseId}/members/me`);
    const list = (await leah.get(base)).body;
    expect(list.needed[0].claimedBy).toBeNull();
  });

  it("can't touch another house's list", async () => {
    const soap = await add(selena, 'Dish soap');
    const outsider = await signUp('xx111');
    const other = (await outsider.post('/houses', { name: 'Elsewhere' })).body
      .house;
    const res = await outsider.post(
      `/houses/${other.id}/shopping-items/${soap.id}/buy`,
    );
    expect(res.status).toBe(404);
    expect((await outsider.get(base)).status).toBe(404);
  });
});
