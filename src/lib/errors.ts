/** An error whose message is safe to show to users. Everything else is replaced with a friendly fallback. */
export class UserError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "UserError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

export const GENERIC_ERROR = "Something went wrong. Please try again.";

export function friendlyError(error: unknown, fallback = GENERIC_ERROR): string {
  if (error instanceof UserError) return error.message;
  return fallback;
}
