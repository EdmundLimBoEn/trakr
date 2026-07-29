# Trakr Firebase backend

This directory contains the trusted server half of Trakr:

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

The checked-in `trakr-test` and `trakr-sst-2026` environment files contain only the non-secret 24-hour overdue default. Use `bun run --cwd firebase/functions serve` for local emulators. The active development alias points to `trakr-sst-2026`; add a distinct production alias before launch.
