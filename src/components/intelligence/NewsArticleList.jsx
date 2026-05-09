// =====================================================
// NEWS ARTICLE LIST
// =====================================================
// Compact list of normalized news articles — title + source + relative
// time + click-out URL. Pure presentational.
// =====================================================

import React from "react";

const PALETTE = {
  bg:        "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  cyan:      "#06b6d4",
};

/**
 * @param {object} props
 * @param {Array<object>} [props.articles]
 * @param {number} [props.limit=8]
 */
export default function NewsArticleList({ articles = [], limit = 8 }) {
  const list = Array.isArray(articles) ? articles.slice(0, limit) : [];

  if (list.length === 0) {
    return (
      <div style={{ padding: "8px 4px", fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
        No articles available.
      </div>
    );
  }

  return (
    <ul aria-label="News article list"
        style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((a, i) => (
        <li key={a.id || `${i}-${a.title}`} style={{
          padding: "6px 8px",
          background: "#0a0d12",
          border: `1px solid ${PALETTE.borderSoft}`,
          borderRadius: 6,
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 9, letterSpacing: "0.06em", color: PALETTE.cyan, fontWeight: 700,
            }}>
              {a.source || "—"}
            </span>
            <span style={{ fontSize: 9, color: PALETTE.textFaint, fontFeatureSettings: "'tnum'" }}>
              {fmtTime(a.publishedAt)}
            </span>
          </div>
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 12, color: PALETTE.text, lineHeight: 1.4, textDecoration: "none" }}>
              {a.title}
            </a>
          ) : (
            <span style={{ fontSize: 12, color: PALETTE.text, lineHeight: 1.4 }}>{a.title}</span>
          )}
          {a.summary && (
            <span style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5 }}>
              {truncate(a.summary, 220)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function fmtTime(ms) {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function truncate(s, n) {
  if (typeof s !== "string") return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
