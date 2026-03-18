import { Component, type ErrorInfo, type ReactNode } from "react";

import { createLogger } from "../lib/logger";

const logger = createLogger("ui");

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Unhandled React render error.", {
      error: error.message,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-ink-950 px-6 py-12 text-slate-100">
          <div className="mx-auto max-w-2xl rounded-[28px] border border-rose-400/20 bg-rose-500/8 p-8">
            <div className="text-xs uppercase tracking-[0.22em] text-rose-200/80">
              Pulse Launcher
            </div>
            <h1 className="mt-3 font-display text-3xl text-white">
              The launcher hit a fatal UI error.
            </h1>
            <p className="mt-3 text-sm text-slate-200">
              Check the developer console for diagnostics, then reload the window. TODO:
              add crash recovery flows for persisted UI state.
            </p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
