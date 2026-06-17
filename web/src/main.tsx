import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { apiClient } from "./lib/api";
import { applyDesign, getSavedDesign } from "./lib/design";

applyDesign(getSavedDesign());

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
