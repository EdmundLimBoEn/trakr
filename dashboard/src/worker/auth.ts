import type { Env } from "./env";
import type { OpsActor } from "../shared/types";
import { isTeacherEmail } from "../shared/types";
import {
  base64UrlToBytes,
  cookieHeader,
  hmacSign,
  hmacVerify,
  parseCookies,
  textToBase64Url,
  timingSafeEqual,
} from "./crypto";

export const SESSION_COOKIE = "trakr_ops_session";
export const EMERGENCY_COOKIE = "trakr_ops_emergency";

const JWKS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

interface SessionPayload {
  uid: string;
  email: string;
  surface: "sso" | "breakglass";
  exp: number;
}

interface EmergencyPayload {
  exp: number;
}

interface FirebaseJwtPayload {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  sub?: string;
}

let jwksCache: { fetchedAt: number; keys: Record<string, string> } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_WINDOW_MS = 60_000;

/** Simple per-IP rate limit (~10 requests per minute). */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "unknown";
}

export function requireTeacherEmail(email: string): void {
  if (!isTeacherEmail(email)) {
    throw new Error("teacher-email-required");
  }
}

async function signPayload(env: Env, payload: object): Promise<string> {
  const body = textToBase64Url(JSON.stringify(payload));
  const sig = await hmacSign(env.SESSION_SIGNING_KEY, body);
  return `${body}.${sig}`;
}

async function verifySignedPayload<T>(env: Env, token: string): Promise<T | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(env.SESSION_SIGNING_KEY, body, sig))) return null;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(body));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function createSessionCookie(
  env: Env,
  actor: OpsActor,
  maxAgeSeconds: number,
  secure = true,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload: SessionPayload = {
    uid: actor.uid,
    email: actor.email,
    surface: actor.surface,
    exp,
  };
  const value = await signPayload(env, payload);
  return cookieHeader(SESSION_COOKIE, value, {
    maxAge: maxAgeSeconds,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
  });
}

export async function createEmergencyCookie(
  env: Env,
  maxAgeSeconds: number,
  secure = true,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload: EmergencyPayload = { exp };
  const value = await signPayload(env, payload);
  return cookieHeader(EMERGENCY_COOKIE, value, {
    maxAge: maxAgeSeconds,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
  });
}

export function clearSessionCookie(): string {
  return cookieHeader(SESSION_COOKIE, "", { maxAge: 0, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
}

export function clearEmergencyCookie(): string {
  return cookieHeader(EMERGENCY_COOKIE, "", { maxAge: 0, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
}

export async function readSession(env: Env, request: Request): Promise<OpsActor | null> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const payload = await verifySignedPayload<SessionPayload>(env, raw);
  if (!payload) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  if (payload.surface !== "sso" && payload.surface !== "breakglass") return null;
  if (!payload.uid || !payload.email) return null;
  return { uid: payload.uid, email: payload.email, surface: payload.surface };
}

export async function readEmergencySession(env: Env, request: Request): Promise<boolean> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const raw = cookies[EMERGENCY_COOKIE];
  if (!raw) return false;
  const payload = await verifySignedPayload<EmergencyPayload>(env, raw);
  if (!payload) return false;
  return payload.exp > Math.floor(Date.now() / 1000);
}

export function breakglassActor(): OpsActor {
  return { surface: "breakglass", uid: "breakglass", email: "breakglass@local" };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function readAsn1Length(data: Uint8Array, offset: number): { length: number; headerLen: number } {
  const first = data[offset]!;
  if (first < 0x80) return { length: first, headerLen: 1 };
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | data[offset + 1 + i]!;
  return { length, headerLen: 1 + numBytes };
}

function readAsn1Element(
  data: Uint8Array,
  offset: number,
): { tag: number; content: Uint8Array; next: number } | null {
  if (offset >= data.length) return null;
  const tag = data[offset]!;
  const { length, headerLen } = readAsn1Length(data, offset + 1);
  const start = offset + 1 + headerLen;
  const end = start + length;
  if (end > data.length) return null;
  return { tag, content: data.subarray(start, end), next: end };
}

/** Extract SubjectPublicKeyInfo bytes from an X.509 PEM certificate. */
function extractSpkiFromPemCertificate(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const cert = readAsn1Element(der, 0);
  if (!cert || cert.tag !== 0x30) throw new Error("invalid-cert");
  const tbs = readAsn1Element(cert.content, 0);
  if (!tbs || tbs.tag !== 0x30) throw new Error("invalid-cert-tbs");
  let offset = 0;
  const elements: Uint8Array[] = [];
  while (offset < tbs.content.length) {
    const el = readAsn1Element(tbs.content, offset);
    if (!el) break;
    elements.push(tbs.content.subarray(offset, el.next));
    offset = el.next;
  }
  // TBSCertificate: optional version [0], serial, sig alg, issuer, validity, subject, subjectPublicKeyInfo
  const spkiIndex = elements[0] && elements[0][0] === 0xa0 ? 6 : 5;
  const spki = elements[spkiIndex];
  if (!spki) throw new Error("missing-spki");
  const copy = new Uint8Array(spki.length);
  copy.set(spki);
  return copy.buffer;
}

async function importPublicKeyFromX509Pem(pem: string): Promise<CryptoKey> {
  const spki = extractSpkiFromPemCertificate(pem);
  return crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function getGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks-fetch-failed: ${res.status}`);
  const keys = (await res.json()) as Record<string, string>;
  jwksCache = { fetchedAt: now, keys };
  return keys;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const json = new TextDecoder().decode(base64UrlToBytes(part));
  return JSON.parse(json) as Record<string, unknown>;
}

function audienceMatches(aud: string | string[] | undefined, projectId: string): boolean {
  if (typeof aud === "string") return aud === projectId;
  if (Array.isArray(aud)) return aud.includes(projectId);
  return false;
}

export async function verifyFirebaseIdToken(
  projectId: string,
  idToken: string,
): Promise<{ uid: string; email: string }> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("invalid-token");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const header = decodeJwtPart(headerB64) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("invalid-token-header");

  const certs = await getGoogleCerts();
  const pem = certs[header.kid];
  if (!pem) throw new Error("unknown-kid");

  const key = await importPublicKeyFromX509Pem(pem);
  const signature = new Uint8Array(base64UrlToBytes(sigB64));
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error("invalid-signature");

  const payload = decodeJwtPart(payloadB64) as FirebaseJwtPayload;
  const iss = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== iss) throw new Error("invalid-iss");
  if (!audienceMatches(payload.aud, projectId)) throw new Error("invalid-aud");
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("token-expired");
  if (!payload.email || payload.email_verified !== true) throw new Error("email-not-verified");
  if (!payload.sub) throw new Error("missing-sub");

  return { uid: payload.sub, email: payload.email };
}

export function verifyBreakglassSecret(env: Env, token: string): boolean {
  return timingSafeEqual(token, env.BREAKGLASS_SECRET);
}
