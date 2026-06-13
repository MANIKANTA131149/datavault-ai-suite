// ─── PII Detection ────────────────────────────────────────────────────────────
// Scans uploaded workbook data for columns likely containing personal data:
// emails, phone numbers, SSNs, credit cards, IP addresses, person names.
// Pure regex + Luhn — no LLM calls, runs in milliseconds, fire-and-forget
// after upload. Results stored as dataset.piiColumns metadata so clients can
// mask or warn; the raw data itself is never modified.

const SAMPLE_SIZE = 200; // values sampled per column
const MATCH_THRESHOLD = 0.6; // ≥60% of non-null samples must match

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const SSN_RE = /^\d{3}-?\d{2}-?\d{4}$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,17}$/;

function luhnValid(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function isCreditCard(v) {
  const digits = v.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(digits) && luhnValid(digits);
}

function isPhone(v) {
  if (!PHONE_RE.test(v)) return false;
  const digitCount = (v.match(/\d/g) || []).length;
  return digitCount >= 7 && digitCount <= 15;
}

// Column-name hints — used to confirm value-pattern matches (phone/ssn are
// pattern-ambiguous with IDs) or to flag name/address columns outright.
const NAME_HINT = /^(first|last|full|middle)?[\s_-]*name$|surname|fullname/i;
const ADDRESS_HINT = /\baddress\b|street[\s_-]?(line|address)|home[\s_-]?address/i;
const PHONE_HINT = /phone|mobile|tel(ephone)?|cell|contact[\s_-]?(no|num)/i;
const SSN_HINT = /\bssn\b|social[\s_-]?security|national[\s_-]?id|aadhaar|aadhar/i;
const EMAIL_HINT = /e?[\s_-]?mail/i;
const DOB_HINT = /\b(dob|date[\s_-]?of[\s_-]?birth|birth[\s_-]?date)\b/i;

/**
 * Detect PII type for one column given its name and sample values.
 * @returns {"email"|"phone"|"ssn"|"credit_card"|"ip_address"|"name"|"address"|"date_of_birth"|null}
 */
function detectColumnPii(columnName, values) {
  const name = String(columnName || "");

  // Name-only signals (values are arbitrary strings)
  if (NAME_HINT.test(name)) return "name";
  if (ADDRESS_HINT.test(name)) return "address";
  if (DOB_HINT.test(name)) return "date_of_birth";

  const samples = [];
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    samples.push(String(v).trim());
    if (samples.length >= SAMPLE_SIZE) break;
  }
  if (samples.length < 3) return null;

  const ratio = (pred) => samples.filter(pred).length / samples.length;

  if (ratio((v) => EMAIL_RE.test(v)) >= MATCH_THRESHOLD) return "email";
  if (ratio(isCreditCard) >= MATCH_THRESHOLD) return "credit_card";
  if (SSN_HINT.test(name) && ratio((v) => SSN_RE.test(v)) >= MATCH_THRESHOLD) return "ssn";
  if (ratio((v) => SSN_RE.test(v)) >= 0.9) return "ssn"; // strong pattern even without hint
  if (ratio((v) => IPV4_RE.test(v)) >= MATCH_THRESHOLD) return "ip_address";
  // Phone numbers collide with numeric IDs — require a column-name hint OR a
  // very strong pattern match including separators/plus signs.
  if (PHONE_HINT.test(name) && ratio(isPhone) >= MATCH_THRESHOLD) return "phone";
  if (ratio((v) => isPhone(v) && /[+\-() ]/.test(v)) >= 0.8) return "phone";
  if (EMAIL_HINT.test(name) && ratio((v) => EMAIL_RE.test(v)) >= 0.3) return "email";

  return null;
}

/**
 * Scan a parsed workbook ({ sheets: { name: { columns, rows } } } or
 * { name: { columns, rows } }) and return { sheetName: { columnName: piiType } }
 * containing only columns where PII was detected. Returns {} when clean.
 */
function scanWorkbook(fileData) {
  const result = {};
  if (!fileData || typeof fileData !== "object") return result;
  const sheets = fileData.sheets && typeof fileData.sheets === "object" ? fileData.sheets : fileData;

  for (const [sheetName, sheet] of Object.entries(sheets)) {
    if (!sheet || !Array.isArray(sheet.rows) || sheet.rows.length === 0) continue;
    const columnNames = Array.isArray(sheet.columns)
      ? sheet.columns.map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean)
      : Object.keys(sheet.rows[0] || {});

    const found = {};
    for (const col of columnNames) {
      try {
        const values = sheet.rows.slice(0, SAMPLE_SIZE * 2).map((r) => r?.[col]);
        const pii = detectColumnPii(col, values);
        if (pii) found[col] = pii;
      } catch { /* one bad column never aborts the scan */ }
    }
    if (Object.keys(found).length > 0) result[sheetName] = found;
  }
  return result;
}

/** Mask a single value according to its PII type (for display layers). */
function maskValue(value, piiType) {
  if (value === null || value === undefined || value === "") return value;
  const s = String(value);
  switch (piiType) {
    case "email": {
      const at = s.indexOf("@");
      if (at <= 0) return "***";
      return `${s.slice(0, Math.min(3, at))}***${s.slice(at)}`;
    }
    case "phone":
      return s.length > 4 ? `${"*".repeat(s.length - 4)}${s.slice(-4)}` : "****";
    case "ssn":
      return `***-**-${s.replace(/\D/g, "").slice(-4)}`;
    case "credit_card":
      return `**** **** **** ${s.replace(/\D/g, "").slice(-4)}`;
    case "name":
      return s.length > 1 ? `${s[0]}${"*".repeat(Math.min(s.length - 1, 8))}` : "*";
    default:
      return "***";
  }
}

module.exports = { scanWorkbook, detectColumnPii, maskValue };
