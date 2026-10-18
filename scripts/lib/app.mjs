// Driving the webmail with Playwright: a browser context in a theme and a
// size, the demo sign-in, a pinned clock, in-app navigation and the capture
// itself. The flows in shoot.mjs compose these.
import fs from "node:fs";
import path from "node:path";
import { loadChromium, loadSharp, SHOTS_DIR, ensureDir } from "./paths.mjs";

export const BASE = process.env.SHOOT_BASE || "http://localhost:3100";

// The app lays out at a laptop width and renders at 4x: 1280x720 becomes a
// 5120x2880 file with the UI at a readable size. Do not raise the viewport to
// the output size at scale 1: the app would lay out for a huge monitor and
// every control would look tiny.
export const DESKTOP = { width: Number(process.env.SHOOT_WIDTH || 1280), height: Number(process.env.SHOOT_HEIGHT || 720), scale: Number(process.env.SHOOT_SCALE || 4) };
export const PHONE = { width: 390, height: 844, scale: 3, mobile: true };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The clock every capture runs at: the next Tuesday at 09:41 local, or
 * SHOOT_CLOCK (an ISO local time). The demo fixtures float with the clock, so
 * pinning it makes the light and the dark run show the same mail at the same
 * times, and keeps "today" a weekday.
 */
export function pinnedClock() {
  if (process.env.SHOOT_CLOCK) return new Date(process.env.SHOOT_CLOCK);
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
  d.setHours(9, 41, 0, 0);
  return d;
}

// What belongs to the dev server or to demo mode, not to a real install: the
// Next.js overlay and the demo badge in the sidebar.
export const HIDE_DEV_CHROME = `
  nextjs-portal, [data-nextjs-toast] { display: none !important; }
  [data-tour="demo-banner"] { display: none !important; }
`;

export async function launchBrowser() {
  return loadChromium().launch();
}

/**
 * A context in one theme at one size. `settings` seeds the app's persisted
 * settings before any app code runs (the store is zustand-persist v8), so a
 * flow can start with, say, the column list on.
 */
export async function newContext(browser, { theme, size = DESKTOP, settings = null, storage = {} }) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    isMobile: !!size.mobile,
    hasTouch: !!size.mobile,
    colorScheme: theme,
    reducedMotion: "reduce",
    // Without this the app follows the machine and renders in German.
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    timezoneId: process.env.SHOOT_TZ || "Europe/Berlin",
  });
  await ctx.addInitScript(({ theme, settings, storage }) => {
    try {
      localStorage.setItem("theme", theme);
      localStorage.setItem("theme-storage", JSON.stringify({ state: { theme }, version: 0 }));
      for (const k of ["bulwark-tour-completed", "tour-completed", "onboarding-completed", "welcome-dismissed", "pwa-install-dismissed", "pwa-prompt-dismissed"]) {
        localStorage.setItem(k, "true");
      }
      // No simulated incoming mail while we shoot.
      localStorage.setItem("bulwark-demo-simulate", "off");
      if (settings) localStorage.setItem("settings-storage", JSON.stringify({ state: settings, version: 8 }));
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
    } catch {}
  }, { theme, settings, storage });
  return ctx;
}

export class Session {
  constructor(page, theme, { out = SHOTS_DIR, label = "" } = {}) {
    this.page = page;
    this.theme = theme;
    this.out = ensureDir(out);
    this.label = label;
    this.misses = [];
    this.errors = [];
    this.written = [];
    page.on("pageerror", (e) => this.errors.push(String(e).slice(0, 200)));
  }

  log(msg) { console.log(`  ${msg}`); }

  async signIn() {
    const { page } = this;
    await page.clock.setFixedTime(pinnedClock());
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    // Demo mode: "Launch Demo". A credential form: "Sign in" (type="button").
    await page.locator('button:has-text("Launch Demo"), button:has-text("Sign in"), button[type="submit"]').first().click({ timeout: 30000 });
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 90000 }).catch(() => {});
    await sleep(8000);
    await this.tryClick('button:has-text("Got it")', 2500);
  }

  async tryClick(sel, ms = 5000) {
    try {
      const l = this.page.locator(sel).first();
      await l.waitFor({ state: "visible", timeout: ms });
      await l.click({ timeout: ms });
      await sleep(800);
      return true;
    } catch {
      return false;
    }
  }

  /** Like tryClick, but a miss is worth knowing: the next shot would repeat the last view. */
  async mustClick(sel, why, ms = 8000) {
    const ok = await this.tryClick(sel, ms);
    if (!ok) {
      this.log(`! no match for ${sel} (${why})`);
      this.misses.push(`${why}: ${sel}`);
    }
    return ok;
  }

  /** The app rail. Full page loads drop the demo session, so navigate in-app only. */
  async rail(name, wait = 6000) {
    const ok = await this.tryClick(`[data-tour="nav-${name}"], [aria-label="${cap(name)}"], a[href$="/${name}"]`, 6000);
    if (!ok) { this.log(`? ${name} is not on the rail`); this.misses.push(`rail ${name}`); return false; }
    await sleep(wait);
    await this.tryClick('button:has-text("Got it")', 1500);
    return true;
  }

  /** Full-text search in the mail list; the fixture subjects are the targets. */
  async search(query) {
    await this.mustClick('input[placeholder*="Search mail" i]', "search field");
    await this.page.keyboard.press("Control+A");
    await this.page.keyboard.type(query, { delay: 10 });
    await this.page.keyboard.press("Enter");
    await sleep(2500);
  }

  async clearSearch() {
    await this.tryClick('input[placeholder*="Search mail" i]', 3000);
    await this.page.keyboard.press("Control+A");
    await this.page.keyboard.press("Backspace");
    await this.page.keyboard.press("Escape");
    await sleep(1200);
  }

  /** Search for a message and open it. */
  async open(query, rowText, why = rowText) {
    await this.search(query);
    const ok = await this.mustClick(`text=${rowText}`, why);
    await sleep(3000);
    return ok;
  }

  /** Scroll the message list back to its top (opening a row can scroll it). */
  async scrollListTop() {
    await this.page.evaluate(() => {
      for (const el of document.querySelectorAll("*")) {
        const st = getComputedStyle(el);
        if ((st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollTop > 0 && el.querySelector('[data-thread-row], [role="row"], [role="listitem"], [data-email-id]')) el.scrollTop = 0;
      }
    }).catch(() => {});
    await sleep(600);
  }

  /** The body iframe of the open message. */
  bodyFrame() {
    return this.page.frames().find((f) => f !== this.page.mainFrame() && f.url() !== "about:blank") ?? this.page.frames().find((f) => f !== this.page.mainFrame());
  }

  /** Refuse to save a shot that is really a bounced login page. */
  async onApp(name) {
    if (this.page.url().includes("/login")) { this.misses.push(`${name} (login bounce)`); return false; }
    const bounced = await this.page.locator('button:has-text("Launch Demo"), text=Your session has expired').count().catch(() => 0);
    if (bounced) { this.misses.push(`${name} (login bounce)`); return false; }
    return true;
  }

  /**
   * Save `<theme>-<name>.webp` (and the PNG with SHOOT_PNG=1). The cursor is
   * parked top-right so no list row shows its hover actions.
   */
  async shoot(name, { png = process.env.SHOOT_PNG === "1", quality = 82, moveMouse = true } = {}) {
    if (!(await this.onApp(name))) { this.log(`x ${name} bounced to login`); return null; }
    await this.page.addStyleTag({ content: HIDE_DEV_CHROME }).catch(() => {});
    if (moveMouse) await this.page.mouse.move(this.page.viewportSize().width - 6, 6);
    await sleep(900);
    const stem = this.theme ? `${this.theme}-${name}` : name;
    const buffer = await this.page.screenshot({ type: "png" });
    const webp = path.join(this.out, `${stem}.webp`);
    await loadSharp()(buffer).webp({ quality, effort: 6 }).toFile(webp);
    if (png) fs.writeFileSync(path.join(this.out, `${stem}.png`), buffer);
    this.written.push(stem);
    this.log(`+ ${stem}.webp`);
    return webp;
  }

  /** A PNG at the exact viewport size (PWA manifest screenshots). */
  async shootPng(file) {
    await this.page.addStyleTag({ content: HIDE_DEV_CHROME }).catch(() => {});
    await this.page.mouse.move(this.page.viewportSize().width - 6, 6);
    await sleep(900);
    ensureDir(path.dirname(file));
    await this.page.screenshot({ type: "png", path: file });
    this.log(`+ ${path.basename(file)}`);
  }

  /** Close an open composer, discarding the draft if it asks. */
  async closeComposer() {
    for (let i = 0; i < 4; i++) {
      const discard = this.page.locator('button:has-text("Discard")').last();
      if (await discard.isVisible().catch(() => false)) { await discard.click({ timeout: 4000 }).catch(() => {}); await sleep(1200); }
      if (!(await this.page.locator('text=New Message').first().isVisible().catch(() => false))) break;
      await this.page.keyboard.press("Escape");
      await sleep(1200);
    }
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
