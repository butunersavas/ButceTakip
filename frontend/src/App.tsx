import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";

import DashboardView from "./components/Dashboard/DashboardView";
import PlansView from "./components/Plans/PlansView";
import ExpensesView from "./components/Expenses/ExpensesView";
import ImportExportView from "./components/ImportExport/ImportExportView";
import CleanupView from "./components/Cleanup/CleanupView";
import UsersView from "./components/Users/UsersView";
import DailyExportView from "./components/DailyExport/DailyExportView";
import WarrantyTrackingView from "./components/WarrantyTracking/WarrantyTrackingView";
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

function LayoutRoute({ children, requireAdmin = false }: { children: JSX.Element; requireAdmin?: boolean }) {
  const { user } = useAuth();

  if (requireAdmin && !user?.is_admin) {
    return <Navigate to="/" replace />;
  }

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
        element={token ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<LayoutRoute><DashboardView /></LayoutRoute>} />
      <Route path="/plans" element={<LayoutRoute><PlansView /></LayoutRoute>} />
      <Route path="/expenses" element={<LayoutRoute><ExpensesView /></LayoutRoute>} />
      <Route path="/reports" element={<LayoutRoute><ImportExportView /></LayoutRoute>} />
      <Route path="/import-export" element={<Navigate to="/reports" replace />} />
      <Route path="/daily-export" element={<LayoutRoute><DailyExportView /></LayoutRoute>} />
      <Route path="/cleanup" element={<LayoutRoute><CleanupView /></LayoutRoute>} />
      <Route path="/users" element={<LayoutRoute requireAdmin><UsersView /></LayoutRoute>} />
      <Route path="/warranty-tracking" element={<LayoutRoute requireAdmin><WarrantyTrackingView /></LayoutRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
