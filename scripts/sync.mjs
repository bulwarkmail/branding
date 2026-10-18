#!/usr/bin/env node
/**
 * Copy the reviewed images out of .staging into the repos that show them.
 *
 *   node scripts/sync.mjs            # everything that exists in .staging
 *   node scripts/sync.mjs --dry-run  # list what would be copied
 *
 * Targets (BULWARK_WEBSITE and BULWARK_WEBMAIL, see lib/paths.mjs):
 *
 *   website/public/screenshots/   the captures a website page references (docs, landing, press page)
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

// Captures: only the names some website page references, so the site does
// not carry every capture of every run. A new page that embeds a capture is
// picked up on the next sync.
function referencedCaptures() {
  const names = new Set(["inbox", "composer", "calendar", "files"]); // landing and press page
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== ".next") walk(p); continue; }
      if (!/\.(md|mdx|tsx?|jsx?)$/.test(entry.name)) continue;
      for (const m of fs.readFileSync(p, "utf8").matchAll(/screenshots\/(?:light|dark)-([a-z0-9-]+)\.webp/g)) names.add(m[1]);
      for (const m of fs.readFileSync(p, "utf8").matchAll(/<Shot[^>]*name="([a-z0-9-]+)"/g)) names.add(m[1]);
      for (const m of fs.readFileSync(p, "utf8").matchAll(/name: "([a-z0-9-]+)", title:/g)) names.add(m[1]);
    }
  };
  for (const dir of ["docs", "src"]) if (fs.existsSync(path.join(WEBSITE, dir))) walk(path.join(WEBSITE, dir));
  return names;
}
const referenced = referencedCaptures();
copyAll(SHOTS_DIR, path.join(WEBSITE, "public", "screenshots"), (n) => webp(n) && referenced.has(n.replace(/^(light|dark)-/, "").replace(/\.webp$/, "")));

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
