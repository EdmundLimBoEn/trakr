import { Hono } from "hono";
import type { Env } from "./env";
import type { OpsActor } from "../shared/types";
import { FLAG_KEYS } from "../shared/types";
import { FirestoreClient } from "./firestore";
import {
  breakglassActor,
  bearerToken,
  checkRateLimit,
  clearEmergencyCookie,
  clearSessionCookie,
  clientIp,
  createEmergencyCookie,
  createSessionCookie,
  readEmergencySession,
  readSession,
  requireTeacherEmail,
  verifyBreakglassSecret,
  verifyFirebaseIdToken,
} from "./auth";
import {
  forceReturnClaims,
  getFlags,
  getIntegrity,
  getOverview,
  listClaims,
  listEquipment,
  listIssues,
  listUsers,
  retireEquipment,
  setUserActive,
  updateEquipment,
  updateFlags,
  updateIssueStatus,
} from "./ops";

type ApiEnv = { Bindings: Env; Variables: { actor: OpsActor } };

const SESSION_MAX_AGE = 60 * 60 * 8;
const EMERGENCY_MAX_AGE = 60 * 60 * 4;

function db(c: { env: Env }): FirestoreClient {
  return new FirestoreClient(c.env.FIREBASE_PROJECT_ID, c.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

function isMutating(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function normalizeApiPath(path: string): string {
  if (path === "/api") return "/";
  if (path.startsWith("/api/")) return path.slice(4);
  return path;
}

function isPublicRoute(method: string, path: string): boolean {
  const p = normalizeApiPath(path);
  if (method === "GET" && (p === "/health" || p === "/config")) return true;
  if (method === "POST" && p === "/auth/session") return true;
  if (method === "POST" && p === "/auth/logout") return true;
  if (method === "GET" && p === "/auth/me") return true;
  if (method === "POST" && p === "/unlock") return true;
  return false;
}

function requestIsSecure(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" || request.headers.get("CF-Visitor")?.includes("https") === true;
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveActor(env: Env, request: Request): Promise<OpsActor | null> {
  const session = await readSession(env, request);
  if (session) return session;

  const bearer = bearerToken(request);
  if (bearer && verifyBreakglassSecret(env, bearer)) {
    return breakglassActor();
  }

  if (await readEmergencySession(env, request)) {
    return breakglassActor();
  }

  return null;
}

export function createApiApp(): Hono<ApiEnv> {
  const api = new Hono<ApiEnv>();

  api.use("*", async (c, next) => {
    if (isPublicRoute(c.req.method, c.req.path)) return next();

    const actor = await resolveActor(c.env, c.req.raw);
    if (!actor) return jsonError(401, "unauthorized");

    if (isMutating(c.req.method) && actor.surface === "sso") {
      const csrf = c.req.header("X-Trakr-Ops");
      if (csrf !== "1") return jsonError(401, "csrf-required");
    }

    c.set("actor", actor);
    await next();
  });

  api.onError((err, c) => {
    console.error("api-error", err);
    return jsonError(500, err instanceof Error ? err.message : "internal-error");
  });

  api.get("/health", (c) => c.json({ ok: true }));

  api.get("/config", (c) =>
    c.json({
      projectId: c.env.FIREBASE_PROJECT_ID,
      authDomain: c.env.FIREBASE_AUTH_DOMAIN,
      apiKey: c.env.FIREBASE_API_KEY ?? "",
    }),
  );

  api.post("/auth/session", async (c) => {
    const ip = clientIp(c.req.raw);
    if (!checkRateLimit(`session:${ip}`)) {
      return jsonError(429, "rate-limited");
    }
    const body = (await c.req.json().catch(() => null)) as { idToken?: string } | null;
    if (!body?.idToken) return jsonError(400, "missing-id-token");
    try {
      const { uid, email } = await verifyFirebaseIdToken(c.env.FIREBASE_PROJECT_ID, body.idToken);
      requireTeacherEmail(email);
      const actor: OpsActor = { uid, email, surface: "sso" };
      const cookie = await createSessionCookie(
        c.env,
        actor,
        SESSION_MAX_AGE,
        requestIsSecure(c.req.raw),
      );
      return c.json({ email, uid }, 200, { "Set-Cookie": cookie });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "invalid-token";
      if (msg === "teacher-email-required") return jsonError(403, msg);
      return jsonError(401, "invalid-token");
    }
  });

  api.post("/auth/logout", () =>
    new Response(null, {
      status: 204,
      headers: [
        ["Set-Cookie", clearSessionCookie()],
        ["Set-Cookie", clearEmergencyCookie()],
      ],
    }),
  );

  api.get("/auth/me", async (c) => {
    const actor = await readSession(c.env, c.req.raw);
    if (!actor || actor.surface !== "sso") return jsonError(401, "unauthorized");
    return c.json({ uid: actor.uid, email: actor.email, surface: actor.surface });
  });

  api.post("/unlock", async (c) => {
    const ip = clientIp(c.req.raw);
    if (!checkRateLimit(`unlock:${ip}`)) {
      return jsonError(429, "rate-limited");
    }
    const body = (await c.req.json().catch(() => ({}))) as { token?: string };
    const token = body.token ?? bearerToken(c.req.raw);
    if (!token || !verifyBreakglassSecret(c.env, token)) {
      return jsonError(401, "invalid-token");
    }
    const cookie = await createEmergencyCookie(
      c.env,
      EMERGENCY_MAX_AGE,
      requestIsSecure(c.req.raw),
    );
    return c.json({ ok: true }, 200, { "Set-Cookie": cookie });
  });

  api.get("/flags", async (c) => c.json(await getFlags(db(c))));

  api.put("/flags", async (c) => {
    const body = (await c.req.json()) as Partial<Record<(typeof FLAG_KEYS)[number], boolean>>;
    const actor = c.get("actor");
    try {
      return c.json(await updateFlags(db(c), body, actor));
    } catch (err) {
      return jsonError(400, err instanceof Error ? err.message : "update-failed");
    }
  });

  api.get("/live", async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      const client = db(c);
      const [equipment, claims, issues] = await Promise.all([
        listEquipment(client), listClaims(client), listIssues(client),
      ]);
      return c.json({ projectId: c.env.FIREBASE_PROJECT_ID, readAt: new Date().toISOString(), equipment, claims, issues });
    } catch (error) {
      console.error("live-read-failed", error);
      return c.json({ error: "Database read failed. Check the connection and try again." }, 503);
    }
  });

  api.get("/overview", async (c) => c.json(await getOverview(db(c))));

  api.get("/equipment", async (c) => c.json(await listEquipment(db(c))));

  api.patch("/equipment/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as { name?: string; internalSerial?: string };
    const actor = c.get("actor");
    try {
      return c.json(await updateEquipment(db(c), id, body, actor));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update-failed";
      const status = msg === "equipment-not-found" ? 404 : 400;
      return jsonError(status, msg);
    }
  });

  api.post("/equipment/:id/retire", async (c) => {
    const id = c.req.param("id");
    const actor = c.get("actor");
    try {
      return c.json(await retireEquipment(db(c), id, actor));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "retire-failed";
      const status = msg === "equipment-not-found" ? 404 : 400;
      return jsonError(status, msg);
    }
  });

  api.get("/claims", async (c) => {
    const status = c.req.query("status") ?? undefined;
    return c.json(await listClaims(db(c), status));
  });

  api.post("/claims/return", async (c) => {
    const body = (await c.req.json()) as { claimIds?: string[] };
    if (!body.claimIds?.length) return jsonError(400, "missing-claim-ids");
    const actor = c.get("actor");
    try {
      return c.json(await forceReturnClaims(db(c), body.claimIds, actor));
    } catch (err) {
      return jsonError(400, err instanceof Error ? err.message : "return-failed");
    }
  });

  api.get("/issues", async (c) => {
    const status = c.req.query("status") ?? undefined;
    return c.json(await listIssues(db(c), status));
  });

  api.patch("/issues/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as { status?: string };
    if (body.status !== "acknowledged" && body.status !== "resolved") {
      return jsonError(400, "invalid-status");
    }
    const actor = c.get("actor");
    try {
      return c.json(await updateIssueStatus(db(c), id, body.status, actor));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update-failed";
      const status = msg === "issue-not-found" ? 404 : 400;
      return jsonError(status, msg);
    }
  });

  api.get("/users", async (c) => c.json(await listUsers(db(c))));

  api.patch("/users/:uid", async (c) => {
    const uid = c.req.param("uid");
    const body = (await c.req.json()) as { active?: boolean; source?: "users" | "demoUsers" };
    if (typeof body.active !== "boolean") return jsonError(400, "missing-active");
    if (body.source !== "users" && body.source !== "demoUsers") {
      return jsonError(400, "invalid-source");
    }
    const actor = c.get("actor");
    try {
      return c.json(await setUserActive(db(c), uid, body.source, body.active, actor));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update-failed";
      const status = msg === "user-not-found" ? 404 : 400;
      return jsonError(status, msg);
    }
  });

  api.get("/integrity", async (c) => c.json(await getIntegrity(db(c))));

  return api;
}
