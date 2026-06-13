import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Studio from "./pages/Studio";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./lib/auth";

function Gate() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen grid place-items-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  if (!user) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Accounts />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/accounts" element={<Navigate to="/" replace />} />
        <Route path="/accounts/:id" element={<AccountDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
