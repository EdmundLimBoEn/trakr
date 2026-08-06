import { useEffect, useMemo, useState } from "react";
import type { ClaimRecord } from "../../shared/types";
import { getClaims, returnClaims } from "../api";

type Filter = "active" | "returned" | "all";

export function ClaimsPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const [rows, setRows] = useState<ClaimRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      if (filter === "all") {
        const [active, returned] = await Promise.all([getClaims("active"), getClaims("returned")]);
        setRows([...active, ...returned].sort((a, b) => b.checkedOutAt.localeCompare(a.checkedOutAt)));
      } else {
        setRows(await getClaims(filter));
      }
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load claims");
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  const selectable = useMemo(() => rows.filter((r) => r.status === "active"), [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === selectable.length) setSelected(new Set());
    else setSelected(new Set(selectable.map((r) => r.claimId)));
  }

  async function onForceReturn() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Force return ${ids.length} claim(s)?`)) return;
    setBusy(true);
    setError(null);
    try {
      await returnClaims(ids);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Return failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Claims</h1>
        <p>Student checkouts and teacher returns.</p>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="toolbar">
        <div className="filter-tabs">
          {(["active", "returned", "all"] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? "active" : undefined} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || selected.size === 0}
          onClick={onForceReturn}
        >
          Force return ({selected.size})
        </button>
      </div>

      {!rows.length && !error ? <div className="loading-block">Loading claims…</div> : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all active"
                    checked={selectable.length > 0 && selected.size === selectable.length}
                    onChange={toggleAll}
                    disabled={!selectable.length}
                  />
                </th>
                <th>Student</th>
                <th>Equipment</th>
                <th>Checked out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.claimId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(row.claimId)}
                      disabled={row.status !== "active"}
                      onChange={() => toggle(row.claimId)}
                      aria-label={`Select claim ${row.claimId}`}
                    />
                  </td>
                  <td>
                    <div>{row.studentEmail}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.equipmentId}</div>
                  </td>
                  <td>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "0.75rem" }}>{row.tagIdAtCheckout}</code>
                  </td>
                  <td>{formatWhen(row.checkedOutAt)}</td>
                  <td>
                    <span className={`badge badge-${row.status === "active" ? "active" : "returned"}`}>
                      {row.status}
                    </span>
                    {row.overdue ? <span className="badge badge-overdue">Overdue</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 && error === null ? (
        <p className="empty-note">No claims for this filter.</p>
      ) : null}
    </>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
