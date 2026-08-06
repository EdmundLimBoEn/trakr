import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { createSession, me } from "../api";
import { signInWithGoogle } from "../firebase";

export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    me()
      .then(() => {
        if (!cancelled) setDone(true);
      })
      .catch(() => {
        /* not signed in */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      const idToken = await signInWithGoogle();
      await createSession(idToken);
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      const lower = message.toLowerCase();
      if (
        lower.includes("domain") ||
        lower.includes("unauthorized") ||
        lower.includes("teacher") ||
        lower.includes("forbidden") ||
        lower.includes("invalid-token")
      ) {
        setError(
          "This Google account is not authorized for Trakr Ops. Use an @sst.edu.sg teacher account.",
        );
      } else if (lower.includes("popup") || lower.includes("cancel")) {
        setError("Sign-in was cancelled. Try again when ready.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <div className="loading-block">Checking session…</div>;
  }

  if (done) {
    return <Navigate to="/overview" replace />;
  }

  return (
    <div className="signin-panel">
      <h1>Trakr Ops</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        Sign in with your school Google account to manage equipment and feature flags.
      </p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onGoogle}>
        {busy ? "Signing in…" : "Continue with Google"}
      </button>
      {error ? (
        <div className="alert alert-error" style={{ marginTop: "1.25rem", textAlign: "left" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
