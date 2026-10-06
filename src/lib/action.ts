import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { UserError, GENERIC_ERROR, type ActionResult } from "./errors";
import { logger } from "./logger";
import { fieldErrors } from "./validation";

/**
 * Wraps a server action so users only ever see friendly messages:
 * validation errors become inline field errors, UserErrors are shown as-is,
 * and anything unexpected is logged and replaced with a generic message.
 */
export async function runAction<T>(name: string, fn: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (error) {
    unstable_rethrow(error); // let redirect()/notFound() through
    if (error instanceof z.ZodError) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(error) };
    if (error instanceof UserError) return { ok: false, error: error.message };
    logger.error(`action.${name}.failed`, { error });
    return { ok: false, error: GENERIC_ERROR };
  }
}

export function formString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export function formBool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}
