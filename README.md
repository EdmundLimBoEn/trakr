# Trakr native MVP

Trakr is an NFC equipment checkout app with native SwiftUI iOS and Jetpack Compose Android clients backed by Firebase.

## iOS

1. Open `Trakr.xcodeproj` in Xcode.
2. Select an iPhone simulator or NFC-capable physical iPhone.
3. Run the `Trakr` scheme.
4. Sign in with an approved school Google account, or choose a local Student/Teacher demo.

The deployment target is iOS 17. Firebase and Google Sign-In are installed with Swift Package Manager.

## Android

```sh
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

The configured project is `trakr-sst-2026` in `asia-southeast1`. Trakr uses only services available on Firebase's no-cost Spark plan: Google Authentication, Cloud Firestore, Security Rules, indexes, Cloud Messaging token registration, and the native SDK credentials. Both apps perform atomic Firestore batches directly; verified email claims and Security Rules enforce the student/teacher boundary. No Cloud Functions, Cloud Scheduler, server runtime, or billing account is required.

Spark does not provide Trakr with a trusted scheduled process or secure FCM sender. Overdue status is calculated in-app, and workflow alerts are in-app/local rather than guaranteed cross-device push notifications. See [production-integration.md](docs/production-integration.md).

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
