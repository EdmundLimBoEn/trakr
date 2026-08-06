import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { me } from "../api";

export function SsoGate() {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    me()
      .then(() => {
        if (!cancelled) setState("ok");
      })
      .catch(() => {
        if (!cancelled) setState("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <div className="loading-block">Checking session…</div>;
  }

  if (state === "denied") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
