/** Only same-site relative paths are allowed as post-login/OAuth destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\x00-\x1f]/.test(next)) return fallback;
  return next;
}
