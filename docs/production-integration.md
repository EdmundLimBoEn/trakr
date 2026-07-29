# Production integration

The repository includes native iOS and Android workflows connected to the trusted Firebase implementation. The backend provides:

- verified-domain role derivation and Auth custom claims;
- device-token registration;
- equipment enrollment, editing, and tag replacement;
- role-aware tag resolution;
- atomic, idempotent checkout and return operations;
- issue lifecycle updates and immutable checkout/return audit records;
- generic FCM notifications and an hourly overdue job;
- deny-by-default Firestore Security Rules and required indexes.

## Deploy the backend

1. Use the configured `trakr-sst-2026` development project, and create a separate production project before a public launch.
2. Add the production project to `.firebaserc`.
3. Enable Authentication with Google, Firestore, Functions, Cloud Scheduler, Cloud Messaging, and App Check.
4. From the repository root, run:

   ```sh
   bun install --cwd firebase/functions
   bun run --cwd firebase/functions verify
   bun run --cwd firebase/functions deploy -- --project development
   ```

5. Set `OVERDUE_HOURS` when prompted or keep the default of 24.

## Native app credentials

The repository contains the development `GoogleService-Info.plist` and `google-services.json`; these identify Firebase apps but are not server credentials. Both clients refresh the Firebase ID token after `initializeUser`, preserve idempotency request IDs, and register their FCM installation.

Before distributing builds:

1. Register App Check debug tokens for local development and enable DeviceCheck/App Attest plus Play Integrity for release.
2. Upload the APNs authentication key and enable Push Notifications/background remote notifications on iOS.
3. Add Android debug and release SHA-1/SHA-256 fingerprints to the Firebase Android app, then download the refreshed `google-services.json`.
4. Enable NFC Tag Reading for the iOS App ID and sign on a physical device.

## Pilot checks

- Enroll all 20 tags and verify each tag on every supported device.
- Test duplicate scans, invalid tags, interrupted network, and repeated confirmations.
- Verify two simultaneous active claims on one item, then confirm one return closes both.
- Confirm students cannot fetch another student's claim.
- Verify generic notification payloads contain identifiers only.
- Confirm a retired item cannot be checked out by calling the backend directly.
