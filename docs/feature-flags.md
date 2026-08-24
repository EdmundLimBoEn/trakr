# Feature flags

Trakr reads a single Firestore document so the **ops web dashboard** can toggle product behaviour without shipping an app update.

## Document

| Field | Value |
|---|---|
| Path | `config/featureFlags` |
| Client access | **Public read**, no client writes |
| Dashboard write | Cloudflare Worker (service account) only — see [ops-dashboard.md](ops-dashboard.md) |

Seed example (Firebase Console → Firestore → add document, or Admin SDK):

```json
{
  "isDemo": true,
  "googleSignInEnabled": true,
  "checkoutEnabled": true,
  "returnsEnabled": true,
  "enrollmentEnabled": true,
  "historyEnabled": true,
  "activityEnabled": true,
  "maintenanceMode": false,
  "simulateOfflineVisible": true,
  "updatedAt": "2026-08-06T00:00:00Z",
  "updatedBy": "manual"
}
```

Unknown keys are ignored. Missing keys fall back to the app’s bundled defaults.

## Flags

| Key | Type | Effect when `false` / `true` |
|---|---|---|
| `isDemo` | bool | **false:** hide demo sign-in and simulator “Add/Enroll demo …” helpers, block `useDemo`. **true:** enable a hidden demo picker (press and hold Sign in with Google for 3 seconds) and those helpers. Turn **off** before public launch. |
| `googleSignInEnabled` | bool | Hides Sign in with Google when false. |
| `checkoutEnabled` | bool | Hides student Collect tab / checkout flow. |
| `returnsEnabled` | bool | Hides teacher Returns tab. |
| `enrollmentEnabled` | bool | Hides Equipment enroll / replace controls. |
| `historyEnabled` | bool | Hides History tab. |
| `activityEnabled` | bool | Hides student Activity tab. |
| `maintenanceMode` | bool | When true, app shows a maintenance screen instead of sign-in / home. |
| `simulateOfflineVisible` | bool | Hides Profile → “Simulate offline” MVP control. |

## Client behaviour

1. App starts with **bundled defaults** (`DEBUG` → `isDemo: true`; Release → `isDemo: false`).
2. A realtime listener on `config/featureFlags` updates SwiftUI via `FeatureFlagsStore`.
3. Launch-argument overrides (for tests / local):
   - `--local-demo` or `--enable-demo` → force `isDemo = true`
   - `--disable-demo` → force `isDemo = false`
   - `--maintenance` → force `maintenanceMode = true`

SwiftUI uses conditional rendering (`if flags.isDemo { … }`), not hidden-but-present controls.

## Dashboard contract

Implemented in [`dashboard/`](../dashboard/):

1. Authenticate a school teacher (`*@sst.edu.sg` Google SSO) or break-glass shared secret.
2. Read/write `config/featureFlags` from the Worker via a Google service account (Firestore REST). No Cloud Functions / Blaze required.
3. Only mutate the boolean keys above (plus `updatedAt` / `updatedBy` metadata).
4. Never grant mobile clients write access to `config/**`.

UI: one toggle per flag, “Save”, and overview warnings when `isDemo` or `maintenanceMode` is on. Turn **off** `isDemo` and Anonymous auth before production.

## Security notes

- Public read is intentional so the **signed-out** sign-in screen can hide demo.
- Do not put secrets in this document.
- Demo Anonymous auth remains a separate Firebase Auth setting; turning `isDemo` off only hides the UI. Disable Anonymous sign-in in Firebase Console for a hard stop.
