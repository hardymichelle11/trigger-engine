// =====================================================
// LANDING PAGE — Beyond the Symbols
// =====================================================
// Clean, minimal, proportional. Inspired by Fintax style.
// Each slide = full viewport. Limited content per slide.
// =====================================================

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Bot,
  Brain,
  ChartCandlestick,
  Gauge,
  LineChart,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";

// ── FADE ────────────────────────────────────────────

function FadeIn({ children, delay = 0, className = "" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }} transition={{ duration: 0.6, delay }} className={className}>
      {children}
    </motion.div>
  );
}

// ── MAIN ────────────────────────────────────────────

export default function LandingPage({ onOpenDashboard }) {
  const [aiInput, setAiInput] = useState("");

  return (
    <div className="min-h-screen bg-[#1a2332] text-white" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* ── NAV ──────────────────────────────────── */}
      <header className="fixed top-0 z-50 w-full bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-10 py-5">
          <div className="text-xl font-bold tracking-[0.15em] text-[#1a2332]" style={{ fontFamily: "'Georgia', serif" }}>
            BEYOND THE SYMBOLS
          </div>
          <nav className="hidden items-center gap-8 text-[13px] text-[#4a5568] md:flex" style={{ fontFamily: "system-ui, sans-serif" }}>
            <a href="#home" className="hover:text-[#1a2332]">Home</a>
            <a href="#services" className="hover:text-[#1a2332]">Services</a>
            <a href="#learn" className="hover:text-[#1a2332]">Learn</a>
            <a href="#docs" className="hover:text-[#1a2332]">Docs</a>
            <a href="#ai-help" className="hover:text-[#1a2332]">AI Help</a>
          </nav>
          <button onClick={onOpenDashboard}
            className="border border-[#1a2332] px-6 py-2 text-[12px] font-semibold tracking-[0.15em] text-[#1a2332] hover:bg-[#1a2332] hover:text-white"
            style={{ fontFamily: "system-ui, sans-serif" }}>
            OPEN DASHBOARD
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════
          SLIDE 1 — HERO
         ═══════════════════════════════════════════ */}
      <section id="home" className="relative flex min-h-screen items-center justify-center overflow-hidden">
        {/* Background image overlay */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=80')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[#1a2332]/80" />

        <FadeIn className="relative z-10 px-8 text-center">
          <div className="text-[13px] tracking-[0.4em] text-white/60" style={{ fontFamily: "system-ui, sans-serif" }}>
            AI-POWERED TRADING INTELLIGENCE
          </div>

          <h1 className="mx-auto mt-8 max-w-3xl text-4xl leading-snug tracking-wide md:text-6xl md:leading-snug">
            Stock &amp; Options<br />Market Intelligence
          </h1>

          <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-white/60" style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}>
            A smarter way to scan, score, and understand trade setups.
            Built for traders who want clarity before action.
          </p>

          <div className="mt-12 flex justify-center gap-5">
            <button onClick={onOpenDashboard}
              className="bg-white px-10 py-4 text-[12px] font-semibold tracking-[0.2em] text-[#1a2332] hover:bg-white/90"
              style={{ fontFamily: "system-ui, sans-serif" }}>
              EXPLORE DASHBOARD
            </button>
            <a href="#services"
              className="border border-white/40 px-10 py-4 text-[12px] font-semibold tracking-[0.2em] text-white hover:bg-white/10"
              style={{ fontFamily: "system-ui, sans-serif" }}>
              OUR SERVICES
            </a>
          </div>
        </FadeIn>
      </section>

      {/* ═══════════════════════════════════════════
          SLIDE 2 — SERVICES (6 cards, 3x2)
         ═══════════════════════════════════════════ */}
      <section id="services" className="flex min-h-screen items-center bg-white">
        <div className="mx-auto w-full max-w-5xl px-10 py-20">
          <FadeIn className="text-center">
            <div className="text-[12px] tracking-[0.4em] text-[#8a9bb5]" style={{ fontFamily: "system-ui, sans-serif" }}>
              WHAT WE OFFER
            </div>
            <h2 className="mt-4 text-3xl tracking-wide text-[#1a2332] md:text-4xl">
              Market Intelligence Services
            </h2>
            <div className="mx-auto mt-5 h-px w-12 bg-[#1a2332]" />
          </FadeIn>

          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {[
              [ChartCandlestick, "Smart Scanner", "Ranks setups by score across your full watchlist."],
              [Brain, "Explainable Scoring", "See exactly why a setup is strong or weak."],
              [Gauge, "Risk Modeling", "Monte Carlo simulations for touch risk and drawdown."],
              [Bell, "Live Alerts", "Get notified when quality gates are passed."],
              [LineChart, "Backtesting", "Replay setups against history to build confidence."],
              [ShieldCheck, "Chart Context", "Support, resistance, and demand zone analysis."],
            ].map(([Icon, title, desc], i) => (
              <FadeIn key={title} delay={i * 0.06}>
                <div className="text-center">
                  <Icon className="mx-auto h-7 w-7 text-[#1a2332]/40" strokeWidth={1.5} />
                  <h3 className="mt-5 text-lg tracking-wide text-[#1a2332]">{title}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-[#6b7c93]" style={{ fontFamily: "system-ui, sans-serif" }}>
                    {desc}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SLIDE 3 — DASHBOARD PREVIEW
         ═══════════════════════════════════════════ */}
      <section className="flex min-h-screen items-center bg-[#f7f8fa]">
        <div className="mx-auto w-full max-w-4xl px-10 py-20">
          <FadeIn className="text-center">
            <div className="text-[12px] tracking-[0.4em] text-[#8a9bb5]" style={{ fontFamily: "system-ui, sans-serif" }}>
              LIVE PREVIEW
            </div>
            <h2 className="mt-4 text-3xl tracking-wide text-[#1a2332] md:text-4xl">
              Inside the Dashboard
            </h2>
            <div className="mx-auto mt-5 h-px w-12 bg-[#1a2332]" />
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="mt-16 bg-[#1a2332] p-10 text-white shadow-2xl">
              {/* Top row */}
              <div className="flex items-start justify-between border-b border-white/10 pb-8">
                <div>
                  <div className="text-[11px] tracking-[0.3em] text-white/40" style={{ fontFamily: "system-ui, sans-serif" }}>TOP SETUP</div>
                  <div className="mt-2 text-2xl tracking-wide">NVDA_POWER_STACK</div>
                  <div className="mt-1 text-[14px] text-emerald-400" style={{ fontFamily: "system-ui, sans-serif" }}>GO &middot; Strong confluence</div>
                </div>
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/50">
                  <span className="text-3xl font-light text-emerald-400">90</span>
                </div>
              </div>

              {/* Metrics */}
              <div className="mt-8 grid grid-cols-3 text-center">
                <div>
                  <div className="text-[10px] tracking-[0.3em] text-white/30" style={{ fontFamily: "system-ui, sans-serif" }}>PROBABILITY</div>
                  <div className="mt-2 text-3xl font-light">74%</div>
                </div>
                <div className="border-x border-white/10">
                  <div className="text-[10px] tracking-[0.3em] text-white/30" style={{ fontFamily: "system-ui, sans-serif" }}>TOUCH RISK</div>
                  <div className="mt-2 text-3xl font-light">22%</div>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.3em] text-white/30" style={{ fontFamily: "system-ui, sans-serif" }}>RISK LEVEL</div>
                  <div className="mt-2 text-3xl font-light text-amber-400">Medium</div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SLIDE 4 — LEARN (videos)
         ═══════════════════════════════════════════ */}
      <section id="learn" className="flex min-h-screen items-center bg-white">
        <div className="mx-auto w-full max-w-5xl px-10 py-20">
          <FadeIn className="text-center">
            <div className="text-[12px] tracking-[0.4em] text-[#8a9bb5]" style={{ fontFamily: "system-ui, sans-serif" }}>
              EDUCATION
            </div>
            <h2 className="mt-4 text-3xl tracking-wide text-[#1a2332] md:text-4xl">
              Learn With Quick Videos
            </h2>
            <div className="mx-auto mt-5 h-px w-12 bg-[#1a2332]" />
          </FadeIn>

          <div className="mt-16 grid gap-8 md:grid-cols-2">
            {[
              ["How to Read a GO Signal", "2:14"],
              ["Using the Credit-Vol Scanner", "3:08"],
              ["Touch Probability Explained", "1:52"],
              ["Backtesting in Plain English", "2:41"],
            ].map(([title, dur], i) => (
              <FadeIn key={title} delay={i * 0.06}>
                <div className="group flex items-center gap-6 border border-[#e2e8f0] p-6 transition hover:border-[#1a2332]/30">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1a2332]">
                    <PlayCircle className="h-6 w-6 text-white/70" />
                  </div>
                  <div>
                    <div className="text-lg tracking-wide text-[#1a2332]">{title}</div>
                    <div className="mt-1 text-[12px] text-[#8a9bb5]" style={{ fontFamily: "system-ui, sans-serif" }}>{dur}</div>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-[#cbd5e0] transition group-hover:text-[#1a2332]" />
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SLIDE 5 — DOCS
         ═══════════════════════════════════════════ */}
      <section id="docs" className="flex min-h-screen items-center bg-[#f7f8fa]">
        <div className="mx-auto w-full max-w-5xl px-10 py-20">
          <FadeIn className="text-center">
            <div className="text-[12px] tracking-[0.4em] text-[#8a9bb5]" style={{ fontFamily: "system-ui, sans-serif" }}>
              DOCUMENTATION
            </div>
            <h2 className="mt-4 text-3xl tracking-wide text-[#1a2332] md:text-4xl">
              Guides &amp; Reference
            </h2>
            <div className="mx-auto mt-5 h-px w-12 bg-[#1a2332]" />
          </FadeIn>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              ["Beginner Guide", "Step-by-step dashboard overview for new users."],
              ["Trigger Engine", "How the scanner ranks setups and highlights signals."],
              ["Credit-Vol Scanner", "Premium selling ideas, risk, and quality."],
            ].map(([title, desc], i) => (
              <FadeIn key={title} delay={i * 0.05}>
                <div className="border border-[#e2e8f0] bg-white p-8">
                  <h3 className="text-lg tracking-wide text-[#1a2332]">{title}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-[#6b7c93]" style={{ fontFamily: "system-ui, sans-serif" }}>
                    {desc}
                  </p>
                  <a href="#" className="mt-6 inline-block text-[12px] tracking-[0.15em] text-[#1a2332] underline underline-offset-4 hover:no-underline"
                    style={{ fontFamily: "system-ui, sans-serif" }}>
                    READ MORE
                  </a>
                </div>
              </FadeIn>
            ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {[
              ["Alerts & Backtesting", "How alerts fire and how replay improves decisions."],
              ["Glossary", "Quick definitions for GO, IV Rank, ATR, and more."],
            ].map(([title, desc], i) => (
              <FadeIn key={title} delay={(i + 3) * 0.05}>
                <div className="border border-[#e2e8f0] bg-white p-8">
                  <h3 className="text-lg tracking-wide text-[#1a2332]">{title}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-[#6b7c93]" style={{ fontFamily: "system-ui, sans-serif" }}>
                    {desc}
                  </p>
                  <a href="#" className="mt-6 inline-block text-[12px] tracking-[0.15em] text-[#1a2332] underline underline-offset-4 hover:no-underline"
                    style={{ fontFamily: "system-ui, sans-serif" }}>
                    READ MORE
                  </a>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SLIDE 6 — AI HELP
         ═══════════════════════════════════════════ */}
      <section id="ai-help" className="flex min-h-screen items-center bg-[#1a2332]">
        <div className="mx-auto w-full max-w-3xl px-10 py-20">
          <FadeIn className="text-center">
            <div className="text-[12px] tracking-[0.4em] text-white/40" style={{ fontFamily: "system-ui, sans-serif" }}>
              SUPPORT ASSISTANT
            </div>
            <h2 className="mt-4 text-3xl tracking-wide md:text-4xl">
              Ask the Dashboard
            </h2>
            <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-white/50" style={{ fontStyle: "italic" }}>
              AI-powered assistant that explains scores, alerts, and features in plain language.
            </p>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="mt-14 border border-white/10 bg-white/[0.03]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-8 py-5">
                <div className="flex items-center gap-3">
                  <Bot className="h-5 w-5 text-white/50" />
                  <span className="text-[14px] text-white/70" style={{ fontFamily: "system-ui, sans-serif" }}>AI Help Agent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-[11px] text-white/30" style={{ fontFamily: "system-ui, sans-serif" }}>Online</span>
                </div>
              </div>

              {/* Chat */}
              <div className="space-y-4 px-8 py-8">
                <div className="ml-auto max-w-[65%] border border-white/10 bg-white/[0.05] px-5 py-3 text-[14px] text-white/80">
                  What does GO mean?
                </div>
                <div className="max-w-[75%] bg-white/[0.03] px-5 py-3 text-[14px] leading-relaxed text-white/60" style={{ fontFamily: "system-ui, sans-serif" }}>
                  <span className="text-white">GO</span> means the setup passed enough quality checks to be considered
                  actionable. Multiple signals are confirming.
                </div>
              </div>

              {/* Input */}
              <div className="flex items-center border-t border-white/10 px-8 py-5">
                <input type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/20"
                  style={{ fontFamily: "system-ui, sans-serif" }} />
                <button className="ml-4 bg-white px-6 py-2 text-[11px] font-semibold tracking-[0.15em] text-[#1a2332] hover:bg-white/90"
                  style={{ fontFamily: "system-ui, sans-serif" }}>
                  ASK
                </button>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────── */}
      <footer className="bg-[#141c28] py-16">
        <div className="mx-auto max-w-5xl px-10 text-center">
          <div className="text-2xl tracking-[0.15em]">BEYOND THE SYMBOLS</div>
          <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed text-white/40" style={{ fontStyle: "italic" }}>
            AI-enhanced market intelligence and trade decision support.
          </p>
          <div className="mx-auto mt-8 h-px w-12 bg-white/10" />
          <nav className="mt-8 flex justify-center gap-8 text-[12px] tracking-[0.15em] text-white/30" style={{ fontFamily: "system-ui, sans-serif" }}>
            <button onClick={onOpenDashboard} className="hover:text-white">Dashboard</button>
            <a href="#services" className="hover:text-white">Services</a>
            <a href="#docs" className="hover:text-white">Docs</a>
            <a href="#ai-help" className="hover:text-white">AI Help</a>
          </nav>
          <div className="mt-10 text-[11px] text-white/15" style={{ fontFamily: "system-ui, sans-serif" }}>
            &copy; 2026 Beyond the Symbols
          </div>
        </div>
      </footer>
    </div>
  );
}
