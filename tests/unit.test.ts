import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyToPence } from "@/lib/money";
import { renderTemplate, findUnknownVariables, textToHtml } from "@/lib/templates";
import { extractAmountPence, describeFromSubject, detectQuote, nameFromAddress } from "@/lib/email/detect";
import { followUpTime, nextSendingTime, isWithinSendingWindow, describeWhen } from "@/lib/schedule";
import { decrypt, encrypt, signPayload, verifyPayload } from "@/lib/crypto";
import { entitlementFor } from "@/lib/billing/entitlements";
import { buildMimeMessage } from "@/lib/email/mime";
import { parseAddressList } from "@/lib/email/mailbox";
import { stripQuotedText } from "@/lib/automation/replies";
import { planSchedule, parseReplyToAddress } from "@/lib/automation/followups";
import { sequenceSchema, quoteSchema } from "@/lib/validation";
import type { Subscription } from "@prisma/client";
import type { MailMessage } from "@/lib/email/mailbox";

const london = { timezone: "Europe/London", sendingStartHour: 9, sendingEndHour: 17, sendOnWeekends: false };

describe("money", () => {
  it("formats and parses GBP", () => {
    expect(formatMoney(240000)).toBe("£2,400");
    expect(formatMoney(240050)).toBe("£2,400.50");
    expect(formatMoney(null)).toBe("—");
    expect(parseMoneyToPence("£2,400.5")).toBe(240050);
    expect(parseMoneyToPence("2400")).toBe(240000);
    expect(parseMoneyToPence("abc")).toBeNull();
    expect(parseMoneyToPence("-5")).toBeNull();
  });
});

describe("templates", () => {
  const ctx = { customerName: "James Smith", businessName: "ABC Plumbing", amountPence: 320000, description: "bathroom renovation", senderName: "John" };
  it("renders variables", () => {
    expect(renderTemplate("Hi {{customer_first_name}}, {{quote_amount}} for {{quote_description}} — {{business_name}}", ctx)).toBe(
      "Hi James, £3,200 for bathroom renovation — ABC Plumbing",
    );
    expect(renderTemplate("{{signature}}", ctx)).toBe("John\nABC Plumbing");
    expect(renderTemplate("{{signature}}", { ...ctx, signature: "Cheers, John" })).toBe("Cheers, John");
  });
  it("flags unknown variables and leaves them visible", () => {
    expect(findUnknownVariables("{{customer_nme}} {{business_name}}")).toEqual(["customer_nme"]);
    expect(renderTemplate("{{customer_nme}}", ctx)).toBe("{{customer_nme}}");
  });
  it("escapes HTML in emails", () => {
    expect(textToHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });
});

describe("quote detection", () => {
  it("extracts amounts, preferring totals", () => {
    expect(extractAmountPence("Deposit £200. Total inc VAT: £2,400.00")).toBe(240000);
    expect(extractAmountPence("Price £1,850")).toBe(185000);
    expect(extractAmountPence("about £3.2k all in")).toBe(320000);
    expect(extractAmountPence("no money here")).toBeNull();
  });
  it("describes jobs from subjects", () => {
    expect(describeFromSubject("RE: Quote for bathroom renovation - ABC Plumbing", "ABC Plumbing")).toBe("Bathroom renovation");
    expect(describeFromSubject("Quotation #Q-1042: Rewire")).toBe("Rewire");
    expect(describeFromSubject("Your quote")).toBe("Quote");
  });
  it("names customers from addresses", () => {
    expect(nameFromAddress({ email: "sarah.jones@gmail.com", name: null })).toBe("Sarah Jones");
    expect(nameFromAddress({ email: "x@y.com", name: "Sarah J" })).toBe("Sarah J");
  });
  const msg = (patch: Partial<MailMessage>): MailMessage => ({
    id: "m1", threadId: "t1", internetMessageId: null, from: { email: "me@abcplumbing.co.uk", name: null },
    to: [{ email: "james@gmail.com", name: "James Smith" }], subject: "Quote for bathroom renovation", date: new Date(),
    text: "Hi James, please find our quote. Total £2,400.", attachmentNames: [], quoteflowHeader: false, ...patch,
  });
  it("detects quotes and ignores non-quotes", () => {
    expect(detectQuote(msg({}), "me@abcplumbing.co.uk")).toMatchObject({ amountPence: 240000, description: "Bathroom renovation" });
    expect(detectQuote(msg({ subject: "Lunch?", text: "See you at 1" }), "me@abcplumbing.co.uk")).toBeNull();
    expect(detectQuote(msg({ quoteflowHeader: true }), "me@abcplumbing.co.uk")).toBeNull();
    expect(detectQuote(msg({ to: [{ email: "noreply@x.com", name: null }] }), "me@abcplumbing.co.uk")).toBeNull();
    expect(detectQuote(msg({ to: [{ email: "colleague@abcplumbing.co.uk", name: null }] }), "me@abcplumbing.co.uk")).toBeNull();
    expect(detectQuote(msg({ subject: "Invoice for quote 12" }), "me@abcplumbing.co.uk")).toBeNull();
    expect(detectQuote(msg({ subject: "Kitchen", attachmentNames: ["Quotation_123.pdf"], text: "Attached" }), "me@abcplumbing.co.uk")).not.toBeNull();
  });
});

describe("scheduling", () => {
  it("schedules at the start of the sending window, N days later, skipping weekends", () => {
    const sent = new Date("2026-10-05T14:30:00Z"); // Monday
    const at = followUpTime(sent, 2, london, new Date("2026-10-05T15:00:00Z"));
    expect(at.toISOString()).toBe("2026-10-07T08:00:00.000Z"); // Wed 09:00 BST
    const fri = followUpTime(new Date("2026-10-08T10:00:00Z"), 2, london, new Date("2026-10-08T10:00:00Z"));
    expect(fri.toISOString()).toBe("2026-10-12T08:00:00.000Z"); // Sat → Mon 09:00
  });
  it("never schedules in the past", () => {
    const now = new Date("2026-10-06T10:00:00Z"); // Tue 11:00 BST
    const at = followUpTime(new Date("2026-09-01T10:00:00Z"), 2, london, now);
    expect(at.getTime()).toBe(now.getTime());
  });
  it("handles windows and DST", () => {
    expect(isWithinSendingWindow(new Date("2026-10-06T07:30:00Z"), london)).toBe(false); // 08:30 BST
    expect(nextSendingTime(new Date("2026-10-06T17:00:00Z"), london).toISOString()).toBe("2026-10-07T08:00:00.000Z");
    // After clocks go back (25 Oct 2026), 09:00 London = 09:00 UTC.
    expect(nextSendingTime(new Date("2026-10-27T05:00:00Z"), london).toISOString()).toBe("2026-10-27T09:00:00.000Z");
  });
  it("spaces out late-added quotes so steps don't all fire at once", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const times = planSchedule(new Date("2026-09-01T10:00:00Z"), [{ delayDays: 2 }, { delayDays: 5 }, { delayDays: 10 }], london, now);
    expect(times[0]!.getTime()).toBe(now.getTime());
    expect(times[1]!.getTime() - times[0]!.getTime()).toBeGreaterThanOrEqual(2 * 86400_000);
    expect(times[2]!.getTime() - times[1]!.getTime()).toBeGreaterThanOrEqual(4 * 86400_000);
  });
  it("describes times relatively", () => {
    expect(describeWhen(new Date("2026-10-07T08:00:00Z"), "Europe/London", new Date("2026-10-06T12:00:00Z"))).toBe("Tomorrow at 09:00");
  });
});

describe("crypto", () => {
  it("round-trips encrypted tokens and rejects tampering", () => {
    const enc = encrypt("ya29.secret-token");
    expect(enc).not.toContain("secret");
    expect(decrypt(enc)).toBe("ya29.secret-token");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("signs and verifies payloads", () => {
    const signed = signPayload({ a: 1 });
    expect(verifyPayload<{ a: number }>(signed)).toEqual({ a: 1 });
    expect(verifyPayload(`${signed.split(".")[0]}.bad`)).toBeNull();
  });
  it("verifies inbound reply addresses", () => {
    expect(parseReplyToAddress("reply+abc.xxxxxxxxxxxx@in.example.com")).toBeNull();
  });
});

describe("entitlements", () => {
  const base = { id: "s", organisationId: "o", plan: "GROWTH", stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, paymentFailedAt: null, createdAt: new Date(), updatedAt: new Date() } as const;
  it("handles trials, expiry, grace periods and cancellation", () => {
    expect(entitlementFor({ ...base, status: "TRIALING", trialEndsAt: new Date(Date.now() + 86400_000) } as Subscription).active).toBe(true);
    expect(entitlementFor({ ...base, status: "TRIALING", trialEndsAt: new Date(Date.now() - 1000) } as Subscription).state).toBe("trial_expired");
    expect(entitlementFor({ ...base, status: "PAST_DUE", trialEndsAt: null, paymentFailedAt: new Date() } as Subscription).active).toBe(true);
    expect(entitlementFor({ ...base, status: "PAST_DUE", trialEndsAt: null, paymentFailedAt: new Date(Date.now() - 30 * 86400_000) } as Subscription).active).toBe(false);
    expect(entitlementFor({ ...base, status: "CANCELED", trialEndsAt: null } as Subscription).active).toBe(false);
    expect(entitlementFor(null).active).toBe(false);
  });
});

describe("email safety", () => {
  it("prevents header injection in MIME messages", () => {
    const mime = buildMimeMessage({ from: "a@b.com", to: "c@d.com", subject: "Hi\r\nBcc: evil@x.com", text: "t", html: "h" });
    expect(mime).not.toMatch(/^Bcc:/m);
  });
  it("parses address lists", () => {
    expect(parseAddressList('"Smith, James" <James@Example.com>, sarah@x.com')).toEqual([
      { name: "Smith, James", email: "james@example.com" },
      { name: null, email: "sarah@x.com" },
    ]);
  });
  it("strips quoted text from replies", () => {
    expect(stripQuotedText("Yes, let's book it.\n\nOn Mon, John wrote:\n> Hi James")).toBe("Yes, let's book it.");
  });
});

describe("validation", () => {
  it("requires increasing delays in sequences", () => {
    const step = { subject: "s", body: "b" };
    expect(sequenceSchema.safeParse({ name: "x", steps: [{ ...step, delayDays: 5 }, { ...step, delayDays: 2 }] }).success).toBe(false);
    expect(sequenceSchema.safeParse({ name: "x", steps: [{ ...step, delayDays: 2 }, { ...step, delayDays: 5 }] }).success).toBe(true);
  });
  it("rejects future quote dates", () => {
    const tomorrow2 = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
    const r = quoteSchema.safeParse({ customerName: "a", customerEmail: "a@b.com", amount: "10", description: "d", sentAt: tomorrow2 });
    expect(r.success).toBe(false);
  });
});

import { safeNext } from "@/lib/safe-redirect";
describe("redirect safety", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/quotes/1")).toBe("/quotes/1");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext(null, "/x")).toBe("/x");
  });
});
