import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { createLogger } from "./lib/logger";
import "./styles.css";

const logger = createLogger("bootstrap");

window.addEventListener("error", (event) => {
  logger.error("Unhandled window error.", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener("unhandledrejection", (event) => {
  logger.error("Unhandled promise rejection.", {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason)
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
