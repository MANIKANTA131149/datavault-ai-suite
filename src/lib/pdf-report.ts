import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface PDFReportOptions {
  title: string;
  query?: string;
  userName?: string;
  datasetName?: string;
  resultElementId?: string; // ID of DOM element to screenshot
  narrative?: string;
  rows?: Record<string, any>[];
}

const BRAND_COLOR = "#6366f1"; // primary indigo
const GRAY = "#64748b";
const DARK = "#0f172a";
const LIGHT_BG = "#f8fafc";

function formatDate() {
  return new Date().toLocaleString("en-US", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Generate a branded PDF report from a query result.
 * Captures an optional DOM element as a chart screenshot.
 */
export async function generatePDF(opts: PDFReportOptions): Promise<void> {
  const {
    title,
    query = "",
    userName = "DataVault User",
    datasetName = "",
    resultElementId,
    narrative,
    rows = [],
  } = opts;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 0;

  // ── Header banner ──────────────────────────────────────────────────────────
  doc.setFillColor(BRAND_COLOR);
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor("#ffffff");
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("DataVault AI", 14, 11);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Enterprise Data Intelligence Platform", 14, 18);

  doc.setFontSize(9);
  doc.text(`Generated: ${formatDate()}`, pageW - 14, 11, { align: "right" });
  doc.text(`By: ${userName}`, pageW - 14, 18, { align: "right" });

  y = 36;

  // ── Report title ───────────────────────────────────────────────────────────
  doc.setTextColor(DARK);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, y);
  y += 7;

  if (datasetName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.text(`Dataset: ${datasetName}`, 14, y);
    y += 6;
  }

  // ── Divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(BRAND_COLOR);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageW - 14, y);
  y += 6;

  // ── Query box ─────────────────────────────────────────────────────────────
  if (query) {
    doc.setFillColor(LIGHT_BG);
    doc.roundedRect(14, y, pageW - 28, 14, 2, 2, "F");
    doc.setTextColor(GRAY);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("QUERY", 18, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(DARK);
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(query, pageW - 42);
    doc.text(wrapped, 18, y + 10);
    y += 14 + (Math.max(0, wrapped.length - 1) * 4) + 4;
  }

  // ── Chart screenshot (if element exists) ───────────────────────────────────
  if (resultElementId) {
    const el = document.getElementById(resultElementId);
    if (el) {
      try {
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        const imgData = canvas.toDataURL("image/png");
        const imgW = pageW - 28;
        const imgH = (canvas.height * imgW) / canvas.width;
        const maxH = pageH - y - 30;
        const finalH = Math.min(imgH, maxH);
        doc.addImage(imgData, "PNG", 14, y, imgW, finalH);
        y += finalH + 6;
      } catch {
        // skip screenshot if it fails
      }
    }
  }

  // ── Narrative ──────────────────────────────────────────────────────────────
  if (narrative) {
    doc.setFillColor(LIGHT_BG);
    const narLines = doc.splitTextToSize(narrative, pageW - 42);
    const narH = narLines.length * 4.5 + 10;
    if (y + narH > pageH - 20) { doc.addPage(); y = 20; }
    doc.roundedRect(14, y, pageW - 28, narH, 2, 2, "F");
    doc.setTextColor(DARK);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(narLines, 18, y + 7);
    y += narH + 6;
  }

  // ── Data table ─────────────────────────────────────────────────────────────
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    if (y + 20 > pageH - 20) { doc.addPage(); y = 20; }

    // Table header
    doc.setFillColor(BRAND_COLOR);
    doc.rect(14, y, pageW - 28, 7, "F");
    doc.setTextColor("#ffffff");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const colW = (pageW - 28) / headers.length;
    headers.forEach((h, i) => {
      doc.text(String(h).slice(0, 18), 16 + i * colW, y + 5);
    });
    y += 7;

    // Table rows
    doc.setFont("helvetica", "normal");
    const displayRows = rows.slice(0, 40);
    displayRows.forEach((row, ri) => {
      if (y + 6 > pageH - 20) { doc.addPage(); y = 20; }
      doc.setFillColor(ri % 2 === 0 ? "#f8fafc" : "#ffffff");
      doc.rect(14, y, pageW - 28, 6, "F");
      doc.setTextColor(DARK);
      headers.forEach((h, i) => {
        const val = String(row[h] ?? "").slice(0, 20);
        doc.text(val, 16 + i * colW, y + 4.5);
      });
      y += 6;
    });

    if (rows.length > 40) {
      y += 2;
      doc.setTextColor(GRAY);
      doc.setFontSize(8);
      doc.text(`... and ${rows.length - 40} more rows`, 14, y);
      y += 5;
    }
  }

  // ── Footer on every page ───────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor("#f1f5f9");
    doc.rect(0, pageH - 10, pageW, 10, "F");
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Generated by DataVault AI — Enterprise Data Intelligence Platform", 14, pageH - 4);
    doc.text(`Page ${p} of ${pageCount}`, pageW - 14, pageH - 4, { align: "right" });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 40);
  doc.save(`datavault-report-${safeTitle}-${Date.now()}.pdf`);
}
