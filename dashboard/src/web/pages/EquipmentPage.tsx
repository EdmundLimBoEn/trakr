import { useEffect, useState } from "react";
import { normalizeSerial, validateEquipmentName, type EquipmentRecord } from "../../shared/types";
import { getEquipment, patchEquipment, retireEquipment } from "../api";

export function EquipmentPage() {
  const [rows, setRows] = useState<EquipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EquipmentRecord | null>(null);
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    getEquipment()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit(row: EquipmentRecord) {
    setEdit(row);
    setName(row.name);
    setSerial(row.internalSerial);
    setError(null);
  }

  async function onSaveEdit() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const patch: { name?: string; internalSerial?: string } = {};
      patch.name = validateEquipmentName(name);
      patch.internalSerial = normalizeSerial(serial).display;
      const updated = await patchEquipment(edit.equipmentId, patch);
      setRows((prev) => prev.map((r) => (r.equipmentId === updated.equipmentId ? updated : r)));
      setEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRetire(row: EquipmentRecord) {
    if (row.status === "retired") return;
    if (!window.confirm(`Retire “${row.name}”? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await retireEquipment(row.equipmentId);
      setRows((prev) => prev.map((r) => (r.equipmentId === updated.equipmentId ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retire failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Equipment</h1>
        <p>Enrolled items and NFC tag bindings.</p>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? <div className="loading-block">Loading equipment…</div> : null}

      {!loading && rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Serial</th>
                <th>Tag</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.equipmentId}>
                  <td>{row.name}</td>
                  <td>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>{row.internalSerial}</code>
                  </td>
                  <td>{row.activeTagId ?? "—"}</td>
                  <td>
                    <span className={`badge badge-${row.status === "active" ? "active" : "retired"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busy || row.status === "retired"}
                      onClick={() => onRetire(row)}
                    >
                      Retire
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
        <p className="empty-note">No equipment enrolled.</p>
      ) : null}

      {edit ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setEdit(null)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Edit equipment</h2>
            <div className="form-field">
              <label htmlFor="eq-name">Name</label>
              <input id="eq-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="eq-serial">Internal serial</label>
              <input id="eq-serial" value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={onSaveEdit}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
