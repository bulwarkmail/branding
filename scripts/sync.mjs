#!/usr/bin/env node
/**
 * Copy the reviewed images out of .staging into the repos that show them.
 *
 *   node scripts/sync.mjs            # everything that exists in .staging
 *   node scripts/sync.mjs --dry-run  # list what would be copied
 *
 * Targets (BULWARK_WEBSITE and BULWARK_WEBMAIL, see lib/paths.mjs):
 *
 *   website/public/screenshots/   every <theme>-<name>.webp capture (docs pages, press page)
 *   website/public/beauty/        the framed images (press kit)
 *   website/public/press/beauty/  the same, the press kit is a copy
 *   website/public/press/launch/  the launch boards
 *   website/public/press/         og cards, X header, avatars
 *   website/public/og-*.png       the Open Graph cards the site links to
 *   webmail/screenshots/          the five framed images the README embeds
 *   webmail/public/screenshot-*.png  the PWA manifest screenshots
 *   branding/social/              og cards, X header, avatars
 *
 * Nothing is deleted on the target: a capture that was renamed leaves its
 * old file behind, so check `git status` there after a rename.
 */
import fs from "node:fs";
import path from "node:path";
import { BRANDING, WEBMAIL, WEBSITE, SHOTS_DIR, FRAMED_DIR, CARDS_DIR } from "./lib/paths.mjs";

const dry = process.argv.includes("--dry-run");
let copied = 0;

function copyAll(from, to, filter = () => true) {
  if (!fs.existsSync(from)) return;
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    if (!fs.statSync(src).isFile() || !filter(name)) continue;
    const dst = path.join(to, name);
    if (dry) { console.log(`  ${path.relative(BRANDING, src)} -> ${dst}`); continue; }
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
  }
}

const webp = (n) => n.endsWith(".webp");
const png = (n) => n.endsWith(".png");
const noGuides = (n) => !n.includes("-guides");

// Captures: docs and press page.
copyAll(SHOTS_DIR, path.join(WEBSITE, "public", "screenshots"), webp);

// Framed images: press kit and the webmail README.
copyAll(FRAMED_DIR, path.join(WEBSITE, "public", "beauty"), webp);
copyAll(FRAMED_DIR, path.join(WEBSITE, "public", "press", "beauty"), webp);
// The README embeds five of them; the rest would only weigh the repo down.
const README_FRAMES = /^(light|dark)-(laptop-phone|calendar-week|contacts-detail|composer-mention)\.webp$|^split-inbox\.webp$/;
copyAll(FRAMED_DIR, path.join(WEBMAIL, "screenshots"), (n) => README_FRAMES.test(n));

// Cards.
copyAll(CARDS_DIR, path.join(WEBSITE, "public"), (n) => /^og-(full|lite)\.png$/.test(n));
copyAll(CARDS_DIR, path.join(WEBSITE, "public", "press"), (n) => png(n) && noGuides(n));
copyAll(CARDS_DIR, path.join(BRANDING, "social"), png);
copyAll(path.join(CARDS_DIR, "launch"), path.join(WEBSITE, "public", "press", "launch"), png);

// PWA manifest screenshots.
copyAll(path.join(SHOTS_DIR, "pwa"), path.join(WEBMAIL, "public"), png);

console.log(dry ? "dry run, nothing copied" : `${copied} files copied`);
