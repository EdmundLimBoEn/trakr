import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import { FirestoreClient } from '../src/worker/firestore';
import {
  forceReturnClaims, retireEquipment, setUserActive, updateEquipment, updateFlags, updateIssueStatus,
} from '../src/worker/ops';
import { createApiApp } from '../src/worker/routes';

const actor = { uid: 'teacher', email: 'teacher@example.test', surface: 'sso' as const };
const iso = '2026-09-22T12:34:56.789Z';
type Fields = Record<string, Record<string, unknown>>;
type Write = { update?: { name: string; fields: Fields } };
afterEach(() => mock.restore());

function setup() {
  // Bypass credentials only; keep the real Firestore encoder, decoder and HTTP bodies.
  spyOn(FirestoreClient.prototype as unknown as { authHeaders(): Promise<HeadersInit> }, 'authHeaders')
    .mockResolvedValue({});
  const commits: Write[] = [];
  const patches: Array<{ path: string; fields: Fields }> = [];
  const documents: Record<string, Fields> = {
    'equipment/camera': {
      status: { stringValue: 'active' }, activeTagId: { stringValue: 'tag' },
      normalizedInternalSerial: { stringValue: 'OLD' }, enrolledAt: { timestampValue: iso },
    },
    'claims/loan': {
      status: { stringValue: 'active' }, checkedOutAt: { timestampValue: iso },
      returnedAt: { nullValue: null },
    },
    'issues/issue': { status: { stringValue: 'open' }, reportedAt: { timestampValue: iso } },
    'users/student': { lastLoginAt: { timestampValue: iso } },
    'config/featureFlags': { updatedAt: { timestampValue: iso } },
  };
  const prefix = 'projects/test/databases/(default)/documents/';
  spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.split('/documents/')[1];
    if (url.pathname.endsWith('/documents:commit')) {
      const body = JSON.parse(String(init?.body)) as { writes: Write[] };
      commits.push(...body.writes);
      for (const write of body.writes) {
        if (write.update) {
          const key = write.update.name.slice(prefix.length);
          documents[key] = { ...documents[key], ...write.update.fields };
        }
      }
      return Response.json({});
    }
    if (init?.method === 'PATCH') {
      const { fields } = JSON.parse(String(init.body));
      patches.push({ path, fields });
      documents[path] = { ...documents[path], ...fields };
      return Response.json({});
    }
    if (init?.method && init.method !== 'GET') throw new Error(`Unexpected method: ${init.method}`);
    if (path && !path.includes('/')) {
      return Response.json({ documents: Object.entries(documents)
        .filter(([key]) => key.startsWith(`${path}/`))
        .map(([key, fields]) => ({ name: prefix + key, fields })) });
    }
    return documents[path]
      ? Response.json({ name: prefix + path, fields: documents[path] })
      : new Response(null, { status: 404 });
  });
  return { db: new FirestoreClient('test', '{}'), commits, patches, documents };
}

function expectTimestamp(value: Record<string, unknown> | undefined) {
  expect(value).toEqual({ timestampValue: expect.any(String) });
  expect(new Date(value!.timestampValue as string).toISOString()).toBe(value!.timestampValue);
}

function expectAudit(patches: Array<{ path: string; fields: Fields }>) {
  const audits = patches.filter(p => p.path.startsWith('auditEvents/'));
  expect(audits).toHaveLength(1);
  expectTimestamp(audits[0].fields.createdAt);
}

test('equipment edit encodes update, serial creation and audit timestamps', async () => {
  const { db, commits, patches } = setup();
  const result = await updateEquipment(db, 'camera', { name: 'Camera', internalSerial: 'NEW' }, actor);
  const equipment = commits.find(w => w.update?.name.endsWith('/equipment/camera'))!.update!;
  const serial = commits.find(w => w.update?.name.endsWith('/equipmentSerials/NEW'))!.update!;
  expectTimestamp(equipment.fields.updatedAt);
  expectTimestamp(serial.fields.createdAt);
  expect(equipment.fields.name).toEqual({ stringValue: 'Camera' });
  expect(result.updatedAt).toBe(equipment.fields.updatedAt.timestampValue);
  expect(result.enrolledAt).toBe(iso);
  expectAudit(patches);
});

test('return encodes the same timestamp for batch and claim, plus audit timestamp', async () => {
  const { db, commits, patches } = setup();
  const result = await forceReturnClaims(db, ['loan'], actor);
  expect(result.returned).toBe(1);
  expectTimestamp(commits[0].update!.fields.createdAt);
  expectTimestamp(commits[1].update!.fields.returnedAt);
  expect(commits[1].update!.fields.returnedAt).toEqual(commits[0].update!.fields.createdAt);
  expectAudit(patches);
});

test('issue resolution encodes resolution and audit timestamps and returns an ISO string', async () => {
  const { db, commits, patches } = setup();
  const result = await updateIssueStatus(db, 'issue', 'resolved', actor);
  expectTimestamp(commits[0].update!.fields.resolvedAt);
  expect(result.resolvedAt).toBe(commits[0].update!.fields.resolvedAt.timestampValue);
  expect(result.reportedAt).toBe(iso);
  expectAudit(patches);
});

test('retirement encodes tag replacement, equipment update and audit timestamps', async () => {
  const { db, commits, patches } = setup();
  await retireEquipment(db, 'camera', actor);
  expectTimestamp(commits.find(w => w.update?.name.endsWith('/tags/tag'))!.update!.fields.replacedAt);
  expectTimestamp(commits.find(w => w.update?.name.endsWith('/equipment/camera'))!.update!.fields.updatedAt);
  expectAudit(patches);
});

test('feature flag updates encode timestamps and return ISO strings', async () => {
  const { db, patches } = setup();
  const result = await updateFlags(db, { isDemo: true }, actor);
  expectTimestamp(patches[0].fields.updatedAt);
  expect(result.updatedAt).toBe(patches[0].fields.updatedAt.timestampValue);
  expectAudit(patches);
});

test('user updates encode update and audit timestamps', async () => {
  const { db, patches } = setup();
  await setUserActive(db, 'student', 'users', false, actor);
  expectTimestamp(patches[0].fields.updatedAt);
  expectAudit(patches);
});

test('API reads native Firestore timestamps as ISO strings and preserves null timestamps', async () => {
  const { documents } = setup();
  documents['equipment/camera'].updatedAt = { timestampValue: iso };
  documents['issues/issue'].resolvedAt = { timestampValue: iso };
  const app = new Hono().route('/api', createApiApp());
  const env = { FIREBASE_PROJECT_ID: 'test', BREAKGLASS_SECRET: 'test-only-token' };
  const headers = { Authorization: 'Bearer test-only-token' };
  for (const [collection, expected] of [
    ['equipment', { enrolledAt: iso, updatedAt: iso }],
    ['claims', { checkedOutAt: iso, returnedAt: null }],
    ['issues', { reportedAt: iso, resolvedAt: iso }],
    ['users', { lastLoginAt: iso }],
  ] as const) {
    const response = await app.request(`/api/${collection}`, { headers }, env);
    expect(response.status).toBe(200);
    expect((await response.json())[0]).toMatchObject(expected);
  }
});
