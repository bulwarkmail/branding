// Driving the webmail with Playwright: a browser context in a theme and a
// size, the demo sign-in, a pinned clock, in-app navigation and the capture
// itself. The flows in shoot.mjs compose these.
import fs from "node:fs";
import path from "node:path";
import { loadChromium, loadSharp, SHOTS_DIR, ensureDir } from "./paths.mjs";
import { AdminApi, OFFICE_IP } from "./instance.mjs";

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
  // --lang: native date and time inputs follow it, not the context locale.
  return loadChromium().launch({ args: ["--lang=en-US"] });
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
    timezoneId: process.env.SHOOT_TZ || "Europe/Berlin",
    // The admin audit log records this address (lib/instance.mjs OFFICE_IP).
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9", "X-Forwarded-For": OFFICE_IP },
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

/**
 * The admin session shoot-all.mjs signed in (SHOOT_ADMIN_COOKIE_FILE), or a
 * new one with SHOOT_ADMIN_PASSWORD. One session for the whole run: the
 * admin login allows five tries per 15 minutes.
 */
let adminSession = null;
export async function adminApi() {
  if (adminSession) return adminSession;
  const file = process.env.SHOOT_ADMIN_COOKIE_FILE;
  if (!file && !process.env.SHOOT_ADMIN_PASSWORD) return null;
  adminSession = await new AdminApi(BASE, file || path.join(SHOTS_DIR, "..", "admin-cookie.txt")).signIn().catch((e) => { console.log(`  ! ${e.message}`); return null; });
  return adminSession;
}

/**
 * Put the admin session into a browser context before anything loads, as
 * if the admin had signed in to the console in this browser first. The demo
 * then gets the whole organisation policy and the admin's plugins.
 */
export async function withAdmin(ctx, host = new URL(BASE).hostname) {
  const api = await adminApi();
  if (!api) return false;
  await ctx.addCookies(api.browserCookies(host));
  return true;
}

export class Session {
  constructor(page, theme, { out = SHOTS_DIR, label = "", base = BASE } = {}) {
    this.page = page;
    this.base = base;
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
    await page.goto(`${this.base}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('button:has-text("Launch Demo"), button:has-text("Sign in")').first().waitFor({ state: "visible", timeout: 120000 }).catch(() => {});
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
    // The rail's own marker first; the others are for layouts without it (the phone).
    const ok = (await this.tryClick(`[data-tour="nav-${name}"]:visible`, 6000)) || (await this.tryClick(`[aria-label="${cap(name)}"]:visible, a[href$="/${name}"]:visible`, 3000));
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
  async shoot(name, { png = process.env.SHOOT_PNG === "1", quality = 82, moveMouse = true, allowLogin = false } = {}) {
    if (!allowLogin && !(await this.onApp(name))) { this.log(`x ${name} bounced to login`); return null; }
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

  /** Recipient and subject of an open composer. */
  async fillComposer({ to, subject }) {
    const toField = this.page.locator('input[placeholder*="Recipient" i], input[placeholder*="To" i], input[name="to"]').first();
    if (to && (await toField.count())) {
      await toField.click().catch(() => {});
      await this.page.keyboard.type(to, { delay: 15 });
      await this.page.keyboard.press("Enter");
      await sleep(500);
      await this.page.keyboard.press("Tab");
    } else if (to) this.misses.push("composer recipient field");
    const subjectField = this.page.locator('input[placeholder*="Subject" i], input[name="subject"]').first();
    if (subject && (await subjectField.count())) {
      await subjectField.click({ force: true }).catch(() => {});
      await this.page.keyboard.type(subject, { delay: 15 });
    } else if (subject) this.misses.push("composer subject field");
  }

  /** Type into the composer body, at its start (above a quote or signature). */
  async typeBody(text) {
    const body = this.page.locator(".ProseMirror").first();
    if (!(await body.count())) { this.misses.push("composer editor"); return; }
    await body.click({ position: { x: 40, y: 12 } }).catch(() => {});
    await this.page.keyboard.press("Control+Home");
    await this.page.keyboard.type(text, { delay: 3 });
    await sleep(600);
  }

  /** Add an address to the composer's Cc row (opening the row first). */
  async addCc(address) {
    await this.tryClick('button:visible:text-is("Cc")', 3000);
    const cc = this.page.locator('input[placeholder*="Cc" i], input[name="cc"], input[aria-label*="Cc" i]').first();
    if (!(await cc.count())) { this.misses.push("Cc field"); return; }
    await cc.click().catch(() => {});
    await this.page.keyboard.type(address, { delay: 12 });
    await this.page.keyboard.press("Enter");
    await sleep(600);
  }

  /** The own Inbox: the first "Inbox" in the sidebar. */
  async ownInbox() {
    const ok = await this.mustClick('[data-tour="sidebar"] >> text=/^Inbox$/', "own inbox");
    await sleep(2500);
    return ok;
  }

  /** The Support group's Inbox: expand Shared and Support, then the second "Inbox". */
  async openSupportInbox() {
    const sidebar = '[data-tour="sidebar"]';
    const inboxes = this.page.locator(`${sidebar} >> text=/^Inbox$/`);
    if ((await inboxes.count()) < 2) {
      await this.tryClick(`${sidebar} >> text=/^Shared$/`, 3000);
      await sleep(500);
      if ((await inboxes.count()) < 2) await this.tryClick(`${sidebar} >> text=/^Support$/`, 3000);
      await sleep(800);
    }
    const ok = await inboxes.nth(1).click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!ok) { this.misses.push("Support inbox"); return false; }
    await sleep(3000);
    return true;
  }

  /** Settings from the rail, waiting for its page list. */
  async openSettings() {
    if (!(await this.rail("settings", 3000))) return false;
    const ok = await this.page.getByRole("button", { name: "Appearance", exact: true }).or(this.page.getByRole("link", { name: "Appearance", exact: true })).first()
      .waitFor({ state: "visible", timeout: 60000 }).then(() => true).catch(() => false);
    if (!ok) this.misses.push("settings pages");
    await sleep(1500);
    return ok;
  }

  /**
   * One settings page by its name in the list. The pane keeps the previous
   * page's scroll position, so scroll it back to the top.
   */
  async settingsPage(label) {
    // Inside the settings list: the rail has a Notifications button too.
    const list = this.page.locator('nav[aria-label="Settings"]');
    const nav = list.getByRole("button", { name: label, exact: true }).or(list.getByRole("link", { name: label, exact: true })).first();
    const ok = await nav.click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!ok) { this.log(`! no settings page ${label}`); this.misses.push(`settings page ${label}`); return false; }
    await sleep(2000);
    await this.scrollToTop();
    return true;
  }

  async scrollToTop() {
    await this.page.evaluate(() => {
      for (const el of document.querySelectorAll("main, main *")) if (el.scrollTop > 0) el.scrollTop = 0;
      window.scrollTo(0, 0);
    }).catch(() => {});
    await sleep(800);
  }

  /** Scroll a settings or admin section (SettingsSection id) to the top of the pane. */
  async scrollToSection(id, why = id) {
    const ok = await this.page.evaluate((id) => {
      const el = document.querySelector(`[data-settings-section="${id}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: "start" });
      return true;
    }, id).catch(() => false);
    if (!ok) { this.log(`! no section ${id}`); this.misses.push(`section ${why}`); }
    await sleep(1000);
    return ok;
  }

  /** The settings sidebar's "Show advanced settings" switch. */
  async showAdvanced() {
    const sw = this.page.locator('[data-testid="settings-advanced-switch"]').first();
    if (!(await sw.count())) { this.misses.push("advanced settings switch"); return; }
    if ((await sw.getAttribute("aria-checked")) !== "true") { await sw.click().catch(() => this.misses.push("advanced settings switch")); await sleep(1000); }
  }

  /** Turn on an admin-installed plugin the admin didn't force on (Settings > Add-ons). */
  async enablePlugin(name) {
    if (!(await this.openSettings()) || !(await this.settingsPage("Add-ons"))) return false;
    const sw = this.page.locator(`[role="switch"][aria-label="Turn ${name} on or off"]`).first();
    const ok = await sw.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
    if (!ok) { this.misses.push(`plugin ${name} in Add-ons`); await this.backToMail(); return false; }
    if ((await sw.getAttribute("aria-checked")) !== "true") { await sw.click(); await sleep(3000); }
    await this.backToMail();
    return true;
  }

  /** From settings back to mail, by the rail. */
  async backToMail() {
    await this.rail("mail", 3000);
  }

  /** The calendar's week view, scrolled to the working day. */
  async weekView() {
    await this.mustClick('[data-testid="calendar-view-menu"]', "calendar view menu");
    await this.mustClick('[role="menuitemradio"]:has-text("Week")', "week view");
    await sleep(2000);
    await this.tryClick('button:has-text("Today")', 3000);
    await sleep(1500);
    await this.page.locator("text=/^07:00$/").first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
    await sleep(1200);
  }

  /** An admin console page from its sidebar. */
  async adminPage(id) {
    const ok = await this.mustClick(`[data-testid="admin-page-${id}"]`, `admin page ${id}`);
    await sleep(3500);
    await this.scrollToTop();
    return ok;
  }

  /** A section chip at the top of an admin page (it scrolls to the section). */
  async adminSection(title) {
    const ok = await this.mustClick(`main button:text-is("${title}")`, `admin section ${title}`, 5000);
    await sleep(1500);
    return ok;
  }

  /** Close an open composer, discarding the draft if it asks. */
  async closeComposer() {
    const editor = this.page.locator(".ProseMirror").first();
    for (let i = 0; i < 5; i++) {
      // A question on top (send confirmation, discard draft?) first.
      const dialog = this.page.locator('[role="alertdialog"]:visible, [role="dialog"]:visible').last();
      if (await dialog.count()) {
        // In this order: a comma list would match in page order, and Cancel comes first there.
        let answered = false;
        for (const label of ["Discard", "Back", "Cancel"]) {
          const answer = dialog.locator(`button:text-is("${label}")`).first();
          if (await answer.count()) { await answer.click({ timeout: 4000 }).catch(() => {}); await sleep(1000); answered = true; break; }
        }
        if (answered) continue;
      }
      if (!(await editor.isVisible().catch(() => false))) return;
      const discard = this.page.locator('button:visible:text-is("Discard")').last();
      if (await discard.count()) { await discard.click({ timeout: 4000 }).catch(() => {}); await sleep(1200); continue; }
      await this.page.keyboard.press("Escape");
      await sleep(1200);
    }
    if (await editor.isVisible().catch(() => false)) this.misses.push("composer did not close");
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
