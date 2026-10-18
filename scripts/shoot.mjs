#!/usr/bin/env node
/**
 * Capture the product screenshots from a running demo instance.
 *
 *   node scripts/shoot.mjs                      # every flow, light and dark
 *   node scripts/shoot.mjs --theme dark         # one theme
 *   node scripts/shoot.mjs --flow mail,calendar # some flows (see FLOWS)
 *   node scripts/shoot.mjs --only inbox,viewer  # some shots inside the flows
 *
 * Needs the webmail dev server in demo mode (README.md has the command),
 * reachable at SHOOT_BASE (default http://localhost:3100). Captures land in
 * .staging/screenshots as <theme>-<name>.webp, 5120x2880 (1280x720 at 4x);
 * SHOOT_PNG=1 keeps the PNG too. Review them, then `node scripts/sync.mjs`.
 *
 * Every flow signs in once and navigates in-app: a full page load drops the
 * demo session. The clock is pinned (lib/app.mjs pinnedClock) so both themes
 * show the same mail at the same times. Click targets are fixture subjects
 * from the webmail's lib/demo/fixtures; a miss is reported and the run exits
 * non-zero, because a missed click leaves the previous view in the next shot.
 *
 * Flows that need another server instance read their own base URL and are
 * skipped when it is unset: SHOOT_LOGIN_BASE (credential login page),
 * SHOOT_SETUP_BASE + SHOOT_SETUP_TOKEN (setup wizard), SHOOT_ADMIN_PASSWORD
 * (admin console on the demo instance).
 */
import path from "node:path";
import { BASE, DESKTOP, PHONE, Session, launchBrowser, newContext, sleep } from "./lib/app.mjs";
import { SHOTS_DIR, ensureDir } from "./lib/paths.mjs";

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const THEMES = (arg("theme") || "all") === "all" ? ["light", "dark"] : [arg("theme")];
const ONLY = arg("only") ? new Set(arg("only").split(",")) : null;
const FLOW_FILTER = arg("flow") ? new Set(arg("flow").split(",")) : null;

const want = (name) => !ONLY || ONLY.has(name);

// Fixture anchors (lib/demo/fixtures/emails.ts and friends in the webmail).
const F = {
  invoice: { query: "Invoice 2026-089", row: "Invoice 2026-089" },
  rollbackThread: { query: "Rollback plan", row: "Re: Rollback plan for the Beacon launch" },
  rollbackAlice: { query: "Michael wants a written", row: "Rollback plan for the Beacon launch" },
  invite: { query: "go / no-go review", row: "Invitation: Beacon go" },
  launchPlan: { query: "launch plan v3", row: "Beacon launch plan v3" },
  newsletter: { query: "TechDigest", row: "Issue #231" },
  booking: { query: "Tejo Vista", row: "Hotel Tejo Vista" },
  soak: { query: "Soak test passed", row: "Soak test passed" },
  phishing: "mailbox password expires",
  support: "Beacon add-on: can we go to 100",
  contact: "Alice Johnson",
  pdf: "quarterly-report.pdf",
};

// ── Mail, calendar, contacts, files, settings, Pro: one signed-in session ──
async function desktop(browser, theme) {
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] desktop ${DESKTOP.width}x${DESKTOP.height}@${DESKTOP.scale}`);
  await s.signIn();

  // Inbox with a message open: with nothing selected, demo mode shows a splash.
  if (want("inbox")) {
    await s.mustClick(`text=${F.invoice.row}`, "message with attachments");
    await sleep(3500);
    await s.scrollListTop();
    await s.shoot("inbox");
  }

  // A conversation: the thread rows under the list item, the reply in the pane.
  if (want("viewer")) {
    await s.open(F.rollbackThread.query, F.rollbackThread.row, "threaded conversation");
    await s.shoot("viewer");
  }

  // @mentions in a received mail: the card opens on click.
  if (want("mention-card")) {
    await s.open(F.rollbackAlice.query, F.rollbackAlice.row, "mail with @mentions");
    const link = s.bodyFrame()?.locator('a[href^="mailto:"]:has-text("@Bob")').first();
    if (link && (await link.count().catch(() => 0))) { await link.click().catch(() => {}); await sleep(1500); }
    else s.misses.push("mention link in body");
    await s.shoot("mention-card");
    await s.page.keyboard.press("Escape");
  }

  // Banners: the invitation, the read receipt, unsubscribe, blocked remote content.
  if (want("invite")) { await s.open(F.invite.query, F.invite.row, "calendar invitation"); await s.shoot("invite"); }
  if (want("read-receipt")) { await s.open(F.launchPlan.query, F.launchPlan.row, "read receipt request"); await s.shoot("read-receipt"); }
  if (want("unsubscribe")) { await s.open(F.newsletter.query, F.newsletter.row, "newsletter with List-Unsubscribe"); await s.shoot("unsubscribe"); }
  if (want("external-content")) { await s.open(F.booking.query, F.booking.row, "mail with remote images"); await s.shoot("external-content"); }
  if (want("attachments")) {
    await s.open(F.soak.query, F.soak.row, "mail with image and spreadsheet");
    await s.shoot("attachments");
    // The image attachment opens in the preview.
    if (await s.tryClick('button:has-text("beacon-soak-dashboard.png"), text=beacon-soak-dashboard.png', 4000)) {
      await sleep(3500);
      await s.shoot("attachment-preview");
      await s.page.keyboard.press("Escape");
      await sleep(800);
    }
  }
  await s.clearSearch();

  // Search results and the filter chips.
  if (want("search")) {
    await s.search("Beacon");
    await s.shoot("search");
    if (await s.tryClick('button[aria-label*="filter" i], button[title*="filter" i], button[aria-label*="Advanced" i]', 3000)) {
      await sleep(1500);
      await s.shoot("search-filters");
      await s.page.keyboard.press("Escape");
    }
    await s.clearSearch();
  }

  // Composer: a reply to Bob with an @mention chip and its card.
  if (want("composer")) {
    await s.mustClick('[data-tour="compose-button"]', "compose button");
    await sleep(3000);
    const to = s.page.locator('input[placeholder*="Recipient" i], input[placeholder*="To" i], input[name="to"]').first();
    if (await to.count()) {
      await to.click().catch(() => {});
      await s.page.keyboard.type("bob.chen@meridianlabs.example", { delay: 15 });
      await s.page.keyboard.press("Enter");
      await sleep(500);
      await s.page.keyboard.press("Tab");
    }
    const subject = s.page.locator('input[placeholder*="Subject" i], input[name="subject"]').first();
    if (await subject.count()) {
      await subject.click({ force: true }).catch(() => {});
      await s.page.keyboard.type("Rollback runbook: your two comments", { delay: 15 });
    }
    const body = s.page.locator(".ProseMirror").first();
    if (!(await body.count())) s.misses.push("composer editor");
    else {
      // The first paragraph, not the signature island further down.
      await s.page.locator(".ProseMirror > p").first().click().catch(() => body.click());
      await s.page.keyboard.type("Hi Bob,\n\nBoth in. Step 3 now names Ahmed as the dashboard owner, and the signing-key question is gone.\n\n", { delay: 3 });
      await s.page.keyboard.type("@Bo", { delay: 60 });
      await sleep(1200);
      const picked = await s.tryClick('[role="option"]:has-text("Bob"), [data-mention-suggestion]:has-text("Bob"), li:has-text("Bob Chen")', 2500);
      if (!picked) await s.page.keyboard.press("Enter");
      await sleep(600);
      await s.page.keyboard.type(" can you sign off before the review so Alice can send it with the agenda?\n\nNora", { delay: 3 });
      await sleep(800);
      await s.shoot("composer");
      // Hover the chip for its card.
      const chip = s.page.locator('.ProseMirror [data-mention], .ProseMirror a[href^="mailto:"]').first();
      if (await chip.count()) {
        await chip.hover().catch(() => {});
        await sleep(1500);
        await s.shoot("composer-mention", { moveMouse: false });
      } else s.misses.push("mention chip in composer");
      // Templates menu.
      if (await s.tryClick('button:has-text("Templates")', 3000)) {
        await sleep(1200);
        await s.shoot("templates");
        await s.page.keyboard.press("Escape");
        await sleep(500);
      }
    }
    await s.closeComposer();
  }

  // Folders and views in the sidebar.
  if (want("unified-inbox")) {
    if (await s.mustClick('[data-tour="sidebar"] >> text=Unified Inbox', "merged inbox")) {
      await sleep(3000);
      await s.mustClick(`text=${F.support}`, "message from the shared mailbox in the merged list");
      await sleep(3000);
      await s.shoot("unified-inbox");
    }
  }
  if (want("shared-mailbox")) {
    await s.tryClick('[data-tour="sidebar"] >> text=Shared', 3000);
    await sleep(600);
    if (await s.mustClick('[data-tour="sidebar"] >> text=Support', "shared Support mailbox")) {
      await sleep(2500);
      await s.mustClick(`text=${F.support}`, "support request");
      await sleep(2500);
      await s.shoot("shared-mailbox");
    }
  }
  if (want("account-switcher")) {
    if (await s.mustClick('button:has-text("Nora Lindqvist")', "account switcher")) {
      await sleep(1200);
      await s.shoot("account-switcher");
      await s.page.keyboard.press("Escape");
      await sleep(600);
    }
  }
  if (want("tag")) {
    // Back to the own inbox first: after the shared mailbox the list scope differs.
    await s.tryClick('[data-tour="sidebar"] >> text=/^Inbox$/', 3000);
    await sleep(1500);
    await s.page.locator('[data-tour="sidebar"]').first().evaluate((el) => { const sc = el.querySelector('[class*="overflow-y"]') || el; sc.scrollTop = sc.scrollHeight; }).catch(() => {});
    await sleep(600);
    if (await s.mustClick('[data-tour="keyword-tags"] >> text=/^Travel$/', "Travel tag")) {
      await sleep(3000);
      await s.mustClick(`text=${F.booking.row}`, "tagged travel mail");
      await sleep(2500);
      await s.shoot("tag");
    }
  }
  if (want("sender-check")) {
    if (await s.mustClick('[data-tour="sidebar"] >> text=/^Spam$/', "Spam folder")) {
      await sleep(2500);
      await s.mustClick(`text=${F.phishing}`, "phishing mail");
      await sleep(3000);
      await s.shoot("sender-check");
    }
  }
  if (want("scheduled")) {
    if (await s.mustClick('[data-tour="sidebar"] >> text=/^Scheduled$/', "Scheduled folder")) {
      await sleep(2500);
      await s.tryClick("text=Go/no-go prep", 3000);
      await sleep(2500);
      await s.shoot("scheduled");
    }
  }
  await s.mustClick('[data-tour="sidebar"] >> text=/^Inbox$/', "back to the inbox");
  await sleep(2500);

  if (want("shortcuts")) {
    await s.page.keyboard.press("Shift+?");
    await sleep(1500);
    if (await s.page.locator('text=/Keyboard shortcuts/i').first().isVisible().catch(() => false)) await s.shoot("shortcuts");
    else s.misses.push("shortcuts overlay");
    await s.page.keyboard.press("Escape");
    await sleep(600);
  }

  // Calendar
  if (await s.rail("calendar")) {
    if (want("calendar")) await s.shoot("calendar");
    await s.mustClick('[data-testid="calendar-view-menu"]', "calendar view menu");
    await s.mustClick('[role="menuitemradio"]:has-text("Week")', "week view");
    await sleep(2000);
    await s.tryClick('button:has-text("Today")', 3000);
    await sleep(1500);
    await s.page.locator("text=/^07:00$/").first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
    await sleep(1200);
    if (want("calendar-week")) await s.shoot("calendar-week");
    if (want("calendar-event")) {
      if (await s.tryClick('[data-calendar-event]:has-text("go / no-go")', 4000)) {
        await sleep(1500);
        await s.shoot("calendar-event");
        await s.page.keyboard.press("Escape");
        await sleep(600);
      } else s.misses.push("go/no-go event in the week view");
    }
    if (want("calendar-create")) {
      if (await s.mustClick('button[aria-label="Create event"]', "create event button")) {
        await sleep(2500);
        await s.shoot("calendar-create");
        await s.page.keyboard.press("Escape");
        await sleep(800);
      }
    }
    if (want("tasks")) {
      if (await s.mustClick("text=/^Tasks$/", "tasks entry")) {
        await sleep(2000);
        await s.shoot("tasks");
      }
    }
  }

  // Contacts
  if (await s.rail("contacts")) {
    await s.mustClick(`text=${F.contact}`, "contact with activity");
    await sleep(3000);
    if (want("contacts-detail")) await s.shoot("contacts-detail");
    if (want("contact-group")) {
      if (await s.mustClick("text=Beacon team", "contact group")) {
        await sleep(2000);
        await s.shoot("contact-group");
      }
    }
  }

  // Files
  if (await s.rail("files")) {
    if (want("files")) await s.shoot("files");
    await s.page.locator("text=Documents").first().dblclick({ timeout: 6000 }).catch(() => s.misses.push("Documents folder"));
    await sleep(2500);
    if (want("files-documents")) await s.shoot("files-documents");
    if (want("files-grid")) {
      if (await s.tryClick('button[aria-label*="grid" i], button[title*="grid" i]', 3000)) {
        await sleep(1500);
        await s.shoot("files-grid");
        await s.tryClick('button[aria-label*="list" i], button[title*="list" i]', 3000);
      }
    }
    if (want("file-preview")) {
      if (await s.mustClick(`text=${F.pdf}`, "PDF in Documents")) {
        await sleep(4500);
        await s.shoot("file-preview");
        await s.page.keyboard.press("Escape");
        await sleep(800);
      }
    }
  }

  // Settings
  if (await s.rail("settings", 8000)) {
    await s.page.locator('button:has-text("Appearance"), a:has-text("Appearance")').first().waitFor({ state: "visible", timeout: 15000 }).catch(() => s.misses.push("settings page"));
    const tab = async (label, name) => {
      if (!want(name)) return;
      const re = new RegExp(`^${label}$`);
      if (await s.mustClick(`button:text-matches("${re.source}"), a:text-matches("${re.source}")`, `${label} settings`)) {
        await sleep(2500);
        await s.shoot(name);
      }
    };
    if (want("settings")) await s.shoot("settings");
    await tab("Appearance", "settings-appearance");
    await tab("Themes", "themes");
    await tab("Identities", "identities");
    await tab("Filters", "filters");
    await tab("Templates", "settings-templates");
    await tab("Out of Office|Vacation Responder", "vacation");

    // Pro shell: the Layout switch takes the standard routes over.
    const layout = s.page.getByRole("button", { name: "Layout", exact: true }).or(s.page.getByRole("link", { name: "Layout", exact: true })).first();
    await layout.click({ timeout: 6000 }).catch(() => s.misses.push("settings Layout tab"));
    await sleep(2000);
    const toggle = s.page.locator('[data-testid="setting-pro-interface"]').first();
    await toggle.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    if (await toggle.count()) {
      await toggle.scrollIntoViewIfNeeded().catch(() => {});
      await toggle.click({ timeout: 5000 }).catch(() => s.misses.push("pro toggle"));
      await sleep(9000);
      await s.tryClick('button:has-text("Got it")', 1500);
      if ((await s.page.locator('[role="tablist"]').count()) > 0) {
        for (const label of ["calendar", "contacts", "files"]) { await s.rail(label, 3500); }
        await s.tryClick('[role="tab"]:has-text("Mail")', 4000);
        await sleep(2500);
        await s.page.locator(`text=${F.rollbackThread.row}`).first().click({ timeout: 5000 }).catch(() => {});
        await sleep(3000);
        if (want("pro")) await s.shoot("pro");
        if (want("pro-calendar")) {
          await s.tryClick('[role="tab"]:has-text("Calendar")', 4000);
          await sleep(3000);
          await s.shoot("pro-calendar");
          await s.tryClick('[role="tab"]:has-text("Mail")', 4000);
          await sleep(2000);
        }
        if (want("pro-composer")) {
          await s.page.keyboard.press("c");
          await sleep(3500);
          await s.shoot("pro-composer");
          await s.closeComposer();
        }
        if (want("search-palette")) {
          const opened = (await s.tryClick('[data-tour="nav-search"]', 3000)) || (await s.page.keyboard.press("Control+KeyK").then(() => true).catch(() => false));
          if (opened) {
            await sleep(1500);
            await s.page.keyboard.type("Beacon", { delay: 40 });
            await sleep(4000);
            await s.shoot("search-palette");
            await s.page.keyboard.press("Escape");
          }
        }
      } else {
        s.misses.push("pro shell");
      }
    } else {
      s.misses.push("pro interface setting");
    }
  }

  await ctx.close();
  return s;
}

// ── The column list (#262): one-line rows as a table under a header ─────
async function columns(browser, theme) {
  const ctx = await newContext(browser, { theme, settings: { listColumns: true, mailLayout: "horizontal" } });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] columns`);
  await s.signIn();
  await s.mustClick(`text=${F.rollbackThread.row}`, "conversation row");
  await sleep(3000);
  await s.shoot("inbox-columns");
  await ctx.close();
  return s;
}

// ── Phone ─────────────────────────────────────────────────────────────
async function phone(browser, theme) {
  const ctx = await newContext(browser, { theme, size: PHONE });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] phone ${PHONE.width}x${PHONE.height}@${PHONE.scale}`);
  await s.signIn();
  await sleep(2000);
  if (want("phone-inbox")) await s.shoot("phone-inbox");
  await s.mustClick(`text=${F.invoice.row}`, "message on the phone list");
  await sleep(3500);
  if (want("phone-message")) await s.shoot("phone-message");
  await s.page.goBack().catch(() => {});
  await sleep(1500);
  if (want("phone-calendar")) {
    if (await s.tryClick('[data-tour="nav-calendar"], [aria-label="Calendar"], a[href$="/calendar"]', 4000)) {
      await sleep(5000);
      await s.shoot("phone-calendar");
    }
  }
  await ctx.close();
  return s;
}

// ── PWA manifest screenshots: exact pixel sizes, light only ──────────────
async function pwa(browser) {
  const out = path.join(SHOTS_DIR, "pwa");
  ensureDir(out);
  for (const [w, h, mobile] of [[1280, 720, false], [540, 720, true]]) {
    const ctx = await newContext(browser, { theme: "light", size: { width: w, height: h, scale: 1, mobile } });
    const s = new Session(await ctx.newPage(), null, { out });
    console.log(`[pwa] ${w}x${h}`);
    await s.signIn();
    await s.mustClick(`text=${F.invoice.row}`, "message for the manifest shot");
    await sleep(3500);
    await s.shootPng(path.join(out, `screenshot-${w}x${h}.png`));
    await ctx.close();
  }
  return null;
}

// ── Admin console, its own session ────────────────────────────────────
async function admin(browser, theme) {
  const password = process.env.SHOOT_ADMIN_PASSWORD;
  if (!password) { console.log(`[${theme}] admin skipped (SHOOT_ADMIN_PASSWORD unset)`); return null; }
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] admin`);
  await s.page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await sleep(3000);
  await s.page.locator('input[type="password"]').first().fill(password).catch(() => s.misses.push("admin password field"));
  await s.page.keyboard.press("Enter");
  await sleep(6000);
  if (s.page.url().includes("/login")) { s.misses.push("admin login"); await ctx.close(); return s; }
  await s.shoot("admin-overview");
  const tab = async (label, name) => {
    if (await s.tryClick(`[role="tab"]:has-text("${label}"), button:has-text("${label}"), a:has-text("${label}")`, 4000)) {
      await sleep(3000);
      await s.shoot(name);
    }
  };
  await tab("Plugins", "admin-plugins");
  await tab("Marketplace", "admin-marketplace");
  await tab("Branding", "admin-branding");
  await tab("Telemetry", "admin-telemetry");
  await ctx.close();
  return s;
}

// ── Credential login page: a server with demo mode off ──────────────────
async function login(browser, theme) {
  const base = process.env.SHOOT_LOGIN_BASE;
  if (!base) { console.log(`[${theme}] login skipped (SHOOT_LOGIN_BASE unset)`); return null; }
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] login at ${base}`);
  await s.page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  const user = s.page.locator('input[type="text"], input[type="email"], input[name="username"]').first();
  if (await user.count()) await user.fill("nora@meridianlabs.example").catch(() => {});
  await s.page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important; }" }).catch(() => {});
  await sleep(600);
  await s.page.screenshot({ type: "png" }).then(async (buf) => {
    const { loadSharp } = await import("./lib/paths.mjs");
    await loadSharp()(buf).webp({ quality: 82, effort: 6 }).toFile(path.join(SHOTS_DIR, `${theme}-login.webp`));
    s.log(`+ ${theme}-login.webp`);
  });
  await ctx.close();
  return s;
}

// ── Setup wizard: empty admin dirs, no JMAP_SERVER_URL, the token from the log
async function setup(browser, theme) {
  const base = process.env.SHOOT_SETUP_BASE;
  const token = process.env.SHOOT_SETUP_TOKEN;
  if (!base || !token) { console.log(`[${theme}] setup skipped (SHOOT_SETUP_BASE / SHOOT_SETUP_TOKEN unset)`); return null; }
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] setup wizard at ${base}`);
  await s.page.goto(`${base}/setup#token=${token}`, { waitUntil: "domcontentloaded" });
  await sleep(4000);
  // Over plain http the wizard first asks for an acknowledgement.
  if (await s.tryClick('button:has-text("Continue over HTTP")', 3000)) await sleep(2500);
  // Welcome: paste the token (the fragment is read too, but typing it is
  // reliable) and Continue verifies it.
  const tokenField = s.page.locator('input[placeholder*="hex token" i]').first();
  if (await tokenField.count()) { await tokenField.fill(token); await sleep(500); }
  if (want("setup-welcome")) await s.shoot("setup-welcome");
  await s.mustClick('button:has-text("Continue")', "setup token step");
  await sleep(3500);
  // Server: the test server makes the probe go green.
  const server = s.page.locator('input[placeholder="https://"], input[type="url"]').first();
  if (await server.count()) {
    await server.fill(process.env.SHOOT_SETUP_SERVER || "https://stalwart.internal.bulwarkmail.org").catch(() => {});
    await s.tryClick('button:has-text("Test")', 3000);
    await sleep(6000);
  } else s.misses.push("setup server field");
  if (want("setup-server")) await s.shoot("setup-server");
  // Auth, security, logging, branding, review: Next through them.
  const steps = [["setup-auth", true], ["setup-security", false], ["setup-logging", false], ["setup-branding", true], ["setup-review", true]];
  for (const [name, shoot] of steps) {
    if (!(await s.mustClick('button:has-text("Next")', name))) break;
    await sleep(3000);
    await s.page.evaluate(() => window.scrollTo(0, 0));
    if (shoot && want(name)) await s.shoot(name);
  }
  await ctx.close();
  return s;
}

const FLOWS = { desktop, columns, phone, pwa, admin, login, setup };

(async () => {
  ensureDir(SHOTS_DIR);
  const browser = await launchBrowser();
  const sessions = [];
  const flows = Object.entries(FLOWS).filter(([name]) => !FLOW_FILTER || FLOW_FILTER.has(name));
  for (const [name, flow] of flows) {
    if (name === "pwa") { await pwa(browser); continue; }
    for (const theme of THEMES) {
      const s = await flow(browser, theme).catch((e) => { console.log(`  ! ${name} (${theme}) failed: ${e.message}`); return { misses: [`${name} ${theme}: ${e.message}`], errors: [], written: [] }; });
      if (s) sessions.push(s);
    }
  }
  await browser.close();
  const misses = sessions.flatMap((s) => s.misses);
  const errors = [...new Set(sessions.flatMap((s) => s.errors))];
  console.log(`\n${sessions.reduce((n, s) => n + s.written.length, 0)} captures in ${SHOTS_DIR}`);
  if (errors.length) { console.log(`page errors: ${errors.length}`); errors.slice(0, 8).forEach((e) => console.log("   !", e)); }
  if (misses.length) { console.log(`missed ${misses.length} target(s):`); misses.forEach((m) => console.log("   -", m)); process.exit(1); }
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
