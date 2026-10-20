import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app, as, signUp } from './helpers.js';

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  it('rejects garbage tokens', async () => {
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });

  it('creates the account on first login, then logs in', async () => {
    const first = await as('lk452').post('/auth/login');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      isNewUser: true,
      user: { netid: 'lk452', email: 'lk452@cornell.edu', presence: 'HOME' },
      house: null,
      pendingInvites: [],
    });

    const again = await as('lk452').post('/auth/login');
    expect(again.status).toBe(200);
    expect(again.body.isNewUser).toBe(false);
    expect(again.body.user.id).toBe(first.body.user.id);
  });

  it('requires login before other routes', async () => {
    const res = await as('zz999').get('/users/me');
    expect(res.status).toBe(403);
  });

  it('never accepts dev tokens in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await as('lk452').post('/auth/login');
      expect(res.status).toBe(401);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('users', () => {
  it('updates profile and presence', async () => {
    const leah = await signUp('lk452');
    const res = await leah.patch('/users/me', {
      name: 'Leah Kim',
      presence: 'AWAY',
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Leah Kim', presence: 'AWAY' });
  });

  it('validates input', async () => {
    const leah = await signUp('lk452');
    const res = await leah.patch('/users/me', { presence: 'ASLEEP' });
    expect(res.status).toBe(400);
    expect(res.body.data).toHaveProperty('body.presence');
  });
});

describe('server', () => {
  it('reports health', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toMatchObject({
      status: 'healthy',
      database: 'connected',
    });
  });

  it('404s unknown routes', async () => {
    const leah = await signUp('lk452');
    expect((await leah.get('/nope')).status).toBe(404);
  });
});
