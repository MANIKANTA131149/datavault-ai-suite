const express = require("express");
const { getDb } = require("../db");
const { logAudit } = require("../middleware/auditLogger");
const { createNotification } = require("./notifications");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware); // all dataset routes require auth

// ─── Get all dataset metadata for current user ────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const datasets = await db
      .collection("datasets")
      .find({ userId: req.userId }, { projection: { fileData: 0 } }) // exclude large fileData
      .sort({ uploadDate: -1 })
      .toArray();

    // Return with `id` instead of `_id` for frontend compatibility
    res.json(datasets.map(({ _id, ...rest }) => ({ id: _id, ...rest })));
  } catch (err) {
    console.error("get datasets error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get full file data for a single dataset (lazy-load after login) ──────────
router.get("/:id/data", async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db
      .collection("datasets")
      .findOne({ _id: req.params.id, userId: req.userId }, { projection: { fileData: 1 } });

    if (!doc) return res.status(404).json({ error: "Dataset not found" });
    if (!doc.fileData) return res.status(404).json({ error: "No file data stored for this dataset" });

    res.json(doc.fileData);
  } catch (err) {
    console.error("get dataset data error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Save dataset metadata + full file content ────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { id, fileName, fileSize, fileType, sheetNames, rowCounts, columnCounts, uploadDate, fileData, displayName, tags, notes } =
      req.body;
    if (!id || !fileName) return res.status(400).json({ error: "id and fileName required" });

    const db = await getDb();
    await db.collection("datasets").insertOne({
      _id: id,
      userId: req.userId,
      fileName,
      fileSize,
      fileType,
      sheetNames,
      rowCounts,
      columnCounts,
      uploadDate,
      displayName: displayName || "",
      tags: Array.isArray(tags) ? tags : [],
      notes: notes || "",
      archived: false,
      archivedAt: null,
      ownerEmail: req.userEmail || "",
      createdBy: req.userEmail || "",
      fileData: fileData ?? null, // full parsed sheet data — null if not provided
    });

    res.status(201).json({ success: true });
    // Async side-effects: audit + notification (don't block response)
    logAudit(req.userId, req.userEmail || "", "dataset.upload", { id, fileName, fileType, rowCounts }, "info");
    createNotification(await getDb(), req.userId, {
      type: "dataset_upload",
      title: "Dataset uploaded",
      message: `"${fileName}" is ready to query.`,
      icon: "database",
      link: "/app/datasets",
    });
  } catch (err) {
    if (err.code === 10334 || err.message?.includes("document too large")) {
      return res.status(413).json({ error: "File too large to store (MongoDB 16 MB limit exceeded). Dataset metadata was saved but file must be re-uploaded each session." });
    }
    console.error("save dataset error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete one dataset ───────────────────────────────────────────────────────
// Update dataset metadata without changing stored file data
router.put("/:id", async (req, res) => {
  try {
    const allowed = ["displayName", "tags", "notes", "archived", "archivedAt"];
    const update = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
    }
    if (Object.prototype.hasOwnProperty.call(update, "tags") && !Array.isArray(update.tags)) {
      update.tags = [];
    }
    if (Object.prototype.hasOwnProperty.call(update, "archived")) {
      update.archivedAt = update.archived ? (update.archivedAt || new Date().toISOString()) : null;
    }

    const db = await getDb();
    const result = await db
      .collection("datasets")
      .updateOne({ _id: req.params.id, userId: req.userId }, { $set: update });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Dataset not found" });

    const doc = await db
      .collection("datasets")
      .findOne({ _id: req.params.id, userId: req.userId }, { projection: { fileData: 0 } });
    const { _id, ...rest } = doc;
    res.json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "dataset.update", { id: req.params.id, update }, "info");
  } catch (err) {
    console.error("update dataset error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Duplicate a dataset metadata entry and its stored file data
router.post("/:id/duplicate", async (req, res) => {
  try {
    const db = await getDb();
    const original = await db.collection("datasets").findOne({ _id: req.params.id, userId: req.userId });
    if (!original) return res.status(404).json({ error: "Dataset not found" });

    const newId = req.body.id;
    if (!newId) return res.status(400).json({ error: "id required" });

    const copy = {
      ...original,
      _id: newId,
      fileName: req.body.fileName || `Copy of ${original.fileName}`,
      displayName: req.body.displayName || `Copy of ${original.displayName || original.fileName}`,
      uploadDate: new Date().toISOString(),
      archived: false,
      archivedAt: null,
      ownerEmail: req.userEmail || original.ownerEmail || "",
      createdBy: req.userEmail || original.createdBy || "",
    };

    await db.collection("datasets").insertOne(copy);
    const { _id, fileData, ...rest } = copy;
    res.status(201).json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "dataset.duplicate", { sourceId: req.params.id, id: newId }, "info");
  } catch (err) {
    console.error("duplicate dataset error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("datasets").deleteOne({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "dataset.delete", { id: req.params.id }, "warn");
  } catch (err) {
    console.error("delete dataset error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
