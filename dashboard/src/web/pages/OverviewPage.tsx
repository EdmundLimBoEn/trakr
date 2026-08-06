import { useEffect, useState } from "react";
import { getOverview } from "../api";
import type { OverviewStats } from "../../shared/types";

export function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (error) {
    return (
      <>
        <header className="page-header">
          <h1>Overview</h1>
        </header>
        <div className="alert alert-error">{error}</div>
      </>
    );
  }

  if (!stats) {
    return <div className="loading-block">Loading overview…</div>;
  }

  return (
    <>
      <header className="page-header">
        <h1>Overview</h1>
        <p>Live counts from Firestore-backed inventory and claims.</p>
      </header>

      {stats.isDemo ? (
        <div className="alert alert-warn">
          <strong>Demo mode is on.</strong> Anonymous demo accounts and demo UI may be visible in the mobile app.
        </div>
      ) : null}
      {stats.maintenanceMode ? (
        <div className="alert alert-warn">
          <strong>Maintenance mode is on.</strong> The mobile app shows a maintenance screen instead of normal sign-in.
        </div>
      ) : null}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Active equipment</div>
          <div className="value">{stats.equipmentActive}</div>
        </div>
        <div className="stat-card">
          <div className="label">Retired equipment</div>
          <div className="value">{stats.equipmentRetired}</div>
        </div>
        <div className="stat-card">
          <div className="label">Active claims</div>
          <div className="value">{stats.claimsActive}</div>
        </div>
        <div className="stat-card">
          <div className="label">Overdue claims</div>
          <div className="value">{stats.claimsOverdue}</div>
        </div>
        <div className="stat-card">
          <div className="label">Open issues</div>
          <div className="value">{stats.issuesOpen}</div>
        </div>
        <div className="stat-card">
          <div className="label">Acknowledged</div>
          <div className="value">{stats.issuesAcknowledged}</div>
        </div>
        <div className="stat-card">
          <div className="label">Resolved issues</div>
          <div className="value">{stats.issuesResolved}</div>
        </div>
        <div className="stat-card">
          <div className="label">Teachers</div>
          <div className="value">{stats.usersTeachers}</div>
        </div>
        <div className="stat-card">
          <div className="label">Students</div>
          <div className="value">{stats.usersStudents}</div>
        </div>
        <div className="stat-card">
          <div className="label">Demo users</div>
          <div className="value">{stats.demoUsers}</div>
        </div>
      </div>
    </>
  );
}
