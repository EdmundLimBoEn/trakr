# GearGuard iOS MVP

GearGuard is a native SwiftUI equipment checkout app driven by NFC tags. This repository contains the complete credential-free iOS MVP plus a deployable Firebase backend for the trusted multi-device workflows described in the product specification.

## Run

1. Open `GearGuard.xcodeproj` in Xcode.
2. Select an iPhone simulator or NFC-capable physical iPhone.
3. Run the `GearGuard` scheme.
4. Choose **Student** or **Teacher** on the sign-in screen.
5. In the simulator, use **Add demo equipment**, **Enroll demo tag**, and **Use demo replacement**. On a signed physical device with the NFC entitlement, use the NFC scan/write buttons.

The deployment target is iOS 17. No third-party packages or credentials are required for the on-device MVP.

## MVP behavior

- Approved school-email role derivation.
- Student multi-item staging, removal, batch condition acknowledgment, issue reporting, idempotent checkout, receipt, and personal history.
- Teacher NFC enrollment with write/read-back verification, equipment editing/retirement, history-preserving tag replacement, active claimant visibility, multi-item returns, and return-all semantics.
- Teacher overview for open, acknowledged, and resolved issues.
- Role-scoped in-app checkout, return, issue, and overdue notifications without leaking issue text.
- Persistent on-device equipment, claim, issue, notification, idempotency, and audit records with backward-compatible decoding.
- Live network reachability plus offline protection that preserves staged items.
- Real Core NFC ISO 14443/NDEF text reading and writing.
- Simulator demo controls for every workflow.

## Firebase backend

The local `GearGuardStore` makes every workflow runnable without school-owned credentials. The `firebase/` directory supplies the production callable functions, scheduled overdue notifications, immutable audit writes, indexes, deny-by-default Security Rules, and emulator tests. Connecting school Google OAuth, APNs, Firebase app configuration, and the iOS Firebase SDK remains an environment-specific deployment step. See [production-integration.md](docs/production-integration.md).

## Test

```sh
xcodebuild test \
  -project GearGuard.xcodeproj \
  -scheme GearGuard \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

The suite includes unit coverage for authorization, validation, idempotency, multiple claims, return-all behavior, tag replacement, persistence migration, issue lifecycle, notification scoping, and overdue deduplication. UI tests exercise student checkout/activity, teacher return, enrollment, and tag replacement.

Validate the backend:

```sh
bun install --cwd firebase/functions
bun run --cwd firebase/functions verify
```
