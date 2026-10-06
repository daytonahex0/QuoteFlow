import type { SequencePreset } from "@prisma/client";

export type StepTemplate = { delayDays: number; subject: string; body: string };

const FRIENDLY_1 = `Hi {{customer_first_name}},

Just checking you received our quote for {{quote_description}} ({{quote_amount}}).

Happy to answer any questions or talk anything through.

Thanks,
{{signature}}`;

const FRIENDLY_2 = `Hi {{customer_first_name}},

Just following up on the quote we sent for {{quote_description}}.

If it would help, I'm happy to adjust anything or pop round to go through it with you.

Thanks,
{{signature}}`;

const FRIENDLY_3 = `Hi {{customer_first_name}},

I don't want to keep filling your inbox, so this is my last check-in about the {{quote_description}} quote ({{quote_amount}}).

Should I keep this quote open for you? A quick yes or no is absolutely fine.

Thanks,
{{signature}}`;

const FRIENDLY_4 = `Hi {{customer_first_name}},

Just a quick note in case the timing wasn't right before — our quote for {{quote_description}} is still available if you'd like to go ahead.

Thanks,
{{signature}}`;

export const SEQUENCE_PRESETS: Record<Exclude<SequencePreset, "CUSTOM">, { label: string; summary: string; steps: StepTemplate[] }> = {
  STANDARD: {
    label: "Standard (recommended)",
    summary: "Day 2 → Day 5 → Day 10",
    steps: [
      { delayDays: 2, subject: "Just checking you received our quote", body: FRIENDLY_1 },
      { delayDays: 5, subject: "Following up on your quote", body: FRIENDLY_2 },
      { delayDays: 10, subject: "Should I keep this quote open?", body: FRIENDLY_3 },
    ],
  },
  GENTLE: {
    label: "Gentle",
    summary: "Day 3 → Day 10",
    steps: [
      { delayDays: 3, subject: "Just checking you received our quote", body: FRIENDLY_1 },
      { delayDays: 10, subject: "Should I keep this quote open?", body: FRIENDLY_3 },
    ],
  },
  PERSISTENT: {
    label: "Persistent",
    summary: "Day 1 → Day 3 → Day 7 → Day 14",
    steps: [
      { delayDays: 1, subject: "Just checking you received our quote", body: FRIENDLY_1 },
      { delayDays: 3, subject: "Following up on your quote", body: FRIENDLY_2 },
      { delayDays: 7, subject: "Is the quote still of interest?", body: FRIENDLY_4 },
      { delayDays: 14, subject: "Should I keep this quote open?", body: FRIENDLY_3 },
    ],
  },
};

export function presetSteps(preset: SequencePreset): StepTemplate[] {
  return preset === "CUSTOM" ? SEQUENCE_PRESETS.STANDARD.steps : SEQUENCE_PRESETS[preset].steps;
}

/** Alternative default first-message tones offered during onboarding. */
export const TEMPLATE_STYLES = {
  friendly: { label: "Friendly", description: "Warm and relaxed — great for homeowners.", first: FRIENDLY_1 },
  professional: {
    label: "Professional",
    description: "Polished and to the point — great for commercial clients.",
    first: `Dear {{customer_name}},

I'm writing to confirm you received our quotation for {{quote_description}}, totalling {{quote_amount}}.

Please let me know if you have any questions or would like to discuss the scope of work.

Kind regards,
{{signature}}`,
  },
  brief: {
    label: "Short & simple",
    description: "Two lines. Easy to read on a phone.",
    first: `Hi {{customer_first_name}}, just checking you got our quote for {{quote_description}} ({{quote_amount}}). Any questions, just reply here.

{{signature}}`,
  },
} as const;

export type TemplateStyle = keyof typeof TEMPLATE_STYLES;
