import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import * as auth from '../src/worker/auth';
import type { Env } from '../src/worker/env';
import { FirestoreClient } from '../src/worker/firestore';
import { createApiApp } from '../src/worker/routes';

const env = { FIREBASE_PROJECT_ID: 'test-project', SESSION_SIGNING_KEY: 'test-only-key', BREAKGLASS_SECRET: 'test-only-secret' } as Env;
const app = new Hono().route('/api', createApiApp());
afterEach(() => mock.restore());

function mockFirestore(active: boolean | undefined | null) {
  // Bypass credentials only; exercise the actual Firestore REST decoder.
  spyOn(FirestoreClient.prototype as unknown as { authHeaders(): Promise<HeadersInit> }, 'authHeaders').mockResolvedValue({});
  return spyOn(globalThis, 'fetch').mockImplementation(async () => active === null
    ? new Response(null, { status: 404 })
    : Response.json({ fields: active === undefined ? {} : { active: { booleanValue: active } } }));
}

async function session(uid: string, maxAge = 3600) {
  return (await auth.createSessionCookie(env, { uid, email: 'teacher@sst.edu.sg', surface: 'sso' }, maxAge)).split(';')[0];
}

for (const active of [false, true, undefined, null]) {
  test(`session issuance checks Firestore active=${active}`, async () => {
    const fetchMock = mockFirestore(active);
    spyOn(auth, 'verifyFirebaseIdToken').mockResolvedValue({ uid: 'teacher', email: 'teacher@sst.edu.sg' });
    const response = await app.request('/api/auth/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'test-token' }),
    }, env);
    expect(response.status).toBe(active === false ? 403 : 200);
    expect(response.headers.get('Set-Cookie') !== null).toBe(active !== false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toEndWith('/users/teacher');
  });
}

for (const path of ['/api/auth/me', '/api/users']) {
  test(`deactivated session is rejected and cleared on ${path}`, async () => {
    mockFirestore(false);
    const read = spyOn(FirestoreClient.prototype, 'listCollection').mockResolvedValue([]);
    const response = await app.request(path, { headers: { Cookie: await session(path) } }, env);
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toContain('trakr_ops_session=;');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(read).not.toHaveBeenCalled();
  });
}

test('concurrent requests share checks across routes, refresh at one minute, and isolate sessions', async () => {
  let now = Date.now();
  spyOn(Date, 'now').mockImplementation(() => now);
  const fetchMock = mockFirestore(true);
  spyOn(FirestoreClient.prototype, 'listCollection').mockResolvedValue([]);
  const cookie = await session('cached-teacher');
  const request = (path = '/api/auth/me', value = cookie) => app.request(path, { headers: { Cookie: value } }, env);
  const responses = await Promise.all([request(), request('/api/users'), request()]);
  expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockImplementation(async () => Response.json({ fields: { active: { booleanValue: false } } }));
  now += 59_999;
  expect((await request()).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await request('/api/auth/me', await session('cached-teacher', 7200))).status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  now += 1;
  const denied = await request('/api/users');
  expect(denied.status).toBe(401);
  expect(denied.headers.get('Set-Cookie')).toContain('Max-Age=0');
  expect((await request()).status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

for (const active of [undefined, null]) {
  test(`existing sessions allow legacy users with active=${active}`, async () => {
    const fetchMock = mockFirestore(active);
    const response = await app.request('/api/auth/me', { headers: { Cookie: await session(`legacy-${active}`) } }, env);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
}

test('Firestore errors fail closed instead of extending a cached allow', async () => {
  let now = Date.now();
  spyOn(Date, 'now').mockImplementation(() => now);
  const fetchMock = mockFirestore(true);
  spyOn(console, 'error').mockImplementation(() => {});
  const cookie = await session('read-failure');
  const request = () => app.request('/api/auth/me', { headers: { Cookie: cookie } }, env);
  expect((await request()).status).toBe(200);
  now += 60_000;
  fetchMock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
  expect((await request()).status).toBe(500);
  expect((await request()).status).toBe(500);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('breakglass access does not require a user document', async () => {
  const fetchMock = mockFirestore(false);
  spyOn(FirestoreClient.prototype, 'listCollection').mockResolvedValue([]);
  const response = await app.request('/api/users', { headers: { Authorization: `Bearer ${env.BREAKGLASS_SECRET}` } }, env);
  expect(response.status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
});
