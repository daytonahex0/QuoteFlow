"use client";

import { useState } from "react";
import type { DailyPoint } from "@/lib/dashboard";

const SENT = "#229676";
const REPLIES = "#d97706";

/** Grouped bars: follow-ups sent vs customer replies per day. Single shared count axis. */
export function ActivityChart({ data, title = "Follow-ups and replies" }: { data: DailyPoint[]; title?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.sent, d.replies)));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const W = 640;
  const H = 180;
  const padL = 28;
  const padB = 4;
  const plotW = W - padL;
  const plotH = H - padB - 8;
  const slot = plotW / data.length;
  const barW = Math.max(3, Math.min(14, slot / 2 - 3));
  const y = (v: number) => 8 + plotH - (v / niceMax) * plotH;
  const ticks = [0, niceMax / 2, niceMax];
  const active = hover != null ? data[hover] : null;
  const totalSent = data.reduce((a, d) => a + d.sent, 0);
  const totalReplies = data.reduce((a, d) => a + d.replies, 0);

  return (
    <figure>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
        <span className="sr-only">{title}. </span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SENT }} aria-hidden /> Follow-ups sent ({totalSent})</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: REPLIES }} aria-hidden /> Replies ({totalReplies})</span>
        <span className="ml-auto min-h-5 text-ink-500 tabular" aria-live="polite">
          {active ? `${active.label}: ${active.sent} sent · ${active.replies} ${active.replies === 1 ? "reply" : "replies"}` : ""}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-44 w-full" role="img" aria-label={`${title}: ${totalSent} follow-ups sent and ${totalReplies} replies over ${data.length} days`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#eef0f2" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#94a0ab">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const bar = (v: number, x: number, color: string) =>
            v > 0 ? <rect x={x} y={y(v)} width={barW} height={Math.max(2, y(0) - y(v))} rx={Math.min(4, barW / 2)} fill={color} /> : null;
          return (
            <g key={d.date}>
              {hover === i && <rect x={padL + slot * i} y={8} width={slot} height={plotH} fill="#f7f8f9" />}
              {bar(d.sent, cx - barW - 1, SENT)}
              {bar(d.replies, cx + 1, REPLIES)}
              <rect x={padL + slot * i} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between pl-[4.4%] text-xs text-ink-400 tabular" aria-hidden>
        {[data[0], data[Math.floor(data.length / 2)], data.at(-1)].map((d, i) => <span key={i}>{d?.label}</span>)}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th>Date</th><th>Follow-ups sent</th><th>Replies</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.date}><td>{d.label}</td><td>{d.sent}</td><td>{d.replies}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
