"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, MailWarning, MessageSquareReply, Sparkles, Trophy, Clock } from "lucide-react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/schedule";
import { cn } from "@/lib/cn";

type Item = { id: string; type: string; title: string; body: string; href: string | null; read: boolean; createdAt: string };

const ICONS: Record<string, { icon: typeof Clock; tone: string }> = {
  CUSTOMER_REPLIED: { icon: MessageSquareReply, tone: "bg-amber-100 text-amber-800" },
  QUOTE_WON: { icon: Trophy, tone: "bg-brand-100 text-brand-800" },
  QUOTE_OVERDUE: { icon: Clock, tone: "bg-ink-100 text-ink-700" },
  AUTOMATION_FAILED: { icon: AlertTriangle, tone: "bg-rose-100 text-rose-700" },
  EMAIL_CONNECTION_EXPIRED: { icon: MailWarning, tone: "bg-rose-100 text-rose-700" },
  QUOTE_DETECTED: { icon: Sparkles, tone: "bg-sky-100 text-sky-800" },
  BILLING: { icon: CreditCard, tone: "bg-ink-100 text-ink-700" },
};

export function NotificationList({ items }: { items: Item[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const unread = items.filter((i) => !i.read).length;

  const open = (item: Item) =>
    start(async () => {
      if (!item.read) await markNotificationReadAction(item.id);
      if (item.href) router.push(item.href);
      else router.refresh();
    });

  return (
    <>
      {unread > 0 && (
        <div className="mb-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await markAllNotificationsReadAction();
                if (r.ok) toast.success(r.message ?? "Done.");
                else toast.error(r.error);
                router.refresh();
              })
            }
          >
            Mark all as read
          </Button>
        </div>
      )}
      <ul className="space-y-2">
        {items.map((item) => {
          const meta = ICONS[item.type] ?? ICONS.BILLING!;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => open(item)}
                className={cn(
                  "flex w-full gap-3 rounded-2xl border p-4 text-left transition-colors",
                  item.read ? "border-ink-200/70 bg-white hover:bg-ink-50" : "border-brand-200 bg-brand-50/40 hover:bg-brand-50",
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.tone)}>
                  <meta.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("text-[15px] text-ink-900", !item.read && "font-semibold")}>{item.title}</span>
                    {!item.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-600">{item.body}</span>
                  <span className="mt-1 block text-xs text-ink-400">{timeAgo(new Date(item.createdAt))}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
