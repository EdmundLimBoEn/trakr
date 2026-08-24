# Trakr native MVP

Trakr is an NFC equipment checkout app with native SwiftUI iOS and Jetpack Compose Android clients backed by Firebase.

## Firebase client config (required)

`GoogleService-Info.plist` and `google-services.json` are gitignored (API keys). Add them locally before a Firebase-backed build:

1. Firebase Console → Project settings → Your apps → download config files, **or**
2. Copy the examples and fill in values from your project:

```sh
cp Trakr/GoogleService-Info.plist.example Trakr/GoogleService-Info.plist
cp android/app/google-services.json.example android/app/google-services.json
```

See [production-integration.md](docs/production-integration.md) for restrictions and pilot setup.
Remote toggles (demo menu, maintenance mode, tabs, …) are documented in [feature-flags.md](docs/feature-flags.md).
The Cloudflare ops dashboard (feature flags + inventory/claims/issues) is documented in [ops-dashboard.md](docs/ops-dashboard.md) and lives in [`dashboard/`](dashboard/).

## iOS

1. Place `Trakr/GoogleService-Info.plist` (see above).
2. Open `Trakr.xcodeproj` in Xcode.
3. Select an iPhone simulator or NFC-capable physical iPhone.
4. Run the `Trakr` scheme.
5. Sign in with an approved school Google account. When the `isDemo` feature flag is on, press and hold **Sign in with Google** for 3 seconds to pick a Student or Teacher demo account.

The deployment target is iOS 17. Firebase and Google Sign-In are installed with Swift Package Manager.

## Android

```sh
# Place android/app/google-services.json first (see Firebase client config).
cd android
./gradlew assembleDebug
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` on an Android 8+ device, or open the `android` directory in Android Studio. The Compose app supports Google sign-in, NFC NDEF read/write, student checkout, teacher returns and enrollment, issue handling, and complete local demo workflows.

## MVP behavior

- Approved school-email role derivation.
- Student multi-item staging, removal, batch condition acknowledgment, issue reporting, idempotent checkout, receipt, and personal history.
- Teacher NFC enrollment with write/read-back verification, equipment editing/retirement, history-preserving tag replacement, active claimant visibility, multi-item returns, and return-all semantics.
- Teacher overview for open, acknowledged, and resolved issues.
- Role-scoped in-app checkout, return, issue, and overdue notifications without leaking issue text.
- Persistent on-device equipment, claim, issue, notification, idempotency, and audit records with backward-compatible decoding.
- Live network reachability plus offline protection that preserves staged items.
- Real Core NFC and Android NDEF reading/writing using branded `tr:` payloads.
- Simulator demo controls for every workflow.

## Firebase Spark backend

The configured project is `trakr-sst-2026` in `asia-southeast1`. Trakr uses only Spark-plan services: Google Authentication, Cloud Firestore, Security Rules, and indexes. Clients write atomic Firestore batches directly; verified email claims and Security Rules enforce the student/teacher boundary. No Cloud Functions, Cloud Messaging, Cloud Scheduler, or billing account.

Overdue status and workflow alerts are calculated in-app. See [production-integration.md](docs/production-integration.md).

## Test

```sh
xcodebuild test \
  -project Trakr.xcodeproj \
  -scheme Trakr \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

The suite includes unit coverage for authorization, validation, idempotency, multiple claims, return-all behavior, tag replacement, persistence migration, issue lifecycle, notification scoping, and overdue deduplication. UI tests exercise student checkout/activity, teacher return, enrollment, and tag replacement.

Validate the backend:

```sh
bun install --cwd firebase/functions
bun run --cwd firebase/functions verify
```

Validate Android:

```sh
cd android
./gradlew testDebugUnitTest assembleDebug lintDebug
```
