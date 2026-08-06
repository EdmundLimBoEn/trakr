import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import type { OpsActor } from "../../shared/types";
import { BREAKGLASS_STORAGE_KEY, logout, me } from "../api";

const NAV = [
  { to: "overview", label: "Overview" },
  { to: "flags", label: "Feature flags" },
  { to: "equipment", label: "Equipment" },
  { to: "claims", label: "Claims" },
  { to: "issues", label: "Issues" },
  { to: "users", label: "Users" },
  { to: "integrity", label: "Integrity" },
] as const;

interface ShellProps {
  emergency: boolean;
}

export function Shell({ emergency }: ShellProps) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [actor, setActor] = useState<OpsActor | null>(null);
  const [busy, setBusy] = useState(false);

  const base = emergency ? `/e/${token}` : "";

  useEffect(() => {
    if (emergency) return;
    me()
      .then(setActor)
      .catch(() => setActor(null));
  }, [emergency]);

  async function onLogout() {
    setBusy(true);
    try {
      if (emergency) {
        sessionStorage.removeItem(BREAKGLASS_STORAGE_KEY);
        await logout();
        navigate(`/e/${token}`, { replace: true });
      } else {
        await logout();
        navigate("/", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`shell${emergency ? " emergency" : ""}`}>
      {navOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <p className="brand-title">{emergency ? "Console" : "Trakr Ops"}</p>
          <p className="brand-sub">{emergency ? "Break-glass access" : "School equipment ops"}</p>
        </div>
        <ul className="nav-list">
          {NAV.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={`${base}/${to}`}
                className={({ isActive }) => (isActive ? "active" : undefined)}
                onClick={() => setNavOpen(false)}
                end={false}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="actor">{actor?.email ?? (emergency ? "emergency" : "—")}</div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onLogout}>
            {emergency ? "Lock" : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <button type="button" className="menu-toggle" onClick={() => setNavOpen(true)}>
            Menu
          </button>
          <span className="brand-title">{emergency ? "Console" : "Trakr Ops"}</span>
          <span />
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
