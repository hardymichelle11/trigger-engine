// =====================================================================
// Basket Agent Registry — 12 living mandates
// =====================================================================
// PURE constants. Each entry describes a basket's mandate, baseline
// reference leaders, discovery keywords, and routing/risk policy. The
// `baselineLeaders` array is a REFERENCE ANCHOR — it is NOT the active
// universe. Active membership lives in basketUniverseManager.js
// (localStorage-backed, user-editable).
// =====================================================================

import {
  REBALANCE_CADENCE,
  MAX_EXPOSURE,
  BASKET_PREFERRED_ROUTES,
} from "./basketAgentTypes.js";

/**
 * @typedef {Object} BasketAgent
 * @property {string} basketId
 * @property {string} basketName
 * @property {string} mandate
 * @property {string[]} baselineLeaders          reference anchors only
 * @property {string[]} discoveryKeywords
 * @property {string[]} macroDrivers
 * @property {string[]} positiveCatalysts
 * @property {string[]} negativeCatalysts
 * @property {string} preferredManagerRoute      one of BASKET_PREFERRED_ROUTES
 * @property {string} riskMandate
 * @property {string} maxSuggestedExposure       one of MAX_EXPOSURE
 * @property {string} rebalanceCadence           one of REBALANCE_CADENCE
 */

export const BASKET_AGENTS = Object.freeze([
  {
    basketId: "brain_compute",
    basketName: "Brain / Compute",
    mandate: "AI compute and training infrastructure — GPUs, accelerators, hyperscale silicon.",
    baselineLeaders: ["NVDA", "AMD", "AVGO", "TSM", "ARM", "MRVL", "QCOM"],
    discoveryKeywords: ["GPU", "accelerator", "AI training", "data center compute", "hyperscaler"],
    macroDrivers: ["AI capex cycle", "data-center buildout", "hyperscaler spend"],
    positiveCatalysts: ["new training run announcements", "design wins", "hyperscaler capex raise"],
    negativeCatalysts: ["export controls", "AI capex cooldown", "competitive launches"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE_AND_CV,
    riskMandate: "Concentration risk acute — size in stages.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.BIWEEKLY,
  },
  {
    basketId: "workflow_agentic_software",
    basketName: "Workflow / Agentic Software",
    mandate: "Agent-native workflow automation, productivity software, and platform agents.",
    baselineLeaders: ["MSFT", "ADBE", "NOW", "CRM", "PLTR", "SNOW", "DDOG"],
    discoveryKeywords: ["agentic", "workflow", "automation", "copilot", "platform"],
    macroDrivers: ["enterprise software spend", "AI productivity adoption"],
    positiveCatalysts: ["copilot adoption metrics", "agent product GA", "ARR acceleration"],
    negativeCatalysts: ["enterprise budget cut", "open-source displacement"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE,
    riskMandate: "Watch valuation and ARR durability.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "data_center_infra",
    basketName: "Data Center Infrastructure",
    mandate: "Hyperscale data-center buildout — interconnect, racks, networking, integrators.",
    baselineLeaders: ["CRWV", "NBIS", "VRT", "DELL", "SMCI", "HPE", "ANET"],
    discoveryKeywords: ["data center", "interconnect", "rack", "buildout", "GPU cluster"],
    macroDrivers: ["AI capex", "hyperscaler buildout", "REIT capacity"],
    positiveCatalysts: ["new colocation contracts", "capacity announcements", "hyperscaler partnerships"],
    negativeCatalysts: ["build delays", "permitting issues", "interconnect bottleneck"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE_AND_CV,
    riskMandate: "Cyclical — track buildout pipeline.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.BIWEEKLY,
  },
  {
    basketId: "power_energy",
    basketName: "Power / Energy",
    mandate: "Power generation, grid, nuclear, and fuel-cell exposure to AI data-center demand.",
    baselineLeaders: ["BE", "CEG", "VST", "OKLO", "ETN", "PWR", "GEV"],
    discoveryKeywords: ["power", "nuclear", "fuel cell", "grid", "generation"],
    macroDrivers: ["data-center power demand", "rate cycle", "permitting"],
    positiveCatalysts: ["PPA announcements", "capacity additions", "regulatory approvals"],
    negativeCatalysts: ["regulatory delay", "demand shock"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE,
    riskMandate: "Capital-intensive, regulatory-sensitive.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "cooling_hvac_building",
    basketName: "Cooling / HVAC / Building Systems",
    mandate: "Cooling, HVAC, and building-systems exposure to AI data-center thermal load.",
    baselineLeaders: ["CARR", "TT", "JCI", "IR", "ETN", "VRT"],
    discoveryKeywords: ["liquid cooling", "HVAC", "thermal", "building automation", "chiller"],
    macroDrivers: ["data-center capacity", "thermal load growth"],
    positiveCatalysts: ["liquid-cooling deal flow", "data-center wins", "guidance raise"],
    negativeCatalysts: ["construction slowdown", "commodity inflation"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE_AND_CV,
    riskMandate: "Tied to data-center capex cycle.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "storage_memory_data_movement",
    basketName: "Storage / Memory / Data Movement",
    mandate: "Storage, memory, and data-movement names supporting AI training and inference.",
    baselineLeaders: ["SNDK", "WDC", "MU", "STX", "PSTG", "NTAP", "DELL", "HPE"],
    discoveryKeywords: ["storage", "memory", "DRAM", "NAND", "flash", "data movement"],
    macroDrivers: ["AI training memory demand", "memory cycle", "hyperscaler buildout"],
    positiveCatalysts: ["memory pricing inflection", "design wins", "guidance raise"],
    negativeCatalysts: ["memory glut", "ASP cuts"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE_AND_CV,
    riskMandate: "Cyclical memory pricing — confirm cycle phase.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.BIWEEKLY,
  },
  {
    basketId: "ai_health_diagnostics",
    basketName: "AI Health / Diagnostics",
    mandate: "AI-driven diagnostics, drug discovery, and precision-health platforms.",
    baselineLeaders: ["TEM", "GH", "EXAS", "TMO", "IQV", "RXRX", "SDGR"],
    discoveryKeywords: ["genomic", "diagnostics", "AI drug", "precision health", "biomarker"],
    macroDrivers: ["healthcare adoption", "regulatory environment"],
    positiveCatalysts: ["data readouts", "regulatory approvals", "platform deals"],
    negativeCatalysts: ["trial failures", "regulatory pushback", "reimbursement risk"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE,
    riskMandate: "Binary catalyst risk — size carefully.",
    maxSuggestedExposure: MAX_EXPOSURE.CONSERVATIVE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "robotics_automation",
    basketName: "Robotics / Physical Automation",
    mandate: "Physical automation, robotics, machine vision, and autonomy.",
    baselineLeaders: ["TSLA", "ISRG", "SYM", "TER", "ROK", "HON", "MBLY"],
    discoveryKeywords: ["robotics", "humanoid", "automation", "machine vision", "autonomy"],
    macroDrivers: ["labor cost cycle", "factory automation capex"],
    positiveCatalysts: ["product launches", "new design wins", "demo events"],
    negativeCatalysts: ["execution risk", "delays", "capex pause"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE_AND_CV,
    riskMandate: "Long ramp — confirm execution.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "cybersecurity_trust",
    basketName: "Cybersecurity / Trust",
    mandate: "Endpoint, identity, cloud security, and trust / compliance platforms.",
    baselineLeaders: ["CRWD", "PANW", "ZS", "NET", "OKTA", "FTNT", "S"],
    discoveryKeywords: ["security", "endpoint", "identity", "zero trust", "SOC"],
    macroDrivers: ["enterprise security spend", "regulatory drift"],
    positiveCatalysts: ["new product launches", "ARR acceleration", "Federal contract wins"],
    negativeCatalysts: ["budget freeze", "displacement risk"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE,
    riskMandate: "Watch competitive displacement.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "data_mlops",
    basketName: "Data / MLOps",
    mandate: "Data platforms, lakehouses, MLOps, and AI infrastructure tooling.",
    baselineLeaders: ["SNOW", "DDOG", "MDB", "ESTC", "PLTR", "NET"],
    discoveryKeywords: ["data platform", "lakehouse", "MLOps", "vector database", "observability"],
    macroDrivers: ["AI workload spend", "data volume growth"],
    positiveCatalysts: ["AI workload wins", "ARR acceleration"],
    negativeCatalysts: ["consumption-revenue compression", "competitor entry"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE,
    riskMandate: "Watch consumption-revenue volatility.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "connectivity_networking",
    basketName: "Connectivity / Networking",
    mandate: "Networking, optical, interconnect, and connectivity infrastructure.",
    baselineLeaders: ["ANET", "CSCO", "CIEN", "AVGO", "MRVL", "JNPR"],
    discoveryKeywords: ["optical", "ethernet", "interconnect", "network silicon"],
    macroDrivers: ["data-center bandwidth growth", "AI cluster fabric"],
    positiveCatalysts: ["hyperscaler design wins", "optical pluggable adoption"],
    negativeCatalysts: ["bandwidth glut", "delayed buildouts"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE,
    riskMandate: "Cyclical buildout dependency.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
  {
    basketId: "semiconductor_hardware",
    basketName: "Semiconductor / Hardware",
    mandate: "Broader semiconductor / hardware ecosystem outside AI compute.",
    baselineLeaders: ["TSM", "ASML", "AMAT", "LRCX", "KLAC", "TXN", "MCHP"],
    discoveryKeywords: ["semiconductor", "wafer", "lithography", "etch", "fab", "analog"],
    macroDrivers: ["semi cycle", "capex inflection"],
    positiveCatalysts: ["bookings inflection", "fab utilization recovery"],
    negativeCatalysts: ["semi inventory glut", "trade restrictions"],
    preferredManagerRoute: BASKET_PREFERRED_ROUTES.SEND_TO_TE,
    riskMandate: "Cyclical — confirm phase.",
    maxSuggestedExposure: MAX_EXPOSURE.MODERATE,
    rebalanceCadence: REBALANCE_CADENCE.MONTHLY,
  },
]);

const BY_ID = Object.freeze(
  Object.fromEntries(BASKET_AGENTS.map((b) => [b.basketId, b])),
);

/** Get a basket agent profile by id; null when absent. */
export function getBasketAgent(basketId) {
  if (typeof basketId !== "string" || !basketId) return null;
  return BY_ID[basketId] || null;
}

/** Snapshot of all 12 basket agents (frozen). */
export function listBasketAgents() {
  return BASKET_AGENTS;
}

/** All basket ids. */
export function listBasketIds() {
  return BASKET_AGENTS.map((b) => b.basketId);
}
