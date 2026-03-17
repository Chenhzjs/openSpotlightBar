export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  function emit(
    level: "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>
  ) {
    const prefix = `[Pulse:${scope}] ${message}`;
    const sink =
      level === "error" ? console.error : level === "warn" ? console.warn : console.info;

    if (meta && Object.keys(meta).length > 0) {
      sink(prefix, meta);
    } else {
      sink(prefix);
    }
  }

  return {
    info(message, meta) {
      emit("info", message, meta);
    },
    warn(message, meta) {
      emit("warn", message, meta);
    },
    error(message, meta) {
      emit("error", message, meta);
    }
  };
}
