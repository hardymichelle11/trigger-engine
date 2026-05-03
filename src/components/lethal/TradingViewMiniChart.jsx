// =====================================================
// TRADINGVIEW MINI CHART (Phase 4.7.5)
// =====================================================
// Embeds the official TradingView mini-symbol-overview
// widget for a candidate's symbol. Provider-aware: we
// don't assume a complete TV universe — when the symbol
// can't be verified, we still attempt the embed with a
// best-effort exchange and surface a small "unverified"
// badge.
//
// Fallback chain:
//   1. TradingView widget (primary)
//   2. SVG sparkline from supplied candles (if widget
//      fails to load OR caller passes fallbackCandles)
//   3. Clean "Chart unavailable" message — no debug text
//
// Hard rules:
//   - Loads TradingView's official embed script from
//     s3.tradingview.com — no scraping, no API key.
//   - Each widget instance lives inside its own iframe
//     (TradingView's standard behavior). State is isolated.
//   - The component never throws; failure modes degrade
//     to the sparkline or message.
// =====================================================

import React, { useEffect, useRef, useState } from "react";
import { resolveTradingViewSymbol } from "../../lib/lethal/tradingViewSymbolResolver.js";

const TV_SCRIPT_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";

// --------------------------------------------------
// PUBLIC COMPONENT
// --------------------------------------------------

/**
 * @param {object} props
 * @param {string} props.symbol                bare ticker (required)
 * @param {string} [props.exchange]            optional exchange override
 * @param {string} [props.tradingViewSymbol]   operator override (e.g. "NASDAQ:NVDA")
 * @param {Array<number>} [props.fallbackCandles]   optional close-price array for sparkline
 * @param {boolean} [props.verified]           caller-supplied verification flag (overrides resolver)
 * @param {number} [props.height]              px; defaults to 200
 * @param {string} [props.interval]            TradingView dateRange ("1D" / "5D" / "1M" etc.)
 * @param {string} [props.theme]               "dark" | "light"
 */
export default function TradingViewMiniChart({
  symbol,
  exchange = null,
  tradingViewSymbol = null,
  fallbackCandles = null,
  verified = null,
  height = 200,
  interval = "1D",
  theme = "dark",
}) {
  const containerRef = useRef(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const resolved = resolveTradingViewSymbol({
    symbol,
    exchange,
    tradingViewSymbol,
  });

  // `verified` prop overrides the resolver's verified flag if supplied.
  // This is how upstream callers (provider-aware data) signal trust.
  const isVerified = verified === null ? resolved?.verified : !!verified;

  // Mount / re-mount the TradingView widget when the resolved symbol
  // changes. TradingView's embed expects each widget to live inside
  // its own container with a freshly-appended <script> tag; the script
  // reads its own innerText config on load.
  useEffect(() => {
    if (!resolved || !containerRef.current) return undefined;
    setLoadFailed(false);

    const container = containerRef.current;
    container.innerHTML =
      `<div class="tradingview-widget-container__widget" style="height:100%;width:100%;"></div>`;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = TV_SCRIPT_SRC;
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: resolved.symbol,
      width: "100%",
      height: "100%",
      locale: "en",
      dateRange: interval,
      colorTheme: theme,
      isTransparent: true,
      autosize: true,
      noTimeScale: false,
      trendLineColor: theme === "dark" ? "#14b8a6" : "#0ea5e9",
      underLineColor: "rgba(20, 184, 166, 0.15)",
      chartOnly: false,
      largeChartUrl: "",
    });

    // If the script never resolves the iframe (network failure / CSP block),
    // fall back to the sparkline / placeholder message.
    let timeoutId = setTimeout(() => {
      const iframe = container.querySelector("iframe");
      if (!iframe) setLoadFailed(true);
    }, 6000);

    script.onerror = () => setLoadFailed(true);

    container.appendChild(script);

    return () => {
      clearTimeout(timeoutId);
      try { container.innerHTML = ""; } catch { /* noop */ }
    };
  }, [resolved?.symbol, interval, theme]);

  if (!resolved) {
    return <ChartUnavailable height={height} reason="No symbol provided" />;
  }

  // Sparkline-only mode: caller explicitly suppressed the embed by passing
  // candles AND verified === false (e.g. provider-aware code already knows
  // TV won't have this symbol). Skip the iframe.
  const explicitSparklineOnly =
    fallbackCandles && fallbackCandles.length > 0 && verified === false;
  if (explicitSparklineOnly) {
    return (
      <SparklineFallback
        height={height}
        candles={fallbackCandles}
        symbol={resolved.ticker}
        unverified />
    );
  }

  if (loadFailed) {
    if (Array.isArray(fallbackCandles) && fallbackCandles.length > 0) {
      return <SparklineFallback
        height={height}
        candles={fallbackCandles}
        symbol={resolved.ticker}
        unverified={!isVerified} />;
    }
    return <ChartUnavailable height={height} symbol={resolved.ticker}
                             unverified={!isVerified} />;
  }

  return (
    <div
      style={{ position: "relative", height, width: "100%", minWidth: 0 }}
      aria-label={`TradingView mini chart — ${resolved.symbol}`}>
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: "100%", width: "100%" }} />
      {!isVerified && <UnverifiedBadge />}
    </div>
  );
}

// --------------------------------------------------
// FALLBACK: SVG SPARKLINE
// --------------------------------------------------

function SparklineFallback({ height, candles, symbol, unverified }) {
  const points = Array.isArray(candles) ? candles.filter(n => Number.isFinite(Number(n))) : [];
  if (points.length === 0) {
    return <ChartUnavailable height={height} symbol={symbol} unverified={unverified} />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 240;
  const stepX = width / Math.max(1, points.length - 1);
  const path = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const tone = points[points.length - 1] >= points[0] ? "#22c55e" : "#ef4444";
  return (
    <div style={{ position: "relative", height, width: "100%", minWidth: 0,
                  background: "#202225", borderRadius: 6, overflow: "hidden" }}
         aria-label={`Sparkline fallback — ${symbol}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
           style={{ width: "100%", height: "100%" }}>
        <path d={path} fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {unverified && <UnverifiedBadge />}
      <div style={{
        position: "absolute", bottom: 4, left: 6,
        fontSize: 10, color: "#9ca3af", letterSpacing: "0.06em",
      }}>
        {symbol} · sparkline
      </div>
    </div>
  );
}

// --------------------------------------------------
// FALLBACK: clean "Chart unavailable" message
// --------------------------------------------------

function ChartUnavailable({ height, symbol = null, unverified = false, reason = null }) {
  return (
    <div role="img"
         aria-label={`Chart unavailable${symbol ? ` for ${symbol}` : ""}`}
         style={{
           height, width: "100%", minWidth: 0,
           background: "#202225",
           border: "1px dashed #2b2f34",
           borderRadius: 6,
           display: "flex", alignItems: "center", justifyContent: "center",
           position: "relative",
         }}>
      <div style={{ textAlign: "center", padding: 8 }}>
        {symbol && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#14b8a6",
                         letterSpacing: "0.02em" }}>
            {symbol}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
          {reason || "Chart unavailable"}
        </div>
      </div>
      {unverified && <UnverifiedBadge />}
    </div>
  );
}

// --------------------------------------------------
// "chart unverified" badge — small, top-right
// --------------------------------------------------

function UnverifiedBadge() {
  return (
    <div style={{
      position: "absolute", top: 6, right: 6,
      fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
      padding: "2px 6px",
      background: "rgba(245, 158, 11, 0.15)",
      border: "1px solid rgba(245, 158, 11, 0.4)",
      color: "#f59e0b",
      borderRadius: 4,
      pointerEvents: "none",
    }}>
      Chart unverified
    </div>
  );
}
