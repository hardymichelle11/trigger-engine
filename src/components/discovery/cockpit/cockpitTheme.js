// =====================================================
// COCKPIT THEME (Phase 4.7.3)
// =====================================================
// Centralized palette + surface tokens for the Lethal Board
// trader cockpit, modeled on the Fidelity dark UI reference
// (see docs/SESSION_NOTES). Use these tokens via inline
// `style={{ background: COCKPIT_SURFACE.panel }}` rather
// than ad-hoc Tailwind shades, so we can re-tune the entire
// visual system in one place.
//
// Hard rules:
//   - Color is reserved for live state, action, P/L, and
//     warnings. Default surfaces use layered charcoals.
//   - Best-use highlight uses teal (#14b8a6) — small accent
//     line or star badge ONLY. Never a whole-card glow.
//   - Numeric values use the tabular-figures feature so
//     digits line up vertically in tables.
// =====================================================

// --------------------------------------------------
// PALETTE
// --------------------------------------------------

export const COCKPIT_PALETTE = Object.freeze({
  // Surfaces (darkest → lightest)
  pageBg:      "#050607",   // outermost, behind operator console
  consoleBg:   "#0b0d10",   // operator console (left rail) — darker than workspace
  workspaceBg: "#0b0d10",   // main working area
  stripBg:     "#151719",   // top command/market strip — slightly lighter
  panelBg:     "#151719",   // panels and cards (default)
  nestedBg:    "#202225",   // nested cards / table rows / inputs
  inputBg:     "#303236",   // text input backgrounds
  border:      "#2b2f34",   // standard divider / border
  borderSoft:  "#21252a",   // softer divider for dense tables

  // Text
  text:        "#f3f4f6",   // primary text
  textDim:     "#9ca3af",   // muted text / labels
  textFaint:   "#6b7280",   // very faint secondary text

  // Accents (used surgically)
  accentGreen: "#22c55e",   // P/L positive, active state, "live"
  accentRed:   "#ef4444",   // P/L negative, danger
  accentAmber: "#f59e0b",   // warnings (estimated, wide spread)
  accentTeal:  "#14b8a6",   // best-use marker, ticker symbol
  accentCyan:  "#06b6d4",   // links / secondary info

  // Action surfaces (filled buttons)
  buyBg:       "#10b98122", // soft green wash
  buyBgHover:  "#10b98144",
  sellBg:      "#ef444422",
  sellBgHover: "#ef444444",

  // Selected row tint (very subtle — no glow)
  selectedTint:  "#1c2026",
  hoverTint:     "#181a1d",
});

// --------------------------------------------------
// SURFACE PRESETS — drop-in style objects
// --------------------------------------------------

export const COCKPIT_SURFACE = Object.freeze({
  page:    { background: COCKPIT_PALETTE.pageBg, color: COCKPIT_PALETTE.text },
  console: { background: COCKPIT_PALETTE.consoleBg, color: COCKPIT_PALETTE.text },
  strip:   { background: COCKPIT_PALETTE.stripBg, color: COCKPIT_PALETTE.text,
             borderBottom: `1px solid ${COCKPIT_PALETTE.border}` },
  workspace: { background: COCKPIT_PALETTE.workspaceBg, color: COCKPIT_PALETTE.text },
  panel:   { background: COCKPIT_PALETTE.panelBg, color: COCKPIT_PALETTE.text,
             border: `1px solid ${COCKPIT_PALETTE.border}`, borderRadius: 12 },
  nested:  { background: COCKPIT_PALETTE.nestedBg },
  input:   { background: COCKPIT_PALETTE.inputBg,
             border: `1px solid ${COCKPIT_PALETTE.border}`, borderRadius: 8,
             color: COCKPIT_PALETTE.text },
});

// --------------------------------------------------
// TEXT PRESETS
// --------------------------------------------------

export const COCKPIT_TEXT = Object.freeze({
  label: { fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
           color: COCKPIT_PALETTE.textDim },
  value: { fontSize: 13, fontWeight: 600, color: COCKPIT_PALETTE.text,
           fontFeatureSettings: "'tnum'" },
  muted: { fontSize: 12, color: COCKPIT_PALETTE.textDim },
  title: { fontSize: 14, fontWeight: 700, color: COCKPIT_PALETTE.text },
  ticker: { fontSize: 18, fontWeight: 700, color: COCKPIT_PALETTE.accentTeal,
            letterSpacing: "0.02em" },
  price: { fontSize: 24, fontWeight: 700, color: COCKPIT_PALETTE.text,
           fontFeatureSettings: "'tnum'" },
  truncate: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
});

// --------------------------------------------------
// HELPER — change-tone mapping
// --------------------------------------------------

export function changeTone(delta) {
  if (delta == null || !Number.isFinite(Number(delta))) return COCKPIT_PALETTE.textDim;
  const v = Number(delta);
  if (v > 0) return COCKPIT_PALETTE.accentGreen;
  if (v < 0) return COCKPIT_PALETTE.accentRed;
  return COCKPIT_PALETTE.textDim;
}

// --------------------------------------------------
// SCROLL CONTAINER CLASS
// --------------------------------------------------

// Components that contain an internal scrollable list should set
// `className="cockpit-scroll"` so the minimal scrollbar style in
// index.css applies. Native overflow-y: auto remains the trigger.
export const COCKPIT_SCROLL_CLASS = "cockpit-scroll";
