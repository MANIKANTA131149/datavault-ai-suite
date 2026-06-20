/* ════════════════════════════════════════════════════════════════════════
   table-export.ts — clean, formatting-preserving table exports.

   Keeps number/date/currency formatting consistent with the on-screen table,
   escapes safely, and emits files that open cleanly in Excel/Sheets without
   broken rows, mojibake, or "=cmd" formula-injection risks.
   ════════════════════════════════════════════════════════════════════════ */

type Row = Record<string, any>;

const UTF8_BOM = "﻿"; // makes Excel detect UTF-8 (fixes accented chars / ₹ / €)

/** 2-decimal rounding for non-integers, no locale grouping (matches the grid). */
export function formatCell(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  // Strip JSON-style wrapping quotes that leak from mixed-type columns.
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/** Neutralise spreadsheet formula injection (=, +, -, @ leading a cell). */
function sanitizeForSpreadsheet(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvField(value: any): string {
  const text = sanitizeForSpreadsheet(formatCell(value));
  // Quote if it contains comma, quote, or newline; double internal quotes.
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function download(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeRows(result: any): Row[] {
  if (Array.isArray(result)) return result.filter((r) => r && typeof r === "object");
  if (result && typeof result === "object" && Array.isArray(result.rows)) return result.rows;
  return [];
}

/** Styled, Excel-safe CSV (UTF-8 BOM, sanitised, properly quoted). */
export function exportCsv(result: any, filename = "querify-export.csv") {
  const rows = normalizeRows(result);
  if (rows.length === 0) throw new Error("No table rows to export");
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvField).join(","),
    ...rows.map((row) => headers.map((h) => csvField(row[h])).join(",")),
  ];
  download(UTF8_BOM + lines.join("\r\n"), filename, "text/csv;charset=utf-8");
}

/**
 * Excel-friendly export. We emit an HTML table with a .xls extension and the
 * Excel mime type — Excel/Sheets open it as a real styled sheet (bold header,
 * borders) with zero extra dependencies. Numbers stay right-aligned.
 */
export function exportExcel(result: any, filename = "querify-export.xls", title?: string) {
  const rows = normalizeRows(result);
  if (rows.length === 0) throw new Error("No table rows to export");
  const headers = Object.keys(rows[0]);
  const esc = (v: any) =>
    sanitizeForSpreadsheet(formatCell(v)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const isNum = (v: any) => typeof v === "number" && Number.isFinite(v);

  const head = headers.map((h) => `<th style="background:#4f46e5;color:#fff;padding:6px 10px;border:1px solid #cbd5e1;text-align:left;font-family:Arial">${esc(h)}</th>`).join("");
  const body = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#ffffff"}">${headers
          .map((h) => `<td style="padding:5px 10px;border:1px solid #e2e8f0;font-family:Arial;text-align:${isNum(r[h]) ? "right" : "left"}">${esc(r[h])}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${
    title ? `<h3 style="font-family:Arial">${esc(title)}</h3>` : ""
  }<table style="border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;

  download(UTF8_BOM + html, filename, "application/vnd.ms-excel");
}

/** JSON export (pretty-printed). */
export function exportJson(result: any, filename = "querify-export.json") {
  download(JSON.stringify(result, null, 2), filename, "application/json");
}

function rowsToTsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => formatCell(v).replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return [headers.join("\t"), ...rows.map((r) => headers.map((h) => esc(r[h])).join("\t"))].join("\n");
}

function rowsToHtmlTable(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => formatCell(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const head = headers.map((h) => `<th style="text-align:left;padding:4px 8px;border:1px solid #ccc;background:#f1f5f9">${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${headers.map((h) => `<td style="padding:4px 8px;border:1px solid #ddd">${esc(r[h])}</td>`).join("")}</tr>`).join("");
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Copy the table as rich text (HTML) + TSV so it pastes formatted into Excel/Sheets/Docs. */
export async function copyTableRichText(result: any): Promise<boolean> {
  const rows = normalizeRows(result);
  if (rows.length === 0) return false;
  const tsv = rowsToTsv(rows);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([tsv], { type: "text/plain" }),
        "text/html": new Blob([rowsToHtmlTable(rows)], { type: "text/html" }),
      }),
    ]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch {
      return false;
    }
  }
}

/** Markdown table (insight narrative supported above the table). */
export function exportMarkdown(result: any, query: string, filename = "querify-export.md") {
  let md = `# Query Result\n\n**Query:** ${query}\n\n**Generated:** ${new Date().toLocaleString()}\n\n`;
  let data = result;
  if (data && !Array.isArray(data) && typeof data === "object" && Array.isArray(data.rows) && data.narrative !== undefined) {
    md += `${String(data.narrative)}\n\n`;
    data = data.rows;
  }
  const rows = normalizeRows(data);
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    md += `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
    for (const row of rows) md += `| ${headers.map((h) => formatCell(row[h]).replace(/\|/g, "\\|")).join(" | ")} |\n`;
  } else if (data?.narrative) {
    md += String(data.narrative);
  } else {
    md += "```json\n" + JSON.stringify(data, null, 2) + "\n```";
  }
  download(md, filename, "text/markdown;charset=utf-8");
}
