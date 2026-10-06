export function sequenceSummary(steps: { delayDays: number }[]) {
  return steps.length ? steps.map((s) => `Day ${s.delayDays}`).join(" → ") : "No follow-ups";
}
