# MVP verification matrix

This matrix separates behavior proven in the credential-free iOS MVP from checks that require school infrastructure or physical NFC hardware.

| Requirement | Evidence in this repository |
|---|---|
| Teacher and student domain roles | `testRoleDerivation`, `testRoleBoundariesAreEnforcedByStore` |
| Unsupported domains denied | `testRoleDerivation` |
| Equipment enrollment and uniqueness | Store validation plus enrollment UI test |
| NFC NDEF payload and UID normalization | `NFCService`, `testTagValidationAndUIDNormalization` |
| Multi-item checkout and removal | Checkout UI and store tests |
| Mandatory condition and issue details | `testIssueRequiresText` |
| Multiple active claims | `testCheckoutAllowsMultipleClaimsAndIsIdempotent` |
| Idempotent checkout and return | Checkout and return idempotency tests |
| Return closes all active claims | `testReturnClosesEveryActiveClaimAndIsIdempotent` |
| Student data isolation | `testStudentsOnlySeeTheirOwnClaimsAndNotifications` |
| Teacher issue workflow | `testIssueLifecycleAndTeacherNotification` and Overview UI |
| Tag replacement preserves history | `testReplacingTagPreservesClaimHistory` and inventory UI test |
| Offline confirmation blocked | `testOfflineConfirmationDoesNotMutateState` |
| Checkout, return, issue, overdue notifications | Notification scoping and overdue tests |
| Persistent schema compatibility | legacy decode and snapshot round-trip tests |
| Student and teacher simulator journeys | `GearGuardUITests` |

The following cannot be proven on the simulator:

- NFC read/write behavior across physical tags and supported iPhones;
- five physical tag scans in under three minutes;
- Apple signing and production NFC entitlement approval;
- school Google OAuth, Firebase Security Rules, FCM, and cross-device synchronization.

Those checks are the physical-device and school-credential steps in `production-integration.md`.
