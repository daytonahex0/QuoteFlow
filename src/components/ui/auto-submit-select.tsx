"use client";

import type { SelectHTMLAttributes } from "react";

/** A <select> that submits its form on change (falls back to the form's submit button without JS). */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
