import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { isEmergencyPath } from "./api";
import { Shell } from "./components/Shell";
import { SignIn } from "./components/SignIn";
import { UnlockGate } from "./components/UnlockGate";
import { ClaimsPage } from "./pages/ClaimsPage";
import { EquipmentPage } from "./pages/EquipmentPage";
import { FlagsPage } from "./pages/FlagsPage";
import { IntegrityPage } from "./pages/IntegrityPage";
import { IssuesPage } from "./pages/IssuesPage";
import { OverviewPage } from "./pages/OverviewPage";
import { UsersPage } from "./pages/UsersPage";
import { SsoGate } from "./components/SsoGate";

function EmergencyShell() {
  return (
    <UnlockGate>
      <Shell emergency />
    </UnlockGate>
  );
}

function EmergencyRoutes() {
  return (
    <Routes>
      <Route path="/e/:token" element={<EmergencyShell />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="flags" element={<FlagsPage />} />
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="claims" element={<ClaimsPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="integrity" element={<IntegrityPage />} />
      </Route>
    </Routes>
  );
}

function SsoRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SignIn />} />
      <Route element={<SsoGate />}>
        <Route element={<Shell emergency={false} />}>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/flags" element={<FlagsPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/integrity" element={<IntegrityPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

export default function App() {
  const emergency = isEmergencyPath();

  useEffect(() => {
    document.body.classList.toggle("emergency", emergency);
    document.title = emergency ? "Console" : "Trakr Ops";
    return () => document.body.classList.remove("emergency");
  }, [emergency]);

  if (emergency) {
    return <EmergencyRoutes />;
  }

  return <SsoRoutes />;
}
