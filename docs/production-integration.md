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
3. Enable Anonymous under Authentication → Sign-in method (required for demo accounts; see below).
4. Create the default Firestore database in Native mode and `asia-southeast1`.
5. Run:

   ```sh
   bun install --cwd firebase/functions
   bun run --cwd firebase/functions verify
   bun run --cwd firebase/functions deploy -- --project development
   ```

The deploy script publishes only Firestore rules and indexes. It does not deploy Functions or require billing.

## Native credentials

Firebase client config files identify the apps. They are **not** admin credentials, but they do contain Google API keys and must **not** be committed (this repo is public).

1. Download from Firebase Console → Project settings → Your apps:
   - iOS → `GoogleService-Info.plist` → place at `Trakr/GoogleService-Info.plist`
   - Android → `google-services.json` → place at `android/app/google-services.json`
2. Or copy the examples and fill in values:
   - `Trakr/GoogleService-Info.plist.example`
   - `android/app/google-services.json.example`
3. Before distribution:
   - Register Android debug and release SHA-1/SHA-256 fingerprints, then refresh `google-services.json`.
   - Enable NFC Tag Reading for the iOS App ID and sign on a physical device.
   - Use separate Firebase app registrations and config files for production.
4. Harden keys in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):
   - iOS key: application restriction = iOS apps (`systems.edmundlim.trakr`)
   - Android key: application restriction = Android apps (package + SHA-1)
   - API restrictions: only Firebase / Identity Toolkit / related APIs you use

## Google sign-in troubleshooting

If "Continue with Google" hangs or fails, work through this checklist. The app logs each sign-in step to the unified log (subsystem `systems.edmundlim.trakr`, category `SignIn`); filter Console.app or the Xcode console by that subsystem to see exactly which step stalls.

1. **Google provider enabled** — Firebase Console → Authentication → Sign-in method → Google is enabled with a support email set.
2. **OAuth consent screen** — Google Cloud Console → APIs & Services → OAuth consent screen is configured and published (not left in a restricted/testing state that excludes school accounts).
3. **iOS OAuth client matches the app** — Google Cloud Console → APIs & Services → Credentials contains an iOS OAuth 2.0 client whose client ID matches `CLIENT_ID` in `Trakr/GoogleService-Info.plist` and whose bundle ID is `systems.edmundlim.trakr`. The reversed client ID must be registered as a URL type in `Trakr/Resources/Info.plist` (already committed).
4. **School Workspace allows the app** — student accounts (`*@s202X.ssts.edu.sg`) live in the SST Google Workspace. If the domain admin restricts third-party OAuth apps, sign-in fails or never completes for those accounts. An admin must allow Trakr's OAuth client under Admin console → Security → Access and data control → API controls → App access control.
5. **Verified email** — the app and the Firestore rules both reject unverified accounts; Google Workspace accounts are verified by default.

## Demo accounts

Demo sign-in is gated by the `isDemo` **feature flag** (`config/featureFlags`). See [feature-flags.md](feature-flags.md). When the flag is on, the “Use demo account” menu signs in with Firebase Anonymous Authentication. Role is stored in `demoUsers/{uid}`; inventory, tags, claims, and returns use the **same** Firestore collections as school Google accounts.

Demo teacher/student writes are intentionally loose for classroom testing. Turn `isDemo` off (and disable Anonymous auth) before a public launch.

For hermetic local runs (UI tests, offline previews), launch with `--local-demo` (also forces `isDemo` on in the client).

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
