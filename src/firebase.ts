import { readFileSync } from 'fs';
import { resolve } from 'path';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Firebase Admin is initialized lazily so the server (and tests) can run with
 * the dev auth bypass before anyone has set up a Firebase project.
 *
 * Credentials, in order of preference (same as Resell):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  stringified service-account JSON (good for hosted envs)
 *   FIREBASE_SERVICE_ACCOUNT_PATH  path to the JSON file (good for local dev / Docker volume)
 */
const loadServiceAccount = (): ServiceAccount => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const path = resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      './firebase-service-account.json',
  );
  return JSON.parse(readFileSync(path, 'utf8'));
};

export const getFirebaseAuth = () => {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(loadServiceAccount()) });
  }
  return getAuth();
};
