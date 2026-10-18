#!/usr/bin/env node
/**
 * Render the Open Graph cards, one per edition:
 *
 *   node scripts/og.mjs
 *
 * 1200x630 PNG (social crawlers are unreliable with WebP), drawn in HTML: the
 * edition's flat field, the mark and wordmark, the hero heading, and the light
 * inbox capture leaving the card at the right and the bottom. Output:
 * .staging/cards/og-{full,lite}.png; `sync` copies them to the website and
 * to social/ in this repo.
 */
import path from "node:path";
import { PALETTE, FONT_LINK, dataUri, loadChromium, renderHtml, writePng, markSvg } from "./lib/render.mjs";
import { SHOTS_DIR, CARDS_DIR } from "./lib/paths.mjs";

const W = 1200;
const H = 630;

const EDITIONS = {
  full: { file: "og-full.png", field: PALETTE.rasp, name: "Bulwark", heading: "Webmail for Stalwart Mail Server." },
  lite: { file: "og-lite.png", field: PALETTE.teal, name: "Bulwark Lite", heading: "Webmail for Stalwart, served as static files." },
};

function html(e, shot) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}<style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body { background: ${e.field}; color: #ffffff; font-family: "Hanken Grotesk", system-ui, sans-serif;
      display: grid; grid-template-columns: 520px 1fr; }
    .text { padding: 64px 0 64px 72px; display: grid; align-content: space-between; }
    .brand { display: flex; align-items: center; gap: 14px; font-weight: 600; font-size: 28px; letter-spacing: -0.01em; }
    h1 { margin: 0; font-weight: 400; font-size: 60px; line-height: 1.06; letter-spacing: -0.015em; }
    .site { font-size: 24px; }
    .shot { align-self: end; margin-left: 56px; width: 900px; height: 506px; overflow: hidden;
      border: 1px solid ${PALETTE.rule}; border-right: 0; border-bottom: 0; box-sizing: border-box; }
    .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 0 0; }
  </style></head><body>
    <div class="text">
      <div class="brand">${markSvg("#ffffff", 40)}<span>${e.name}</span></div>
      <h1>${e.heading}</h1>
      <div class="site">bulwarkmail.org</div>
    </div>
    <div class="shot"><img src="${shot}" alt=""></div>
  </body></html>`;
}

async function main() {
  const browser = await loadChromium().launch();
  const shot = dataUri(path.join(SHOTS_DIR, "light-inbox.webp"));
  for (const e of Object.values(EDITIONS)) {
    const png = await renderHtml(browser, { html: html(e, shot), width: W, height: H, scale: 1, settle: 1500 });
    const r = writePng(png, path.join(CARDS_DIR, e.file));
    console.log(`  + ${e.file} ${(r.bytes / 1024).toFixed(0)}KB`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
