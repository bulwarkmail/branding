#!/usr/bin/env node
/**
 * Render the X / Twitter profile header:
 *
 *   node scripts/twitter-header.mjs          # twitter-header.png (1500x500) + @2x
 *   node scripts/twitter-header.mjs --guides # also twitter-header-guides.png
 *
 * Same system as the OG cards: the flat raspberry field, the white mark and
 * wordmark, the hero heading at regular weight, and the light inbox capture
 * leaving the header at the right and the bottom.
 *
 * Safe areas. The profile picture covers the bottom-left corner on desktop
 * (about x 0-400, y 300-500 at 1500x500), and phones crop roughly 60px off the
 * top and bottom. Text therefore sits top-left, above the avatar and inside
 * y 60-440; the corner under the avatar is empty field. `--guides` draws both
 * zones over the render so they can be checked.
 */
import path from "node:path";
import { PALETTE, FONT_LINK, dataUri, loadChromium, renderHtml, writePng, markSvg } from "./lib/render.mjs";
import { SHOTS_DIR, CARDS_DIR } from "./lib/paths.mjs";

const W = 1500;
const H = 500;

const GUIDES = `
  <div class="g g-crop" style="top:0;height:60px"></div>
  <div class="g g-crop" style="bottom:0;height:60px"></div>
  <div class="g g-avatar"></div>`;

function html(shot, guides) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}<style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body { position: relative; background: ${PALETTE.rasp}; color: #ffffff;
      font-family: "Hanken Grotesk", system-ui, sans-serif; }
    .text { position: absolute; left: 88px; top: 80px; width: 600px; }
    .brand { display: flex; align-items: center; gap: 14px; font-weight: 600; font-size: 30px; letter-spacing: -0.01em; }
    h1 { margin: 32px 0 0; font-weight: 400; font-size: 64px; line-height: 1.06; letter-spacing: -0.015em; }
    .shot { position: absolute; left: 760px; top: 88px; width: 960px; height: 540px; overflow: hidden;
      border: 1px solid ${PALETTE.rule}; border-right: 0; border-bottom: 0; box-sizing: border-box; }
    .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 0 0; }
    .g { position: absolute; left: 0; right: 0; background: rgba(0,0,0,.35); outline: 2px dashed #ffd400; outline-offset: -2px; }
    .g-avatar { left: 0; right: auto; width: 400px; top: 300px; height: 200px; border-radius: 0 200px 0 0; background: rgba(0,0,0,.45); }
  </style></head><body>
    <div class="text">
      <div class="brand">${markSvg("#ffffff", 44)}<span>Bulwark</span></div>
      <h1>Webmail for<br>Stalwart Mail Server.</h1>
    </div>
    <div class="shot"><img src="${shot}" alt=""></div>
    ${guides ? GUIDES : ""}
  </body></html>`;
}

async function main() {
  const withGuides = process.argv.includes("--guides");
  const browser = await loadChromium().launch();
  const shot = dataUri(path.join(SHOTS_DIR, "light-inbox.webp"));
  const jobs = [
    ["twitter-header.png", 1, false],
    ["twitter-header@2x.png", 2, false],
    ...(withGuides ? [["twitter-header-guides.png", 1, true]] : []),
  ];
  for (const [file, scale, guides] of jobs) {
    const png = await renderHtml(browser, { html: html(shot, guides), width: W, height: H, scale, settle: 1500 });
    const r = writePng(png, path.join(CARDS_DIR, file));
    console.log(`  + ${file} ${(r.bytes / 1024).toFixed(0)}KB`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
