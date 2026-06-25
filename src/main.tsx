import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initWebVitals } from "@/lib/perf/webVitals";

// Boot the Core Web Vitals collector before React renders so we capture
// the very first paint/LCP entries. No-op outside the browser.
initWebVitals();

// Auto-recover from stale chunk errors after a new deploy.
// When the browser has cached an old index.html that references hashed
// chunks no longer present on the server, dynamic import() throws
// "Failed to fetch dynamically imported module". Force a one-time reload.
const RELOAD_KEY = "__chunk_reload_attempt__";
window.addEventListener("error", (event) => {
  const msg = event?.message || "";
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("Importing a module script failed")) {
    if (!sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }
  }
});
window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event?.reason?.message || event?.reason || "");
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("Importing a module script failed")) {
    if (!sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }
  }
});
// Clear the guard once the app has booted successfully.
window.addEventListener("load", () => {
  setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 5000);
});

createRoot(document.getElementById("root")!).render(<App />);
