# Trakr Firebase Spark backend

Spark-plan only:

- Google Authentication with verified school email accounts
- Firestore in `asia-southeast1`
- deny-by-default Security Rules (roles from verified Auth email)
- indexes for role-scoped history and inventory queries
- atomic client write batches for checkout, return, enrollment, and tag replacement

`firebase.json` has no Functions configuration. The `functions` package is the domain + rules test harness only (no Cloud Functions runtime). Scripts expect the Firebase CLI on `PATH` (`firebase --version`).

```sh
bun install --cwd firebase/functions
bun run --cwd firebase/functions test
bun run --cwd firebase/functions verify
bun run --cwd firebase/functions deploy -- --project development
```

Deploy publishes Firestore rules and indexes only. Overdue and alerts are calculated in-app.
