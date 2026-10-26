import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import { equipmentState } from '../src/shared/live';
import type { EquipmentRecord, ClaimRecord } from '../src/shared/types';
import { FirestoreClient } from '../src/worker/firestore';
import { createApiApp } from '../src/worker/routes';

const equipment = { equipmentId: 'camera', status: 'active' } as EquipmentRecord;
const now = new Date('2026-09-22T12:00:00Z');
const claim = { claimId: 'loan', equipmentId: 'camera', status: 'active', checkedOutAt: '2026-09-22T11:00:00Z' } as ClaimRecord;
afterEach(() => mock.restore());

test('checkout, overdue threshold, multiple claims, return and retirement states', () => {
  expect(equipmentState(equipment, [], now)).toBe('available');
  expect(equipmentState(equipment, [claim], now)).toBe('checked-out');
  expect(equipmentState(equipment, [{ ...claim, checkedOutAt: '2026-09-21T12:00:01Z' }], now)).toBe('checked-out');
  expect(equipmentState(equipment, [claim, { ...claim, checkedOutAt: '2026-09-21T12:00:00Z' }], now)).toBe('overdue');
  expect(equipmentState(equipment, [{ ...claim, status: 'returned' }], now)).toBe('available');
  expect(equipmentState(equipment, [{ ...claim, equipmentId: 'other' }], now)).toBe('available');
  expect(equipmentState({ ...equipment, status: 'retired' }, [claim], now)).toBe('retired');
});

const env = { FIREBASE_PROJECT_ID: 'test-project', BREAKGLASS_SECRET: 'test-only-token', SESSION_SIGNING_KEY: 'test-only-key' };
let app: Hono;
beforeEach(() => { app = new Hono().route('/api', createApiApp()); });

test('admin reads and writes still require authentication', async () => {
  const read = spyOn(FirestoreClient.prototype, 'listCollection');
  for (const [path, method] of [['/api/equipment', 'GET'], ['/api/users', 'GET'], ['/api/claims', 'GET'], ['/api/equipment/camera', 'PATCH'], ['/api/claims/return', 'POST'], ['/api/live', 'POST']]) {
    const response = await app.request(path, { method }, env);
    expect(response.status).toBe(401);
  }
  expect(read).not.toHaveBeenCalled();
});

test('live endpoint returns real collection results with a public five-second cache', async () => {
  spyOn(FirestoreClient.prototype, 'listCollection').mockImplementation(async collection =>
    collection === 'equipment' ? [{ id: 'camera', name: 'Camera', status: 'active' }] : []);
  const response = await app.request('/api/live', {}, env);
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=5');
  expect(data.projectId).toBe('test-project');
  expect(data.equipment[0].equipmentId).toBe('camera');
  expect(data.claims).toEqual([]);
  expect(Number.isFinite(Date.parse(data.readAt))).toBe(true);
});

test('failed collection reads do not return partial data or a success timestamp', async () => {
  spyOn(console, 'error').mockImplementation(() => {});
  spyOn(FirestoreClient.prototype, 'listCollection').mockRejectedValue(new Error('private database error'));
  const response = await app.request('/api/live', {}, env);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private database error');
});

test('collection reads follow every page and reject failures on later pages', async () => {
  const db = new FirestoreClient('test', '{}');
  // Bypass credentials only; exercise the real REST pagination implementation.
  spyOn(db as unknown as { authHeaders(): Promise<HeadersInit> }, 'authHeaders').mockResolvedValue({});
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
    documents: [{ name: 'projects/test/documents/equipment/first', fields: { name: { stringValue: 'First' } } }], nextPageToken: 'page+2',
  })).mockResolvedValueOnce(Response.json({ documents: [{ name: 'projects/test/documents/equipment/last' }] }));
  expect((await db.listCollection('equipment')).map(r => r.id)).toEqual(['first', 'last']);
  expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=page%2B2');
  fetchMock.mockResolvedValueOnce(Response.json({ nextPageToken: 'more' })).mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
  await expect(db.listCollection('equipment')).rejects.toThrow('503');
});


test('public live response excludes identities and private issue text at the API boundary', async () => {
  spyOn(FirestoreClient.prototype, 'listCollection').mockImplementation(async collection => {
    if (collection === 'equipment') return [{ id: 'camera', enrolledBy: 'PRIVATE', updatedBy: 'PRIVATE' }];
    if (collection === 'claims') return [{ id: 'loan', equipmentId: 'camera', studentUid: 'PRIVATE', studentEmail: 'PRIVATE', issueText: 'PRIVATE', returnedByTeacherUid: 'PRIVATE' }];
    return [{ id: 'issue', equipmentId: 'camera', text: 'PRIVATE', reportedByStudentUid: 'PRIVATE', resolvedByTeacherUid: 'PRIVATE' }];
  });
  const response = await app.request('/api/live', {}, env);
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain('PRIVATE');
  const data = JSON.parse(text);
  expect(Object.keys(data.claims[0]).sort()).toEqual(['claimId', 'equipmentId', 'status', 'condition', 'checkedOutAt', 'returnedAt'].sort());
  expect(Object.keys(data.issues[0]).sort()).toEqual(['issueId', 'equipmentId', 'status', 'reportedAt', 'resolvedAt'].sort());
});


test('concurrent live requests and reads within five seconds share one completed snapshot', async () => {
  let time = 1_000;
  spyOn(Date, 'now').mockImplementation(() => time);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const read = spyOn(FirestoreClient.prototype, 'listCollection').mockImplementation(async collection => {
    await gate;
    return collection === 'equipment' ? [{ id: 'camera', name: `Camera ${time}` }] : [];
  });
  const first = app.request('/api/live', {}, env);
  const second = app.request('/api/live', {}, env);
  // A load lasting longer than the TTL must still be shared while in flight.
  time += 6_000;
  const third = app.request('/api/live', {}, env);
  release();
  const responses = await Promise.all([first, second, third]);
  expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
  const snapshots = await Promise.all(responses.map(response => response.json()));
  expect(snapshots[1]).toEqual(snapshots[0]);
  expect(snapshots[2]).toEqual(snapshots[0]);
  expect(read.mock.calls.map(([collection]) => collection).sort()).toEqual(['claims', 'equipment', 'issues']);
  expect(await (await app.request('/api/live', {}, env)).json()).toEqual(snapshots[0]);
  time += 4_999;
  expect(await (await app.request('/api/live', {}, env)).json()).toEqual(snapshots[0]);
  expect(read).toHaveBeenCalledTimes(3);
  time += 1;
  const refreshed = await (await app.request('/api/live', {}, env)).json();
  expect(read).toHaveBeenCalledTimes(6);
  expect(refreshed.equipment[0].name).toBe(`Camera ${time}`);
  expect(refreshed.equipment).not.toEqual(snapshots[0].equipment);
});

test('failed live loads are not cached and the next request retries', async () => {
  spyOn(console, 'error').mockImplementation(() => {});
  const read = spyOn(FirestoreClient.prototype, 'listCollection').mockRejectedValue(new Error('test failure'));
  const failed = await app.request('/api/live', {}, env);
  expect(failed.status).toBe(503);
  expect(failed.headers.get('Cache-Control')).toBe('no-store');
  read.mockResolvedValue([]);
  const retried = await app.request('/api/live', {}, env);
  expect(retried.status).toBe(200);
  expect(read).toHaveBeenCalledTimes(6);
});
