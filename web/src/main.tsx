import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
// Admin-only "СЕЧЕНИЕ" skin — loaded AFTER index.css so its scoped rules win ties; fully inert
// (every rule lives under html[data-skin="sechenie"]) until an admin opts in. See lib/skin.tsx.
import "./styles/sechenie.css";
import App from "./App.tsx";
import { apiClient } from "./lib/api";
import { applyDesign, getSavedDesign } from "./lib/design";
import { applySavedSkin } from "./lib/skin";

applyDesign(getSavedDesign());
// Apply the СЕЧЕНИЕ skin (default ON) before React mounts so the login/boot screens don't flash classic.
applySavedSkin();

// Ship uncaught client-side errors to the server log (admin Errors page). Fire-and-forget.
window.addEventListener("error", (e) => {
  apiClient.reportClientError(e.message || "window.error", e.error?.stack, location.pathname);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as { message?: string; stack?: string } | undefined;
  apiClient.reportClientError(
    "Unhandled rejection: " + (r?.message || String(e.reason)),
    r?.stack,
    location.pathname,
  );
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
