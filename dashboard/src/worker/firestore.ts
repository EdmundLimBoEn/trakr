import type { ServiceAccount } from "./env";
import { base64UrlToBytes, bytesToBase64Url, textToBase64Url } from "./crypto";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/** Decode standard base64 PEM body (not url-safe). */
function pemBodyToBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemBodyToBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createServiceAccountJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textToBase64Url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/datastore",
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${bytesToBase64Url(signature)}`;
}

export async function getAccessToken(saJson: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }
  const sa = JSON.parse(saJson) as ServiceAccount;
  const jwt = await createServiceAccountJwt(sa);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token-exchange-failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

export function fromFirestoreValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) {
    const fields = value.mapValue.fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
    return out;
  }
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map((v) => fromFirestoreValue(v));
  }
  return undefined;
}

export function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } };
  }
  if (typeof value === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

export function docToObject(doc: {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}): Record<string, unknown> & { __name?: string } {
  const out: Record<string, unknown> & { __name?: string } = {};
  if (doc.name) out.__name = doc.name;
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

export function objectToFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function docIdFromName(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

export class FirestoreClient {
  constructor(
    private readonly projectId: string,
    private readonly saJson: string,
  ) {}

  private base(): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  private async authHeaders(): Promise<HeadersInit> {
    const token = await getAccessToken(this.saJson);
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async getDoc(path: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${this.base()}/${path}`, { headers: await this.authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`firestore-get ${path}: ${res.status} ${await res.text()}`);
    const doc = (await res.json()) as { name?: string; fields?: Record<string, FirestoreValue> };
    return docToObject(doc);
  }

  async setDoc(path: string, data: Record<string, unknown>, merge = false): Promise<void> {
    const fields = objectToFields(data);
    const updateMask = merge
      ? `?${Object.keys(data)
          .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
          .join("&")}`
      : "";
    const res = await fetch(`${this.base()}/${path}${updateMask}`, {
      method: "PATCH",
      headers: await this.authHeaders(),
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`firestore-set ${path}: ${res.status} ${await res.text()}`);
  }

  async deleteDoc(path: string): Promise<void> {
    const res = await fetch(`${this.base()}/${path}`, {
      method: "DELETE",
      headers: await this.authHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`firestore-delete ${path}: ${res.status} ${await res.text()}`);
    }
  }

  async listCollection(
    collection: string,
    opts?: { pageSize?: number; orderBy?: string },
  ): Promise<Array<Record<string, unknown> & { id: string }>> {
    const params = new URLSearchParams();
    params.set("pageSize", String(opts?.pageSize ?? 500));
    if (opts?.orderBy) params.set("orderBy", opts.orderBy);
    const qs = params.toString();
    const res = await fetch(`${this.base()}/${collection}?${qs}`, {
      headers: await this.authHeaders(),
    });
    if (!res.ok) throw new Error(`firestore-list ${collection}: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as {
      documents?: Array<{ name: string; fields?: Record<string, FirestoreValue> }>;
    };
    return (body.documents ?? []).map((doc) => {
      const obj = docToObject(doc);
      return { ...obj, id: docIdFromName(doc.name) };
    });
  }

  async runQuery(
    structuredQuery: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown> & { id: string }>> {
    const res = await fetch(`${this.base()}:runQuery`, {
      method: "POST",
      headers: await this.authHeaders(),
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) throw new Error(`firestore-query: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{
      document?: { name: string; fields?: Record<string, FirestoreValue> };
    }>;
    return rows
      .filter((r) => r.document)
      .map((r) => {
        const doc = r.document!;
        const obj = docToObject(doc);
        return { ...obj, id: docIdFromName(doc.name) };
      });
  }

  async commit(writes: Array<Record<string, unknown>>): Promise<void> {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:commit`,
      {
        method: "POST",
        headers: await this.authHeaders(),
        body: JSON.stringify({ writes }),
      },
    );
    if (!res.ok) throw new Error(`firestore-commit: ${res.status} ${await res.text()}`);
  }

  docName(path: string): string {
    return `projects/${this.projectId}/databases/(default)/documents/${path}`;
  }
}
