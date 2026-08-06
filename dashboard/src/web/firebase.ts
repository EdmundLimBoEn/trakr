import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getConfig } from "./api";

let app: FirebaseApp | null = null;

async function firebaseApp(): Promise<FirebaseApp> {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const config = await getConfig();
  app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
  });
  return app;
}

export async function signInWithGoogle(): Promise<string> {
  const fb = await firebaseApp();
  const auth = getAuth(fb);
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken();
}
