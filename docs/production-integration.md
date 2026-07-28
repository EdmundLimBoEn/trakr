# Production integration

The repository includes the full single-device iOS workflow and the trusted Firebase implementation. The backend provides:

- verified-domain role derivation and Auth custom claims;
- device-token registration;
- equipment enrollment, editing, and tag replacement;
- role-aware tag resolution;
- atomic, idempotent checkout and return operations;
- issue lifecycle updates and immutable checkout/return audit records;
- generic FCM notifications and an hourly overdue job;
- deny-by-default Firestore Security Rules and required indexes.

## Deploy the backend

1. Create development and production Firebase projects.
2. Copy `.firebaserc.example` to `.firebaserc` and replace both project IDs.
3. Enable Authentication with Google, Firestore, Functions, Cloud Scheduler, and Cloud Messaging.
4. From the repository root, run:

   ```sh
   bun install --cwd firebase/functions
   bun run --cwd firebase/functions verify
   bun run --cwd firebase/functions deploy -- --project development
   ```

5. Set `OVERDUE_HOURS` when prompted or keep the default of 24.

## Connect the school iOS environment

The credential-free target intentionally uses `GearGuardStore`, so reviewers can run every flow immediately. For a shared live pilot:

1. Add the Firebase Auth, Functions, Firestore, Messaging, and Google Sign-In Swift packages.
2. Add the school project's `GoogleService-Info.plist` and reversed-client-ID URL type.
3. Exchange the local store operations for the matching callable functions. Preserve each `requestID` for retries and refresh the Firebase ID token after `initializeUser` assigns the role claim.
4. Register and rotate the FCM installation token through `registerDevice`.
5. Enable Push Notifications and background remote notifications, then upload an APNs authentication key to Firebase.
6. Enable NFC Tag Reading for the release App ID and sign the app on a physical device.

The SwiftUI screens, validation, idempotency keys, Core NFC adapter, and domain models already match these callable contracts.

## Pilot checks

- Enroll all 20 tags and verify each tag on every supported device.
- Test duplicate scans, invalid tags, interrupted network, and repeated confirmations.
- Verify two simultaneous active claims on one item, then confirm one return closes both.
- Confirm students cannot fetch another student's claim.
- Verify generic notification payloads contain identifiers only.
- Confirm a retired item cannot be checked out by calling the backend directly.
