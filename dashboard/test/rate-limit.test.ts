import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import { checkRateLimit, createEmergencyCookie, createSessionCookie } from '../src/worker/auth';
import type { Env } from '../src/worker/env';
import { FirestoreClient } from '../src/worker/firestore';
import { createApiApp } from '../src/worker/routes';

const env = { FIREBASE_PROJECT_ID: 'test-project', BREAKGLASS_SECRET: 'test-only-token', SESSION_SIGNING_KEY: 'test-only-key' } as Env;
const app = new Hono().route('/api', createApiApp());
let now = Date.now();
beforeEach(() => {
  now += 120_000;
  spyOn(Date, 'now').mockImplementation(() => now);
  checkRateLimit('cleanup', false);
});
afterEach(() => mock.restore());

function request(token = 'wrong', ip = '192.0.2.1', path = '/api/equipment') {
  return app.request(path, { headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': ip } }, env);
}

test('failed bearer attempts are limited per IP across protected routes and unlock', async () => {
  const read = spyOn(FirestoreClient.prototype, 'listCollection').mockResolvedValue([]);
  for (let i = 0; i < 10; i++) expect((await request()).status).toBe(401);
  const limited = await request();
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ error: 'rate-limited' });
  expect((await request('wrong', '192.0.2.1', '/api/users')).status).toBe(429);
  expect((await app.request('/api/unlock', {
    method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify({ token: 'wrong' }),
  }, env)).status).toBe(429);
  // A saturated bucket is rejected before reading the comparison secret.
  const guardedEnv = { ...env, get BREAKGLASS_SECRET(): string { throw new Error('comparison reached'); } };
  expect((await app.request('/api/equipment', {
    headers: { Authorization: 'Bearer wrong', 'CF-Connecting-IP': '192.0.2.1' },
  }, guardedEnv)).status).toBe(429);
  expect((await request('wrong', '192.0.2.2')).status).toBe(401);
  expect(read).not.toHaveBeenCalled();
  now += 60_000;
  expect((await request()).status).toBe(401);
});

test('successful bearer requests do not consume the failure budget', async () => {
  spyOn(FirestoreClient.prototype, 'listCollection').mockResolvedValue([]);
  for (let i = 0; i < 15; i++) expect((await request(env.BREAKGLASS_SECRET)).status).toBe(200);
  for (let i = 0; i < 9; i++) expect((await request()).status).toBe(401);
  expect((await request(env.BREAKGLASS_SECRET)).status).toBe(200);
  expect((await request()).status).toBe(401);
  expect((await request()).status).toBe(429);
});

test('valid sessions still work when bearer attempts are limited', async () => {
  spyOn(FirestoreClient.prototype, 'listCollection').mockResolvedValue([]);
  // SSO sessions also confirm the user is still active.
  spyOn(FirestoreClient.prototype, 'getDoc').mockResolvedValue({ active: true });
  for (let i = 0; i < 10; i++) await request();
  for (const cookie of [
    await createEmergencyCookie(env, 3600),
    await createSessionCookie(env, { uid: 'test', email: 'test@example.com', surface: 'sso' }, 3600),
  ]) {
    const response = await app.request('/api/equipment', {
      headers: { Cookie: cookie.split(';')[0], Authorization: 'Bearer wrong', 'CF-Connecting-IP': '192.0.2.1' },
    }, env);
    expect(response.status).toBe(200);
  }
});

test('expired buckets are deleted even when their IP never returns', () => {
  checkRateLimit('expired-client');
  now += 30_000;
  for (let i = 0; i < 10; i++) checkRateLimit('active-client');
  const remove = spyOn(Map.prototype, 'delete');
  now += 30_000;
  checkRateLimit('new-client');
  expect(remove).toHaveBeenCalledWith('expired-client');
  expect(remove).not.toHaveBeenCalledWith('active-client');
  expect(checkRateLimit('active-client')).toBe(false);
});

test('bucket storage is capped by evicting the oldest entry', () => {
  for (let i = 0; i < 10; i++) checkRateLimit('oldest-client');
  for (let i = 0; i < 9_999; i++) checkRateLimit(`client-${i}`);
  expect(checkRateLimit('oldest-client', false)).toBe(false);
  const remove = spyOn(Map.prototype, 'delete');
  checkRateLimit('overflow-client');
  expect(remove).toHaveBeenCalledWith('oldest-client');
  expect(checkRateLimit('oldest-client', false)).toBe(true);
});
