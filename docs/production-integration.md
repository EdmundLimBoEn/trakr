# Firebase Spark integration

Trakr's native iOS and Android clients are designed to stay on Firebase's no-cost Spark plan. They use Google Authentication and direct Cloud Firestore access. Firestore Security Rules derive the role from Firebase's verified `email` claim:

- `@sst.edu.sg` is a teacher;
- any subdomain of `@ssts.edu.sg` is a student;
- unverified and unrelated accounts have no data access.

Checkout, return, equipment enrollment, serial uniqueness, tag replacement, and issue changes use atomic Firestore write batches. Rules validate complete schemas, ownership, immutable fields, related records, state transitions, and the maximum 20-item checkout size.

## Deploy

The configured development project is `trakr-sst-2026`; create a separate Firebase project before a public production launch.

1. Keep the project on Spark.
2. Enable Google under Authentication → Sign-in method.
3. Create the default Firestore database in Native mode and `asia-southeast1`.
4. Run:

   ```sh
   bun install --cwd firebase/functions
   bun run --cwd firebase/functions verify
   bun run --cwd firebase/functions deploy -- --project development
   ```

The deploy script publishes only Firestore rules and indexes. It does not deploy Functions or require billing.

## Native credentials

The checked-in development `GoogleService-Info.plist` and `google-services.json` identify the Firebase apps; they are not admin credentials. Before distribution:

1. Register Android debug and release SHA-1/SHA-256 fingerprints, then refresh `google-services.json`.
2. Enable NFC Tag Reading for the iOS App ID and sign on a physical device.
3. Use separate Firebase app registrations and downloaded config files for production.

## Spark limitations

- No trusted scheduled overdue process — each app calculates overdue state on refresh.
- No push notifications — workflow alerts are in-app only.
- Spark quotas apply. Watch Authentication and Firestore usage during the pilot.
- Client-generated request IDs and immutable batch documents make repeated confirmations safe; still test offline replay on devices.

## Pilot checks

- Enroll all tags and verify each one on supported devices.
- Test duplicate scans, invalid tags, interrupted networks, and repeated confirmations.
- Confirm students cannot query another student's claims or issues.
- Confirm teachers can return every active claim on an item.
- Confirm retired equipment cannot be checked out using direct Firestore calls.
- Review the deployed rules again before broadly sharing the app.
