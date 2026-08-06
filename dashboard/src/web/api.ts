import type {
  ClaimRecord,
  EquipmentRecord,
  FeatureFlags,
  IntegrityReport,
  IssueRecord,
  OpsActor,
  OverviewStats,
  UserRecord,
} from "../shared/types";

export const BREAKGLASS_STORAGE_KEY = "trakr_breakglass_token";

export function isEmergencyPath(): boolean {
  return /^\/e\//.test(location.pathname);
}

export function apiBase(): string {
  const m = location.pathname.match(/^(\/e\/[^/]+)/);
  return m ? `${m[1]}/api` : "/api";
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (isEmergencyPath()) {
    const token = sessionStorage.getItem(BREAKGLASS_STORAGE_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-Trakr-Ops", "1");
  }

  for (const [k, v] of Object.entries(authHeaders())) {
    headers.set(k, v);
  }

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    method,
    credentials: "include",
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = (await res.json()) as { error?: string; message?: string };
      message = err.error ?? err.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message || `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export interface FirebaseClientConfig {
  projectId: string;
  authDomain: string;
  apiKey: string;
}

export function getConfig(): Promise<FirebaseClientConfig> {
  return api<FirebaseClientConfig>("/config");
}

export function createSession(idToken: string): Promise<OpsActor> {
  return api<{ email: string; uid: string }>("/auth/session", { method: "POST", json: { idToken } }).then(
    (r) => ({ uid: r.uid, email: r.email, surface: "sso" }),
  );
}

export function logout(): Promise<void> {
  return api<void>("/auth/logout", { method: "POST" });
}

export function me(): Promise<OpsActor> {
  return api<OpsActor>("/auth/me");
}

export function unlock(token: string): Promise<void> {
  return api<void>("/unlock", { method: "POST", json: { token } });
}

export function getFlags(): Promise<FeatureFlags> {
  return api<FeatureFlags>("/flags");
}

export function putFlags(flags: FeatureFlags): Promise<FeatureFlags> {
  return api<FeatureFlags>("/flags", { method: "PUT", json: flags });
}

export function getOverview(): Promise<OverviewStats> {
  return api<OverviewStats>("/overview");
}

export function getEquipment(): Promise<EquipmentRecord[]> {
  return api<EquipmentRecord[]>("/equipment");
}

export function patchEquipment(
  equipmentId: string,
  patch: { name?: string; internalSerial?: string },
): Promise<EquipmentRecord> {
  return api<EquipmentRecord>(`/equipment/${encodeURIComponent(equipmentId)}`, {
    method: "PATCH",
    json: patch,
  });
}

export function retireEquipment(equipmentId: string): Promise<EquipmentRecord> {
  return api<EquipmentRecord>(`/equipment/${encodeURIComponent(equipmentId)}/retire`, {
    method: "POST",
  });
}

export function getClaims(status?: "active" | "returned"): Promise<ClaimRecord[]> {
  const qs = status ? `?status=${status}` : "";
  return api<ClaimRecord[]>(`/claims${qs}`);
}

export function returnClaims(claimIds: string[]): Promise<{ batchId: string; returned: number }> {
  return api<{ batchId: string; returned: number }>("/claims/return", {
    method: "POST",
    json: { claimIds },
  });
}

export function getIssues(status?: IssueRecord["status"]): Promise<IssueRecord[]> {
  const qs = status ? `?status=${status}` : "";
  return api<IssueRecord[]>(`/issues${qs}`);
}

export function patchIssue(
  issueId: string,
  patch: { status: "acknowledged" | "resolved" },
): Promise<IssueRecord> {
  return api<IssueRecord>(`/issues/${encodeURIComponent(issueId)}`, {
    method: "PATCH",
    json: patch,
  });
}

export function getUsers(): Promise<UserRecord[]> {
  return api<UserRecord[]>("/users");
}

export function patchUser(
  uid: string,
  patch: { active: boolean; source: UserRecord["source"] },
): Promise<UserRecord> {
  return api<UserRecord>(`/users/${encodeURIComponent(uid)}`, {
    method: "PATCH",
    json: patch,
  });
}

export function getIntegrity(): Promise<IntegrityReport> {
  return api<IntegrityReport>("/integrity");
}
