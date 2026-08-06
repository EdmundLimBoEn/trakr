import {
  FLAG_KEYS,
  type ClaimRecord,
  type EquipmentRecord,
  type FeatureFlags,
  type IntegrityReport,
  type IssueRecord,
  type OpsActor,
  type OverviewStats,
  type UserRecord,
  isOverdue,
  normalizeSerial,
  validateEquipmentName,
} from "../shared/types";
import { FirestoreClient, objectToFields } from "./firestore";
import { randomId } from "./crypto";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isoNow(): string {
  return new Date().toISOString();
}

function mapEquipment(doc: Record<string, unknown>, id: string): EquipmentRecord {
  return {
    equipmentId: str(doc.equipmentId) || id,
    name: str(doc.name),
    internalSerial: str(doc.internalSerial),
    normalizedInternalSerial: str(doc.normalizedInternalSerial),
    activeTagId: doc.activeTagId == null ? null : str(doc.activeTagId) || null,
    status: str(doc.status) === "retired" ? "retired" : "active",
    enrolledBy: str(doc.enrolledBy) || undefined,
    enrolledAt: str(doc.enrolledAt) || undefined,
    updatedBy: str(doc.updatedBy) || undefined,
    updatedAt: str(doc.updatedAt) || undefined,
  };
}

function mapClaim(doc: Record<string, unknown>, id: string): ClaimRecord {
  const checkedOutAt = str(doc.checkedOutAt);
  const status = str(doc.status) === "returned" ? "returned" : "active";
  return {
    claimId: str(doc.claimId) || id,
    checkoutBatchId: str(doc.checkoutBatchId),
    returnBatchId: doc.returnBatchId == null ? null : str(doc.returnBatchId) || null,
    equipmentId: str(doc.equipmentId),
    tagIdAtCheckout: str(doc.tagIdAtCheckout),
    studentUid: str(doc.studentUid),
    studentEmail: str(doc.studentEmail),
    condition: str(doc.condition) === "has_issue" ? "has_issue" : "no_issues",
    issueText: doc.issueText == null ? null : str(doc.issueText) || null,
    status,
    checkedOutAt,
    returnedAt: doc.returnedAt == null ? null : str(doc.returnedAt) || null,
    returnedByTeacherUid:
      doc.returnedByTeacherUid == null ? null : str(doc.returnedByTeacherUid) || null,
    overdue: status === "active" && isOverdue(checkedOutAt),
  };
}

function mapIssue(doc: Record<string, unknown>, id: string): IssueRecord {
  const statusRaw = str(doc.status);
  const status =
    statusRaw === "acknowledged" || statusRaw === "resolved" ? statusRaw : "open";
  return {
    issueId: str(doc.issueId) || id,
    claimId: str(doc.claimId),
    equipmentId: str(doc.equipmentId),
    reportedByStudentUid: str(doc.reportedByStudentUid),
    text: str(doc.text),
    status,
    reportedAt: str(doc.reportedAt),
    resolvedAt: doc.resolvedAt == null ? null : str(doc.resolvedAt) || null,
    resolvedByTeacherUid:
      doc.resolvedByTeacherUid == null ? null : str(doc.resolvedByTeacherUid) || null,
  };
}

function mapUser(doc: Record<string, unknown>, id: string, source: "users" | "demoUsers"): UserRecord {
  const roleRaw = str(doc.role);
  const role = roleRaw === "teacher" ? "teacher" : "student";
  return {
    uid: str(doc.uid) || id,
    email: str(doc.email),
    displayName: str(doc.displayName),
    role,
    emailDomain: str(doc.emailDomain) || undefined,
    active: bool(doc.active, true),
    lastLoginAt: str(doc.lastLoginAt) || undefined,
    demo: source === "demoUsers" ? true : bool(doc.demo, false) || undefined,
    source,
  };
}

function defaultFlags(): FeatureFlags {
  const base = {} as FeatureFlags;
  for (const key of FLAG_KEYS) base[key] = false;
  return base;
}

export async function getFlags(db: FirestoreClient): Promise<FeatureFlags> {
  const doc = await db.getDoc("config/featureFlags");
  const flags = defaultFlags();
  if (!doc) return flags;
  for (const key of FLAG_KEYS) {
    flags[key] = bool(doc[key], false);
  }
  const updatedAt = str(doc.updatedAt);
  const updatedBy = str(doc.updatedBy);
  if (updatedAt) flags.updatedAt = updatedAt;
  if (updatedBy) flags.updatedBy = updatedBy;
  return flags;
}

export async function updateFlags(
  db: FirestoreClient,
  partial: Partial<Record<(typeof FLAG_KEYS)[number], boolean>>,
  actor: OpsActor,
): Promise<FeatureFlags> {
  const current = await getFlags(db);
  const next: Record<string, unknown> = { ...current };
  for (const key of FLAG_KEYS) {
    if (key in partial && typeof partial[key] === "boolean") {
      next[key] = partial[key];
    }
  }
  next.updatedAt = isoNow();
  next.updatedBy = actor.email;
  await db.setDoc("config/featureFlags", next, true);
  await writeAudit(db, actor, "flags.update", ["config/featureFlags"], { keys: Object.keys(partial) });
  return getFlags(db);
}

export async function getOverview(db: FirestoreClient): Promise<OverviewStats> {
  const [equipment, claims, issues, users, demoUsers, flags] = await Promise.all([
    db.listCollection("equipment"),
    db.listCollection("claims"),
    db.listCollection("issues"),
    db.listCollection("users"),
    db.listCollection("demoUsers"),
    getFlags(db),
  ]);

  let equipmentActive = 0;
  let equipmentRetired = 0;
  for (const row of equipment) {
    if (str(row.status) === "retired") equipmentRetired += 1;
    else equipmentActive += 1;
  }

  let claimsActive = 0;
  let claimsOverdue = 0;
  for (const row of claims) {
    if (str(row.status) !== "active") continue;
    claimsActive += 1;
    const checkedOutAt = str(row.checkedOutAt);
    if (isOverdue(checkedOutAt)) claimsOverdue += 1;
  }

  let issuesOpen = 0;
  let issuesAcknowledged = 0;
  let issuesResolved = 0;
  for (const row of issues) {
    const status = str(row.status);
    if (status === "acknowledged") issuesAcknowledged += 1;
    else if (status === "resolved") issuesResolved += 1;
    else issuesOpen += 1;
  }

  let usersTeachers = 0;
  let usersStudents = 0;
  for (const row of users) {
    if (str(row.role) === "teacher") usersTeachers += 1;
    else usersStudents += 1;
  }

  return {
    equipmentActive,
    equipmentRetired,
    claimsActive,
    claimsOverdue,
    issuesOpen,
    issuesAcknowledged,
    issuesResolved,
    usersTeachers,
    usersStudents,
    demoUsers: demoUsers.length,
    isDemo: flags.isDemo,
    maintenanceMode: flags.maintenanceMode,
  };
}

export async function listEquipment(db: FirestoreClient): Promise<EquipmentRecord[]> {
  const rows = await db.listCollection("equipment");
  return rows.map((row) => mapEquipment(row, row.id));
}

export async function updateEquipment(
  db: FirestoreClient,
  id: string,
  patch: { name?: string; internalSerial?: string },
  actor: OpsActor,
): Promise<EquipmentRecord> {
  const existing = await db.getDoc(`equipment/${id}`);
  if (!existing) throw new Error("equipment-not-found");
  if (str(existing.status) === "retired") throw new Error("equipment-retired");

  const writes: Array<Record<string, unknown>> = [];
  const update: Record<string, unknown> = {
    updatedBy: actor.uid,
    updatedAt: isoNow(),
  };

  if (patch.name !== undefined) {
    update.name = validateEquipmentName(patch.name);
  }
  if (patch.internalSerial !== undefined) {
    const { display, normalized } = normalizeSerial(patch.internalSerial);
    const oldNorm = str(existing.normalizedInternalSerial);
    update.internalSerial = display;
    update.normalizedInternalSerial = normalized;
    if (normalized !== oldNorm) {
      const taken = await db.getDoc(`equipmentSerials/${normalized}`);
      if (taken && str(taken.equipmentId) !== id) {
        throw new Error("serial-already-in-use");
      }
      writes.push({
        update: {
          name: db.docName(`equipmentSerials/${normalized}`),
          fields: objectToFields({
            equipmentId: id,
            normalizedSerial: normalized,
            createdAt: isoNow(),
          }),
        },
        currentDocument: { exists: false },
      });
      if (oldNorm) {
        writes.push({ delete: db.docName(`equipmentSerials/${oldNorm}`) });
      }
    }
  }

  const fieldPaths = Object.keys(update);
  writes.push({
    update: {
      name: db.docName(`equipment/${id}`),
      fields: objectToFields(update),
    },
    updateMask: { fieldPaths },
  });

  await db.commit(writes);
  await writeAudit(db, actor, "equipment.update", [id], patch);
  const refreshed = await db.getDoc(`equipment/${id}`);
  if (!refreshed) throw new Error("equipment-not-found");
  return mapEquipment(refreshed, id);
}

export async function retireEquipment(db: FirestoreClient, id: string, actor: OpsActor): Promise<EquipmentRecord> {
  const existing = await db.getDoc(`equipment/${id}`);
  if (!existing) throw new Error("equipment-not-found");

  const writes: Array<Record<string, unknown>> = [];
  const normalized = str(existing.normalizedInternalSerial);
  const activeTagId = existing.activeTagId == null ? null : str(existing.activeTagId) || null;

  if (normalized) {
    writes.push({ delete: db.docName(`equipmentSerials/${normalized}`) });
  }

  if (activeTagId) {
    writes.push({
      update: {
        name: db.docName(`tags/${activeTagId}`),
        fields: objectToFields({
          status: "replaced",
          replacedAt: isoNow(),
          replacedBy: actor.uid,
        }),
      },
      updateMask: { fieldPaths: ["status", "replacedAt", "replacedBy"] },
    });
  }

  writes.push({
    update: {
      name: db.docName(`equipment/${id}`),
      fields: objectToFields({
        status: "retired",
        activeTagId: null,
        updatedBy: actor.uid,
        updatedAt: isoNow(),
      }),
    },
    updateMask: { fieldPaths: ["status", "activeTagId", "updatedBy", "updatedAt"] },
  });

  await db.commit(writes);
  await writeAudit(db, actor, "equipment.retire", [id]);
  const refreshed = await db.getDoc(`equipment/${id}`);
  if (!refreshed) throw new Error("equipment-not-found");
  return mapEquipment(refreshed, id);
}

export async function listClaims(db: FirestoreClient, status?: string): Promise<ClaimRecord[]> {
  let rows: Array<Record<string, unknown> & { id: string }>;
  if (status === "active" || status === "returned") {
    rows = await db.runQuery({
      from: [{ collectionId: "claims" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: status },
        },
      },
    });
  } else {
    rows = await db.listCollection("claims");
  }
  return rows.map((row) => mapClaim(row, row.id));
}

export async function forceReturnClaims(
  db: FirestoreClient,
  claimIds: string[],
  actor: OpsActor,
): Promise<{ batchId: string; returned: number }> {
  const unique = [...new Set(claimIds.filter(Boolean))];
  if (unique.length === 0) throw new Error("no-claims");

  const claims = await Promise.all(unique.map((id) => db.getDoc(`claims/${id}`)));
  const activeIds: string[] = [];
  for (let i = 0; i < unique.length; i++) {
    const doc = claims[i];
    const id = unique[i]!;
    if (!doc) throw new Error(`claim-not-found:${id}`);
    if (str(doc.status) !== "active") throw new Error(`claim-not-active:${id}`);
    activeIds.push(id);
  }

  const batchId = randomId(12);
  const returnedAt = isoNow();
  const writes: Array<Record<string, unknown>> = [
    {
      update: {
        name: db.docName(`returnBatches/${batchId}`),
        fields: objectToFields({
          batchId,
          teacherUid: actor.uid,
          claimCount: activeIds.length,
          createdAt: returnedAt,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  for (const claimId of activeIds) {
    writes.push({
      update: {
        name: db.docName(`claims/${claimId}`),
        fields: objectToFields({
          status: "returned",
          returnBatchId: batchId,
          returnedAt,
          returnedByTeacherUid: actor.uid,
        }),
      },
      updateMask: { fieldPaths: ["status", "returnBatchId", "returnedAt", "returnedByTeacherUid"] },
    });
  }

  await db.commit(writes);
  await writeAudit(db, actor, "claims.forceReturn", activeIds, { batchId });
  return { batchId, returned: activeIds.length };
}

export async function listIssues(db: FirestoreClient, status?: string): Promise<IssueRecord[]> {
  let rows: Array<Record<string, unknown> & { id: string }>;
  if (status === "open" || status === "acknowledged" || status === "resolved") {
    rows = await db.runQuery({
      from: [{ collectionId: "issues" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: status },
        },
      },
    });
  } else {
    rows = await db.listCollection("issues");
  }
  return rows.map((row) => mapIssue(row, row.id));
}

export async function updateIssueStatus(
  db: FirestoreClient,
  id: string,
  status: "acknowledged" | "resolved",
  actor: OpsActor,
): Promise<IssueRecord> {
  const existing = await db.getDoc(`issues/${id}`);
  if (!existing) throw new Error("issue-not-found");

  const update: Record<string, unknown> = { status };
  const mask = ["status"];
  if (status === "resolved") {
    update.resolvedAt = isoNow();
    update.resolvedByTeacherUid = actor.uid;
    mask.push("resolvedAt", "resolvedByTeacherUid");
  }

  await db.commit([
    {
      update: {
        name: db.docName(`issues/${id}`),
        fields: objectToFields(update),
      },
      updateMask: { fieldPaths: mask },
    },
  ]);

  await writeAudit(db, actor, "issues.updateStatus", [id], { status });
  const refreshed = await db.getDoc(`issues/${id}`);
  if (!refreshed) throw new Error("issue-not-found");
  return mapIssue(refreshed, id);
}

export async function listUsers(db: FirestoreClient): Promise<UserRecord[]> {
  const [users, demoUsers] = await Promise.all([
    db.listCollection("users"),
    db.listCollection("demoUsers"),
  ]);
  return [
    ...users.map((row) => mapUser(row, row.id, "users")),
    ...demoUsers.map((row) => mapUser(row, row.id, "demoUsers")),
  ];
}

export async function setUserActive(
  db: FirestoreClient,
  uid: string,
  source: "users" | "demoUsers",
  active: boolean,
  actor: OpsActor,
): Promise<UserRecord> {
  const path = `${source}/${uid}`;
  const existing = await db.getDoc(path);
  if (!existing) throw new Error("user-not-found");

  await db.setDoc(
    path,
    {
      active,
      updatedAt: isoNow(),
    },
    true,
  );

  await writeAudit(db, actor, "users.setActive", [uid], { source, active });
  const refreshed = await db.getDoc(path);
  if (!refreshed) throw new Error("user-not-found");
  return mapUser(refreshed, uid, source);
}

export async function getIntegrity(db: FirestoreClient): Promise<IntegrityReport> {
  const [equipmentRows, tagRows] = await Promise.all([
    db.listCollection("equipment"),
    db.listCollection("tags"),
  ]);

  const equipmentById = new Map<string, EquipmentRecord>();
  for (const row of equipmentRows) {
    equipmentById.set(row.id, mapEquipment(row, row.id));
  }

  const orphanTags: IntegrityReport["orphanTags"] = [];
  const tagById = new Map<string, Record<string, unknown> & { id: string }>();
  for (const tag of tagRows) {
    tagById.set(tag.id, tag);
    const equipmentId = str(tag.equipmentId);
    if (!equipmentId || !equipmentById.has(equipmentId)) {
      orphanTags.push({ tagId: tag.id, equipmentId });
    }
  }

  const missingActiveTags: IntegrityReport["missingActiveTags"] = [];
  const retiredWithActiveTag: IntegrityReport["retiredWithActiveTag"] = [];

  for (const eq of equipmentById.values()) {
    const tagId = eq.activeTagId;
    if (eq.status === "active") {
      if (!tagId) {
        missingActiveTags.push({
          equipmentId: eq.equipmentId,
          name: eq.name,
          activeTagId: "",
        });
        continue;
      }
      const tag = tagById.get(tagId);
      const tagBad =
        !tag ||
        str(tag.equipmentId) !== eq.equipmentId ||
        str(tag.status) !== "active";
      if (tagBad) {
        missingActiveTags.push({
          equipmentId: eq.equipmentId,
          name: eq.name,
          activeTagId: tagId,
        });
      }
    } else if (tagId) {
      const tag = tagById.get(tagId);
      if (tag && str(tag.status) === "active") {
        retiredWithActiveTag.push({
          equipmentId: eq.equipmentId,
          name: eq.name,
          activeTagId: tagId,
        });
      }
    }
  }

  return { orphanTags, missingActiveTags, retiredWithActiveTag };
}

export async function writeAudit(
  db: FirestoreClient,
  actor: OpsActor,
  action: string,
  resourceIds: string[],
  meta?: Record<string, unknown>,
): Promise<void> {
  const id = randomId(12);
  await db.setDoc(`auditEvents/${id}`, {
    eventId: id,
    action,
    resourceIds,
    actorUid: actor.uid,
    actorEmail: actor.email,
    surface: actor.surface,
    meta: meta ?? null,
    createdAt: isoNow(),
  });
}
