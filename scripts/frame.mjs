#!/usr/bin/env node
/**
 * Frame the raw captures for the places that show one image on its own: the
 * README, the press kit and social posts. Flat style: a browser window on a
 * plain ground with a 1px edge and no shadow, a laptop-and-phone hero on the
 * raspberry field, and a light/dark split of the inbox.
 *
 *   node scripts/frame.mjs            # every frame from .staging/screenshots
 *   node scripts/frame.mjs inbox pro  # only these window frames
 *
 * Output: .staging/framed/*.webp at 2400x1500 (1600x1000 CSS px at 1.5x),
 * each at most 400 KB (quality steps down until it fits). Everything is drawn
 * in HTML and rendered with headless Chromium; nothing is edited by hand.
 */
import fs from "node:fs";
import path from "node:path";
import { PALETTE, dataUri, loadChromium, renderHtml, writeWebp } from "./lib/render.mjs";
import { SHOTS_DIR, FRAMED_DIR, ensureDir } from "./lib/paths.mjs";

const W = 1600;
const H = 1000;
const SCALE = 1.5;

/** The captures that get a window frame; the laptop-and-phone pair and the split come on top. */
const WINDOW_SHOTS = ["inbox", "viewer", "composer", "composer-mention", "unified-inbox", "invite", "calendar-week", "calendar", "contacts-detail", "files", "pro", "search-palette", "inbox-columns", "login"];

const URLS = {
  inbox: "mail.meridianlabs.example/mail/folder/inbox",
  viewer: "mail.meridianlabs.example/mail/folder/inbox",
  composer: "mail.meridianlabs.example/mail/folder/inbox",
  "composer-mention": "mail.meridianlabs.example/mail/folder/inbox",
  "unified-inbox": "mail.meridianlabs.example/mail/unified/inbox",
  invite: "mail.meridianlabs.example/mail/folder/inbox",
  "calendar-week": "mail.meridianlabs.example/calendar",
  calendar: "mail.meridianlabs.example/calendar",
  "contacts-detail": "mail.meridianlabs.example/contacts",
  files: "mail.meridianlabs.example/files",
  pro: "mail.meridianlabs.example/pro",
  "search-palette": "mail.meridianlabs.example/pro",
  "inbox-columns": "mail.meridianlabs.example/mail/folder/inbox",
  login: "mail.meridianlabs.example/login",
};

// The website's flat tokens: neutral grounds, 1px rules, raspberry as the one field colour.
const FLAT = {
  light: { ground: "#f4f4f5", window: "#ffffff", bar: "#f4f4f5", rule: "#dddde1", dot: "#c9c9ce", url: "#56565d", urlBg: "#ffffff", field: PALETTE.rasp },
  dark: { ground: "#131315", window: "#1f1f22", bar: "#1f1f22", rule: "#36363b", dot: "#4a4a50", url: "#ababb2", urlBg: "#131315", field: "#c4264b" },
};

function winCss(t, cls = ".win") {
  return `${cls} { background: ${t.window}; border: 1px solid ${t.rule}; }
    ${cls} .bar { background: ${t.bar}; border-bottom: 1px solid ${t.rule}; }
    ${cls} .dot { background: ${t.dot}; }
    ${cls} .url { color: ${t.url}; background: ${t.urlBg}; border: 1px solid ${t.rule}; }`;
}

function shell(theme, body, { ground, extraCss = "" } = {}) {
  const t = FLAT[theme];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body { background: ${ground ?? t.ground}; font-family: system-ui, sans-serif; position: relative; }
    .win { position: absolute; border-radius: 4px; overflow: hidden; }
    .bar { height: 38px; display: flex; align-items: center; gap: 7px; padding: 0 14px; box-sizing: border-box; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .url { margin-left: 14px; flex: 1; max-width: 460px; height: 22px; border-radius: 2px; display: flex; align-items: center; padding: 0 10px;
      font: 500 11.5px ui-monospace, "JetBrains Mono", Consolas, Menlo, monospace; letter-spacing: 0.01em; box-sizing: border-box; }
    .win img { display: block; width: 100%; height: auto; }
    .phone { position: absolute; border-radius: 44px; background: #0b0b0c; padding: 11px; box-sizing: border-box; }
    .phone .screen { border-radius: 34px; overflow: hidden; }
    .phone img { display: block; width: 100%; height: auto; }
    ${winCss(t)}
    ${extraCss}
  </style></head><body>${body}</body></html>`;
}

function browserWindow({ src, url, left, top, width, cls = "win" }) {
  return `<div class="${cls}" style="left:${left}px;top:${top}px;width:${width}px">
    <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">${url}</span></div>
    <img src="${src}" alt="">
  </div>`;
}

function capture(theme, name) {
  const p = path.join(SHOTS_DIR, `${theme}-${name}.webp`);
  return fs.existsSync(p) ? p : null;
}

async function main() {
  const only = process.argv.slice(2);
  const shots = only.length ? only : WINDOW_SHOTS;
  ensureDir(FRAMED_DIR);
  const browser = await loadChromium().launch();
  const written = [];
  const missing = [];
  const save = async (html, name) => {
    const png = await renderHtml(browser, { html, width: W, height: H, scale: SCALE });
    const out = path.join(FRAMED_DIR, `${name}.webp`);
    const r = await writeWebp(png, out);
    written.push(`${path.basename(out)} ${(r.bytes / 1024).toFixed(0)}KB q${r.quality}`);
  };

  for (const theme of ["light", "dark"]) {
    for (const name of shots) {
      const shot = capture(theme, name);
      if (!shot) { missing.push(`${theme}-${name}`); continue; }
      const width = 1440;
      await save(shell(theme, browserWindow({ src: dataUri(shot), url: URLS[name] ?? "mail.meridianlabs.example", left: (W - width) / 2, top: 80, width })), `${theme}-${name}`);
    }

    // Hero: the desktop runs off the bottom edge of the raspberry field; the
    // phone stands on the field to its right, rising above the window and
    // overlapping only its corner.
    const laptop = capture(theme, "inbox");
    const phone = capture(theme, "phone-message") || capture(theme, "phone-inbox");
    if (laptop && phone && (!only.length || only.includes("laptop-phone"))) {
      const t = FLAT[theme];
      const body = `
        ${browserWindow({ src: dataUri(laptop), url: URLS.inbox, left: 72, top: 228, width: 1320 })}
        <div class="phone" style="right:40px;top:150px;width:330px">
          <div class="screen"><img src="${dataUri(phone)}" alt=""></div>
        </div>`;
      const css = `.win { border-color: rgba(0,0,0,0.28); }
        .phone { background: #111113; padding: 9px; border-radius: 46px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16), 0 0 0 1px rgba(0,0,0,0.35), 0 36px 70px -28px rgba(40,0,12,0.55); }
        .phone .screen { border-radius: 38px; }`;
      await save(shell(theme, body, { ground: t.field, extraCss: css }), `${theme}-laptop-phone`);
    } else if (!only.length) {
      missing.push(`${theme}-laptop-phone (needs inbox + phone-message)`);
    }
  }

  // Light/dark split of the inbox, divided by a raspberry rule.
  const light = capture("light", "inbox");
  const dark = capture("dark", "inbox");
  if (light && dark && (!only.length || only.includes("split-inbox"))) {
    const width = 1440;
    const left = (W - width) / 2;
    const body = `
      <div style="position:absolute;inset:0;background:${FLAT.dark.ground};clip-path:polygon(58% 0, 100% 0, 100% 100%, 42% 100%)"></div>
      ${browserWindow({ src: dataUri(light), url: URLS.inbox, left, top: 80, width })}
      <div style="position:absolute;inset:0;clip-path:polygon(58% 0, 100% 0, 100% 100%, 42% 100%)">
        ${browserWindow({ src: dataUri(dark), url: URLS.inbox, left, top: 80, width, cls: "win win-dark" })}
      </div>
      <div style="position:absolute;top:0;bottom:0;left:58%;width:3px;background:${PALETTE.rasp};transform:skewX(-${Math.atan((0.16 * W) / H) * (180 / Math.PI)}deg);transform-origin:top"></div>`;
    await save(shell("light", body, { extraCss: winCss(FLAT.dark, ".win-dark") }), "split-inbox");
  } else if (!only.length) {
    missing.push("split-inbox (needs light + dark inbox)");
  }

  await browser.close();
  for (const w of written) console.log("  +", w);
  if (missing.length) console.log("missing captures:", missing.join(", "));
  console.log(`output: ${FRAMED_DIR}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
