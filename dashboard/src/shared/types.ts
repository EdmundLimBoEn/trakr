export const FLAG_KEYS = [
  "isDemo",
  "googleSignInEnabled",
  "checkoutEnabled",
  "returnsEnabled",
  "enrollmentEnabled",
  "historyEnabled",
  "activityEnabled",
  "maintenanceMode",
  "simulateOfflineVisible",
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];

export type FeatureFlags = Record<FlagKey, boolean> & {
  updatedAt?: string;
  updatedBy?: string;
};

export const FLAG_LABELS: Record<FlagKey, string> = {
  isDemo: "Demo mode (anonymous accounts UI)",
  googleSignInEnabled: "Google sign-in",
  checkoutEnabled: "Student checkout",
  returnsEnabled: "Teacher returns",
  enrollmentEnabled: "Equipment enrollment",
  historyEnabled: "History tab",
  activityEnabled: "Activity tab",
  maintenanceMode: "Maintenance mode",
  simulateOfflineVisible: "Simulate offline control",
};

export const OVERDUE_HOURS = 24;

export type Surface = "sso" | "breakglass";

export type Role = "student" | "teacher";

export interface OpsActor {
  surface: Surface;
  uid: string;
  email: string;
}

export interface OverviewStats {
  equipmentActive: number;
  equipmentRetired: number;
  claimsActive: number;
  claimsOverdue: number;
  issuesOpen: number;
  issuesAcknowledged: number;
  issuesResolved: number;
  usersTeachers: number;
  usersStudents: number;
  demoUsers: number;
  isDemo: boolean;
  maintenanceMode: boolean;
}

export interface EquipmentRecord {
  equipmentId: string;
  name: string;
  internalSerial: string;
  normalizedInternalSerial: string;
  activeTagId: string | null;
  status: "active" | "retired";
  enrolledBy?: string;
  enrolledAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface ClaimRecord {
  claimId: string;
  checkoutBatchId: string;
  returnBatchId: string | null;
  equipmentId: string;
  tagIdAtCheckout: string;
  studentUid: string;
  studentEmail: string;
  condition: "no_issues" | "has_issue";
  issueText: string | null;
  status: "active" | "returned";
  checkedOutAt: string;
  returnedAt: string | null;
  returnedByTeacherUid: string | null;
  overdue: boolean;
}

export interface IssueRecord {
  issueId: string;
  claimId: string;
  equipmentId: string;
  reportedByStudentUid: string;
  text: string;
  status: "open" | "acknowledged" | "resolved";
  reportedAt: string;
  resolvedAt: string | null;
  resolvedByTeacherUid: string | null;
}

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  emailDomain?: string;
  active: boolean;
  lastLoginAt?: string;
  demo?: boolean;
  source: "users" | "demoUsers";
}

export interface IntegrityReport {
  orphanTags: Array<{ tagId: string; equipmentId: string }>;
  missingActiveTags: Array<{ equipmentId: string; name: string; activeTagId: string }>;
  retiredWithActiveTag: Array<{ equipmentId: string; name: string; activeTagId: string }>;
}

export function isOverdue(checkedOutAt: string | Date, now = new Date()): boolean {
  const start = typeof checkedOutAt === "string" ? new Date(checkedOutAt) : checkedOutAt;
  if (Number.isNaN(start.getTime())) return false;
  return now.getTime() - start.getTime() >= OVERDUE_HOURS * 60 * 60 * 1000;
}

export function normalizeSerial(value: string): { display: string; normalized: string } {
  const display = value.trim().replace(/\s+/g, " ");
  if (display.length < 1 || display.length > 50) {
    throw new Error("invalid-serial");
  }
  return { display, normalized: display.toUpperCase() };
}

export function validateEquipmentName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 100) {
    throw new Error("invalid-name");
  }
  return name;
}

export function isTeacherEmail(email: string): boolean {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 && parts[1] === "sst.edu.sg";
}
