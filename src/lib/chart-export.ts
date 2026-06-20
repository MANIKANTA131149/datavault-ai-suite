/* ════════════════════════════════════════════════════════════════════════
   chart-export.ts — high-quality, theme-safe chart & element export.

   Root causes this fixes (vs. the old html2canvas-at-scale:2 path):
   • Blurry      → rasterize at devicePixelRatio × export scale (3×+ on retina).
   • Black/dark  → resolve the *computed* foreground/border colours and paint a
                   solid theme-correct background; never leave a null/black fill.
   • Collapsed   → measure the real <svg> bounding box (responsive recharts
                   containers report 0 in html2canvas; the live SVG never does).
   • Vector loss → SVG export serialises the actual <svg> with inlined styles,
                   so it stays infinitely sharp; PNG/JPEG rasterise from it.

   All functions are pure and dependency-free (no html2canvas). They operate on
   a DOM node that contains exactly one <svg> (our charts always do).
   ════════════════════════════════════════════════════════════════════════ */

export type ExportTheme = "light" | "dark" | "transparent";
export type RasterFormat = "png" | "jpeg";

const LIGHT_BG = "#ffffff";
const DARK_BG = "#0b0f1a";

function resolveBackground(theme: ExportTheme): string | null {
  if (theme === "transparent") return null;
  return theme === "dark" ? DARK_BG : LIGHT_BG;
}

/** Find the chart SVG inside an arbitrary container. */
function findSvg(node: HTMLElement): SVGSVGElement | null {
  if (node instanceof SVGSVGElement) return node;
  return node.querySelector("svg");
}

/**
 * Copy *computed* styles from the live element tree onto a cloned SVG so the
 * serialised markup is self-contained (no CSS variables, no external classes).
 * This is what keeps strokes/fills/fonts identical to what's on screen and
 * prevents the "everything turns black" problem when CSS vars don't resolve.
 */
const STYLE_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
  "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "color", "font-family", "font-size", "font-weight", "opacity",
  "text-anchor", "dominant-baseline",
];

function inlineStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source);
  let style = "";
  for (const prop of STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (value) style += `${prop}:${value};`;
  }
  target.setAttribute("style", style);

  const sourceChildren = source.children;
  const targetChildren = target.children;
  for (let i = 0; i < sourceChildren.length; i += 1) {
    if (targetChildren[i]) inlineStyles(sourceChildren[i], targetChildren[i]);
  }
}

/**
 * Serialise a chart node to a standalone SVG string with inlined styles and an
 * explicit theme background. Returns the SVG markup plus its pixel dimensions.
 */
export function serializeChartSvg(
  node: HTMLElement,
  theme: ExportTheme = "light",
): { svg: string; width: number; height: number } | null {
  const live = findSvg(node);
  if (!live) return null;

  const rect = live.getBoundingClientRect();
  // Prefer the rendered box; fall back to the viewBox so a momentarily
  // unsized responsive container can never collapse the export to 0×0.
  let width = Math.round(rect.width);
  let height = Math.round(rect.height);
  if ((!width || !height) && live.viewBox?.baseVal) {
    width = width || Math.round(live.viewBox.baseVal.width) || 640;
    height = height || Math.round(live.viewBox.baseVal.height) || 360;
  }
  width = width || 640;
  height = height || 360;

  const clone = live.cloneNode(true) as SVGSVGElement;
  inlineStyles(live, clone);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const bg = resolveBackground(theme);
  if (bg) {
    const rectEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectEl.setAttribute("x", "0");
    rectEl.setAttribute("y", "0");
    rectEl.setAttribute("width", "100%");
    rectEl.setAttribute("height", "100%");
    rectEl.setAttribute("fill", bg);
    clone.insertBefore(rectEl, clone.firstChild);
  }

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, width, height };
}

/** Load an SVG string into an <img> via a blob URL (avoids data-URI size caps). */
function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Rasterise a chart node to a high-DPI PNG/JPEG data URL.
 * `scale` multiplies devicePixelRatio, so the default lands at 3× on retina.
 */
export async function chartToRasterDataUrl(
  node: HTMLElement,
  { theme = "light", format = "png", scale = 2 }: { theme?: ExportTheme; format?: RasterFormat; scale?: number } = {},
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const serialized = serializeChartSvg(node, format === "jpeg" && theme === "transparent" ? "light" : theme);
  if (!serialized) return null;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pixelScale = Math.min(6, dpr * scale); // cap to avoid huge canvases
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(serialized.width * pixelScale);
  canvas.height = Math.round(serialized.height * pixelScale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // JPEG has no alpha — always paint a solid background so it isn't black.
  if (format === "jpeg") {
    ctx.fillStyle = theme === "dark" ? DARK_BG : LIGHT_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const img = await svgToImage(serialized.svg);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const quality = format === "jpeg" ? 0.95 : undefined;
  return { dataUrl: canvas.toDataURL(mime, quality), width: canvas.width, height: canvas.height };
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download a chart as a true vector SVG file. */
export function downloadChartSvg(node: HTMLElement, filename: string, theme: ExportTheme = "light") {
  const serialized = serializeChartSvg(node, theme);
  if (!serialized) throw new Error("No chart to export");
  const blob = new Blob([serialized.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/** Download a chart as a high-DPI PNG or JPEG. */
export async function downloadChartRaster(
  node: HTMLElement,
  filename: string,
  opts: { theme?: ExportTheme; format?: RasterFormat; scale?: number } = {},
) {
  const out = await chartToRasterDataUrl(node, opts);
  if (!out) throw new Error("No chart to export");
  triggerDownload(out.dataUrl, filename);
}

/** Copy a chart to the clipboard as a PNG image (theme-safe, high-DPI). */
export async function copyChartToClipboard(node: HTMLElement, theme: ExportTheme = "light"): Promise<boolean> {
  const out = await chartToRasterDataUrl(node, { theme, format: "png" });
  if (!out) return false;
  try {
    const res = await fetch(out.dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Detect the document's current theme so exports can default to matching it. */
export function detectTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
