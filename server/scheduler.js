// ─── Scheduler Lambda (F3 + F11) ──────────────────────────────────────────────
// Invoked by EventBridge every 15 minutes (see serverless.yml). Two passes:
//   1. Execute due scheduled queries → store result in history + notify.
//   2. Evaluate due alerts → fire notification when the rule trips.
// Each item is isolated: one failure never aborts the batch. Also runnable
// locally: `node scheduler.js`.

require("./loadEnv");

const { getDb } = require("./db");
const { runStoredQuery } = require("./lib/query-runner");
const { recordUsage } = require("./lib/metering");
const { recordLineage } = require("./lib/lineage");
const { evaluateCondition, dispatchAction } = require("./lib/automation-actions");
const { downgradeExpiredPlans, flagPastDuePlans } = require("./lib/subscriptions");

const BATCH_LIMIT = 25;

const ALERT_INTERVALS_MS = {
  hourly: 60 * 60 * 1000,
  every6h: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

async function notify(db, userId, payload) {
  try {
    await db.collection("notifications").insertOne({
      userId,
      read: false,
      createdAt: new Date().toISOString(),
      ...payload,
    });
  } catch (err) {
    console.error("scheduler notify failed:", err.message);
  }
}

// ── Pass 1: scheduled queries ────────────────────────────────────────────────
async function runDueSchedules(db, nowIso) {
  const due = await db
    .collection("schedules")
    .find({ enabled: true, nextRun: { $lte: nowIso } })
    .limit(BATCH_LIMIT)
    .toArray();

  for (const schedule of due) {
    const startedAt = new Date().toISOString();
    let status = "success";
    let error = null;
    let rowCount = 0;
    let preview = [];

    let runResult = null;
    try {
      runResult = await runStoredQuery(db, schedule.userId, {
        datasetId: schedule.datasetId,
        connectionId: schedule.connectionId,
        sheetName: schedule.sheetName,
        sql: schedule.sql,
      });
      rowCount = runResult.rowCount;
      preview = runResult.rows.slice(0, 50);
    } catch (err) {
      status = "error";
      error = String(err.message || err).slice(0, 500);
    }

    // F-AUTO: result-driven "when → then". Only schedules that carry a condition
    // do anything here; legacy schedules skip this entirely (unchanged behavior).
    let automationStatus = null;
    if (status === "success" && schedule.condition && runResult) {
      try {
        const evald = evaluateCondition(schedule.condition, runResult, schedule.lastValue);
        // Persist the latest value so "changed/increased/decreased" works next tick.
        await db.collection("schedules").updateOne(
          { _id: schedule._id },
          { $set: { lastValue: evald.value } }
        );
        if (evald.tripped) {
          automationStatus = await dispatchAction(
            schedule.action,
            { scheduleName: schedule.name, detail: evald.detail, rowCount },
            (payload) => notify(db, schedule.userId, payload)
          );
          recordUsage({
            userId: schedule.userId,
            eventType: "alert_evaluation",
            units: 1,
            metadata: { scheduleId: schedule._id, automation: automationStatus, detail: evald.detail },
          });
        }
      } catch (e) {
        automationStatus = `error: ${String(e.message || e).slice(0, 120)}`;
      }
    }

    // Record the run (append-only run log, capped retrieval client-side).
    await db.collection("schedule_runs").insertOne({
      scheduleId: schedule._id,
      userId: schedule.userId,
      ts: startedAt,
      status,
      error,
      rowCount,
      preview,
      ...(automationStatus ? { automationStatus } : {}),
    }).catch((e) => console.error("schedule_runs insert failed:", e.message));

    // Advance nextRun from NOW (not from the stale nextRun) so a backlog
    // never causes a run storm.
    const { INTERVALS } = require("./routes/schedules");
    const intervalMs = INTERVALS[schedule.interval] || INTERVALS.daily;
    await db.collection("schedules").updateOne(
      { _id: schedule._id },
      {
        $set: {
          lastRun: startedAt,
          lastStatus: status,
          lastError: error,
          nextRun: new Date(Date.now() + intervalMs).toISOString(),
        },
        $inc: { runCount: 1 },
      }
    );

    await notify(db, schedule.userId, {
      type: "scheduled_run",
      title: status === "success" ? "Scheduled query completed" : "Scheduled query failed",
      message:
        status === "success"
          ? `"${schedule.name}" returned ${rowCount} row${rowCount === 1 ? "" : "s"}.`
          : `"${schedule.name}" failed: ${error}`,
      icon: status === "success" ? "clock" : "alert-triangle",
      link: "/app/history",
    });

    recordUsage({
      userId: schedule.userId,
      eventType: "scheduled_run",
      units: 1,
      metadata: { scheduleId: schedule._id, status, rowCount },
    });
    if (schedule.datasetId) {
      recordLineage({
        userId: schedule.userId,
        sourceId: schedule._id,
        sourceType: "schedule",
        targetId: schedule.datasetId,
        targetType: "dataset",
        relation: "scheduled_by",
      });
    }

    console.log(`schedule ${schedule._id} (${schedule.name}): ${status}${error ? ` — ${error}` : ` — ${rowCount} rows`}`);
  }

  return due.length;
}

// ── Pass 2: alerts ───────────────────────────────────────────────────────────
function compare(value, operator, threshold) {
  switch (operator) {
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "=": return value === threshold;
    case "!=": return value !== threshold;
    default: return false;
  }
}

async function evaluateDueAlerts(db, now) {
  const alerts = await db.collection("alerts").find({ enabled: true }).limit(100).toArray();
  let evaluated = 0;

  for (const alert of alerts) {
    const intervalMs = ALERT_INTERVALS_MS[alert.checkInterval] || ALERT_INTERVALS_MS.daily;
    if (alert.lastChecked && now - new Date(alert.lastChecked).getTime() < intervalMs) continue;
    evaluated++;

    let value = null;
    let error = null;
    try {
      const result = await runStoredQuery(db, alert.userId, {
        datasetId: alert.datasetId,
        connectionId: alert.connectionId,
        sheetName: alert.sheetName,
        sql: alert.metricSql,
      });
      const firstRow = result.rows[0];
      const firstVal = firstRow ? Object.values(firstRow)[0] : null;
      value = Number(firstVal);
      if (!Number.isFinite(value)) throw new Error(`Metric query returned a non-numeric value: ${String(firstVal).slice(0, 50)}`);
    } catch (err) {
      error = String(err.message || err).slice(0, 500);
    }

    const fired = error === null && compare(value, alert.operator, alert.threshold);

    await db.collection("alerts").updateOne(
      { _id: alert._id },
      {
        $set: {
          lastChecked: new Date().toISOString(),
          lastValue: error ? null : value,
          lastError: error,
          ...(fired ? { lastFired: new Date().toISOString() } : {}),
        },
        ...(fired ? { $inc: { fireCount: 1 } } : {}),
      }
    );

    if (fired) {
      await notify(db, alert.userId, {
        type: "alert_fired",
        title: "Data alert triggered",
        message: `"${alert.label}" — current value ${value} is ${alert.operator} ${alert.threshold}.`,
        icon: "bell-ring",
        link: "/app/dashboard",
      });
    } else if (error) {
      await notify(db, alert.userId, {
        type: "alert_error",
        title: "Data alert could not be evaluated",
        message: `"${alert.label}": ${error}`,
        icon: "alert-triangle",
        link: "/app/dashboard",
      });
    }

    recordUsage({
      userId: alert.userId,
      eventType: "alert_evaluation",
      units: 1,
      metadata: { alertId: alert._id, fired, value, error },
    });

    console.log(`alert ${alert._id} (${alert.label}): value=${value} fired=${fired}${error ? ` error=${error}` : ""}`);
  }

  return evaluated;
}

// ── Entry points ─────────────────────────────────────────────────────────────
async function runScheduler() {
  const db = await getDb();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const [schedules, alerts] = [await runDueSchedules(db, nowIso), await evaluateDueAlerts(db, now)];

  // Billing lifecycle: flag plans inside their grace window as past_due, then
  // downgrade any whose grace window has fully elapsed. Isolated so a billing
  // error never aborts schedules/alerts.
  let pastDue = 0;
  let downgraded = 0;
  try {
    pastDue = await flagPastDuePlans(db, new Date(now));
    downgraded = await downgradeExpiredPlans(db, new Date(now));
  } catch (err) {
    console.error("billing lifecycle pass failed:", err.message);
  }

  console.log(
    `scheduler tick: ${schedules} schedules run, ${alerts} alerts evaluated, ${pastDue} past_due, ${downgraded} downgraded`
  );
  return { schedules, alerts, pastDue, downgraded };
}

module.exports.handler = async () => {
  try {
    return { statusCode: 200, body: JSON.stringify(await runScheduler()) };
  } catch (err) {
    console.error("scheduler fatal:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// Local execution: node scheduler.js
if (require.main === module) {
  runScheduler()
    .then((r) => {
      console.log("done", r);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
