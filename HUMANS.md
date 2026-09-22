# Human actions

## Google API key public-leak follow-up

GitHub secret scanning flagged Firebase client API keys in a public repo. Configs are gitignored; examples stay in-tree. Complete:

- [ ] Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials?project=trakr-sst-2026)
- [ ] **Restrict** the iOS browser/API key to iOS app `systems.edmundlim.trakr` and only required Firebase APIs
- [ ] **Restrict** the Android key to package `systems.edmundlim.trakr` + your debug/release SHA-1s and only required Firebase APIs
- [ ] **Regenerate / rotate** both keys (recommended because they were public), then re-download configs into:
  - `Trakr/GoogleService-Info.plist`
  - `android/app/google-services.json`
- [ ] Confirm local files are still gitignored (`git status` should not list them)
- [ ] Confirm secret-scanning alerts #1 and #2 are closed on GitHub

## Live equipment demo

- [ ] Sign in to the ops dashboard with a school teacher account, open **Live dashboard**, and check out then return an item using the Firebase-connected mobile app. Confirm its card changes on the next refresh. Browser interaction tests use isolated fixtures; the live authenticated phone-to-dashboard flow still needs this check.
