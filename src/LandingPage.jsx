// =====================================================
// LANDING PAGE — AI Trading Intelligence
// =====================================================
// Single-page landing experience with hero, features,
// videos, docs, AI help preview, audience, and footer.
//
// Placeholder links to replace:
//   - video hrefs → real YouTube/Vimeo URLs
//   - doc hrefs → real doc routes or PDF links
//   - "Open Dashboard" → onOpenDashboard prop callback
//   - AI Help chat → wire to /api/knowledgebot/chat
// =====================================================

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  Brain,
  ChartCandlestick,
  CircleHelp,
  FileText,
  Gauge,
  LineChart,
  MonitorSmartphone,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

// ── DATA ────────────────────────────────────────────

const features = [
  {
    icon: ChartCandlestick,
    title: "Smart Market Scanner",
    what: "Scans stock and options setups in one dashboard.",
    why: "Helps users find promising opportunities faster instead of guessing.",
  },
  {
    icon: Brain,
    title: "Explainable Scoring",
    what: "Shows why a setup is strong or weak.",
    why: "Builds trust by explaining the score, not just showing a number.",
  },
  {
    icon: Gauge,
    title: "Monte Carlo Risk Modeling",
    what: "Simulates paths, touch risk, drawdown, and outcome ranges.",
    why: "Helps users understand risk before acting.",
  },
  {
    icon: Bell,
    title: "Alerts & Monitoring",
    what: "Notifies users when high-quality setups pass defined gates.",
    why: "Saves time and reduces the need to watch charts all day.",
  },
  {
    icon: LineChart,
    title: "Backtesting & Calibration",
    what: "Replays setups and tracks what worked over time.",
    why: "Turns ideas into evidence and helps refine decision rules.",
  },
  {
    icon: ShieldCheck,
    title: "Chart Context Engine",
    what: "Adds support, resistance, demand, supply, and ATR context.",
    why: "Improves entry and exit quality without replacing the core thesis.",
  },
];

// Replace href values with real video URLs when ready
const videos = [
  {
    title: "How to Read a GO Signal",
    description:
      "Quick walkthrough of what a high score means and why it matters.",
    duration: "2:14",
    href: "#",
  },
  {
    title: "Using the Credit-Vol Scanner",
    description:
      "Learn how to evaluate premium setups and risk in simple terms.",
    duration: "3:08",
    href: "#",
  },
  {
    title: "Touch Probability Explained",
    description:
      "Understand why a trade can still feel risky even with good odds.",
    duration: "1:52",
    href: "#",
  },
  {
    title: "Backtesting in Plain English",
    description:
      "See how the app checks what worked before and why that helps.",
    duration: "2:41",
    href: "#",
  },
];

// Replace href values with real doc routes or PDF links
const docs = [
  {
    title: "Beginner Guide",
    description:
      "A simple overview of the dashboard and how to use it step by step.",
    cta: "Read Guide",
    href: "#",
  },
  {
    title: "Trigger Engine Guide",
    description:
      "Learn how the main scanner ranks setups and highlights signals.",
    cta: "Open Docs",
    href: "#",
  },
  {
    title: "Credit-Vol Scanner Guide",
    description: "Understand premium selling ideas, risk, and setup quality.",
    cta: "Open Docs",
    href: "#",
  },
  {
    title: "Alerts & Backtesting",
    description:
      "See how alerts fire and how historical replay helps improve confidence.",
    cta: "Read Guide",
    href: "#",
  },
  {
    title: "Glossary",
    description:
      "Quick definitions for GO, IV Rank, touch probability, ATR, and more.",
    cta: "Open Glossary",
    href: "#",
  },
];

const audiences = [
  {
    icon: TrendingUp,
    title: "Traders",
    text: "For people who want stronger setup evaluation before entering a trade.",
  },
  {
    icon: Activity,
    title: "Analysts",
    text: "For users who want explainable scoring, pattern context, and replayable logic.",
  },
  {
    icon: MonitorSmartphone,
    title: "Active Investors",
    text: "For users who want better visibility into opportunity, risk, and timing.",
  },
  {
    icon: CircleHelp,
    title: "Decision Support Users",
    text: "For anyone who wants to understand why a signal matters, not just see it.",
  },
];

const samplePrompts = [
  "What does GO mean?",
  "How do alerts work?",
  "What is touch probability?",
  "Explain this page",
];

// ── HELPERS ─────────────────────────────────────────

function SectionHeader({ badge, title, subtitle }) {
  return (
    <div className="max-w-3xl">
      {badge ? (
        <div className="mb-3 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-300">
          {badge}
        </div>
      ) : null}
      <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-sm leading-7 text-slate-300 md:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function GlowCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-slate-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

// ── MAIN COMPONENT ──────────────────────────────────

export default function LandingPage({ onOpenDashboard }) {
  const [aiInput, setAiInput] = useState("");

  return (
    <div className="min-h-screen bg-[#020817] text-slate-200">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(6,182,212,0.12),transparent_22%),radial-gradient(circle_at_50%_80%,rgba(245,158,11,0.08),transparent_20%)]" />

      <div className="relative">
        {/* ── TOP NAV ──────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <a href="#home" className="flex items-center gap-3">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-2">
                <Sparkles className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-slate-400">
                  AI Trading Intelligence
                </div>
                <div className="text-lg font-semibold text-white">
                  Trigger Engine
                </div>
              </div>
            </a>

            <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
              <a href="#home" className="hover:text-white">Home</a>
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#videos" className="hover:text-white">Videos</a>
              <a href="#docs" className="hover:text-white">Docs</a>
              <a href="#ai-help" className="hover:text-white">AI Help</a>
            </nav>

            <div className="hidden md:block">
              <a
                href="#docs"
                className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-400/20"
              >
                View User Guide
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 pb-20">
          {/* ── HERO ────────────────────────────────── */}
          <section
            id="home"
            className="grid min-h-[85vh] items-center gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr]"
          >
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="mb-5 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-emerald-300">
                AI-Powered Trading Intelligence
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-white md:text-6xl">
                Scan, score, explain, and monitor smarter trade opportunities.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
                We build an AI-powered market intelligence and trade
                decision-support application that helps users evaluate stock and
                options setups through explainable scoring, chart context, Monte
                Carlo risk modeling, alerts, and backtesting.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={onOpenDashboard}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Open Dashboard <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#docs"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  View User Guide <BookOpen className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  ["Find promising setups", "Scanner + discovery tools"],
                  ["Understand why they matter", "Explainable score traces"],
                  ["Evaluate risk before acting", "MC paths + chart context"],
                ].map(([title, text]) => (
                  <GlowCard key={title} className="p-4">
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <div className="mt-1 text-sm text-slate-400">{text}</div>
                  </GlowCard>
                ))}
              </div>
            </motion.div>

            {/* Dashboard preview card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              <GlowCard className="overflow-hidden p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Live Preview
                    </div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      Smart Dashboard Snapshot
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                    LIVE
                  </div>
                </div>

                <div className="mt-5 grid gap-4">
                  <GlowCard className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
                          Top Setup
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          NVDA_POWER_STACK
                        </div>
                        <div className="mt-1 text-sm text-emerald-300">
                          GO &middot; Strong confluence
                        </div>
                      </div>
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-emerald-400/70 text-lg font-bold text-emerald-300">
                        90
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl bg-white/5 p-3">
                        <div className="text-slate-400">Prob</div>
                        <div className="mt-1 font-semibold text-white">74%</div>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <div className="text-slate-400">Touch</div>
                        <div className="mt-1 font-semibold text-white">22%</div>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <div className="text-slate-400">Risk</div>
                        <div className="mt-1 font-semibold text-amber-300">Med</div>
                      </div>
                    </div>
                  </GlowCard>

                  <div className="grid gap-4 md:grid-cols-2">
                    <GlowCard className="p-4">
                      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
                        Explainable Scoring
                      </div>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-300">Regime: Risk On</span>
                          <span className="font-semibold text-emerald-300">+20</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">IV Rich</span>
                          <span className="font-semibold text-emerald-300">+10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">ATR Extension</span>
                          <span className="font-semibold text-amber-300">-5</span>
                        </div>
                      </div>
                    </GlowCard>
                    <GlowCard className="p-4">
                      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
                        Why It Matters
                      </div>
                      <p className="mt-3 text-sm leading-7 text-slate-300">
                        The dashboard helps users find opportunities, understand
                        risk, and see why a setup is strong before taking action.
                      </p>
                    </GlowCard>
                  </div>
                </div>
              </GlowCard>
            </motion.div>
          </section>

          {/* ── AUDIENCE / VALUE ────────────────────── */}
          <section className="py-10">
            <SectionHeader
              badge="Who It's For"
              title="Built for traders, analysts, and active investors."
              subtitle="The platform is designed for users who want explainable decision support, not black-box signals."
            />
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {audiences.map((item) => {
                const Icon = item.icon;
                return (
                  <GlowCard key={item.title} className="p-5">
                    <div className="inline-flex rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-3">
                      <Icon className="h-5 w-5 text-cyan-300" />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-white">
                      {item.title}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-300">
                      {item.text}
                    </p>
                  </GlowCard>
                );
              })}
            </div>
          </section>

          {/* ── FEATURES ───────────────────────────── */}
          <section id="features" className="py-16">
            <SectionHeader
              badge="Core Features"
              title="Everything needed to evaluate opportunity and risk in one workflow."
              subtitle="The application combines live market scanning, explainable scoring, risk modeling, alerts, backtesting, and chart context in one place."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {features.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: idx * 0.06 }}
                  >
                    <GlowCard className="h-full p-6">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                          <Icon className="h-5 w-5 text-emerald-300" />
                        </div>
                        <h3 className="text-xl font-semibold text-white">
                          {feature.title}
                        </h3>
                      </div>
                      <div className="mt-5 space-y-3 text-sm leading-7">
                        <p>
                          <span className="font-semibold text-slate-200">
                            What it does:{" "}
                          </span>
                          <span className="text-slate-300">{feature.what}</span>
                        </p>
                        <p>
                          <span className="font-semibold text-slate-200">
                            Why it matters:{" "}
                          </span>
                          <span className="text-slate-300">{feature.why}</span>
                        </p>
                      </div>
                    </GlowCard>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* ── VIDEOS ─────────────────────────────── */}
          <section id="videos" className="py-16">
            <SectionHeader
              badge="Learn Fast"
              title="Investment Shorts"
              subtitle="Short, easy-to-swap video blocks for education, onboarding, and feature walkthroughs."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {videos.map((video) => (
                <GlowCard key={video.title} className="overflow-hidden">
                  <div className="relative aspect-video bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full border border-white/10 bg-white/10 p-4 backdrop-blur">
                        <PlayCircle className="h-10 w-10 text-white" />
                      </div>
                    </div>
                    <div className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                      {video.duration}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-lg font-semibold text-white">
                      {video.title}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-300">
                      {video.description}
                    </p>
                    <a
                      href={video.href}
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      Watch <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </GlowCard>
              ))}
            </div>
          </section>

          {/* ── DOCS ───────────────────────────────── */}
          <section id="docs" className="py-16">
            <SectionHeader
              badge="Documentation"
              title="User guides and quick-start help."
              subtitle="Organize beginner help, page-specific documentation, and glossary content in one easy access area."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {docs.map((doc) => (
                <GlowCard key={doc.title} className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
                      <FileText className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="text-lg font-semibold text-white">
                      {doc.title}
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    {doc.description}
                  </p>
                  <a
                    href={doc.href}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
                  >
                    {doc.cta} <ArrowRight className="h-4 w-4" />
                  </a>
                </GlowCard>
              ))}
            </div>
          </section>

          {/* ── AI HELP ────────────────────────────── */}
          <section id="ai-help" className="py-16">
            <SectionHeader
              badge="Support Assistant"
              title="Ask the Dashboard"
              subtitle="A visible help area for an AI assistant or grounded knowledge bot that can answer questions about the dashboard, features, and guides."
            />
            <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <GlowCard className="p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-3">
                    <Bot className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      AI Help Agent
                    </div>
                    <div className="text-sm text-slate-400">
                      Powered by Vertex AI
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  This assistant can help explain scores, alerts, terms, and how
                  to use each page of the application in plain language.
                </p>
                <div className="mt-5">
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
                    Sample prompts
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {samplePrompts.map((prompt) => (
                      <button
                        key={prompt}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </GlowCard>

              {/* Chat preview */}
              <GlowCard className="p-5">
                <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-2">
                        <Bot className="h-4 w-4 text-emerald-300" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Ask the Dashboard
                        </div>
                        <div className="text-xs text-slate-400">
                          Knowledge bot preview
                        </div>
                      </div>
                    </div>
                    <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      Online
                    </div>
                  </div>

                  <div className="space-y-4 py-4">
                    <div className="ml-auto max-w-[82%] rounded-3xl rounded-br-md bg-cyan-500/15 px-4 py-3 text-sm text-slate-100">
                      What does GO mean?
                    </div>
                    <div className="max-w-[88%] rounded-3xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-slate-200">
                      <span className="font-semibold text-white">GO</span> means
                      the setup passed enough quality checks to be considered
                      actionable. It does not guarantee success, but it tells you
                      that multiple signals are lining up in a stronger way than
                      WATCH or NO TRADE.
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t border-white/10 pt-4">
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="Ask a question about the dashboard..."
                      className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
                    />
                    <button className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                      Ask
                    </button>
                  </div>
                </div>
              </GlowCard>
            </div>
          </section>

          {/* ── FOOTER ─────────────────────────────── */}
          <footer className="border-t border-white/10 py-10">
            <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-slate-500">
                  Trigger Engine
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  AI-enhanced market intelligence and trade decision support.
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
                  Built to help users scan markets, evaluate setups, understand
                  risk, monitor alerts, and learn from historical results in a
                  single workflow.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="font-semibold text-white">Product</div>
                  <div className="mt-3 space-y-2 text-slate-400">
                    <button onClick={onOpenDashboard} className="block hover:text-white">
                      Dashboard
                    </button>
                    <a href="#features" className="block hover:text-white">
                      Features
                    </a>
                    <a href="#videos" className="block hover:text-white">
                      Videos
                    </a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-white">Support</div>
                  <div className="mt-3 space-y-2 text-slate-400">
                    <a href="#docs" className="block hover:text-white">
                      User Guide
                    </a>
                    <a href="#ai-help" className="block hover:text-white">
                      AI Help
                    </a>
                    <a href="#contact" className="block hover:text-white">
                      Contact
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
