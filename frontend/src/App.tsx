import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";

import DashboardView from "./components/Dashboard/DashboardView";
import PlansView from "./components/Plans/PlansView";
import ExpensesView from "./components/Expenses/ExpensesView";
import ImportExportView from "./components/ImportExport/ImportExportView";
import CleanupView from "./components/Cleanup/CleanupView";
import AppLayout from "./components/layout/AppLayout";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function LayoutRoute({ children }: { children: JSX.Element }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  const { loading, token } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/" element={<LayoutRoute><DashboardView /></LayoutRoute>} />
      <Route path="/plans" element={<LayoutRoute><PlansView /></LayoutRoute>} />
      <Route path="/expenses" element={<LayoutRoute><ExpensesView /></LayoutRoute>} />
      <Route
        path="/import-export"
        element={<LayoutRoute><ImportExportView /></LayoutRoute>}
      />
      <Route path="/cleanup" element={<LayoutRoute><CleanupView /></LayoutRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
