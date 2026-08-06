import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

let environment: RulesTestEnvironment;

const teacherClaims = {
  email: "teacher@sst.edu.sg",
  email_verified: true,
};
const alexClaims = {
  email: "alex@media.ssts.edu.sg",
  email_verified: true,
};
const jamieClaims = {
  email: "jamie@media.ssts.edu.sg",
  email_verified: true,
};

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "trakr-test",
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
    const now = new Date();
    await Promise.all([
      setDoc(doc(firestore, "equipment/camera"), {
        equipmentId: "camera",
        name: "Camera",
        internalSerial: "MC-CAM-01",
        normalizedInternalSerial: "MC-CAM-01",
        activeTagId: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC",
        status: "active",
        enrolledBy: "teacher",
        enrolledAt: now,
        updatedBy: "teacher",
        updatedAt: now,
      }),
      setDoc(doc(firestore, "tags/tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC"), {
        tagId: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC",
        equipmentId: "camera",
        hardwareUidHex: "04A1B2C3",
        chipFamily: "NFC Forum Type 2",
        status: "active",
        enrolledBy: "teacher",
        enrolledAt: now,
        replacedAt: null,
        replacedBy: null,
      }),
      setDoc(doc(firestore, "claims/alex-existing"), {
        claimId: "alex-existing",
        checkoutBatchId: "existing-batch",
        returnBatchId: null,
        equipmentId: "camera",
        tagIdAtCheckout: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC",
        studentUid: "alex",
        studentEmail: alexClaims.email,
        condition: "no_issues",
        issueText: null,
        status: "active",
        checkedOutAt: now,
        returnedAt: null,
        returnedByTeacherUid: null,
        overdueNotificationSentAt: null,
      }),
      setDoc(doc(firestore, "claims/jamie-existing"), {
        claimId: "jamie-existing",
        studentUid: "jamie",
        status: "active",
      }),
      setDoc(doc(firestore, "issues/alex-existing"), {
        issueId: "alex-existing",
        claimId: "alex-existing",
        equipmentId: "camera",
        reportedByStudentUid: "alex",
        text: "Loose plate",
        status: "open",
        reportedAt: now,
        resolvedAt: null,
        resolvedByTeacherUid: null,
      }),
    ]);
  });
});

afterAll(async () => {
  await environment.cleanup();
});

function validProfile(uid: string, email: string, role: "student" | "teacher") {
  return {
    uid,
    email,
    displayName: "Test User",
    role,
    emailDomain: email.split("@")[1],
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };
}

function validClaim(claimId: string, batchId: string, uid = "alex", email = alexClaims.email) {
  return {
    claimId,
    checkoutBatchId: batchId,
    returnBatchId: null,
    equipmentId: "camera",
    tagIdAtCheckout: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC",
    studentUid: uid,
    studentEmail: email,
    condition: "no_issues",
    issueText: null,
    status: "active",
    checkedOutAt: serverTimestamp(),
    returnedAt: null,
    returnedByTeacherUid: null,
    overdueNotificationSentAt: null,
  };
}

describe("identity and PII", () => {
  test("allows an approved user to create only their valid derived profile", async () => {
    const firestore = environment.authenticatedContext("alex", alexClaims).firestore();
    await assertSucceeds(setDoc(doc(firestore, "users/alex"), validProfile("alex", alexClaims.email, "student")));
    await assertFails(setDoc(doc(firestore, "users/alex"), validProfile("alex", alexClaims.email, "teacher")));
    await assertFails(setDoc(doc(firestore, "users/jamie"), validProfile("jamie", jamieClaims.email, "student")));
  });

  test("denies unverified and unrelated Google identities", async () => {
    const unverified = environment.authenticatedContext("alex", {
      email: alexClaims.email,
      email_verified: false,
    }).firestore();
    const outsider = environment.authenticatedContext("outsider", {
      email: "person@gmail.com",
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(unverified, "equipment/camera")));
    await assertFails(getDoc(doc(outsider, "equipment/camera")));
  });
});

describe("inventory", () => {
  test("allows approved users to resolve inventory but only teachers to mutate it", async () => {
    const student = environment.authenticatedContext("alex", alexClaims).firestore();
    const teacher = environment.authenticatedContext("teacher", teacherClaims).firestore();
    await assertSucceeds(getDoc(doc(student, "equipment/camera")));
    await assertFails(updateDoc(doc(student, "equipment/camera"), { name: "Stolen" }));

    const batch = writeBatch(teacher);
    batch.set(doc(teacher, "equipment/tripod"), {
      equipmentId: "tripod",
      name: "Tripod",
      internalSerial: "MC-TRI-02",
      normalizedInternalSerial: "MC-TRI-02",
      activeTagId: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TD",
      status: "active",
      enrolledBy: "teacher",
      enrolledAt: serverTimestamp(),
      updatedBy: "teacher",
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(teacher, "tags/tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TD"), {
      tagId: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TD",
      equipmentId: "tripod",
      hardwareUidHex: "04A1B2C4",
      chipFamily: "NFC Forum Type 2",
      status: "active",
      enrolledBy: "teacher",
      enrolledAt: serverTimestamp(),
      replacedAt: null,
      replacedBy: null,
    });
    batch.set(doc(teacher, "equipmentSerials/MC-TRI-02"), {
      equipmentId: "tripod",
      normalizedSerial: "MC-TRI-02",
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  test("rejects schema pollution during teacher updates", async () => {
    const teacher = environment.authenticatedContext("teacher", teacherClaims).firestore();
    await assertFails(updateDoc(doc(teacher, "equipment/camera"), {
      name: "Camera",
      extraAdmin: true,
      updatedBy: "teacher",
      updatedAt: serverTimestamp(),
    }));
  });
});

describe("checkout and issues", () => {
  test("allows a student batch containing their own claim and linked issue", async () => {
    const firestore = environment.authenticatedContext("alex", alexClaims).firestore();
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, "checkoutBatches/batch-1"), {
      batchId: "batch-1",
      studentUid: "alex",
      studentEmail: alexClaims.email,
      itemCount: 1,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(firestore, "claims/claim-1"), {
      ...validClaim("claim-1", "batch-1"),
      condition: "has_issue",
      issueText: "Lens cap is cracked",
    });
    batch.set(doc(firestore, "issues/issue-1"), {
      issueId: "issue-1",
      claimId: "claim-1",
      equipmentId: "camera",
      reportedByStudentUid: "alex",
      text: "Lens cap is cracked",
      status: "open",
      reportedAt: serverTimestamp(),
      resolvedAt: null,
      resolvedByTeacherUid: null,
    });
    await assertSucceeds(batch.commit());
  });

  test("denies ownership hijacking and direct student returns", async () => {
    const firestore = environment.authenticatedContext("alex", alexClaims).firestore();
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, "checkoutBatches/batch-bad"), {
      batchId: "batch-bad",
      studentUid: "alex",
      studentEmail: alexClaims.email,
      itemCount: 1,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(firestore, "claims/claim-bad"), validClaim("claim-bad", "batch-bad", "jamie", jamieClaims.email));
    await assertFails(batch.commit());
    await assertFails(updateDoc(doc(firestore, "claims/alex-existing"), { status: "returned" }));
  });

  test("allows only the owner or a teacher to read claims and issues", async () => {
    const alex = environment.authenticatedContext("alex", alexClaims).firestore();
    const teacher = environment.authenticatedContext("teacher", teacherClaims).firestore();
    await assertSucceeds(getDoc(doc(alex, "claims/alex-existing")));
    await assertFails(getDoc(doc(alex, "claims/jamie-existing")));
    await assertSucceeds(getDoc(doc(teacher, "claims/jamie-existing")));
    await assertSucceeds(getDoc(doc(alex, "issues/alex-existing")));
  });
});

describe("returns and issue lifecycle", () => {
  test("allows a teacher return batch and constrained active-to-returned transition", async () => {
    const firestore = environment.authenticatedContext("teacher", teacherClaims).firestore();
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, "returnBatches/return-1"), {
      batchId: "return-1",
      teacherUid: "teacher",
      claimCount: 1,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(firestore, "claims/alex-existing"), {
      status: "returned",
      returnBatchId: "return-1",
      returnedAt: serverTimestamp(),
      returnedByTeacherUid: "teacher",
    });
    await assertSucceeds(batch.commit());
  });

  test("allows valid issue status changes and rejects oversized corruption", async () => {
    const firestore = environment.authenticatedContext("teacher", teacherClaims).firestore();
    await assertSucceeds(updateDoc(doc(firestore, "issues/alex-existing"), {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      resolvedByTeacherUid: "teacher",
    }));
    await assertFails(updateDoc(doc(firestore, "issues/alex-existing"), {
      text: "x".repeat(1000),
      status: "open",
      resolvedAt: null,
      resolvedByTeacherUid: null,
    }));
  });
});

describe("shared demo and school inventory", () => {
  const anonymousAuth = { firebase: { sign_in_provider: "anonymous" } };

  function validDemoProfile(uid: string, role: "student" | "teacher") {
    return {
      uid,
      displayName: "Demo User",
      role,
      demo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
  }

  test("lets demo teachers enroll into the shared inventory school students can read", async () => {
    const demoTeacher = environment.authenticatedContext("demoTeacher", anonymousAuth).firestore();
    await assertSucceeds(
      setDoc(doc(demoTeacher, "demoUsers/demoTeacher"), validDemoProfile("demoTeacher", "teacher"))
    );

    const batch = writeBatch(demoTeacher);
    batch.set(doc(demoTeacher, "equipment/demo-cam"), {
      equipmentId: "demo-cam",
      name: "Demo Camera",
      internalSerial: "MC-DEMO-01",
      normalizedInternalSerial: "MC-DEMO-01",
      activeTagId: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TF",
      status: "active",
      enrolledBy: "demoTeacher",
      enrolledAt: serverTimestamp(),
      updatedBy: "demoTeacher",
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(demoTeacher, "tags/tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TF"), {
      tagId: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TF",
      equipmentId: "demo-cam",
      hardwareUidHex: "04A1B2C9",
      chipFamily: "NFC Forum Type 2",
      status: "active",
      enrolledBy: "demoTeacher",
      enrolledAt: serverTimestamp(),
      replacedAt: null,
      replacedBy: null,
    });
    batch.set(doc(demoTeacher, "equipmentSerials/MC-DEMO-01"), {
      equipmentId: "demo-cam",
      normalizedSerial: "MC-DEMO-01",
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());

    const schoolStudent = environment.authenticatedContext("alex", alexClaims).firestore();
    await assertSucceeds(getDoc(doc(schoolStudent, "equipment/demo-cam")));
    await assertSucceeds(getDoc(doc(schoolStudent, "tags/tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TF")));
  });

  test("lets demo students check out shared equipment and denies demo students enroll", async () => {
    const demoTeacher = environment.authenticatedContext("demoTeacher", anonymousAuth).firestore();
    await assertSucceeds(
      setDoc(doc(demoTeacher, "demoUsers/demoTeacher"), validDemoProfile("demoTeacher", "teacher"))
    );

    const demoStudent = environment.authenticatedContext("demoStudent", anonymousAuth).firestore();
    await assertSucceeds(
      setDoc(doc(demoStudent, "demoUsers/demoStudent"), validDemoProfile("demoStudent", "student"))
    );
    await assertSucceeds(getDoc(doc(demoStudent, "equipment/camera")));
    await assertFails(
      setDoc(doc(demoStudent, "equipment/tripod"), {
        equipmentId: "tripod",
        name: "Tripod",
        internalSerial: "MC-TRI-02",
        normalizedInternalSerial: "MC-TRI-02",
        activeTagId: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TD",
        status: "active",
        enrolledBy: "demoStudent",
        enrolledAt: serverTimestamp(),
        updatedBy: "demoStudent",
        updatedAt: serverTimestamp(),
      })
    );

    const batch = writeBatch(demoStudent);
    batch.set(doc(demoStudent, "checkoutBatches/batch-1"), {
      batchId: "batch-1",
      studentUid: "demoStudent",
      studentEmail: "alex.lim@s2026.ssts.edu.sg",
      itemCount: 1,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(demoStudent, "claims/claim-1"), {
      ...validClaim("claim-1", "batch-1", "demoStudent", "alex.lim@s2026.ssts.edu.sg"),
    });
    await assertSucceeds(batch.commit());
  });

  test("denies role escalation and foreign demo profile access", async () => {
    const demoTeacher = environment.authenticatedContext("demoTeacher", anonymousAuth).firestore();
    await assertSucceeds(
      setDoc(doc(demoTeacher, "demoUsers/demoTeacher"), validDemoProfile("demoTeacher", "teacher"))
    );

    const demoStudent = environment.authenticatedContext("demoStudent", anonymousAuth).firestore();
    await assertFails(getDoc(doc(demoStudent, "demoUsers/demoTeacher")));
    await assertFails(
      setDoc(doc(demoStudent, "demoUsers/demoTeacher"), validDemoProfile("demoTeacher", "student"))
    );
    await assertFails(
      updateDoc(doc(demoTeacher, "demoUsers/demoTeacher"), {
        ...validDemoProfile("demoTeacher", "student"),
      })
    );
  });

  test("denies anonymous users without a demo profile on shared collections", async () => {
    const anonymous = environment.authenticatedContext("anon", anonymousAuth).firestore();
    await assertFails(getDoc(doc(anonymous, "equipment/camera")));
    await assertFails(setDoc(doc(anonymous, "users/anon"), { uid: "anon" }));
  });

  test("allows public reads of feature flags and denies client writes", async () => {
    const unauthenticated = environment.unauthenticatedContext().firestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "config/featureFlags"), {
        isDemo: true,
        googleSignInEnabled: true,
      });
    });
    await assertSucceeds(getDoc(doc(unauthenticated, "config/featureFlags")));
    await assertFails(
      setDoc(doc(unauthenticated, "config/featureFlags"), { isDemo: false })
    );
  });
});

test("unauthenticated clients are denied", async () => {
  const firestore = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(firestore, "equipment/camera")));
  expect(true).toBe(true);
});
