# Production integration

The included app is the full single-device iOS workflow MVP. These external systems require school-owned credentials and must be connected before multi-device live deployment:

1. Create development and production Firebase projects.
2. Add Firebase Auth, Firestore, callable Functions, Messaging, and Google Sign-In packages.
3. Implement `initializeUser`, `resolveTags`, `enrollEquipment`, `confirmCheckout`, and `confirmReturn` callable functions from the source specification.
4. Replace `GearGuardStore` mutations with those callable operations. Keep `requestID` unchanged on retries.
5. Enforce the teacher/student role in Auth custom claims and deny direct client writes to claims and audit events.
6. Add `GoogleService-Info.plist`, the reversed-client-ID URL type, Push Notifications, Background Modes, and an APNs authentication key.
7. Configure the Apple NFC Tag Reading capability for the release App ID and sign on a physical device.

The UI, validation rules, idempotency keys, role-scoped notification inbox, and Core NFC adapter do not require redesign when the backend is swapped. Firebase Cloud Messaging should replace or supplement the local notification records for cross-device delivery.

## Pilot checks

- Enroll all 20 tags and verify each tag on every supported device.
- Test duplicate scans, invalid tags, interrupted network, and repeated confirmations.
- Verify two simultaneous active claims on one item, then confirm one return closes both.
- Confirm students cannot fetch another student's claim.
- Verify generic notification payloads contain identifiers only.
