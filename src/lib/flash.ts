/** Friendly messages for ?error= and ?status= codes set by redirects. */
const ERRORS: Record<string, string> = {
  oauth_state: "That sign-in link expired. Please try again.",
  oauth_cancelled: "Connection cancelled. You can try again whenever you're ready.",
  oauth_failed: "Something went wrong while connecting your email. Please try again.",
  oauth_not_configured: "This email provider hasn't been set up on this QuoteFlow server yet. See the setup instructions below.",
  oauth_scopes: "QuoteFlow needs permission to read and send email. Please reconnect and tick every permission box.",
  oauth_offline: "We couldn't get lasting access to your mailbox. Remove QuoteFlow from your account's connected apps, then connect again.",
  oauth_forbidden: "Only the account owner or an admin can connect email accounts.",
  oauth_link: "An account with this email already exists. Log in with your password, then connect your provider.",
  oauth_unknown: "That sign-in method isn't supported.",
  session_expired: "Your session expired. Please log in again.",
  billing_failed: "We couldn't open billing right now. Please try again.",
};

const STATUSES: Record<string, string> = {
  email_connected: "Email connected. We're checking for quotes now.",
  signed_out: "You've been signed out.",
  password_reset: "Password updated. You're signed in.",
  account_deleted: "Your account and data have been deleted.",
};

export function flashFrom(params: Record<string, string | string[] | undefined>) {
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  if (error) return { kind: "error" as const, message: error };
  const status = typeof params.status === "string" ? STATUSES[params.status] : undefined;
  if (status) return { kind: "success" as const, message: status };
  if (params.expired === "1") return { kind: "info" as const, message: "Please log in to continue." };
  return null;
}
