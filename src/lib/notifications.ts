import type { NotificationType, Organisation } from "@prisma/client";
import { db } from "./db";
import { appUrl } from "./env";
import { logger } from "./logger";
import { sendSystemEmail, transactionalHtml } from "./email/system-mailer";

const ALWAYS_IN_APP: NotificationType[] = ["QUOTE_OVERDUE", "QUOTE_DETECTED", "BILLING", "EMAIL_CONNECTION_EXPIRED"];
const EMAIL_TYPES: NotificationType[] = ["CUSTOMER_REPLIED", "QUOTE_WON", "AUTOMATION_FAILED", "EMAIL_CONNECTION_EXPIRED", "BILLING"];

function enabledFor(org: Organisation, type: NotificationType) {
  if (ALWAYS_IN_APP.includes(type)) return true;
  if (type === "CUSTOMER_REPLIED") return org.notifyReplies;
  if (type === "QUOTE_WON") return org.notifyWon;
  if (type === "AUTOMATION_FAILED") return org.notifyFailures;
  return true;
}

/**
 * Notifies every member of an organisation in-app and, where enabled, by email.
 * Never throws — a failed notification must not break the automation that raised it.
 */
export async function notifyOrganisation(input: {
  organisationId: string;
  type: NotificationType;
  title: string;
  body: string;
  quoteId?: string | null;
  href?: string;
}) {
  try {
    const org = await db.organisation.findUnique({
      where: { id: input.organisationId },
      include: { memberships: { include: { user: { select: { id: true, email: true, name: true, emailVerifiedAt: true } } } } },
    });
    if (!org || !enabledFor(org, input.type)) return;
    const wantsEmail = org.notifyByEmail && EMAIL_TYPES.includes(input.type);
    for (const m of org.memberships) {
      const notification = await db.notification.create({
        data: {
          organisationId: org.id,
          userId: m.user.id,
          quoteId: input.quoteId ?? null,
          type: input.type,
          title: input.title.slice(0, 200),
          body: input.body.slice(0, 1000),
          href: input.href ?? null,
        },
      });
      if (wantsEmail && m.user.emailVerifiedAt) {
        try {
          await sendSystemEmail({
            to: m.user.email,
            subject: input.title,
            text: `${input.body}\n\nOpen QuoteFlow: ${appUrl(input.href ?? "/dashboard")}`,
            html: transactionalHtml({
              heading: input.title,
              paragraphs: [input.body],
              cta: { label: "Open QuoteFlow", url: appUrl(input.href ?? "/dashboard") },
              footer: "Change which emails you receive in Settings → Notifications.",
            }),
          });
          await db.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } });
        } catch (error) {
          logger.warn("notification.email_failed", { organisationId: org.id, type: input.type, error });
        }
      }
    }
  } catch (error) {
    logger.error("notification.failed", { organisationId: input.organisationId, type: input.type, error });
  }
}
