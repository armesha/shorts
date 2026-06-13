import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Studio from "./pages/Studio";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import History from "./pages/History";
import Settings from "./pages/Settings";

export default function App() {
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
