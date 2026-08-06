import { useEffect, useState } from "react";
import { FLAG_KEYS, FLAG_LABELS, type FeatureFlags, type FlagKey } from "../../shared/types";
import { getFlags, putFlags } from "../api";

export function FlagsPage() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [draft, setDraft] = useState<Record<FlagKey, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFlags()
      .then((f) => {
        setFlags(f);
        setDraft(pickBooleans(f));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load flags"));
  }, []);

  function pickBooleans(f: FeatureFlags): Record<FlagKey, boolean> {
    const out = {} as Record<FlagKey, boolean>;
    for (const key of FLAG_KEYS) out[key] = Boolean(f[key]);
    return out;
  }

  function toggle(key: FlagKey) {
    setDraft((d) => (d ? { ...d, [key]: !d[key] } : d));
    setMessage(null);
  }

  async function onSave() {
    if (!draft || !flags) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: FeatureFlags = { ...draft, updatedAt: flags.updatedAt, updatedBy: flags.updatedBy };
      const saved = await putFlags(payload);
      setFlags(saved);
      setDraft(pickBooleans(saved));
      setMessage("Flags saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (error && !draft) {
    return (
      <>
        <header className="page-header">
          <h1>Feature flags</h1>
        </header>
        <div className="alert alert-error">{error}</div>
      </>
    );
  }

  if (!draft) {
    return <div className="loading-block">Loading flags…</div>;
  }

  return (
    <>
      <header className="page-header">
        <h1>Feature flags</h1>
        <p>Toggles apply to mobile clients via the public featureFlags document.</p>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-warn">{message}</div> : null}

      <div className="flag-list">
        {FLAG_KEYS.map((key) => (
          <div className="flag-row" key={key}>
            <label htmlFor={`flag-${key}`}>{FLAG_LABELS[key]}</label>
            <label className="toggle">
              <input
                id={`flag-${key}`}
                type="checkbox"
                checked={draft[key]}
                onChange={() => toggle(key)}
              />
              <span />
            </label>
          </div>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: "1.25rem" }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save"}
        </button>
        {flags?.updatedAt ? (
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Last updated {flags.updatedAt}
            {flags.updatedBy ? ` · ${flags.updatedBy}` : ""}
          </span>
        ) : null}
      </div>
    </>
  );
}
