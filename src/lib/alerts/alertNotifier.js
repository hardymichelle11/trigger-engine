// =====================================================
// ALERT NOTIFIER — pluggable delivery layer
// =====================================================
// Sends alerts through one or more channels.
// Start with browser notifications + console.
// Future: Slack webhook, email, SMS.
// =====================================================

// --------------------------------------------------
// BROWSER NOTIFICATION
// --------------------------------------------------

let _notificationPermission = null;

/**
 * Request browser notification permission (call once on app load).
 */
export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") {
    _notificationPermission = "granted";
    return "granted";
  }
  if (Notification.permission === "denied") {
    _notificationPermission = "denied";
    return "denied";
  }
  const result = await Notification.requestPermission();
  _notificationPermission = result;
  return result;
}

/**
 * Send a browser notification.
 * @param {object} alert — AlertResult from alertEngine
 */
function notifyBrowser(alert) {
  if (_notificationPermission !== "granted") return;
  if (typeof Notification === "undefined") return;

  const icon = alert.priority === "high" ? "\uD83D\uDFE2" : "\uD83D\uDFE1";
  const title = `${icon} ${alert.card.symbol} — ${alert.card.action}`;
  const body = [
    `Score: ${alert.card.score} | ${alert.priority.toUpperCase()}`,
    alert.card.probability?.method === "monte_carlo"
      ? `Prob: ${(alert.card.probability.probAboveStrike * 100).toFixed(0)}% | Touch: ${(alert.card.probability.probTouch * 100).toFixed(0)}%`
      : "",
    `IV: ${alert.card.metrics?.ivPercentile || "?"}%ile (${alert.card.metrics?.ivSource || "?"})`,
    alert.summary,
  ].filter(Boolean).join("\n");

  try {
    new Notification(title, { body, tag: `alert-${alert.card.symbol}`, renotify: true });
  } catch {
    // Notification failed — non-fatal
  }
}

// --------------------------------------------------
// CONSOLE NOTIFICATION
// --------------------------------------------------

function notifyConsole(alert) {
  const prefix = alert.priority === "high" ? "\x1b[32m[ALERT]\x1b[0m" : "\x1b[33m[WATCH]\x1b[0m";
  console.log(`${prefix} ${alert.summary}`);
  if (alert.passedGates.length > 0) {
    console.log(`  Gates passed: ${alert.passedGates.join(", ")}`);
  }
}

// --------------------------------------------------
// WEBHOOK PLACEHOLDER
// --------------------------------------------------

/**
 * Send alert to a webhook URL (Slack, Discord, custom).
 * @param {object} alert
 * @param {string} webhookUrl
 */
export async function notifyWebhook(alert, webhookUrl) {
  if (!webhookUrl) return;

  const payload = {
    text: alert.summary,
    symbol: alert.card.symbol,
    score: alert.card.score,
    action: alert.card.action,
    priority: alert.priority,
    probability: alert.card.probability?.probAboveStrike,
    touchProb: alert.card.probability?.probTouch,
    ivPercentile: alert.card.metrics?.ivPercentile,
    ivSource: alert.card.metrics?.ivSource,
    gates: alert.passedGates,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Webhook delivery failed:", err.message);
  }
}

// --------------------------------------------------
// PUBLIC API
// --------------------------------------------------

/**
 * Send an alert through all enabled channels.
 * @param {object} alert — AlertResult from alertEngine
 * @param {object} [options] — { browser: true, console: true, webhookUrl: null }
 */
export function sendAlert(alert, options = {}) {
  const { browser = true, console: useConsole = true, webhookUrl = null } = options;

  if (useConsole) notifyConsole(alert);
  if (browser) notifyBrowser(alert);
  if (webhookUrl) notifyWebhook(alert, webhookUrl);
}

/**
 * Send multiple alerts.
 * @param {object[]} alerts
 * @param {object} [options]
 */
export function sendAlerts(alerts, options = {}) {
  for (const alert of alerts) {
    sendAlert(alert, options);
  }
}
