// =====================================================
// KNOWLEDGE BOT PANEL — dashboard help bot UI
// =====================================================
// Modes: OFF, FAQ_ONLY, SEARCH_ONLY, FULL_CHAT
// Shows mode badge, budget bar, FAQ browser, search,
// and chat input (when available).
// =====================================================

import { useState, useCallback, useMemo } from "react";
import { loadKnowledgeBotConfig, saveKnowledgeBotConfig, getCapabilities } from "./knowledgeBotConfig.js";
import { recordUsage } from "./usageTracker.js";
import { getBotStatus } from "./modeResolver.js";
import { searchFaq, searchGlossary, getFaqCategories, getFaqByCategory, GLOSSARY } from "./faqContent.js";

const GREEN  = "#22c55e";
const RED    = "#ef4444";
const AMBER  = "#f59e0b";
const BLUE   = "#38bdf8";
const SLATE  = "#94a3b8";

// ── MODE BADGE ──────────────────────────────────────

function ModeBadge({ status }) {
  const cap = status.capabilities;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      color: cap.color, background: cap.color + "22",
      padding: "3px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      {status.downgraded && <span style={{ fontSize: 12 }} title={status.reason}>&#9888;</span>}
      {cap.label}
    </span>
  );
}

// ── BUDGET BAR ──────────────────────────────────────

function BudgetBar({ status }) {
  const pct = status.budgetBarPct;
  return (
    <div style={{ marginTop: 6, fontSize: 10, color: SLATE }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span>Budget: ${status.usage.totalCostUsd} / ${status.usage.budgetUsd}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${Math.min(pct, 100)}%`,
          background: status.budgetColor, borderRadius: 2,
          transition: "width 0.3s ease",
        }} />
      </div>
      {status.downgraded && (
        <div style={{ marginTop: 3, color: AMBER, fontSize: 9 }}>
          {status.reason}
        </div>
      )}
    </div>
  );
}

// ── FAQ BROWSER ─────────────────────────────────────

function FaqBrowser() {
  const [expanded, setExpanded] = useState(null);
  const categories = useMemo(() => getFaqCategories(), []);

  return (
    <div style={{ maxHeight: 280, overflowY: "auto", marginTop: 8 }}>
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: BLUE, letterSpacing: "0.06em", marginBottom: 4 }}>
            {cat.toUpperCase()}
          </div>
          {getFaqByCategory(cat).map(entry => (
            <div key={entry.id} style={{
              padding: "6px 8px", marginBottom: 2, borderRadius: 4, cursor: "pointer",
              background: expanded === entry.id ? "#1e293b" : "transparent",
            }} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
              <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 500 }}>
                {expanded === entry.id ? "▾" : "▸"} {entry.q}
              </div>
              {expanded === entry.id && (
                <div style={{ fontSize: 10, color: SLATE, marginTop: 4, lineHeight: 1.5, paddingLeft: 12 }}>
                  {entry.a}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: BLUE, letterSpacing: "0.06em", marginBottom: 4 }}>
          GLOSSARY
        </div>
        {GLOSSARY.map(g => (
          <div key={g.term} style={{ fontSize: 10, padding: "2px 8px", color: SLATE }}>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{g.term}</span> — {g.definition}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SEARCH RESULTS ──────────────────────────────────

function SearchResults({ query }) {
  const faqResults = useMemo(() => searchFaq(query), [query]);
  const glossaryResults = useMemo(() => searchGlossary(query), [query]);

  if (faqResults.length === 0 && glossaryResults.length === GLOSSARY.length) {
    return <div style={{ fontSize: 10, color: SLATE, padding: 8 }}>No results for "{query}"</div>;
  }

  return (
    <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
      {faqResults.length > 0 && faqResults.slice(0, 5).map(entry => (
        <div key={entry.id} style={{ padding: "6px 8px", marginBottom: 4, background: "#1e293b", borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 500 }}>{entry.q}</div>
          <div style={{ fontSize: 10, color: SLATE, marginTop: 2, lineHeight: 1.4 }}>{entry.a}</div>
          <div style={{ fontSize: 9, color: BLUE, marginTop: 2 }}>{entry.category}</div>
        </div>
      ))}
      {glossaryResults.length > 0 && glossaryResults.length < GLOSSARY.length && (
        <div style={{ marginTop: 4 }}>
          {glossaryResults.slice(0, 5).map(g => (
            <div key={g.term} style={{ fontSize: 10, padding: "2px 8px", color: SLATE }}>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{g.term}</span> — {g.definition}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CHAT PANE — Vertex AI (Gemini) via backend proxy ─

const BOT_API_URL = "/api/knowledgebot/chat";

function ChatPane({ config, onUsage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setError(null);
    setMessages(prev => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const resp = await fetch(BOT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10),
        }),
      });

      const data = await resp.json();

      if (!data.ok) {
        throw new Error(data.error || "Chat request failed");
      }

      // Record usage with actual cost from backend
      const estimatedCost = data.usage?.estimatedCostUsd || 0.01;
      onUsage({ mode: "FULL_CHAT", estimatedCostUsd: estimatedCost });

      setMessages(prev => [...prev, { role: "bot", text: data.text }]);
    } catch (err) {
      setError(err.message);
      setMessages(prev => [...prev, { role: "bot", text: `[Error] ${err.message}. Try again or switch to FAQ/Search.` }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, onUsage]);

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            padding: "4px 8px", marginBottom: 2, borderRadius: 4,
            background: m.role === "user" ? "#1e3a5f" : "#1e293b",
            color: m.role === "user" ? BLUE : "#e2e8f0",
            textAlign: m.role === "user" ? "right" : "left",
          }}>
            {m.text}
          </div>
        ))}
        {loading && <div style={{ padding: "4px 8px", color: SLATE, fontStyle: "italic" }}>Thinking...</div>}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask about your dashboard..."
          style={{
            flex: 1, padding: "6px 8px", fontSize: 11,
            background: "#0f172a", border: "1px solid #334155",
            borderRadius: 4, color: "#e2e8f0", outline: "none",
          }}
        />
        <button onClick={send} style={{
          padding: "6px 12px", fontSize: 10, fontWeight: 700,
          background: GREEN + "22", color: GREEN, border: "none",
          borderRadius: 4, cursor: "pointer",
        }}>
          Send
        </button>
      </div>
    </div>
  );
}

// ── MAIN PANEL ──────────────────────────────────────

export default function KnowledgeBotPanel() {
  const [config, setConfig] = useState(() => loadKnowledgeBotConfig());
  const [tab, setTab] = useState("faq"); // faq | search | chat
  const [searchQuery, setSearchQuery] = useState("");
  const status = useMemo(() => getBotStatus(config), [config]);
  const caps = status.capabilities;

  const handleUsage = useCallback((entry) => {
    recordUsage(entry);
    // Re-resolve status after usage recorded
    setConfig(prev => ({ ...prev }));
  }, []);

  const toggleEnabled = useCallback(() => {
    const updated = { ...config, enabled: !config.enabled };
    saveKnowledgeBotConfig(updated);
    setConfig(updated);
  }, [config]);

  // Don't render if OFF
  if (status.mode === "OFF") {
    return (
      <div style={{
        padding: "12px 16px", background: "#0f172a", borderRadius: 8,
        border: "1px solid #1e293b",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: SLATE }}>Help Bot</span>
          <button onClick={toggleEnabled} style={{
            fontSize: 9, padding: "3px 8px", background: "#1e293b",
            color: SLATE, border: "none", borderRadius: 4, cursor: "pointer",
          }}>
            Enable
          </button>
        </div>
        <div style={{ fontSize: 10, color: SLATE, marginTop: 4 }}>Bot is disabled. Click Enable to activate.</div>
      </div>
    );
  }

  // Active tabs based on current capabilities
  const tabs = [
    { id: "faq", label: "FAQ", enabled: caps.faq },
    { id: "search", label: "Search", enabled: caps.search },
    { id: "chat", label: "Chat", enabled: caps.chat },
  ].filter(t => t.enabled);

  // Auto-select first available tab if current is unavailable
  const activeTab = tabs.some(t => t.id === tab) ? tab : tabs[0]?.id || "faq";

  return (
    <div style={{
      padding: "12px 16px", background: "#0f172a", borderRadius: 8,
      border: "1px solid #1e293b",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>Help Bot</span>
          <ModeBadge status={status} />
        </div>
        <button onClick={toggleEnabled} style={{
          fontSize: 9, padding: "3px 8px", background: RED + "22",
          color: RED, border: "none", borderRadius: 4, cursor: "pointer",
        }}>
          Disable
        </button>
      </div>

      {/* Budget bar */}
      <BudgetBar status={status} />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontSize: 10, fontWeight: 600, padding: "4px 10px",
            background: activeTab === t.id ? "#1e293b" : "transparent",
            color: activeTab === t.id ? "#e2e8f0" : SLATE,
            border: "none", borderRadius: 4, cursor: "pointer",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search bar (for search + chat tabs) */}
      {(activeTab === "search") && (
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search help docs..."
          style={{
            width: "100%", marginTop: 8, padding: "6px 8px", fontSize: 11,
            background: "#0f172a", border: "1px solid #334155",
            borderRadius: 4, color: "#e2e8f0", outline: "none",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Content */}
      {activeTab === "faq" && <FaqBrowser />}
      {activeTab === "search" && <SearchResults query={searchQuery} />}
      {activeTab === "chat" && <ChatPane config={config} onUsage={handleUsage} />}
    </div>
  );
}
