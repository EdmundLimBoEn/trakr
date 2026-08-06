import { Hono } from "hono";
import { createApiApp } from "./routes";
import type { Env } from "./env";
import { timingSafeEqual } from "./crypto";

const api = createApiApp();

const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

app.all("/e/:path/api/*", async (c) => {
  const path = c.req.param("path");
  if (!c.env.BREAKGLASS_PATH || !timingSafeEqual(path, c.env.BREAKGLASS_PATH)) {
    return c.text("Not Found", 404);
  }
  const url = new URL(c.req.url);
  const prefix = `/e/${path}`;
  // Keep /api/... so the mounted API app sees the same paths as SSO.
  const stripped = url.pathname.slice(prefix.length) || "/";
  const rewritten = new Request(new URL(stripped + url.search, url.origin), c.req.raw);
  return app.fetch(rewritten, c.env, c.executionCtx);
});

function isApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname === "/api") return true;
  return /^\/e\/[^/]+\/api(\/|$)/.test(pathname);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (isApiPath(url.pathname)) {
      return app.fetch(request, env, ctx);
    }

    const eMatch = url.pathname.match(/^\/e\/([^/]+)/);
    if (eMatch && env.BREAKGLASS_PATH && !timingSafeEqual(eMatch[1]!, env.BREAKGLASS_PATH)) {
      return new Response("Not Found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
