# Trakr Firebase Spark backend

The production configuration uses only Spark-plan Firebase services:

- Google Authentication with verified school email accounts;
- Firestore in `asia-southeast1`;
- deny-by-default Security Rules that derive roles from verified Auth email claims;
- indexes for role-scoped history and inventory queries;
- atomic client write batches for checkout, return, enrollment, and tag replacement.

`firebase.json` intentionally has no Functions configuration. The old TypeScript implementation under `functions/src` is retained only as an upgrade reference; neither native app imports Firebase Functions or invokes it. The `functions` package remains the rules-test harness.

Run checks from the repository root:

```sh
bun install --cwd firebase/functions
bun run --cwd firebase/functions verify
```

Use `bun run --cwd firebase/functions serve` for the Auth and Firestore emulators. Deploying with `bun run --cwd firebase/functions deploy -- --project development` publishes Firestore rules and indexes only.

Spark limitation: there is no trusted scheduled overdue job or secure server-side FCM sender. The clients calculate overdue state and provide local/in-app alerts.
