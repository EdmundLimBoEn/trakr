# Ops dashboard

Trakr’s privileged web console lives in [`dashboard/`](../dashboard/). It stays on Firebase **Spark**: a Cloudflare Worker talks to Firestore with a service account (Admin SDK is not used on Workers).

## Two entry points

1. **Google SSO** (`/`) — any verified `@sst.edu.sg` teacher. Session cookie after Firebase ID token verification.
2. **Break-glass** (`/e/{BREAKGLASS_PATH}/`) — long random path + shared secret bearer. Same APIs and UI capabilities; actor recorded as `breakglass` in audits.

See [dashboard/README.md](../dashboard/README.md) for secrets, deploy, and rotation.

## Feature flags

The dashboard is the supported writer for `config/featureFlags`. Details: [feature-flags.md](feature-flags.md).

## Spark note

No Cloud Functions, Scheduler, or Blaze upgrade is required for this dashboard. Watch Firestore read quotas when listing large collections from Overview.
