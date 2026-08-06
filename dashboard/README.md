# Trakr Ops dashboard

Cloudflare Workers app that manages Trakr without leaving the Firebase **Spark** plan. Privileged Firestore access uses a Google service account from the Worker (no Cloud Functions).

## Surfaces

| Surface | URL | Auth |
|---|---|---|
| **SSO (normal)** | `/` | Google Sign-In → verified `*@sst.edu.sg` → HttpOnly session cookie |
| **Break-glass** | `/e/{BREAKGLASS_PATH}/…` | Obscure path + shared secret bearer (or one-shot unlock cookie). Full feature parity. |

Wrong break-glass paths return a generic **404**.

## Capabilities

- Overview counts (equipment, claims, overdue ≥24h, issues, users)
- Feature flags (`config/featureFlags`)
- Equipment edit / retire
- Force-return active claims
- Issue acknowledge / resolve
- User / demo-user `active` toggle
- Integrity checks (orphan tags, missing active tags)
- `auditEvents` written on every mutation

NFC tag enrollment stays on the mobile apps.

## Setup

### 1. Firebase Web app

Firebase Console → Project settings → Add app → **Web**. Copy the config into Wrangler:

```sh
cd dashboard
npx wrangler secret put FIREBASE_API_KEY
# Optional: set FIREBASE_AUTH_DOMAIN / FIREBASE_PROJECT_ID in wrangler.toml [vars]
```

Enable **Google** sign-in in Authentication. Restrict the OAuth client to the school Workspace if required.

### 2. Service account

Google Cloud Console (same project as `trakr-sst-2026`) → IAM → Service accounts → create (or use the Firebase Admin SDK account) → JSON key with Cloud Datastore User / Firestore access.

```sh
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
# Paste the full JSON document
```

### 3. Session + break-glass secrets

```sh
openssl rand -base64 48 | npx wrangler secret put SESSION_SIGNING_KEY
openssl rand -hex 32 | npx wrangler secret put BREAKGLASS_PATH
openssl rand -base64 48 | npx wrangler secret put BREAKGLASS_SECRET
```

Store `BREAKGLASS_PATH` and `BREAKGLASS_SECRET` in a password manager. After any suspected leak, rotate both.

### 4. Dev / deploy

```sh
cd dashboard
npm install
npm run dev      # Vite + Worker locally
npm run deploy  # build + wrangler deploy
```

For local secrets, use `dashboard/.dev.vars` (gitignored):

```
SESSION_SIGNING_KEY=dev-session-key-change-me
BREAKGLASS_PATH=dev-breakglass-path
BREAKGLASS_SECRET=dev-breakglass-secret
FIREBASE_API_KEY=your-web-api-key
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## Break-glass bookmark recipe

1. Bookmark `https://<worker>/e/<BREAKGLASS_PATH>/`
2. Open the bookmark → paste `BREAKGLASS_SECRET` into the access-token field once (stored in `sessionStorage` for the tab; also sent as `Authorization: Bearer`)
3. Or call APIs with curl:

```sh
curl -H "Authorization: Bearer $BREAKGLASS_SECRET" \
  "https://<worker>/e/$BREAKGLASS_PATH/api/overview"
```

## Security notes

- Mobile clients still cannot write `config/**` (rules unchanged).
- Break-glass is shared-secret obscurity, not per-user auth. Prefer SSO for day-to-day ops.
- Mutating SSO requests require header `X-Trakr-Ops: 1` (CSRF mitigation with SameSite cookies).
- Never put the service account or break-glass secret in the SPA bundle.
