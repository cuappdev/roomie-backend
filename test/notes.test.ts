import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../src/prisma.js';
import { formatDate, todayIn } from '../src/utils/dates.js';
import { signUp } from './helpers.js';

type Client = Awaited<ReturnType<typeof signUp>>;
let leah: Client, selena: Client, melissa: Client, base: string;

const DAY = 86_400_000;
const today = () => todayIn('America/New_York');
const inDays = (n: number) => formatDate(new Date(today().getTime() + n * DAY));

beforeEach(async () => {
  leah = await signUp('lk452');
  selena = await signUp('sc2291');
  melissa = await signUp('mv384');
  const house = (await leah.post('/houses', { name: 'The Linden Loft' })).body
    .house;
  await selena.post('/houses/join', { inviteCode: house.inviteCode });
  await melissa.post('/houses/join', { inviteCode: house.inviteCode });
  base = `/houses/${house.id}/notes`;
});

afterEach(() => {
  vi.useRealTimers();
});

const post = async (as: Client, body: object) => {
  const res = await as.post(base, body);
  expect(res.status).toBe(201);
  return res.body.note;
};

/** Moves a note's posting time back, as if it had been on the board that long. */
const age = (id: number, days: number) =>
  prisma.note.update({
    where: { id },
    data: { createdAt: new Date(Date.now() - days * DAY) },
  });

describe('posting notes', () => {
  it('posts a note with the author, an optional due date and a picked color', async () => {
    const note = await post(selena, {
      body: 'plumber coming thurs!',
      dueOn: inDays(2),
      notify: true,
    });
    expect(note).toMatchObject({
      body: 'plumber coming thurs!',
      color: 'YELLOW',
      dueOn: inDays(2),
      pinned: false,
      pinnedAt: null,
      author: { netid: 'sc2291' },
    });
    expect(note).not.toHaveProperty('houseId');
    expect(note).not.toHaveProperty('notify');
  });

  it('cycles colors so recent notes all look different', async () => {
    const colors = [];
    for (let i = 0; i < 7; i++) {
      colors.push((await post(leah, { body: `note ${i}` })).color);
    }
    expect(colors).toEqual([
      'YELLOW',
      'ORANGE',
      'BLUE',
      'GREEN',
      'PINK',
      'PURPLE',
      'YELLOW',
    ]);
    // A color the app chooses is kept.
    expect((await post(leah, { body: 'mine', color: 'PINK' })).color).toBe(
      'PINK',
    );
  });

  it('validates the body', async () => {
    expect((await leah.post(base, { body: '   ' })).status).toBe(400);
    expect((await leah.post(base, { body: 'x'.repeat(501) })).status).toBe(400);
    expect((await leah.post(base, { body: 'hi', color: 'RED' })).status).toBe(
      400,
    );
    expect((await leah.post(base, { body: 'hi', dueOn: '12/01' })).status).toBe(
      400,
    );
    const past = await leah.post(base, { body: 'hi', dueOn: inDays(-1) });
    expect(past.status).toBe(400);
    expect(past.body.errorCode).toBe('BAD_REQUEST');
    // Today is fine.
    expect(
      (await leah.post(base, { body: 'hi', dueOn: inDays(0) })).status,
    ).toBe(201);
  });
});

describe('the board', () => {
  it('shows pinned notes first, then the rest newest first', async () => {
    const rent = await post(melissa, {
      body: 'Rent is due dec 1',
      pinned: true,
    });
    await post(leah, { body: 'Mihili, thanks for cleaning!' });
    const movie = await post(selena, { body: 'Movie night Friday?' });
    expect(rent.pinned).toBe(true);

    const board = (await leah.get(base)).body;
    expect(board.pinned.map((n: { body: string }) => n.body)).toEqual([
      'Rent is due dec 1',
    ]);
    expect(board.notes.map((n: { body: string }) => n.body)).toEqual([
      'Movie night Friday?',
      'Mihili, thanks for cleaning!',
    ]);
    expect((await leah.get(`${base}/${movie.id}`)).body.note.body).toBe(
      'Movie night Friday?',
    );
  });

  it('drops notes after 14 days, unless they are pinned or not due yet', async () => {
    const old = await post(leah, { body: 'old news' });
    const pinned = await post(leah, { body: 'house rules', pinned: true });
    const due = await post(leah, { body: 'lease renewal', dueOn: inDays(3) });
    const fresh = await post(leah, { body: 'fresh' });
    for (const n of [old, pinned, due]) await age(n.id, 15);
    await age(fresh.id, 13);

    const board = (await selena.get(base)).body;
    expect(board.pinned.map((n: { id: number }) => n.id)).toEqual([pinned.id]);
    expect(board.notes.map((n: { id: number }) => n.id).sort()).toEqual(
      [due.id, fresh.id].sort(),
    );
    expect((await selena.get(`${base}/${old.id}`)).status).toBe(404);

    // Unpinning an old note takes it off the board.
    const unpinned = await selena.delete(`${base}/${pinned.id}/pin`);
    expect(unpinned.body.note.pinned).toBe(false);
    expect((await selena.get(`${base}/${pinned.id}`)).status).toBe(404);
  });
});

describe('editing, deleting and pinning', () => {
  it('lets only the author edit the message, due date and color', async () => {
    const note = await post(selena, { body: 'plumber coming thurs!' });
    const edited = await selena.patch(`${base}/${note.id}`, {
      body: 'plumber coming fri!',
      dueOn: inDays(3),
      color: 'GREEN',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.note).toMatchObject({
      body: 'plumber coming fri!',
      dueOn: inDays(3),
      color: 'GREEN',
    });
    const cleared = await selena.patch(`${base}/${note.id}`, { dueOn: null });
    expect(cleared.body.note.dueOn).toBeNull();

    const other = await melissa.patch(`${base}/${note.id}`, { body: 'nope' });
    expect(other.status).toBe(403);
    const past = await selena.patch(`${base}/${note.id}`, {
      dueOn: inDays(-2),
    });
    expect(past.status).toBe(400);
  });

  it('lets the author or the house owner delete', async () => {
    const a = await post(selena, { body: 'a' });
    const b = await post(selena, { body: 'b' });
    expect((await melissa.delete(`${base}/${a.id}`)).status).toBe(403);
    expect((await selena.delete(`${base}/${a.id}`)).status).toBe(204);
    // Leah created the house, so she owns it.
    expect((await leah.delete(`${base}/${b.id}`)).status).toBe(204);
    expect((await leah.get(base)).body.notes).toEqual([]);
  });

  it('lets any member pin and unpin; re-pinning moves a note to the top', async () => {
    const a = await post(selena, { body: 'a' });
    const b = await post(selena, { body: 'b' });
    await melissa.post(`${base}/${a.id}/pin`);
    await new Promise((r) => setTimeout(r, 5));
    await leah.post(`${base}/${b.id}/pin`);
    let board = (await leah.get(base)).body;
    expect(board.pinned.map((n: { id: number }) => n.id)).toEqual([b.id, a.id]);

    await new Promise((r) => setTimeout(r, 5));
    await leah.post(`${base}/${a.id}/pin`);
    board = (await leah.get(base)).body;
    expect(board.pinned.map((n: { id: number }) => n.id)).toEqual([a.id, b.id]);

    await melissa.delete(`${base}/${a.id}/pin`);
    board = (await leah.get(base)).body;
    expect(board.pinned.map((n: { id: number }) => n.id)).toEqual([b.id]);
    expect(board.notes.map((n: { id: number }) => n.id)).toEqual([a.id]);
  });
});

describe('membership', () => {
  it('keeps notes, with their name, after someone moves out', async () => {
    await post(melissa, { body: 'Love living with you all!' });
    await melissa.delete(`${base.replace('/notes', '')}/members/me`);
    const board = (await leah.get(base)).body;
    expect(board.notes[0].author).toMatchObject({ netid: 'mv384' });
  });

  it("can't see or touch another house's notes", async () => {
    const note = await post(selena, { body: 'secret' });
    const outsider = await signUp('xx111');
    const other = (await outsider.post('/houses', { name: 'Elsewhere' })).body
      .house;
    expect((await outsider.get(base)).status).toBe(404);
    expect(
      (await outsider.get(`/houses/${other.id}/notes/${note.id}`)).status,
    ).toBe(404);
    expect(
      (await outsider.post(`/houses/${other.id}/notes/${note.id}/pin`)).status,
    ).toBe(404);
  });
});
