// ─── Seed first-party gallery templates (F-MKT) ───────────────────────────────
// Inserts a small set of curated, dataset-agnostic templates as
// public + approved so they appear in the gallery immediately. Idempotent:
// uses fixed _id values and upserts, so re-running just refreshes them.
//
//   node server/scripts/seed-templates.js
//
// Query templates carry a natural-language `question` the user runs against
// their OWN data after forking. Dashboard templates carry generic panels whose
// questions are re-bound to the user's dataset on fork (no dataset ids stored).

require("../loadEnv");
const { getDb } = require("../db");

const NOW = new Date().toISOString();

const TEMPLATES = [
  {
    _id: "tpl_seed_top_n",
    type: "query",
    name: "Top N by a metric",
    description: "Rank the highest items by any numeric column — great for top products, customers, or regions.",
    payload: { question: "Show the top 10 items by total value, highest first." },
    tags: ["ranking", "starter"],
  },
  {
    _id: "tpl_seed_monthly_trend",
    type: "query",
    name: "Monthly trend",
    description: "Aggregate a metric by month to see how it changes over time.",
    payload: { question: "Show the monthly total over time as a trend." },
    tags: ["time-series", "trend"],
  },
  {
    _id: "tpl_seed_breakdown",
    type: "query",
    name: "Breakdown by category",
    description: "Group and total a metric by a category column to compare segments.",
    payload: { question: "Break down the total by category and show the share of each." },
    tags: ["grouping", "comparison"],
  },
  {
    _id: "tpl_seed_anomalies",
    type: "query",
    name: "Find outliers",
    description: "Surface unusually high or low values that deserve a closer look.",
    payload: { question: "Find the outliers and unusual values in this data and explain them." },
    tags: ["anomaly", "quality"],
  },
  {
    _id: "tpl_seed_data_quality",
    type: "query",
    name: "Data quality check",
    description: "Profile the dataset: nulls, duplicates, and column distributions.",
    payload: { question: "Profile this dataset and flag any data quality issues." },
    tags: ["profiling", "quality"],
  },
  {
    _id: "tpl_seed_exec_dashboard",
    type: "dashboard",
    name: "Executive overview",
    description: "A starter dashboard: a headline metric, a trend, and a category breakdown. Bind it to your dataset after forking.",
    payload: {
      panels: [
        { id: "p1", title: "Headline total", question: "What is the overall total?", sql: "", chartType: "metric", layout: { w: 4, h: 3 } },
        { id: "p2", title: "Monthly trend", question: "Show the monthly total over time.", sql: "", chartType: "line", layout: { w: 8, h: 4 } },
        { id: "p3", title: "By category", question: "Break down the total by category.", sql: "", chartType: "bar", layout: { w: 6, h: 4 } },
        { id: "p4", title: "Top items", question: "Show the top 10 items by value.", sql: "", chartType: "table", layout: { w: 6, h: 4 } },
      ],
    },
    tags: ["dashboard", "starter"],
  },
];

async function main() {
  const db = await getDb();
  let upserted = 0;
  for (const t of TEMPLATES) {
    await db.collection("templates").updateOne(
      { _id: t._id },
      {
        $set: {
          type: t.type,
          name: t.name,
          description: t.description,
          payload: t.payload,
          tags: t.tags || [],
          authorUserId: "system",
          authorName: "Querify",
          public: true,
          status: "approved",
          updatedAt: NOW,
        },
        $setOnInsert: { installs: 0, createdAt: NOW },
      },
      { upsert: true }
    );
    upserted++;
  }
  console.log(`Seeded ${upserted} gallery templates (public + approved).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-templates failed:", err);
  process.exit(1);
});
