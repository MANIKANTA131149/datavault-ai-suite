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
const PAGE_MARGIN = 14;
const FOOTER_SPACE = 18;
const MAX_CELL_CHARS = 240;

function formatDate() {
  return new Date().toLocaleString("en-US", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function cleanCellValue(value: any): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const normalized = raw.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_CELL_CHARS ? `${normalized.slice(0, MAX_CELL_CHARS - 1)}...` : normalized;
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

  const columnCount = rows[0] ? Object.keys(rows[0]).length : 0;
  const orientation: "portrait" | "landscape" = columnCount > 4 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 0;

  const addPageIfNeeded = (heightNeeded: number) => {
    if (y + heightNeeded > pageH - FOOTER_SPACE) {
      doc.addPage();
      y = 20;
    }
  };

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
  const titleLines = doc.splitTextToSize(title, pageW - 28);
  doc.text(titleLines, 14, y);
  y += titleLines.length * 7;

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
    const wrapped = doc.splitTextToSize(query, pageW - 42);
    const queryBoxH = Math.max(14, wrapped.length * 4 + 10);
    addPageIfNeeded(queryBoxH + 4);
    doc.roundedRect(14, y, pageW - 28, queryBoxH, 2, 2, "F");
    doc.setTextColor(GRAY);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("QUERY", 18, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(DARK);
    doc.setFontSize(9);
    doc.text(wrapped, 18, y + 10);
    y += queryBoxH + 4;
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
    const tableW = pageW - PAGE_MARGIN * 2;
    const colW = tableW / headers.length;
    const cellPadX = 1.6;
    const cellPadY = 1.4;
    const tableFontSize = headers.length > 8 ? 5.5 : headers.length > 5 ? 6.2 : 7.2;
    const lineH = headers.length > 8 ? 2.7 : 3.2;
    const maxTextW = Math.max(8, colW - cellPadX * 2);

    const drawTableHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(tableFontSize);
      const headerLines = headers.map((header) => doc.splitTextToSize(String(header), maxTextW));
      const headerH = Math.max(7, Math.max(...headerLines.map((lines) => lines.length)) * lineH + cellPadY * 2);

      addPageIfNeeded(headerH + 4);
      doc.setFillColor(BRAND_COLOR);
      doc.rect(PAGE_MARGIN, y, tableW, headerH, "F");
      doc.setTextColor("#ffffff");
      headerLines.forEach((lines, i) => {
        doc.text(lines, PAGE_MARGIN + i * colW + cellPadX, y + cellPadY + lineH);
      });
      y += headerH;
    };

    drawTableHeader();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(tableFontSize);
    rows.forEach((row, ri) => {
      const cellLines = headers.map((header) => doc.splitTextToSize(cleanCellValue(row[header]), maxTextW));
      const rowH = Math.max(6, Math.max(...cellLines.map((lines) => lines.length || 1)) * lineH + cellPadY * 2);

      if (y + rowH > pageH - FOOTER_SPACE) {
        doc.addPage();
        y = 20;
        drawTableHeader();
      }

      doc.setFillColor(ri % 2 === 0 ? "#f8fafc" : "#ffffff");
      doc.rect(PAGE_MARGIN, y, tableW, rowH, "F");
      doc.setDrawColor("#e2e8f0");
      doc.setLineWidth(0.1);
      doc.line(PAGE_MARGIN, y + rowH, PAGE_MARGIN + tableW, y + rowH);
      doc.setTextColor(DARK);
      cellLines.forEach((lines, i) => {
        doc.text(lines.length ? lines : [""], PAGE_MARGIN + i * colW + cellPadX, y + cellPadY + lineH);
      });
      y += rowH;
    });
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
