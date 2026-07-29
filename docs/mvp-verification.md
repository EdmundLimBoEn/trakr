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
| Student and teacher simulator journeys | `TrakrUITests` |
| Trusted role assignment and callable validation | `firebase/functions/src` and domain tests |
| Firestore authorization boundary | Firebase Emulator Suite rules tests |
| Atomic/idempotent server mutations | transactional callable implementations |
| Cross-device push routing and overdue scheduling | FCM helpers and scheduled function |

The following cannot be proven on the simulator:

- NFC read/write behavior across physical tags and supported iPhones;
- five physical tag scans in under three minutes;
- Apple signing and production NFC entitlement approval;
- school Google OAuth, deployed FCM/APNs delivery, and cross-device synchronization.

Those checks are the physical-device and school-credential steps in `production-integration.md`.
