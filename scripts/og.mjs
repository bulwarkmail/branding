#!/usr/bin/env node
/**
 * Render the Open Graph cards: the site's own and one per audience page.
 *
 *   node scripts/og.mjs                       # every card
 *   node scripts/og.mjs organisations homelab # some cards
 *
 * 1200x630 PNG (social crawlers are unreliable with WebP), drawn in HTML: the
 * raspberry field, the mark and wordmark, the page's heading, and a light
 * capture leaving the card at the right and the bottom. Output:
 * .staging/cards/og-<card>.png; `sync` copies them to the website and to
 * social/ in this repo.
 */
import fs from "node:fs";
import path from "node:path";
import { PALETTE, FONT_LINK, dataUri, loadChromium, renderHtml, writePng, markSvg } from "./lib/render.mjs";
import { SHOTS_DIR, CARDS_DIR } from "./lib/paths.mjs";

const W = 1200;
const H = 630;

// Each card carries its page's h1 and its hero capture. The longer headings
// step the type down so they keep to five lines beside the capture.
const CARDS = {
  full: { file: "og-full.png", heading: "Webmail for Stalwart Mail Server.", shot: "inbox" },
  organisations: { file: "og-organisations.png", heading: "Webmail for an organisation that runs its own Stalwart.", shot: "admin-policy", size: 52 },
  "small-business": { file: "og-small-business.png", heading: "Shared mail and calendars for a small business.", shot: "shared-mailbox", size: 56 },
  homelab: { file: "og-homelab.png", heading: "Webmail for the Stalwart server in your home lab.", shot: "unified-inbox", size: 56 },
};

function html(card, shot) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}<style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body { background: ${PALETTE.rasp}; color: #ffffff; font-family: "Hanken Grotesk", system-ui, sans-serif;
      display: grid; grid-template-columns: 520px 1fr; }
    .text { padding: 64px 0 64px 72px; display: grid; align-content: space-between; }
    .brand { display: flex; align-items: center; gap: 14px; font-weight: 600; font-size: 28px; letter-spacing: -0.01em; }
    h1 { margin: 0; font-weight: 400; font-size: ${card.size ?? 60}px; line-height: 1.06; letter-spacing: -0.015em; }
    .site { font-size: 24px; }
    .shot { align-self: end; margin-left: 56px; width: 900px; height: 506px; overflow: hidden;
      border: 1px solid ${PALETTE.rule}; border-right: 0; border-bottom: 0; box-sizing: border-box; }
    .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 0 0; }
  </style></head><body>
    <div class="text">
      <div class="brand">${markSvg("#ffffff", 40)}<span>Bulwark</span></div>
      <h1>${card.heading}</h1>
      <div class="site">bulwarkmail.org</div>
    </div>
    <div class="shot"><img src="${shot}" alt=""></div>
  </body></html>`;
}

async function main() {
  const names = process.argv.slice(2);
  const unknown = names.filter((n) => !Object.hasOwn(CARDS, n));
  if (unknown.length) throw new Error(`unknown card ${unknown.join(", ")}; pick from ${Object.keys(CARDS).join(", ")}`);
  const cards = (names.length ? names : Object.keys(CARDS)).map((n) => CARDS[n]);
  const missing = cards.map((c) => `light-${c.shot}.webp`).filter((f) => !fs.existsSync(path.join(SHOTS_DIR, f)));
  if (missing.length) throw new Error(`missing captures in ${SHOTS_DIR}: ${missing.join(", ")}; run shoot.mjs first`);
  const browser = await loadChromium().launch();
  for (const card of cards) {
    const shot = dataUri(path.join(SHOTS_DIR, `light-${card.shot}.webp`));
    const png = await renderHtml(browser, { html: html(card, shot), width: W, height: H, scale: 1, settle: 1500 });
    const r = writePng(png, path.join(CARDS_DIR, card.file));
    console.log(`  + ${card.file} ${(r.bytes / 1024).toFixed(0)}KB`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
