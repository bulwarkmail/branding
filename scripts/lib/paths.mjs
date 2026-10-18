// Where things are. This repo has no dependencies of its own: Playwright
// comes from the webmail checkout (it ships it for the test suite) and sharp
// from the website checkout (Next.js pulls it in). Both default to the
// layout of the webmail repo, where this repo and the website are nested
// checkouts under repos/; set BULWARK_WEBMAIL and BULWARK_WEBSITE otherwise.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BRANDING = path.resolve(here, "..", "..");
export const WEBMAIL = path.resolve(process.env.BULWARK_WEBMAIL || path.join(BRANDING, "..", ".."));
export const WEBSITE = path.resolve(process.env.BULWARK_WEBSITE || path.join(BRANDING, "..", "website"));

/** Raw captures and rendered images land here; `sync` copies them out. */
export const STAGING = path.resolve(process.env.BULWARK_STAGING || path.join(BRANDING, ".staging"));
export const SHOTS_DIR = path.join(STAGING, "screenshots");
export const FRAMED_DIR = path.join(STAGING, "framed");
export const CARDS_DIR = path.join(STAGING, "cards");

for (const [name, dir, marker] of [
  ["BULWARK_WEBMAIL", WEBMAIL, "node_modules/playwright-core"],
  ["BULWARK_WEBSITE", WEBSITE, "node_modules/sharp"],
]) {
  if (!fs.existsSync(path.join(dir, marker))) {
    console.error(`${name}: ${dir} has no ${marker}. Point it at the right checkout.`);
    process.exit(2);
  }
}

const webmailRequire = createRequire(path.join(WEBMAIL, "package.json"));
const websiteRequire = createRequire(path.join(WEBSITE, "package.json"));

export function loadChromium() {
  return webmailRequire("playwright-core").chromium;
}

export function loadSharp() {
  return websiteRequire("sharp");
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
