import { useEffect, useState } from "react";
import type { IssueRecord } from "../../shared/types";
import { getIssues, patchIssue } from "../api";

type Filter = IssueRecord["status"] | "all";

export function IssuesPage() {
  const [filter, setFilter] = useState<Filter>("open");
  const [rows, setRows] = useState<IssueRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      if (filter === "all") {
        const [open, ack, resolved] = await Promise.all([
          getIssues("open"),
          getIssues("acknowledged"),
          getIssues("resolved"),
        ]);
        setRows(
          [...open, ...ack, ...resolved].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
        );
      } else {
        setRows(await getIssues(filter));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function updateStatus(issue: IssueRecord, status: "acknowledged" | "resolved") {
    setBusyId(issue.issueId);
    setError(null);
    try {
      const updated = await patchIssue(issue.issueId, { status });
      setRows((prev) => prev.map((r) => (r.issueId === updated.issueId ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Issues</h1>
        <p>Equipment problems reported at checkout.</p>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="toolbar">
        <div className="filter-tabs">
          {(["open", "acknowledged", "resolved", "all"] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? "active" : undefined} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {!rows.length && !error ? <div className="loading-block">Loading issues…</div> : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Reported</th>
                <th>Equipment</th>
                <th>Text</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.issueId}>
                  <td>{formatWhen(row.reportedAt)}</td>
                  <td>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "0.75rem" }}>{row.equipmentId}</code>
                  </td>
                  <td style={{ maxWidth: "20rem" }}>{row.text}</td>
                  <td>
                    <span className={`badge badge-${badgeClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {row.status === "open" ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === row.issueId}
                        onClick={() => updateStatus(row, "acknowledged")}
                      >
                        Acknowledge
                      </button>
                    ) : null}
                    {row.status !== "resolved" ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === row.issueId}
                          onClick={() => updateStatus(row, "resolved")}
                        >
                          Resolve
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 && error === null ? (
        <p className="empty-note">No issues for this filter.</p>
      ) : null}
    </>
  );
}

function badgeClass(status: IssueRecord["status"]): string {
  if (status === "open") return "open";
  if (status === "acknowledged") return "ack";
  return "resolved";
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
