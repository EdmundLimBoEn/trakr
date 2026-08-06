import { useEffect, useState, type ReactNode } from "react";
import { BREAKGLASS_STORAGE_KEY, getOverview, isEmergencyPath, me, unlock } from "../api";

interface UnlockGateProps {
  children: ReactNode;
}

export function UnlockGate({ children }: UnlockGateProps) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(): Promise<boolean> {
    if (isEmergencyPath()) {
      const stored = sessionStorage.getItem(BREAKGLASS_STORAGE_KEY);
      if (!stored) return false;
      try {
        await getOverview();
        return true;
      } catch {
        return false;
      }
    }
    try {
      await me();
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    verify().then((ok) => {
      if (!cancelled) setState(ok ? "open" : "locked");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const trimmed = tokenInput.trim();
      if (!trimmed) {
        setError("Enter an access token.");
        return;
      }
      await unlock(trimmed);
      sessionStorage.setItem(BREAKGLASS_STORAGE_KEY, trimmed);
      const ok = await verify();
      if (!ok) {
        sessionStorage.removeItem(BREAKGLASS_STORAGE_KEY);
        setError("Token was not accepted.");
        return;
      }
      setState("open");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return <div className="loading-block">Verifying access…</div>;
  }

  if (state === "open") {
    return <>{children}</>;
  }

  return (
    <div className="form-panel">
      <h1>Console</h1>
      <p>Paste the break-glass access token to continue.</p>
      <form onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="access-token">Access token</label>
          <input
            id="access-token"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
        </div>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}
