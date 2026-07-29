import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineInt } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { authenticatedActor, mapDomainError, requestData } from "./auth.js";
import {
  deriveRole,
  normalizeSerial,
  validateCheckoutItems,
  validateEquipmentName,
  validateString,
  validateTagId,
  type Role,
} from "./domain.js";
import { sendToTeachers, sendToUsers } from "./notifications.js";

initializeApp();

const db = getFirestore();
const REGION = "asia-southeast1";
const CALLABLE_OPTIONS = { region: REGION, enforceAppCheck: true };
const overdueHours = defineInt("OVERDUE_HOURS", { default: 24 });

async function deliverBestEffort(operation: () => Promise<void>, context: Record<string, unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    logger.error("Post-commit notification delivery failed", { ...context, error });
  }
}

function idempotencyReference(uid: string, kind: string, value: unknown): DocumentReference {
  const requestId = validateString(value, "client-request-id", 100);
  if (!/^[A-Za-z0-9_-]+$/.test(requestId)) throw new Error("invalid-client-request-id");
  return db.collection("idempotency").doc(`${uid}_${kind}_${requestId}`);
}

function hardwareUid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9A-F]+$/.test(value) || value.length < 2 || value.length > 64 || value.length % 2 !== 0) {
    throw new Error("invalid-hardware-uid");
  }
  return value;
}

function callableFailure(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  mapDomainError(error);
}

export const initializeUser = onCall(CALLABLE_OPTIONS, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in is required.");
  const email = typeof auth.token.email === "string" ? auth.token.email.trim().toLowerCase() : "";
  if (!email || auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "A verified school Google account is required.");
  }

  let role: Role;
  try {
    role = deriveRole(email);
  } catch {
    throw new HttpsError("permission-denied", "This school email domain is not approved.");
  }

  const userRecord = await getAuth().getUser(auth.uid);
  await getAuth().setCustomUserClaims(auth.uid, { ...(userRecord.customClaims ?? {}), role });
  const now = Timestamp.now();
  const profileReference = db.collection("users").doc(auth.uid);
  const existing = await profileReference.get();
  await profileReference.set(
    {
      uid: auth.uid,
      email,
      displayName: typeof auth.token.name === "string" ? auth.token.name : userRecord.displayName ?? "",
      role,
      emailDomain: email.split("@")[1],
      active: true,
      createdAt: existing.exists ? existing.get("createdAt") ?? now : now,
      updatedAt: now,
      lastLoginAt: now,
    },
    { merge: true },
  );
  return { role, requiresTokenRefresh: true };
});

export const registerDevice = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request);
  const data = requestData(request);
  try {
    const installationId = validateString(data.installationId, "installation-id", 128);
    const fcmToken = validateString(data.fcmToken, "fcm-token", 4096);
    const platform = data.platform === "android" ? "android" : "ios";
    await db.collection("users").doc(actor.uid).collection("devices").doc(installationId).set(
      {
        installationId,
        platform,
        fcmToken,
        notificationsEnabled: data.notificationsEnabled !== false,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    return { registered: true };
  } catch (error) {
    callableFailure(error);
  }
});

export const enrollEquipment = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request, "teacher");
  const data = requestData(request);
  try {
    const name = validateEquipmentName(data.name);
    const serial = normalizeSerial(data.internalSerial);
    const tagId = validateTagId(data.tagId);
    const uid = hardwareUid(data.hardwareUidHex);
    const chipFamily = typeof data.chipFamily === "string" ? data.chipFamily.slice(0, 50) : null;
    const equipmentReference = db.collection("equipment").doc();
    const tagReference = db.collection("tags").doc(tagId);
    const serialReference = db.collection("equipmentSerials").doc(serial.normalized);
    const auditReference = db.collection("auditEvents").doc();
    const now = Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const [tag, serialGuard] = await transaction.getAll(tagReference, serialReference);
      if (!tag || !serialGuard) throw new HttpsError("internal", "transaction-read-failed");
      if (tag.exists) throw new HttpsError("already-exists", "duplicate-tag");
      if (serialGuard.exists) throw new HttpsError("already-exists", "duplicate-serial");

      transaction.create(equipmentReference, {
        equipmentId: equipmentReference.id,
        name,
        internalSerial: serial.display,
        normalizedInternalSerial: serial.normalized,
        activeTagId: tagId,
        status: "active",
        enrolledBy: actor.uid,
        enrolledAt: now,
        updatedBy: actor.uid,
        updatedAt: now,
      });
      transaction.create(serialReference, { equipmentId: equipmentReference.id, createdAt: now });
      transaction.create(tagReference, {
        tagId,
        equipmentId: equipmentReference.id,
        hardwareUidHex: uid,
        chipFamily,
        status: "active",
        enrolledBy: actor.uid,
        enrolledAt: now,
        replacedAt: null,
        replacedBy: null,
      });
      transaction.create(auditReference, {
        eventId: auditReference.id,
        type: "equipment_enrolled",
        actorUid: actor.uid,
        actorRole: actor.role,
        equipmentIds: [equipmentReference.id],
        claimIds: [],
        metadata: { tagId, internalSerial: serial.display },
        createdAt: now,
      });
    });
    return { equipmentId: equipmentReference.id, tagId };
  } catch (error) {
    callableFailure(error);
  }
});

export const editEquipment = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request, "teacher");
  const data = requestData(request);
  try {
    const equipmentId = validateString(data.equipmentId, "equipment-id", 128);
    const name = validateEquipmentName(data.name);
    const serial = normalizeSerial(data.internalSerial);
    const status = data.status === "retired" ? "retired" : "active";
    const equipmentReference = db.collection("equipment").doc(equipmentId);
    const newSerialReference = db.collection("equipmentSerials").doc(serial.normalized);
    const auditReference = db.collection("auditEvents").doc();
    const now = Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const equipmentSnapshot = await transaction.get(equipmentReference);
      if (!equipmentSnapshot.exists) throw new HttpsError("not-found", "equipment-not-found");
      const previousSerial = equipmentSnapshot.get("normalizedInternalSerial") as string;
      const newGuard = await transaction.get(newSerialReference);
      if (newGuard.exists && newGuard.get("equipmentId") !== equipmentId) {
        throw new HttpsError("already-exists", "duplicate-serial");
      }
      if (!newGuard.exists) transaction.create(newSerialReference, { equipmentId, createdAt: now });
      if (previousSerial && previousSerial !== serial.normalized) {
        transaction.delete(db.collection("equipmentSerials").doc(previousSerial));
      }
      transaction.update(equipmentReference, {
        name,
        internalSerial: serial.display,
        normalizedInternalSerial: serial.normalized,
        status,
        updatedBy: actor.uid,
        updatedAt: now,
      });
      transaction.create(auditReference, {
        eventId: auditReference.id,
        type: "equipment_updated",
        actorUid: actor.uid,
        actorRole: actor.role,
        equipmentIds: [equipmentId],
        claimIds: [],
        metadata: { status },
        createdAt: now,
      });
    });
    return { equipmentId, status };
  } catch (error) {
    callableFailure(error);
  }
});

export const replaceTag = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request, "teacher");
  const data = requestData(request);
  try {
    const equipmentId = validateString(data.equipmentId, "equipment-id", 128);
    const newTagId = validateTagId(data.tagId);
    const uid = hardwareUid(data.hardwareUidHex);
    const equipmentReference = db.collection("equipment").doc(equipmentId);
    const newTagReference = db.collection("tags").doc(newTagId);
    const auditReference = db.collection("auditEvents").doc();
    const now = Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const equipmentSnapshot = await transaction.get(equipmentReference);
      if (!equipmentSnapshot.exists) throw new HttpsError("not-found", "equipment-not-found");
      const oldTagId = equipmentSnapshot.get("activeTagId") as string;
      const oldTagReference = db.collection("tags").doc(oldTagId);
      const [newTag, oldTag] = await transaction.getAll(newTagReference, oldTagReference);
      if (!newTag || !oldTag) throw new HttpsError("internal", "transaction-read-failed");
      if (newTag.exists) throw new HttpsError("already-exists", "duplicate-tag");
      if (!oldTag.exists) throw new HttpsError("failed-precondition", "active-tag-mapping-missing");

      transaction.update(oldTagReference, {
        status: "replaced",
        replacedAt: now,
        replacedBy: actor.uid,
      });
      transaction.create(newTagReference, {
        tagId: newTagId,
        equipmentId,
        hardwareUidHex: uid,
        chipFamily: typeof data.chipFamily === "string" ? data.chipFamily.slice(0, 50) : null,
        status: "active",
        enrolledBy: actor.uid,
        enrolledAt: now,
        replacedAt: null,
        replacedBy: null,
      });
      transaction.update(equipmentReference, {
        activeTagId: newTagId,
        status: "active",
        updatedBy: actor.uid,
        updatedAt: now,
      });
      transaction.create(auditReference, {
        eventId: auditReference.id,
        type: "tag_replaced",
        actorUid: actor.uid,
        actorRole: actor.role,
        equipmentIds: [equipmentId],
        claimIds: [],
        metadata: { oldTagId, newTagId },
        createdAt: now,
      });
    });
    return { equipmentId, tagId: newTagId };
  } catch (error) {
    callableFailure(error);
  }
});

export const resolveTags = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request);
  const data = requestData(request);
  try {
    if (!Array.isArray(data.tagIds) || data.tagIds.length < 1 || data.tagIds.length > 20) {
      throw new Error("invalid-tag-batch");
    }
    const tagIds = [...new Set(data.tagIds.map(validateTagId))];
    if (tagIds.length !== data.tagIds.length) throw new Error("duplicate-tag");
    const tagSnapshots = await db.getAll(...tagIds.map((tagId) => db.collection("tags").doc(tagId)));
    const results = [];
    for (const tagSnapshot of tagSnapshots) {
      if (!tagSnapshot.exists) {
        results.push({ tagId: tagSnapshot.id, status: "unknown" });
        continue;
      }
      const tag = tagSnapshot.data()!;
      if (tag.status !== "active") {
        results.push({ tagId: tagSnapshot.id, status: "inactive" });
        continue;
      }
      const equipmentSnapshot = await db.collection("equipment").doc(tag.equipmentId as string).get();
      if (!equipmentSnapshot.exists || equipmentSnapshot.get("status") !== "active") {
        results.push({ tagId: tagSnapshot.id, status: "inactive" });
        continue;
      }
      const equipment = equipmentSnapshot.data()!;
      let activeClaimants: Array<{ studentUid: string; studentEmail: string; checkedOutAt: Timestamp }> | undefined;
      if (actor.role === "teacher") {
        const claims = await db
          .collection("claims")
          .where("equipmentId", "==", equipmentSnapshot.id)
          .where("status", "==", "active")
          .orderBy("checkedOutAt", "desc")
          .get();
        activeClaimants = claims.docs.map((claim) => ({
          studentUid: claim.get("studentUid") as string,
          studentEmail: claim.get("studentEmail") as string,
          checkedOutAt: claim.get("checkedOutAt") as Timestamp,
        }));
      }
      results.push({
        tagId: tagSnapshot.id,
        status: "active",
        equipment: {
          equipmentId: equipmentSnapshot.id,
          name: equipment.name,
          internalSerial: equipment.internalSerial,
        },
        ...(activeClaimants ? { activeClaimants } : {}),
      });
    }
    return { results };
  } catch (error) {
    callableFailure(error);
  }
});

export const confirmCheckout = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request, "student");
  const data = requestData(request);
  try {
    const items = validateCheckoutItems(data.items);
    const requestReference = idempotencyReference(actor.uid, "checkout", data.clientRequestId);
    const tagReferences = items.map((item) => db.collection("tags").doc(item.tagId));
    const now = Timestamp.now();

    const result = await db.runTransaction(async (transaction) => {
      const existingRequest = await transaction.get(requestReference);
      if (existingRequest.exists) return { ...existingRequest.data()!.result, replayed: true };
      const tagSnapshots = await transaction.getAll(...tagReferences);
      const equipmentIds = tagSnapshots.map((tagSnapshot) => {
        if (!tagSnapshot.exists) throw new HttpsError("not-found", "tag-not-enrolled");
        if (tagSnapshot.get("status") !== "active") throw new HttpsError("failed-precondition", "tag-inactive");
        return tagSnapshot.get("equipmentId") as string;
      });
      const equipmentSnapshots = await transaction.getAll(
        ...equipmentIds.map((equipmentId) => db.collection("equipment").doc(equipmentId)),
      );
      if (equipmentSnapshots.some((equipmentSnapshot) => !equipmentSnapshot.exists || equipmentSnapshot.get("status") !== "active")) {
        throw new HttpsError("failed-precondition", "equipment-inactive");
      }

      const checkoutBatchId = db.collection("checkoutBatches").doc().id;
      const claimReferences = items.map(() => db.collection("claims").doc());
      items.forEach((item, index) => {
        const claimReference = claimReferences[index]!;
        const equipmentId = equipmentIds[index]!;
        transaction.create(claimReference, {
          claimId: claimReference.id,
          checkoutBatchId,
          returnBatchId: null,
          equipmentId,
          tagIdAtCheckout: item.tagId,
          studentUid: actor.uid,
          studentEmail: actor.email,
          condition: item.condition,
          issueText: item.issueText ?? null,
          status: "active",
          checkedOutAt: now,
          returnedAt: null,
          returnedByTeacherUid: null,
          overdueNotificationSentAt: null,
        });
        if (item.condition === "has_issue") {
          const issueReference = db.collection("issues").doc();
          transaction.create(issueReference, {
            issueId: issueReference.id,
            claimId: claimReference.id,
            equipmentId,
            reportedByStudentUid: actor.uid,
            text: item.issueText,
            status: "open",
            reportedAt: now,
            resolvedAt: null,
            resolvedByTeacherUid: null,
          });
        }
      });
      const auditReference = db.collection("auditEvents").doc();
      transaction.create(auditReference, {
        eventId: auditReference.id,
        type: "checkout_confirmed",
        actorUid: actor.uid,
        actorRole: actor.role,
        equipmentIds,
        claimIds: claimReferences.map((reference) => reference.id),
        metadata: { checkoutBatchId, itemCount: items.length },
        createdAt: now,
      });
      const persistedResult = {
        checkoutBatchId,
        equipmentIds,
        claimIds: claimReferences.map((reference) => reference.id),
        checkedOutAtMillis: now.toMillis(),
      };
      transaction.create(requestReference, { kind: "checkout", actorUid: actor.uid, result: persistedResult, createdAt: now });
      return { ...persistedResult, replayed: false };
    });

    if (!result.replayed) {
      await deliverBestEffort(
        () => sendToUsers([actor.uid], "Equipment checked out", `${items.length} item${items.length === 1 ? "" : "s"} checked out.`, {
          type: "checkout_confirmed",
          checkoutBatchId: result.checkoutBatchId as string,
        }),
        { type: "checkout_confirmed", checkoutBatchId: result.checkoutBatchId },
      );
      if (items.some((item) => item.condition === "has_issue")) {
        await deliverBestEffort(
          () => sendToTeachers("Equipment issue reported", "A student reported an equipment issue.", {
            type: "issue_reported",
            checkoutBatchId: result.checkoutBatchId as string,
          }),
          { type: "issue_reported", checkoutBatchId: result.checkoutBatchId },
        );
      }
    }
    return result;
  } catch (error) {
    callableFailure(error);
  }
});

export const confirmReturn = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request, "teacher");
  const data = requestData(request);
  try {
    if (!Array.isArray(data.tagIds) || data.tagIds.length < 1 || data.tagIds.length > 20) {
      throw new Error("invalid-tag-batch");
    }
    const tagIds = [...new Set(data.tagIds.map(validateTagId))];
    if (tagIds.length !== data.tagIds.length) throw new Error("duplicate-tag");
    const requestReference = idempotencyReference(actor.uid, "return", data.clientRequestId);
    const tagReferences = tagIds.map((tagId) => db.collection("tags").doc(tagId));
    const now = Timestamp.now();

    const result = await db.runTransaction(async (transaction) => {
      const existingRequest = await transaction.get(requestReference);
      if (existingRequest.exists) return { ...existingRequest.data()!.result, replayed: true };
      const tagSnapshots = await transaction.getAll(...tagReferences);
      const equipmentIds = tagSnapshots.map((tagSnapshot) => {
        if (!tagSnapshot.exists) throw new HttpsError("not-found", "tag-not-enrolled");
        if (tagSnapshot.get("status") !== "active") throw new HttpsError("failed-precondition", "tag-inactive");
        return tagSnapshot.get("equipmentId") as string;
      });
      const claimSnapshots = await Promise.all(
        equipmentIds.map((equipmentId) =>
          transaction.get(db.collection("claims").where("equipmentId", "==", equipmentId).where("status", "==", "active")),
        ),
      );
      const claims = claimSnapshots.flatMap((snapshot) => snapshot.docs);
      if (claims.length > 400) throw new HttpsError("resource-exhausted", "too-many-active-claims");
      const returnBatchId = db.collection("returnBatches").doc().id;
      claims.forEach((claim) => {
        transaction.update(claim.ref, {
          status: "returned",
          returnBatchId,
          returnedAt: now,
          returnedByTeacherUid: actor.uid,
        });
      });
      const noClaimEquipmentIds = equipmentIds.filter((equipmentId) => !claims.some((claim) => claim.get("equipmentId") === equipmentId));
      const auditReference = db.collection("auditEvents").doc();
      transaction.create(auditReference, {
        eventId: auditReference.id,
        type: claims.length === 0 ? "return_without_claim" : "return_confirmed",
        actorUid: actor.uid,
        actorRole: actor.role,
        equipmentIds,
        claimIds: claims.map((claim) => claim.id),
        metadata: { returnBatchId, noClaimEquipmentIds },
        createdAt: now,
      });
      const persistedResult = {
        returnBatchId,
        equipmentIds,
        claimIds: claims.map((claim) => claim.id),
        studentUids: [...new Set(claims.map((claim) => claim.get("studentUid") as string))],
        returnedAtMillis: now.toMillis(),
      };
      transaction.create(requestReference, { kind: "return", actorUid: actor.uid, result: persistedResult, createdAt: now });
      return { ...persistedResult, replayed: false };
    });

    if (!result.replayed && (result.studentUids as string[]).length > 0) {
      await deliverBestEffort(
        () => sendToUsers(
          result.studentUids as string[],
          "Equipment returned",
          "Your equipment return was recorded.",
          { type: "return_confirmed", returnBatchId: result.returnBatchId as string },
        ),
        { type: "return_confirmed", returnBatchId: result.returnBatchId },
      );
    }
    return result;
  } catch (error) {
    callableFailure(error);
  }
});

export const updateIssue = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = authenticatedActor(request, "teacher");
  const data = requestData(request);
  try {
    const issueId = validateString(data.issueId, "issue-id", 128);
    const status = data.status;
    if (status !== "acknowledged" && status !== "resolved" && status !== "open") {
      throw new Error("invalid-issue-status");
    }
    const issueReference = db.collection("issues").doc(issueId);
    const issue = await issueReference.get();
    if (!issue.exists) throw new HttpsError("not-found", "issue-not-found");
    await issueReference.update({
      status,
      resolvedAt: status === "resolved" ? Timestamp.now() : null,
      resolvedByTeacherUid: status === "resolved" ? actor.uid : null,
    });
    return { issueId, status };
  } catch (error) {
    callableFailure(error);
  }
});

export const sendOverdueNotifications = onSchedule(
  { region: REGION, schedule: "every 60 minutes", timeZone: "Asia/Singapore" },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - overdueHours.value() * 60 * 60 * 1000);
    const snapshot = await db
      .collection("claims")
      .where("status", "==", "active")
      .where("checkedOutAt", "<=", cutoff)
      .where("overdueNotificationSentAt", "==", null)
      .limit(200)
      .get();
    for (const claim of snapshot.docs) {
      try {
        await Promise.all([
          sendToUsers([claim.get("studentUid") as string], "Equipment return overdue", "Equipment is overdue for return.", {
            type: "claim_overdue",
            claimId: claim.id,
          }),
          sendToTeachers("Overdue equipment", "An equipment claim is overdue.", {
            type: "claim_overdue",
            claimId: claim.id,
          }),
        ]);
        await claim.ref.update({ overdueNotificationSentAt: FieldValue.serverTimestamp() });
      } catch (error) {
        logger.error("Unable to send overdue notification", { claimId: claim.id, error });
      }
    }
  },
);
