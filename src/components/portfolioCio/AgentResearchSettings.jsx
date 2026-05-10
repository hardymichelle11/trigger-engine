// =====================================================
// AGENT RESEARCH SETTINGS  (Research Automation)
// =====================================================
// Settings/Admin-only configurator. Lets the operator define what an
// agent should monitor for a given basket, how often, and where new
// findings should land. Writes a JSON-safe record to localStorage via
// agentResearchSettingsStore. Reads basket-aware defaults from the
// same store. Renders an operator-safe plan summary after Save via
// researchAutomationContract.buildResearchAutomationPlan.
//
// Hard rules:
//   - This is a SETTINGS surface only. Saving does not run research,
//     schedule jobs, or ingest sources.
//   - requireApproval defaults true; even when explicitly false the
//     settings record cannot override engine verdicts, Credit View
//     risk, Trigger posture, stale-data warnings, capital fit, or
//     allowedActions.
//   - Trader-facing copy. No cron / queue / raw scoring tokens.
// =====================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RESEARCH_FREQUENCY,
  RESEARCH_SOURCE,
  RESEARCH_OUTPUT,
  getDefaultAgentResearchSettings,
  getAgentResearchSettings,
  saveAgentResearchSettings,
  resetAgentResearchSettings,
} from "../../lib/portfolioCio/agentResearchSettingsStore.js";
import {
  buildResearchAutomationPlan,
  FREQUENCY_LABELS,
  SOURCE_LABELS,
  OUTPUT_LABELS,
} from "../../lib/portfolioCio/researchAutomationContract.js";
import { runResearchCheck } from "../../lib/portfolioCio/researchRunner.js";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  cardBg:    "#0a0d12",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  green:     "#22c55e",
  red:       "#ef4444",
  amber:     "#f59e0b",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
};

const BASKETS = Object.freeze([
  { id: "ai_health_diagnostics", label: "AI Health / Diagnostics" },
  { id: "ai_infrastructure",     label: "AI Infrastructure" },
  { id: "robotics",              label: "Robotics" },
  { id: "saas_harvest",          label: "SaaS Harvest" },
  { id: "dividend_income",       label: "Dividend Income" },
  { id: "watchlist",             label: "Watchlist" },
]);

const AGENTS = Object.freeze([
  { id: "aiHealthDiagnosticsAgent",  label: "aiHealthDiagnosticsAgent" },
  { id: "marketIntelligenceAgent",   label: "marketIntelligenceAgent" },
  { id: "creditViewAgent",           label: "creditViewAgent" },
  { id: "triggerContextAgent",       label: "triggerContextAgent" },
  { id: "basketManagerAgent",        label: "basketManagerAgent" },
]);

const ORDERED_FREQUENCIES = Object.freeze([
  RESEARCH_FREQUENCY.MANUAL_ONLY,
  RESEARCH_FREQUENCY.DAILY,
  RESEARCH_FREQUENCY.WEEKLY,
  RESEARCH_FREQUENCY.ON_MAJOR_NEWS,
]);

const ORDERED_SOURCES = Object.freeze([
  RESEARCH_SOURCE.SEC_FILINGS,
  RESEARCH_SOURCE.EARNINGS_RELEASES,
  RESEARCH_SOURCE.COMPANY_RELEASES,
  RESEARCH_SOURCE.FDA_UPDATES,
  RESEARCH_SOURCE.MEDICARE_REIMBURSEMENT,
  RESEARCH_SOURCE.ARK_HOLDINGS,
  RESEARCH_SOURCE.PARTNERSHIPS,
  RESEARCH_SOURCE.MA_NEWS,
  RESEARCH_SOURCE.ANALYST_CHANGES,
  RESEARCH_SOURCE.OPTIONS_IV,
  RESEARCH_SOURCE.CREDIT_MARKET_STRESS,
  RESEARCH_SOURCE.INSIDER_ACTIVITY,
]);

const ORDERED_OUTPUTS = Object.freeze([
  RESEARCH_OUTPUT.PROPOSED_INTELLIGENCE,
  RESEARCH_OUTPUT.THESIS_CHECK_UPDATE,
  RESEARCH_OUTPUT.MANAGER_REVIEW,
  RESEARCH_OUTPUT.ALERT_CANDIDATE,
  RESEARCH_OUTPUT.ACTIVE_RESEARCH_CARD,
]);

const SAFETY_NOTE =
  "Research settings control what agents monitor. New findings are " +
  "proposed intelligence until approved. They do not override engine " +
  "verdicts, Credit View risk, Trigger posture, stale-data warnings, " +
  "capital fit, or allowed actions.";

/**
 * @param {object} props
 * @param {string} [props.defaultBasketId]
 * @param {string} [props.defaultAgentId]
 * @param {(result: object) => void} [props.onResearchRun]   bumped when a manual research check completes
 */
export default function AgentResearchSettings({
  defaultBasketId = "ai_health_diagnostics",
  defaultAgentId  = "aiHealthDiagnosticsAgent",
  onResearchRun,
}) {
  const [basketId, setBasketId] = useState(defaultBasketId);
  const [agentId,  setAgentId]  = useState(defaultAgentId);
  const [settings, setSettings] = useState(
    () => loadSettingsFor(defaultBasketId, defaultAgentId),
  );
  const [savedPlan, setSavedPlan] = useState(null);
  const [info, setInfo] = useState(null);

  // Reload settings when basket / agent selection changes.
  useEffect(() => {
    setSettings(loadSettingsFor(basketId, agentId));
    setSavedPlan(null);
    setInfo(null);
  }, [basketId, agentId]);

  const setFrequency = useCallback((freq) => {
    setSettings((prev) => ({ ...prev, frequency: freq }));
  }, []);

  const toggleSource = useCallback((sourceId) => {
    setSettings((prev) => {
      const has = prev.sources.includes(sourceId);
      const next = has
        ? prev.sources.filter((s) => s !== sourceId)
        : [...prev.sources, sourceId];
      return { ...prev, sources: next };
    });
  }, []);

  const toggleOutput = useCallback((outputId) => {
    setSettings((prev) => {
      const has = prev.outputs.includes(outputId);
      const next = has
        ? prev.outputs.filter((o) => o !== outputId)
        : [...prev.outputs, outputId];
      return { ...prev, outputs: next };
    });
  }, []);

  const setRequireApproval = useCallback((value) => {
    setSettings((prev) => ({ ...prev, requireApproval: !!value }));
  }, []);

  const setSymbols = useCallback((symbols) => {
    setSettings((prev) => ({ ...prev, symbols }));
  }, []);

  const onSave = useCallback(() => {
    const stored = saveAgentResearchSettings({
      ...settings,
      basketId,
      agentId,
      enabled: true,
    });
    if (!stored) {
      setInfo({ tone: "error", text: "Could not save research settings." });
      return;
    }
    setSettings(stored);
    setSavedPlan(buildResearchAutomationPlan(stored));
    setInfo({ tone: "success", text: "Research settings saved." });
  }, [settings, basketId, agentId]);

  const onReset = useCallback(() => {
    const fresh = resetAgentResearchSettings({ basketId, agentId });
    if (!fresh) {
      setInfo({ tone: "error", text: "Could not reset research settings." });
      return;
    }
    setSettings(fresh);
    setSavedPlan(buildResearchAutomationPlan(fresh));
    setInfo({ tone: "success", text: "Defaults restored." });
  }, [basketId, agentId]);

  const onDisable = useCallback(() => {
    const stored = saveAgentResearchSettings({
      ...settings,
      basketId,
      agentId,
      enabled: false,
    });
    if (!stored) {
      setInfo({ tone: "error", text: "Could not disable automation." });
      return;
    }
    setSettings(stored);
    setSavedPlan(buildResearchAutomationPlan(stored));
    setInfo({ tone: "amber", text: "Research automation disabled for this basket and agent." });
  }, [settings, basketId, agentId]);

  const onRun = useCallback(() => {
    // Auto-save the current edit state so the run always reflects
    // what the operator sees — no risk of running stale settings.
    const stored = saveAgentResearchSettings({
      ...settings,
      basketId,
      agentId,
      enabled: settings.enabled !== false,
    });
    const target = stored || settings;
    const result = runResearchCheck(target);
    setSettings(target);
    setSavedPlan(buildResearchAutomationPlan(target));
    if (!result.ok) {
      setInfo({ tone: "error", text: result.summary || "Research check failed." });
      return;
    }
    setInfo({ tone: "success", text: result.summary });
    if (typeof onResearchRun === "function") {
      onResearchRun(result);
    }
  }, [settings, basketId, agentId, onResearchRun]);

  return (
    <section aria-label="Research Automation"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
      {/* Header */}
      <header>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 4 }}>
          RESEARCH AUTOMATION
        </div>
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
          Configure what agents monitor and where proposed intelligence should go.
        </div>
        <div style={{
          marginTop: 6,
          fontSize: 10, color: PALETTE.textFaint, lineHeight: 1.5,
          background: `${PALETTE.amber}10`,
          border: `1px solid ${PALETTE.amber}33`,
          borderLeft: `2px solid ${PALETTE.amber}`,
          borderRadius: 6, padding: "6px 8px",
          fontStyle: "italic",
        }}>
          {SAFETY_NOTE}
        </div>
      </header>

      {/* Basket / agent / frequency */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 8,
      }}>
        <Field label="Basket">
          <select value={basketId} onChange={(e) => setBasketId(e.target.value)} style={inputStyle()}>
            {BASKETS.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Agent">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={inputStyle()}>
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Research frequency">
          <select value={settings.frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle()}>
            {ORDERED_FREQUENCIES.map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABELS[f] || f}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Sources */}
      <Field label="Sources to monitor">
        <CheckboxGroup
          ordered={ORDERED_SOURCES}
          labels={SOURCE_LABELS}
          selected={settings.sources}
          onToggle={toggleSource}
          tone={PALETTE.cyan} />
      </Field>

      {/* Outputs + require approval */}
      <Field label="Output destinations">
        <CheckboxGroup
          ordered={ORDERED_OUTPUTS}
          labels={OUTPUT_LABELS}
          selected={settings.outputs}
          onToggle={toggleOutput}
          tone={PALETTE.green} />
        <div style={{ marginTop: 6 }}>
          <CheckboxRow
            id="require_approval"
            label="Require approval before memory update"
            checked={!!settings.requireApproval}
            onToggle={() => setRequireApproval(!settings.requireApproval)}
            tone={PALETTE.purple}
            emphasis />
        </div>
      </Field>

      {/* Symbols */}
      <Field label="Symbols to monitor">
        <SymbolChipInput
          symbols={settings.symbols}
          onChange={setSymbols} />
      </Field>

      {/* Buttons */}
      <footer style={{
        display: "flex", gap: 6, flexWrap: "wrap",
        marginTop: 4, paddingTop: 6,
        borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        <button type="button" onClick={onSave} style={btn(PALETTE.accentTeal)}>
          Save settings
        </button>
        <button type="button" onClick={onRun}
          aria-label="Run research check"
          style={btn(PALETTE.purple)}>
          Run research check
        </button>
        <button type="button" onClick={onReset} style={btn(PALETTE.cyan)}>
          Reset defaults
        </button>
        <button type="button" onClick={onDisable} style={btn(PALETTE.amber)}>
          Disable automation
        </button>
        {info && (
          <span style={{
            fontSize: 11, alignSelf: "center",
            color: info.tone === "error"  ? PALETTE.red
                 : info.tone === "amber"  ? PALETTE.amber
                 :                          PALETTE.green,
          }}>
            {info.text}
          </span>
        )}
      </footer>

      {/* Plan summary */}
      {savedPlan && <PlanSummary plan={savedPlan} />}
    </section>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function CheckboxGroup({ ordered, labels, selected, onToggle, tone }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: 4,
    }}>
      {ordered.map((id) => (
        <CheckboxRow key={id} id={id}
          label={labels[id] || id}
          checked={selected.includes(id)}
          onToggle={() => onToggle(id)}
          tone={tone} />
      ))}
    </div>
  );
}

function CheckboxRow({ id, label, checked, onToggle, tone, emphasis }) {
  return (
    <label htmlFor={`research-cb-${id}`}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: emphasis ? `${tone}14` : "transparent",
        border: emphasis ? `1px solid ${tone}55` : `1px solid transparent`,
        borderRadius: 4, padding: emphasis ? "5px 8px" : "3px 6px",
        cursor: "pointer",
        fontSize: 11, color: PALETTE.text, lineHeight: 1.4,
        fontWeight: emphasis ? 700 : 500,
      }}>
      <input id={`research-cb-${id}`} type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={label}
        style={{ accentColor: tone, cursor: "pointer" }} />
      <span style={{ color: checked ? tone : PALETTE.textDim }}>
        {label}
      </span>
    </label>
  );
}

function SymbolChipInput({ symbols, onChange }) {
  const [pending, setPending] = useState("");
  const onAdd = () => {
    const v = (pending || "").trim().toUpperCase();
    if (!v) return;
    if (symbols.includes(v)) { setPending(""); return; }
    onChange([...symbols, v].slice(0, 64));
    setPending("");
  };
  const onRemove = (sym) => onChange(symbols.filter((s) => s !== sym));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {symbols.length === 0 ? (
          <span style={{ fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic" }}>
            No symbols set — agent will fall back to basket defaults when known.
          </span>
        ) : (
          symbols.map((sym, i) => (
            <span key={`${sym}-${i}`} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
              color: PALETTE.accentTeal,
              background: `${PALETTE.accentTeal}1a`,
              border: `1px solid ${PALETTE.accentTeal}55`,
              borderRadius: 4, padding: "2px 6px",
            }}>
              {sym}
              <button type="button" onClick={() => onRemove(sym)}
                aria-label={`Remove ${sym}`}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  cursor: "pointer", color: PALETTE.accentTeal, fontFamily: "inherit",
                }}>
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input type="text" value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          placeholder="Add ticker (e.g. TEM)"
          aria-label="Add ticker"
          style={{ ...inputStyle(), flex: 1 }} />
        <button type="button" onClick={onAdd} style={btn(PALETTE.textFaint)}>+</button>
      </div>
    </div>
  );
}

function PlanSummary({ plan }) {
  const tone = plan.enabled ? PALETTE.green : PALETTE.amber;
  return (
    <section aria-label="Research automation plan summary"
      style={{
        background: `${tone}10`,
        border: `1px solid ${tone}55`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 8, padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
      <div style={{ fontSize: 9, letterSpacing: "0.10em", color: tone, fontWeight: 700 }}>
        AUTOMATION PLAN
      </div>
      <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
        {plan.nextStepLabel}
      </div>
      {plan.enabled && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
          <PlanRow label="Basket"      value={plan.basketId} />
          <PlanRow label="Agent"       value={plan.agentId} />
          <PlanRow label="Frequency"   value={plan.frequencyLabel} />
          <PlanRow label="Sources"     value={plan.monitoredSources.map((s) => s.label).join(" · ") || "none"} />
          <PlanRow label="Outputs"     value={plan.outputDestinations.map((o) => o.label).join(" · ") || "none"} />
          <PlanRow label="Symbols"     value={plan.monitoredSymbols.length === 0 ? "(basket defaults)" : plan.monitoredSymbols.join(", ")} />
          <PlanRow label="Approval"    value={plan.approvalLabel} />
        </ul>
      )}
    </section>
  );
}

function PlanRow({ label, value }) {
  return (
    <li style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5 }}>
      <strong style={{ color: PALETTE.textFaint, marginRight: 4 }}>{label}:</strong>
      <span style={{ color: PALETTE.text }}>{value}</span>
    </li>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{
        fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700,
      }}>
        {(label || "").toUpperCase()}
      </span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function loadSettingsFor(basketId, agentId) {
  const saved = getAgentResearchSettings({ basketId, agentId });
  if (saved) return saved;
  return getDefaultAgentResearchSettings({ basketId, agentId });
}

function inputStyle() {
  return {
    background: PALETTE.panelBg, color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`, borderRadius: 6,
    padding: "5px 8px", fontSize: 11, fontFamily: "inherit",
  };
}
function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "5px 12px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
