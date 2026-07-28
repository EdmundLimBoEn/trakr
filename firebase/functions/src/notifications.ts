import { getFirestore } from "firebase-admin/firestore";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { logger } from "firebase-functions";

interface DeviceTarget {
  token: string;
  referencePath: string;
}

async function userTargets(userIds: string[]): Promise<DeviceTarget[]> {
  const db = getFirestore();
  const snapshots = await Promise.all(
    userIds.map((uid) => db.collection("users").doc(uid).collection("devices").where("notificationsEnabled", "==", true).get()),
  );
  return snapshots.flatMap((snapshot) =>
    snapshot.docs.flatMap((document) => {
      const token = document.get("fcmToken");
      return typeof token === "string" && token ? [{ token, referencePath: document.ref.path }] : [];
    }),
  );
}

async function teacherIds(): Promise<string[]> {
  const snapshot = await getFirestore()
    .collection("users")
    .where("role", "==", "teacher")
    .where("active", "==", true)
    .get();
  return snapshot.docs.map((document) => document.id);
}

export async function sendToUsers(
  userIds: string[],
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  const targets = await userTargets([...new Set(userIds)]);
  if (targets.length === 0) return;

  const message: MulticastMessage = {
    tokens: targets.map((target) => target.token),
    notification: { title, body },
    data,
  };
  const result = await getMessaging().sendEachForMulticast(message);
  const invalidPaths: string[] = [];
  result.responses.forEach((response, index) => {
    if (response.success) return;
    const code = response.error?.code ?? "";
    if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
      const target = targets[index];
      if (target) invalidPaths.push(target.referencePath);
    } else {
      logger.warn("FCM delivery failed", { code });
    }
  });
  if (invalidPaths.length > 0) {
    const db = getFirestore();
    const batch = db.batch();
    invalidPaths.forEach((path) => batch.update(db.doc(path), { notificationsEnabled: false, fcmToken: "" }));
    await batch.commit();
  }
}

export async function sendToTeachers(
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  await sendToUsers(await teacherIds(), title, body, data);
}

