# GearGuard Firebase backend

This directory contains the trusted server half of GearGuard:

- callable Cloud Functions in `functions/src/index.ts`;
- shared validation and role derivation;
- FCM device routing and scheduled overdue notifications;
- Firestore indexes and deny-by-default Security Rules;
- Bun unit tests and Firebase Emulator rules tests.

All callable functions run in `asia-southeast1` with App Check enforcement. Clients cannot write protected Firestore records directly.

Run checks from the repository root:

```sh
bun install --cwd firebase/functions
bun run --cwd firebase/functions verify
```

The checked-in `gearguard-test` environment file contains only the non-secret 24-hour emulator default. Use `bun run --cwd firebase/functions serve` for local emulators. Copy `.firebaserc.example` to `.firebaserc`, replace the project IDs, and use `bun run --cwd firebase/functions deploy` only after selecting the intended Firebase project.
