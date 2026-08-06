import { useEffect, useState } from "react";
import type { IntegrityReport } from "../../shared/types";
import { getIntegrity } from "../api";

export function IntegrityPage() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIntegrity()
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load report"));
  }, []);

  if (error) {
    return (
      <>
        <header className="page-header">
          <h1>Integrity</h1>
        </header>
        <div className="alert alert-error">{error}</div>
      </>
    );
  }

  if (!report) {
    return <div className="loading-block">Running integrity checks…</div>;
  }

  return (
    <>
      <header className="page-header">
        <h1>Integrity</h1>
        <p>Cross-checks between equipment records and NFC tags.</p>
      </header>

      <section className="integrity-section">
        <h2>Orphan tags ({report.orphanTags.length})</h2>
        {report.orphanTags.length === 0 ? (
          <p className="empty-note">None detected.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Tag ID</th>
                  <th>Equipment ID</th>
                </tr>
              </thead>
              <tbody>
                {report.orphanTags.map((row) => (
                  <tr key={`${row.tagId}-${row.equipmentId}`}>
                    <td>
                      <code style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>{row.tagId}</code>
                    </td>
                    <td>{row.equipmentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="integrity-section">
        <h2>Missing active tags ({report.missingActiveTags.length})</h2>
        {report.missingActiveTags.length === 0 ? (
          <p className="empty-note">None detected.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Name</th>
                  <th>Recorded tag</th>
                </tr>
              </thead>
              <tbody>
                {report.missingActiveTags.map((row) => (
                  <tr key={row.equipmentId}>
                    <td>{row.equipmentId}</td>
                    <td>{row.name}</td>
                    <td>
                      <code style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>{row.activeTagId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="integrity-section">
        <h2>Retired with active tag ({report.retiredWithActiveTag.length})</h2>
        {report.retiredWithActiveTag.length === 0 ? (
          <p className="empty-note">None detected.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Name</th>
                  <th>Active tag</th>
                </tr>
              </thead>
              <tbody>
                {report.retiredWithActiveTag.map((row) => (
                  <tr key={row.equipmentId}>
                    <td>{row.equipmentId}</td>
                    <td>{row.name}</td>
                    <td>
                      <code style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>{row.activeTagId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
