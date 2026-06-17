import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Studio from "./pages/Studio";
import Cards from "./pages/Cards";
import Packs from "./pages/Packs";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import History from "./pages/History";
import Notifications from "./pages/Notifications";
import Statistics from "./pages/Statistics";
import Changelog from "./pages/Changelog";
import Errors from "./pages/Errors";
import System from "./pages/System";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import ClipDemos from "./pages/ClipDemos";
import TemplateEditor from "./pages/TemplateEditor";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./lib/auth";
import { GenQueueProvider } from "./lib/genQueue";
import { ConfirmHost } from "./lib/confirm";
import { I18nProvider } from "./lib/i18n";

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
    <GenQueueProvider>
      <Layout>
        <Routes>
        <Route path="/" element={user.role === "admin" ? <Overview /> : <Accounts />} />
        <Route path="/channels" element={<Accounts />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/cards" element={<Cards />} />
        <Route path="/packs" element={<Packs />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/accounts" element={<Navigate to={user.role === "admin" ? "/channels" : "/"} replace />} />
        <Route path="/accounts/:id" element={<AccountDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/statistics" element={<Statistics />} />
        {/* Аналитика-сводка переехала во вкладку «Сводка» на /statistics (только админ). */}
        <Route path="/admin/analytics" element={<Navigate to="/statistics" replace />} />
        <Route path="/clip-demos" element={<ClipDemos />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/errors" element={<Errors />} />
        <Route path="/system" element={<System />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/editor" element={<TemplateEditor />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </GenQueueProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Gate />
        <ConfirmHost />
      </AuthProvider>
    </I18nProvider>
  );
}
