// =====================================================
// ENTRY READINESS CARD (Phase 4.7.8)
// =====================================================
// Compact verdict card. Sits directly under the Candidate
// Intelligence summary. Single source of truth for "can the
// operator act on this right now?"
//
// Hard rules:
//   - Reads the buildEntryReadiness() output only.
//   - Never exposes raw scoreAdjustment integers, internal
//     weights, or provider implementation details.
//   - At most three reasons rendered (helper already caps).
//   - Does NOT duplicate the candidate-intelligence paragraph.
// =====================================================

import React from "react";
import { COCKPIT_PALETTE } from "./cockpitTheme.js";

const SEVERITY_TONE = {
  green: {
    border: COCKPIT_PALETTE.accentTeal,
    bg: "rgba(34, 197, 94, 0.08)",
    text: COCKPIT_PALETTE.accentTeal,
    pillBg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
  amber: {
    border: COCKPIT_PALETTE.accentAmber,
    bg: "rgba(245, 158, 11, 0.08)",
    text: COCKPIT_PALETTE.accentAmber,
    pillBg: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
  red: {
    border: "#ef4444",
    bg: "rgba(239, 68, 68, 0.08)",
    text: "#fca5a5",
    pillBg: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  },
};

/**
 * @param {object} props
 * @param {object|null} props.readiness  buildEntryReadiness() output
 */
export default function EntryReadinessCard({ readiness }) {
  if (!readiness) return null;

  const tone = SEVERITY_TONE[readiness.severity] || SEVERITY_TONE.amber;

  return (
    <section
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      aria-label={`Entry readiness: ${readiness.label}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COCKPIT_PALETTE.textDim,
          }}
        >
          Entry readiness
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone.pillBg}`}
        >
          {readiness.label}
        </span>
      </div>

      {readiness.reasons && readiness.reasons.length > 0 && (
        <ul className="space-y-0.5">
          {readiness.reasons.slice(0, 3).map((r, i) => (
            <li
              key={i}
              className="text-[11px] text-zinc-300 leading-snug flex gap-2"
            >
              <span style={{ color: tone.text, flex: "0 0 auto" }}>•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {readiness.operatorInstruction && (
        <div
          style={{
            fontSize: 11,
            color: tone.text,
            fontWeight: 600,
            lineHeight: 1.45,
            paddingTop: 4,
            borderTop: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
          }}
        >
          → {readiness.operatorInstruction}
        </div>
      )}
    </section>
  );
}
