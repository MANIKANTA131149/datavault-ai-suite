// ─── Result-Driven Automation Actions (F-AUTO) ────────────────────────────────
// After a scheduled query runs, evaluate an optional condition against the
// result and, if it trips, dispatch an optional action. Actions are deliberately
// limited and safe: an in-app notification, or an outbound webhook that MUST
// pass the SSRF net-guard. Email is delivered as a notification + (optional)
// webhook to the deployer's own endpoint — we do not ship an SMTP sender here.
//
// Fully additive: the scheduler calls this only when a schedule carries
// `condition`/`action`; legacy schedules (without them) behave exactly as before.

const { assertPublicHost } = require("./net-guard");

const OPERATORS = new Set([">", ">=", "<", "<=", "=", "!=", "changed", "increased", "decreased", "any_rows", "no_rows"]);
const ACTION_TYPES = new Set(["notification", "webhook"]);

function coerceNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Evaluate a condition against the current run result and the previous value.
 * @returns {{ tripped: boolean, value: number|null, detail: string }}
 */
function evaluateCondition(condition, result, previousValue) {
  if (!condition || !condition.operator) return { tripped: false, value: null, detail: "" };
  const rows = result?.rows || [];
  const rowCount = result?.rowCount ?? rows.length;

  // Row-presence conditions don't need a numeric metric.
  if (condition.operator === "any_rows") return { tripped: rowCount > 0, value: rowCount, detail: `${rowCount} rows` };
  if (condition.operator === "no_rows") return { tripped: rowCount === 0, value: rowCount, detail: `${rowCount} rows` };

  // Numeric conditions read the first cell of the first row (same convention as alerts).
  const firstVal = rows[0] ? Object.values(rows[0])[0] : null;
  const value = coerceNumber(firstVal);
  if (value === null) return { tripped: false, value: null, detail: "non-numeric result" };

  const prev = coerceNumber(previousValue);
  const threshold = coerceNumber(condition.threshold);

  switch (condition.operator) {
    case ">":  return { tripped: threshold !== null && value > threshold, value, detail: `${value} > ${threshold}` };
    case ">=": return { tripped: threshold !== null && value >= threshold, value, detail: `${value} >= ${threshold}` };
    case "<":  return { tripped: threshold !== null && value < threshold, value, detail: `${value} < ${threshold}` };
    case "<=": return { tripped: threshold !== null && value <= threshold, value, detail: `${value} <= ${threshold}` };
    case "=":  return { tripped: threshold !== null && value === threshold, value, detail: `${value} = ${threshold}` };
    case "!=": return { tripped: threshold !== null && value !== threshold, value, detail: `${value} != ${threshold}` };
    case "changed":   return { tripped: prev !== null && value !== prev, value, detail: `${prev} → ${value}` };
    case "increased": return { tripped: prev !== null && value > prev, value, detail: `${prev} → ${value}` };
    case "decreased": return { tripped: prev !== null && value < prev, value, detail: `${prev} → ${value}` };
    default: return { tripped: false, value, detail: "" };
  }
}

/**
 * Dispatch the action. Returns a short status string for the run log.
 * `notifyFn(payload)` writes an in-app notification (provided by the scheduler).
 */
async function dispatchAction(action, { scheduleName, detail, rowCount }, notifyFn) {
  if (!action || !ACTION_TYPES.has(action.type)) return "no-action";

  if (action.type === "notification") {
    await notifyFn({
      type: "automation_fired",
      title: `Automation: ${scheduleName}`,
      message: action.message ? String(action.message).slice(0, 500) : `Condition met (${detail}).`,
      icon: "zap",
      link: "/app/automations",
    });
    return "notified";
  }

  if (action.type === "webhook") {
    const url = String(action.url || "");
    if (!url) return "webhook-no-url";
    // SSRF defense: resolve+block private/internal targets on Lambda.
    await assertPublicHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "querify.automation",
          schedule: scheduleName,
          detail,
          rowCount,
          firedAt: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
      return `webhook-${resp.status}`;
    } finally {
      clearTimeout(timer);
    }
  }
  return "no-action";
}

module.exports = { evaluateCondition, dispatchAction, OPERATORS, ACTION_TYPES };
