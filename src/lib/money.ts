const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbpPrecise = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });

/** Formats pence as £1,234 (or £1,234.50 when there are pennies). */
export function formatMoney(pence: number | null | undefined): string {
  if (pence == null) return "—";
  return pence % 100 === 0 ? gbp.format(pence / 100) : gbpPrecise.format(pence / 100);
}

/** Parses user input like "£2,400", "2400.50" into pence. Returns null when invalid. */
export function parseMoneyToPence(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  const cleaned = String(input).replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(parseFloat(cleaned) * 100);
  return Number.isSafeInteger(pence) && pence >= 0 && pence <= 100_000_000_00 ? pence : null;
}
