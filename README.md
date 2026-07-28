# GearGuard iOS MVP

GearGuard is a native SwiftUI equipment checkout app driven by NFC tags. This repository contains a complete credential-free MVP for the student checkout and teacher enrollment/return workflows described in the product specification.

## Run

1. Open `GearGuard.xcodeproj` in Xcode.
2. Select an iPhone simulator or NFC-capable physical iPhone.
3. Run the `GearGuard` scheme.
4. Choose **Student** or **Teacher** on the sign-in screen.
5. In the simulator, use **Add demo equipment** and **Enroll demo tag**. On a signed physical device with the NFC entitlement, use the NFC scan/write buttons.

The deployment target is iOS 17. No third-party packages, credentials, or backend are required.

## MVP behavior

- Approved school-email role derivation.
- Student multi-item staging, removal, batch condition acknowledgment, issue reporting, idempotent checkout, receipt, and personal history.
- Teacher NFC enrollment with write/read-back verification, inventory, active claimant visibility, multi-item returns, return-all semantics, and complete history.
- Persistent on-device equipment, claim, idempotency, and audit records.
- Offline protection that preserves staged items.
- Real Core NFC ISO 14443/NDEF text reading and writing.
- Simulator demo controls for every workflow.

## Production boundary

The local `GearGuardStore` intentionally makes the assignment runnable without Firebase secrets. Before a real school pilot, replace it with a Firebase implementation of the same operations so domain role assignment, authorization, transactions, and idempotency are trusted server-side. See [production-integration.md](docs/production-integration.md).

## Test

```sh
xcodebuild test \
  -project GearGuard.xcodeproj \
  -scheme GearGuard \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

