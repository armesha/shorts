import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { SkinProvider } from "./lib/skin";
import { GenQueueProvider } from "./lib/genQueue";
import { GenProgressToast } from "./components/GenProgressToast";
import { ConfirmHost } from "./lib/confirm";
import { I18nProvider } from "./lib/i18n";
import { pageLoaders } from "./lib/routeLoaders";

const Overview = lazy(pageLoaders.overview);
const Studio = lazy(pageLoaders.studio);
const Gallery = lazy(pageLoaders.gallery);
const Cards = lazy(pageLoaders.cards);
const Packs = lazy(pageLoaders.packs);
const QueuePage = lazy(pageLoaders.queue);
const Accounts = lazy(pageLoaders.accounts);
const AccountDetail = lazy(pageLoaders.accountDetail);
const History = lazy(pageLoaders.history);
const Notifications = lazy(pageLoaders.notifications);
const Statistics = lazy(pageLoaders.statistics);
const Changelog = lazy(pageLoaders.changelog);
const Errors = lazy(pageLoaders.errors);
const System = lazy(pageLoaders.system);
const Settings = lazy(pageLoaders.settings);
const Users = lazy(pageLoaders.users);
const ClipDemos = lazy(pageLoaders.clipDemos);
const Examples = lazy(pageLoaders.examples);
const LongVideos = lazy(pageLoaders.longVideos);
const Limits = lazy(pageLoaders.limits);
const TemplateEditor = lazy(pageLoaders.templateEditor);
const Login = lazy(pageLoaders.login);
const Register = lazy(pageLoaders.register);

function CreatorExternalRedirect() {
  useEffect(() => {
    window.location.replace("/creator");
  }, []);
  return <BootShell />;
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <BootShell />;
  if (!user) {
    return (
      <Suspense fallback={<BootShell />}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </Suspense>
    );
  }
  const defaultRoute = user.role === "admin" ? <Navigate to="/channels" replace /> : <CreatorExternalRedirect />;
  return (
    <GenQueueProvider>
      <GenProgressToast />
      <Layout>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={defaultRoute} />
            <Route path="/channels" element={<Accounts />} />
            <Route path="/overview" element={user.role === "admin" ? <Overview /> : <Navigate to="/channels" replace />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/gallery" element={user.role === "admin" ? <Gallery /> : <Navigate to="/channels" replace />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/library" element={<Packs />} />
            <Route path="/packs" element={<Navigate to="/library" replace />} />
            <Route path="/queue" element={user.role === "admin" ? <QueuePage /> : <Navigate to="/channels" replace />} />
            <Route path="/notifications" element={user.role === "admin" ? <Notifications /> : <Navigate to="/channels" replace />} />
            <Route path="/accounts" element={<Navigate to="/channels" replace />} />
            <Route path="/accounts/:id" element={<AccountDetail />} />
            <Route path="/history" element={<History />} />
            <Route path="/statistics" element={<Statistics />} />
            {/* Аналитика-сводка переехала во вкладку «Сводка» на /statistics (только админ). */}
            <Route path="/admin/analytics" element={<Navigate to="/statistics" replace />} />
            <Route path="/clip-demos" element={<ClipDemos />} />
            <Route path="/examples" element={user.isSuperAdmin ? <Examples /> : <Navigate to="/channels" replace />} />
            <Route path="/long-videos" element={<LongVideos />} />
            <Route path="/limits" element={user.role === "admin" ? <Limits /> : <Navigate to="/channels" replace />} />
            <Route path="/creator" element={<CreatorExternalRedirect />} />
            <Route path="/register" element={<Navigate to="/channels" replace />} />
            <Route path="/login" element={defaultRoute} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/errors" element={<Errors />} />
            <Route path="/system" element={<System />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/editor" element={<TemplateEditor />} />
            <Route path="/users" element={<Users />} />
            <Route path="*" element={defaultRoute} />
          </Routes>
        </Suspense>
      </Layout>
    </GenQueueProvider>
  );
}

function PageFallback() {
  return (
    <div className="route-page space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-base-300 bg-base-100 p-4">
            <div className="skeleton h-4 w-20 rounded mb-4" />
            <div className="skeleton h-7 w-24 rounded mb-2" />
            <div className="skeleton h-3 w-32 rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-base-300 bg-base-100 p-4">
        <div className="skeleton h-5 w-40 rounded mb-4" />
        <div className="skeleton h-56 rounded-lg" />
      </div>
    </div>
  );
}

function BootShell() {
  return (
    <div className="admin-shell min-h-screen bg-base-200 text-base-content">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-72 border-r border-base-300 bg-base-100 flex-col">
        <div className="h-16 border-b border-base-300 px-5 flex items-center gap-3">
          <div className="skeleton h-8 w-8 rounded-md" />
          <div className="skeleton h-5 w-28 rounded" />
        </div>
        <div className="p-3 space-y-6">
          {[0, 1, 2].map((group) => (
            <div key={group} className="space-y-2">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-9 w-full rounded-md" />
              <div className="skeleton h-9 w-10/12 rounded-md" />
              <div className="skeleton h-9 w-11/12 rounded-md" />
            </div>
          ))}
        </div>
      </aside>
      <div className="min-h-screen lg:pl-72">
        <header className="h-14 border-b border-base-300 bg-base-100/95 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="skeleton h-8 w-8 rounded-md" />
            <div className="skeleton h-4 w-24 rounded" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="skeleton h-8 w-8 rounded-md" />
            <div className="skeleton h-8 w-8 rounded-md" />
            <div className="skeleton h-8 w-16 rounded-md hidden sm:block" />
          </div>
        </header>
        <main className="max-w-[1320px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
          <div className="route-page space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border border-base-300 bg-base-100 p-4">
                  <div className="skeleton h-4 w-20 rounded mb-4" />
                  <div className="skeleton h-8 w-24 rounded mb-2" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-lg border border-base-300 bg-base-100 p-4">
                <div className="skeleton h-5 w-36 rounded mb-5" />
                <div className="skeleton h-64 rounded-lg" />
              </div>
              <div className="rounded-lg border border-base-300 bg-base-100 p-4 space-y-3">
                <div className="skeleton h-5 w-32 rounded" />
                <div className="skeleton h-12 rounded-md" />
                <div className="skeleton h-12 rounded-md" />
                <div className="skeleton h-12 rounded-md" />
                <div className="skeleton h-12 rounded-md" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <SkinProvider>
          <Gate />
          <ConfirmHost />
        </SkinProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
