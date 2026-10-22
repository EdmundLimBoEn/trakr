import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import { normalizeSerial } from '../src/shared/types';
import { FirestoreClient } from '../src/worker/firestore';
import { createApiApp } from '../src/worker/routes';

const env = { FIREBASE_PROJECT_ID: 'test-project', BREAKGLASS_SECRET: 'test-only-token', SESSION_SIGNING_KEY: 'test-only-key' };
const app = new Hono().route('/api', createApiApp());
const headers = { Authorization: 'Bearer test-only-token', 'Content-Type': 'application/json' };
afterEach(() => mock.restore());

function request(path: string, body: unknown, method = 'POST') {
  return app.request(`/api${path}`, { method, headers, body: JSON.stringify(body) }, env);
}

test('serials match the rules and reject document paths', async () => {
  for (const serial of ['A/B/C', '.', 'A.B', 'A B', 'é', 'A'.repeat(51)]) {
    expect(() => normalizeSerial(serial)).toThrow('invalid-serial');
  }
  expect(normalizeSerial(' ab_12-Z ')).toEqual({ display: 'ab_12-Z', normalized: 'AB_12-Z' });
  const read = spyOn(FirestoreClient.prototype, 'getDoc').mockResolvedValue({ status: 'active' });
  const commit = spyOn(FirestoreClient.prototype, 'commit').mockResolvedValue();
  const response = await request('/equipment/camera', { internalSerial: 'A/B/C' }, 'PATCH');
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid-serial' });
  expect(read).toHaveBeenCalledTimes(1);
  expect(commit).not.toHaveBeenCalled();
});

test('claim IDs are bounded, distinct single document IDs before any reads', async () => {
  const read = spyOn(FirestoreClient.prototype, 'getDoc').mockResolvedValue({ status: 'active' });
  spyOn(FirestoreClient.prototype, 'commit').mockResolvedValue();
  spyOn(FirestoreClient.prototype, 'setDoc').mockResolvedValue();
  for (const claimIds of [Array.from({ length: 401 }, (_, i) => `id-${i}`), 'abc', {}, [], ['a', 'a'], [''], ['a/b'], ['.'], ['..'], [1], [null], ['é'.repeat(751)]]) {
    const response = await request('/claims/return', { claimIds });
    expect(response.status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  }
});

test('400 valid claim IDs and a 1500-byte ID still return successfully', async () => {
  const read = spyOn(FirestoreClient.prototype, 'getDoc').mockResolvedValue({ status: 'active' });
  spyOn(FirestoreClient.prototype, 'commit').mockResolvedValue();
  spyOn(FirestoreClient.prototype, 'setDoc').mockResolvedValue();
  const claimIds = Array.from({ length: 400 }, (_, i) => `id-${i}`);
  claimIds[0] = 'é'.repeat(750);
  const response = await request('/claims/return', { claimIds });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ batchId: expect.any(String), returned: 400 });
  expect(read).toHaveBeenCalledTimes(400);
});

test('all JSON handlers reject streamed bodies over 64 KiB, regardless of content length', async () => {
  const read = spyOn(FirestoreClient.prototype, 'getDoc');
  for (const [path, method] of [['/auth/session', 'POST'], ['/unlock', 'POST'], ['/flags', 'PUT'], ['/equipment/camera', 'PATCH'], ['/claims/return', 'POST'], ['/issues/issue', 'PATCH'], ['/users/user', 'PATCH']]) {
    let cancelled = false;
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks++;
        controller.enqueue(new TextEncoder().encode(' '.repeat(32768)));
      },
      cancel() { cancelled = true; },
    });
    const response = await app.request(`/api${path}`, { method, headers: { ...headers, 'Content-Length': '1' }, body, duplex: 'half' } as RequestInit, env);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'body-too-large' });
    expect(cancelled).toBe(true);
    expect(chunks).toBeLessThanOrEqual(4);
  }
  expect(read).not.toHaveBeenCalled();
});

test('64 KiB JSON is accepted and multibyte bodies are limited by bytes', async () => {
  const json = JSON.stringify({ token: env.BREAKGLASS_SECRET });
  const response = await app.request('/api/unlock', { method: 'POST', headers, body: json.padEnd(65536) }, env);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  const oversized = await request('/unlock', { token: env.BREAKGLASS_SECRET, padding: 'é'.repeat(32768) });
  expect(oversized.status).toBe(413);
  const malformed = await app.request('/api/auth/session', { method: 'POST', headers, body: '{' }, env);
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toEqual({ error: 'missing-id-token' });
});

test('Firestore URL paths encode individual segments without encoding separators', async () => {
  const db = new FirestoreClient('test', '{}');
  spyOn(db as unknown as { authHeaders(): Promise<HeadersInit> }, 'authHeaders').mockResolvedValue({});
  const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
  const path = 'equipment/a?#% é/subcollection/child';
  const encoded = '/equipment/a%3F%23%25%20%C3%A9/subcollection/child';
  await db.getDoc(path);
  await db.setDoc(path, { name: 'Camera' }, true);
  await db.deleteDoc(path);
  await db.listCollection(path);
  for (const [url] of fetchMock.mock.calls) expect(String(url)).toContain(`/documents${encoded}`);
  expect(String(fetchMock.mock.calls[1][0])).toEndWith('?updateMask.fieldPaths=name');
  expect(String(fetchMock.mock.calls[3][0])).toEndWith('?pageSize=500');
  expect(db.docName(path)).toBe(`projects/test/databases/(default)/documents/${path}`);
});
