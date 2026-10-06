import { z } from "zod";
import { BUSINESS_TYPE_VALUES } from "./organisations";
import { parseMoneyToPence } from "./money";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "That password is too long")
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9\W]/.test(p), "Include letters and at least one number or symbol");

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  businessName: z.string().trim().min(1, "Enter your business name").max(120),
  email: emailSchema,
  password: passwordSchema,
  businessType: z.enum(BUSINESS_TYPE_VALUES, { errorMap: () => ({ message: "Choose your business type" }) }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export const moneySchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const pence = parseMoneyToPence(v);
    if (pence == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter an amount like 2400 or 2,400.50" });
      return z.NEVER;
    }
    return pence;
  });

export const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .transform((v) => new Date(`${v}T12:00:00Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "Choose a valid date")
  .refine((d) => d.getTime() <= Date.now() + 86400_000, "The quote date can't be in the future")
  .refine((d) => d.getTime() >= Date.now() - 365 * 86400_000, "That date is more than a year ago");

export const quoteSchema = z.object({
  customerName: z.string().trim().min(1, "Enter the customer's name").max(120),
  customerEmail: emailSchema,
  customerPhone: z.string().trim().max(40).regex(/^[0-9+()\s-]*$/, "Enter a valid phone number").optional().or(z.literal("")),
  amount: moneySchema,
  description: z.string().trim().min(1, "Describe the job, e.g. Bathroom renovation").max(200),
  sentAt: dateSchema,
  startFollowUps: z.boolean().default(true),
  sequenceId: z.string().optional().or(z.literal("")),
});

export const stepSchema = z.object({
  id: z.string().optional(),
  delayDays: z.coerce.number().int("Whole days only").min(1, "At least 1 day").max(90, "At most 90 days"),
  subject: z.string().trim().min(1, "Add a subject").max(200),
  body: z.string().trim().min(1, "Add a message").max(5000),
});

export const sequenceSchema = z
  .object({
    name: z.string().trim().min(1, "Name this sequence").max(80),
    steps: z.array(stepSchema).min(1, "Add at least one follow-up").max(10),
  })
  .refine((s) => s.steps.every((step, i) => i === 0 || step.delayDays > s.steps[i - 1]!.delayDays), {
    message: "Each follow-up must be sent later than the one before it",
    path: ["steps"],
  });

/** Turns a ZodError into { field: message } for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}
