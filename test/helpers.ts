import request from 'supertest';

import { createApp } from '../src/app.js';

export const app = createApp();

/** A signed-in client for a NetID, using the dev auth bypass. */
export const as = (netid: string) => {
  const auth = { Authorization: `Bearer dev:${netid}` };
  return {
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) =>
      request(app)
        .post(url)
        .set(auth)
        .send(body ?? {}),
    patch: (url: string, body?: object) =>
      request(app)
        .patch(url)
        .set(auth)
        .send(body ?? {}),
    delete: (url: string) => request(app).delete(url).set(auth),
  };
};

/** Signs a user up (POST /auth/login) and returns their client + user id. */
export const signUp = async (netid: string) => {
  const client = as(netid);
  const res = await client.post('/auth/login');
  if (res.status >= 300)
    throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return { ...client, id: res.body.user.id as number, netid };
};
