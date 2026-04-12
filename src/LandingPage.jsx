// =====================================================
// LANDING PAGE — Trigger Engine
// =====================================================
// About Us + Product Features (benefit-focused).
// Divider lines between sections. No duplicate CTAs.
// Single "Launch Dashboard" in header only.
// =====================================================

export default function LandingPage({ onOpenDashboard }) {
  const capabilities = [
    { title: "Deep Market Scanning", benefit: "Surface the setups that matter most across stocks and options — ranked, filtered, and ready to review." },
    { title: "Options Intelligence", benefit: "Evaluate premium opportunities with strike selection, probability context, and risk-aware put ladder guidance." },
    { title: "Explainable Signals", benefit: "Every signal comes with a clear trace showing what contributed to the score — so you know why, not just what." },
    { title: "Probability Modeling", benefit: "Monte Carlo simulations estimate touch risk, expected move, and drawdown before you commit to a position." },
    { title: "Smart Alerts", benefit: "Multi-gate alerts fire only when quality thresholds are met — reducing noise and surfacing what deserves attention." },
    { title: "Backtesting & Calibration", benefit: "Replay setups against history to see what worked, refine your rules, and build evidence-based confidence." },
    { title: "Market Regime Awareness", benefit: "The dashboard adapts to shifting conditions — so your workflow reflects what the market is actually doing." },
    { title: "Chart Context Analysis", benefit: "Automatic support, resistance, demand zones, and ATR context improve entry and exit quality without manual effort." },
    { title: "Polished Dashboard Experience", benefit: "A clean, dark-mode workspace with ranked cards, detail panels, and guided flow — designed for speed and clarity." },
    { title: "Decision Support Workflow", benefit: "From scan to signal to risk to action — a structured path that replaces guesswork with disciplined process." },
  ];

  const taglines = [
    "Take the guess out of investing",
    "Signals that you can trust",
    "Tools dynamically adjust to market conditions",
    "Invest like institutional investors",
  ];

  // Reusable divider
  const Divider = () => (
    <div className="mx-auto w-full max-w-[1200px] px-8">
      <div className="h-px bg-[#1e2530]" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060a0f] text-[#e2e8f0]" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* ── HEADER ───────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[#1e2530] bg-[#060a0f]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-8 py-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-lg font-bold tracking-wide text-white">TRIGGER ENGINE</div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#94a3b8]">Market Intelligence Platform</div>
            </div>
            <div className="hidden rounded-lg border border-[#1e2530] bg-[#0d1117] px-5 py-2.5 md:block">
              <div className="text-[12px] font-semibold leading-tight text-white">Built for clarity, not hype.</div>
              <div className="mt-0.5 text-[11px] text-[#22c55e]">Invest like institutional investors.</div>
            </div>
          </div>
          <button onClick={onOpenDashboard}
            className="rounded-lg bg-[#22c55e] px-5 py-2 text-[13px] font-semibold text-[#060a0f] transition hover:bg-[#16a34a]">
            Launch Dashboard
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════
          TAGLINE STRIP — directly under header
         ═══════════════════════════════════════════ */}
      <section className="bg-[#0d1117]">
        {/* Top line */}
        <div className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
          <div className="h-[6px] rounded-full bg-white/10" />
        </div>
        {/* Taglines — stack on mobile, 4-col on desktop */}
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {taglines.map((text, i) => (
            <div key={text} className={`px-6 py-4 text-center md:px-8 md:py-5 ${i > 0 ? "border-t border-[#1e2530] sm:border-t-0 sm:border-l" : ""}`}>
              <div className="text-[12px] font-semibold leading-5 text-white md:text-[13px]">{text}</div>
            </div>
          ))}
        </div>
        {/* Bottom line */}
        <div className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
          <div className="h-[6px] rounded-full bg-white/10" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          ABOUT US
         ═══════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(34,197,94,0.07),transparent_50%),radial-gradient(ellipse_at_80%_70%,rgba(56,189,248,0.05),transparent_50%)]" />

        <div className="relative mx-auto w-full max-w-[1200px] px-8 py-20">
          {/* Chart box with about copy — stacks on mobile */}
          <div className="grid items-stretch gap-6 grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
            {/* Left: trading chart visualization */}
            <div className="rounded-xl border border-[#1e2530] bg-[#0d1117] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-[#22c55e]" />
                  <span className="text-[12px] font-semibold text-white">Market Overview</span>
                </div>
                <span className="text-[10px] text-[#94a3b8]">Live</span>
              </div>
              {/* Chart area */}
              <div className="relative h-[220px] overflow-hidden rounded-lg border border-[#1e2530] bg-[#060a0f] p-4">
                {/* Grid lines */}
                <div className="absolute inset-4 flex flex-col justify-between">
                  {[0,1,2,3,4].map(i => <div key={i} className="h-px bg-[#1e2530]" />)}
                </div>
                {/* Price labels */}
                <div className="absolute right-4 top-4 bottom-4 flex flex-col justify-between text-[9px] text-[#94a3b8]/50">
                  <span>192</span><span>188</span><span>184</span><span>180</span><span>176</span>
                </div>
                {/* Candlestick-style bars */}
                <svg className="absolute inset-4 right-12" viewBox="0 0 400 180" preserveAspectRatio="none">
                  {/* Uptrend candles */}
                  {[
                    [20,120,90,130,80],  [45,100,70,110,60],  [70,80,55,90,45],
                    [95,90,65,100,55],   [120,70,40,80,30],   [145,55,30,65,20],
                    [170,60,45,70,35],   [195,45,20,55,10],   [220,50,30,60,20],
                    [245,35,15,45,5],    [270,40,25,50,15],   [295,30,10,40,5],
                    [320,25,8,35,3],     [345,35,20,45,12],   [370,20,5,30,0],
                  ].map(([x, o, c, h, l], i) => {
                    const isUp = c < o;
                    const color = isUp ? "#22c55e" : "#ef4444";
                    const top = Math.min(o, c);
                    const body = Math.abs(o - c);
                    return (
                      <g key={i}>
                        <line x1={x} y1={l} x2={x} y2={h} stroke={color} strokeWidth="1.5" opacity="0.6" />
                        <rect x={x - 8} y={top} width="16" height={Math.max(body, 2)} fill={color} opacity="0.8" rx="1" />
                      </g>
                    );
                  })}
                  {/* Moving average line */}
                  <polyline
                    points="20,105 45,85 70,68 95,78 120,55 145,43 170,53 195,33 220,40 245,25 270,33 295,20 320,17 345,28 370,13"
                    fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.5" />
                </svg>
                {/* Volume bars at bottom */}
                <div className="absolute bottom-4 left-4 right-12 flex items-end gap-[10px] h-[30px]">
                  {[60,45,80,35,90,70,55,95,40,85,50,75,65,45,80].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-[#22c55e]/15" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              {/* Bottom ticker strip */}
              <div className="mt-3 flex gap-4 text-[11px]">
                {[["NVDA", "+2.4%", "#22c55e"], ["SPY", "+0.8%", "#22c55e"], ["QQQ", "-0.3%", "#ef4444"], ["XLF", "+1.1%", "#22c55e"]].map(([sym, chg, color]) => (
                  <div key={sym} className="flex items-center gap-2">
                    <span className="font-semibold text-white">{sym}</span>
                    <span style={{ color }}>{chg}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: about copy */}
            <div className="flex flex-col justify-center rounded-xl border border-[#1e2530] bg-[#0d1117] p-8">
              <p className="text-[15px] leading-7 text-[#94a3b8]">
                Trigger Engine is a market intelligence platform built for traders who want more than
                raw data and basic scanners. We combine signal scanning, risk interpretation, and
                structured workflow into one dashboard so users can evaluate opportunities with clarity
                and act with confidence.
              </p>
              <p className="mt-5 text-[15px] leading-7 text-[#94a3b8]">
                Our focus is delivering signal quality, explainability, and disciplined decision support
                — the three things most platforms skip.
              </p>
            </div>
          </div>

          <div className="my-12 h-[6px] rounded-full bg-white/10/10" />

          {/* Three pillars */}
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {[
              ["Signal Quality", "Surface what actually matters — ranked, scored, and filtered so you focus on the strongest setups first."],
              ["Explainability", "Every signal comes with a trace. Know exactly what contributed to the score, not just the number."],
              ["Decision Support", "A structured path from scan to signal to risk to action — replacing guesswork with disciplined process."],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-xl border border-[#1e2530] bg-[#0d1117] p-6 text-center">
                <div className="text-[16px] font-bold text-[#22c55e]">{title}</div>
                <p className="mt-3 text-[13px] leading-6 text-[#94a3b8]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GREEN LINE ABOVE CAPABILITIES ─────── */}
      <div className="bg-[#060a0f] py-6" />
      <div className="mx-auto w-full max-w-[1200px] px-8">
        <div className="h-[6px] rounded-full bg-white/10" />
      </div>
      <div className="bg-[#060a0f] py-6" />

      {/* ═══════════════════════════════════════════
          PRODUCT CAPABILITIES
         ═══════════════════════════════════════════ */}
      <section>
        <div className="mx-auto w-full max-w-[1200px] px-8 py-20">
          <div className="mb-14 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#94a3b8]">Product Capabilities</div>
            <h2 className="mt-4 text-[2rem] font-bold leading-tight text-white md:text-[2.4rem]">
              Everything you need in one workflow.
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-[#94a3b8]">
              Each capability is designed to reduce noise, improve clarity, and help you make better decisions.
              Tools dynamically adjust to market conditions.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-[#1e2530] bg-[#1e2530] md:grid-cols-2">
            {capabilities.map((cap, i) => (
              <div key={cap.title} className="bg-[#0d1117] p-8">
                <div className="flex items-start gap-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#22c55e]/10 text-[13px] font-bold text-[#22c55e]">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white">{cap.title}</h3>
                    <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">{cap.benefit}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIVIDER ──────────────────────────────── */}
      <Divider />

      {/* ═══════════════════════════════════════════
          CLOSING
         ═══════════════════════════════════════════ */}
      <section>
        <div className="mx-auto w-full max-w-[1200px] px-8 py-20">
          <div className="relative overflow-hidden rounded-xl border border-[#1e2530] bg-[#0d1117]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.05),transparent_60%)]" />

            <div className="relative px-10 py-12 md:px-14">
              <p className="text-[18px] leading-8 text-[#94a3b8] md:text-[20px]">
                Explore the dashboard, review the workflow, and see how
                Trigger Engine is designed to support better decisions.
              </p>
              <p className="mt-5 text-[11px] leading-5 text-[#94a3b8]/50">
                Users should always apply their own judgment and risk management when making trading decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────── */}
      <footer className="border-t border-[#1e2530]">
        <div className="mx-auto w-full max-w-[1200px] px-8 py-6 text-right text-[11px] text-[#94a3b8]/40">
          &copy; 2026 Trigger Engine
        </div>
      </footer>
    </div>
  );
}
