import { useEffect, useMemo, useState } from "react";
import type { UserRecord } from "../../shared/types";
import { getUsers, patchUser } from "../api";

type RoleFilter = "all" | "teacher" | "student" | "demo";

export function UsersPage() {
  const [rows, setRows] = useState<UserRecord[]>([]);
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    getUsers()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"));
  }, []);

  const visible = useMemo(() => {
    switch (filter) {
      case "teacher":
        return rows.filter((u) => u.role === "teacher" && !u.demo);
      case "student":
        return rows.filter((u) => u.role === "student" && !u.demo);
      case "demo":
        return rows.filter((u) => u.demo);
      default:
        return rows;
    }
  }, [rows, filter]);

  async function toggleActive(user: UserRecord) {
    setBusyUid(user.uid);
    setError(null);
    try {
      const updated = await patchUser(user.uid, { active: !user.active, source: user.source });
      setRows((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Users</h1>
        <p>Teachers, students, and demo accounts.</p>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="toolbar">
        <div className="filter-tabs">
          {(
            [
              ["all", "All"],
              ["teacher", "Teachers"],
              ["student", "Students"],
              ["demo", "Demo"],
            ] as const
          ).map(([f, label]) => (
            <button key={f} type="button" className={filter === f ? "active" : undefined} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!rows.length && !error ? <div className="loading-block">Loading users…</div> : null}

      {visible.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Source</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.uid}>
                  <td>{user.email}</td>
                  <td>{user.displayName || "—"}</td>
                  <td>
                    {user.role}
                    {user.demo ? <span className="badge badge-demo"> demo</span> : null}
                  </td>
                  <td>{user.source}</td>
                  <td>
                    <span className={`badge badge-${user.active ? "active" : "returned"}`}>
                      {user.active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyUid === user.uid}
                      onClick={() => toggleActive(user)}
                    >
                      {user.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.length && !visible.length ? (
        <p className="empty-note">No users match this filter.</p>
      ) : null}
    </>
  );
}
