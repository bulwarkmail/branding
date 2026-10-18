// Render an HTML document with headless Chromium and write it as PNG or
// size-capped WebP. Shared by the framing and card scripts.
import fs from "node:fs";
import path from "node:path";
import { loadChromium, loadSharp } from "./paths.mjs";

export { loadChromium, loadSharp };

export function dataUri(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

/** Render one HTML document to a PNG buffer at the given CSS size and scale. */
export async function renderHtml(browser, { html, width, height, scale = 1, settle = 300 }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(settle);
  const png = await page.screenshot({ type: "png", fullPage: false });
  await ctx.close();
  return png;
}

/** Write a WebP no larger than maxBytes, stepping quality down until it fits. */
export async function writeWebp(pngBuffer, outFile, { maxBytes = 400 * 1024, quality = 82, minQuality = 50 } = {}) {
  const sharp = loadSharp();
  let q = quality;
  let out;
  for (;;) {
    out = await sharp(pngBuffer).webp({ quality: q, effort: 6 }).toBuffer();
    if (out.length <= maxBytes || q <= minQuality) break;
    q -= 6;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out);
  return { bytes: out.length, quality: q };
}

export function writePng(pngBuffer, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, pngBuffer);
  return { bytes: pngBuffer.length };
}

// The brand tokens (tokens/tokens.json has the full set).
export const PALETTE = {
  paper: "#f5f6f8",
  paperDeep: "#eceef2",
  navy: "#0c1322",
  navyDeep: "#070b16",
  ink: "#0c1322",
  rasp: "#db2d54",
  teal: "#0f8578",
  rule: "#dddde1",
};

// The website's family (src/app/layout.tsx). Only fetched by these scripts on
// a developer machine, never by a published page.
export const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">';

export const MARK_PATHS = [
  "M373.467 557.247L55.226 271.52V385.564C55.226 398.153 62.453 415.6 71.355 424.501L107.525 460.671C116.426 469.573 123.653 487.02 123.653 499.609V682.08C123.655 718.462 133.336 750.017 152.047 778.668L373.467 557.247z",
  "M626.533 557.247L944.774 271.52V396.969C944.774 403.263 941.16 411.987 936.709 416.437L884.411 468.736C879.96 473.186 876.347 481.91 876.347 488.204V682.08C876.345 718.462 866.664 750.017 847.953 778.668L626.533 557.247z",
  "M500 638.743C466.206 638.738 448.855 625.316 424.448 603.033L197.809 829.672C261.382 884.635 364.213 931.859 500 990C635.787 931.859 738.618 884.635 802.191 829.672L575.552 603.033C551.145 625.316 533.794 638.738 500 638.743z",
  "M483.028 563.647L63.713 187.183C59.029 182.978 55.226 174.454 55.226 168.159V122.542C55.226 116.247 60.206 109.988 66.339 108.573L215.181 74.225C221.314 72.809 226.293 76.77 226.293 83.065V176.92L352.034 147.895C358.167 146.479 363.147 140.219 363.147 133.925V51.483C363.147 45.189 368.126 38.93 374.259 37.514L488.888 11.061C495.021 9.646 504.979 9.646 511.112 11.061L625.741 37.514C631.874 38.93 636.853 45.189 636.853 51.483V133.925C636.853 140.219 641.833 146.479 647.966 147.895L773.707 176.92V83.065C773.707 76.77 778.686 72.809 784.819 74.225L933.661 108.573C939.794 109.988 944.774 116.247 944.774 122.542V168.159C944.774 174.454 940.971 182.978 936.287 187.183L516.972 563.647C512.288 567.852 504.684 567.852 500 567.852C495.316 567.852 487.712 567.852 483.028 563.647z",
];

/** The Bulwark mark (the same paths as the logo SVGs), in one colour. */
export function markSvg(fill, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 1000 1000" aria-hidden="true">${MARK_PATHS.map((d) => `<path fill="${fill}" d="${d}"/>`).join("")}</svg>`;
}
