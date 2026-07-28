import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "gearguard-test",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, "equipment/camera"), { name: "Camera" }),
      setDoc(doc(firestore, "claims/alex-claim"), { studentUid: "alex", status: "active" }),
      setDoc(doc(firestore, "claims/jamie-claim"), { studentUid: "jamie", status: "active" }),
      setDoc(doc(firestore, "issues/alex-issue"), { reportedByStudentUid: "alex", status: "open" }),
      setDoc(doc(firestore, "auditEvents/event"), { actorUid: "teacher" }),
    ]);
  });
});

afterAll(async () => {
  await environment.cleanup();
});

describe("student access", () => {
  test("reads only the signed-in student's claims and issues", async () => {
    const firestore = environment.authenticatedContext("alex", { role: "student" }).firestore();
    await assertSucceeds(getDoc(doc(firestore, "claims/alex-claim")));
    await assertFails(getDoc(doc(firestore, "claims/jamie-claim")));
    await assertSucceeds(getDoc(doc(firestore, "issues/alex-issue")));
    await assertFails(getDoc(doc(firestore, "equipment/camera")));
  });

  test("cannot write protected records", async () => {
    const firestore = environment.authenticatedContext("alex", { role: "student" }).firestore();
    await assertFails(setDoc(doc(firestore, "claims/new"), { studentUid: "alex" }));
    await assertFails(setDoc(doc(firestore, "equipment/new"), { name: "New" }));
    await assertFails(setDoc(doc(firestore, "auditEvents/new"), { actorUid: "alex" }));
  });
});

describe("teacher access", () => {
  test("reads inventory, all claims, issues, and audit events", async () => {
    const firestore = environment.authenticatedContext("teacher", { role: "teacher" }).firestore();
    const reads = await Promise.all([
      assertSucceeds(getDoc(doc(firestore, "equipment/camera"))),
      assertSucceeds(getDoc(doc(firestore, "claims/alex-claim"))),
      assertSucceeds(getDoc(doc(firestore, "claims/jamie-claim"))),
      assertSucceeds(getDoc(doc(firestore, "issues/alex-issue"))),
      assertSucceeds(getDoc(doc(firestore, "auditEvents/event"))),
    ]);
    expect(reads).toHaveLength(5);
  });

  test("cannot bypass callable functions for writes", async () => {
    const firestore = environment.authenticatedContext("teacher", { role: "teacher" }).firestore();
    await assertFails(setDoc(doc(firestore, "equipment/new"), { name: "New" }));
    await assertFails(setDoc(doc(firestore, "issues/alex-issue"), { status: "resolved" }));
  });
});

test("unauthenticated clients are denied", async () => {
  const firestore = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(firestore, "equipment/camera")));
  await assertFails(getDoc(doc(firestore, "claims/alex-claim")));
});

