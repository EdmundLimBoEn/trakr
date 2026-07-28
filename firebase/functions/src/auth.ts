import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { Role } from "./domain.js";

export interface AuthenticatedActor {
  uid: string;
  email: string;
  role: Role;
}

export function authenticatedActor(request: CallableRequest<unknown>, requiredRole?: Role): AuthenticatedActor {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in is required.");
  const email = typeof auth.token.email === "string" ? auth.token.email.toLowerCase() : "";
  const role = auth.token.role;
  if ((role !== "student" && role !== "teacher") || !email) {
    throw new HttpsError("permission-denied", "Initialize the authenticated user first.");
  }
  if (requiredRole && role !== requiredRole) {
    throw new HttpsError("permission-denied", `${requiredRole} access is required.`);
  }
  return { uid: auth.uid, email, role };
}

export function requestData(request: CallableRequest<unknown>): Record<string, unknown> {
  if (typeof request.data !== "object" || request.data === null || Array.isArray(request.data)) {
    throw new HttpsError("invalid-argument", "A request object is required.");
  }
  return request.data as Record<string, unknown>;
}

export function mapDomainError(error: unknown): never {
  const message = error instanceof Error ? error.message : "invalid-request";
  const conflictErrors = new Set(["duplicate-tag", "duplicate-serial"]);
  if (conflictErrors.has(message)) {
    throw new HttpsError("already-exists", message);
  }
  throw new HttpsError("invalid-argument", message);
}

