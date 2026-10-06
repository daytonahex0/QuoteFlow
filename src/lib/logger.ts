/**
 * Structured, audit-friendly logging. Emits one JSON object per line so logs can
 * be shipped to any aggregator. Never log secrets, tokens or message bodies.
 */
type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const entry = { ts: new Date().toISOString(), level, event, ...sanitise(data) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.NODE_ENV !== "test") console.log(line);
}

const REDACT = /token|secret|password|authorization|cookie|hash/i;

function sanitise(data?: Record<string, unknown>) {
  if (!data) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (REDACT.test(key)) out[key] = "[redacted]";
    else if (value instanceof Error) out[key] = { name: value.name, message: value.message };
    else out[key] = value;
  }
  return out;
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => emit("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
};

/** Audit log for security-relevant actions (sign-in, permission changes, deletions). */
export function audit(action: string, data: { userId?: string | null; organisationId?: string | null; [k: string]: unknown }) {
  emit("info", `audit.${action}`, data);
}
