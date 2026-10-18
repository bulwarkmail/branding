#!/usr/bin/env node
/**
 * Render the social profile pictures:
 *
 *   node scripts/avatar.mjs          # every preset, 1x and @2x
 *   node scripts/avatar.mjs --guides # also <name>-guides.png per preset
 *
 * The white mark on the flat raspberry field, nothing else. Each preset sizes
 * the mark for the platform's crop: X crops to a circle, so the mark keeps
 * clear of the inscribed circle; GitHub shows organisations as rounded squares
 * and down to 20px in lists, so the mark runs larger. `--guides` masks the
 * area the crop removes. Output: .staging/cards/.
 */
import path from "node:path";
import { PALETTE, dataUri, loadChromium, renderHtml, writePng } from "./lib/render.mjs";
import { BRANDING, CARDS_DIR } from "./lib/paths.mjs";

const PRESETS = [
  // mark: mark edge as a share of the canvas; radius: the platform's crop.
  { name: "twitter-avatar", size: 400, mark: 0.56, radius: "50%" },
  { name: "github-avatar", size: 500, mark: 0.64, radius: "12%" },
];

function html(p, mark, guides) {
  const m = Math.round(p.size * p.mark);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${p.size}px; height: ${p.size}px; overflow: hidden; }
    body { background: ${PALETTE.rasp}; display: grid; place-items: center; }
    img { width: ${m}px; height: ${m}px; display: block; }
    .g { position: absolute; inset: 0; border-radius: ${p.radius}; box-shadow: 0 0 0 ${p.size}px rgba(0,0,0,.55); outline: 2px dashed #ffd400; outline-offset: -2px; }
  </style></head><body>
    <img src="${mark}" alt="">
    ${guides ? '<div class="g"></div>' : ""}
  </body></html>`;
}

async function main() {
  const withGuides = process.argv.includes("--guides");
  const browser = await loadChromium().launch();
  const mark = dataUri(path.join(BRANDING, "logo", "Bulwark Logo White.svg"));
  for (const p of PRESETS) {
    const jobs = [
      [`${p.name}.png`, 1, false],
      [`${p.name}@2x.png`, 2, false],
      ...(withGuides ? [[`${p.name}-guides.png`, 1, true]] : []),
    ];
    for (const [file, scale, guides] of jobs) {
      const png = await renderHtml(browser, { html: html(p, mark, guides), width: p.size, height: p.size, scale });
      const r = writePng(png, path.join(CARDS_DIR, file));
      console.log(`  + ${file} ${(r.bytes / 1024).toFixed(0)}KB`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
