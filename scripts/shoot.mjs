#!/usr/bin/env node
/**
 * Capture the product screenshots from a running webmail instance.
 *
 *   node scripts/shoot.mjs --flow desktop          # some flows (see FLOWS)
 *   node scripts/shoot.mjs --theme dark            # one theme
 *   node scripts/shoot.mjs --only inbox,viewer     # some shots inside the flows
 *
 * shoot-all.mjs starts the instances (scenarios.mjs) and calls this once per
 * instance with SHOOT_BASE and the flows that instance serves. Captures land
 * in .staging/screenshots as <theme>-<name>.webp, 5120x2880 (1280x720 at
 * 4x); SHOOT_PNG=1 keeps the PNG too. Review them, then `node scripts/sync.mjs`.
 *
 * Every flow signs in once and navigates in-app: a full page load drops the
 * demo session. The clock is pinned (lib/app.mjs pinnedClock) so both themes
 * show the same mail at the same times. Click targets are fixture subjects
 * from the webmail's lib/demo/fixtures; a miss is reported and the run exits
 * non-zero, because a missed click leaves the previous view in the next shot.
 *
 * Flows that show what an organisation set up (its policy, signature,
 * plugins) put the admin session into the browser before "Launch Demo"
 * (SHOOT_ADMIN_COOKIE_FILE, written by shoot-all.mjs): without it the demo
 * only gets the public part of the policy. Flows on other instances read
 * their own base: SHOOT_SETUP_TOKEN (setup wizard), SHOOT_LITE_BASE (Lite).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, DESKTOP, PHONE, Session, launchBrowser, newContext, sleep, withAdmin, adminApi } from "./lib/app.mjs";
import { SHOTS_DIR, ensureDir } from "./lib/paths.mjs";
import { BRANDED_HOST, LOGIN_CONFIGS, WORK_HOST } from "./scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(here, "assets");

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const THEMES = (arg("theme") || "all") === "all" ? ["light", "dark"] : [arg("theme")];
const ONLY = arg("only") ? new Set(arg("only").split(",")) : null;
const FLOW_FILTER = arg("flow") ? new Set(arg("flow").split(",")) : null;

const want = (...names) => !ONLY || names.some((n) => ONLY.has(n));

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
  signed: { query: "security review", row: "Beacon security review: signed off" },
  coffee: { query: "Coffee before", row: "Coffee before the go/no-go?" },
  eInvoice: { query: "SH-2026-10418", row: "Your invoice SH-2026-10418" },
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
  if (want("attachments", "attachment-preview")) {
    await s.open(F.soak.query, F.soak.row, "mail with image and spreadsheet");
    if (want("attachments")) await s.shoot("attachments");
    // The image attachment opens in the preview.
    if (want("attachment-preview") && await s.mustClick("text=beacon-soak-dashboard.png", "image attachment", 4000)) {
      await sleep(3500);
      await s.shoot("attachment-preview");
      await s.page.keyboard.press("Escape");
      await sleep(800);
    }
  }
  await s.clearSearch();

  // Search results and the filter chips.
  if (want("search", "search-filters")) {
    await s.search("Beacon");
    if (want("search")) await s.shoot("search");
    // The funnel next to the search field is titled "More".
    if (want("search-filters") && await s.mustClick('button[title="More"], button[aria-label*="filter" i], button[title*="filter" i]', "advanced search toggle", 3000)) {
      await sleep(1500);
      await s.shoot("search-filters");
      await s.page.keyboard.press("Escape");
    }
    await s.clearSearch();
  }

  // Composer: a new message to Bob with an @mention chip and its card.
  if (want("composer", "composer-mention", "templates")) {
    await s.mustClick('[data-tour="compose-button"]', "compose button");
    await sleep(3000);
    await s.fillComposer({ to: "bob.chen@meridianlabs.example", subject: "Rollback runbook: your two comments" });
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
      if (want("composer")) await s.shoot("composer");
      if (want("composer-mention")) {
        // Hover the chip for its card.
        const chip = s.page.locator('.ProseMirror [data-mention], .ProseMirror a[href^="mailto:"]').first();
        if (await chip.count()) {
          await chip.hover().catch(() => {});
          await sleep(1500);
          await s.shoot("composer-mention", { moveMouse: false });
          await s.page.mouse.move(DESKTOP.width - 6, 6);
        } else s.misses.push("mention chip in composer");
      }
      // The templates menu: an icon button in the composer's bottom bar.
      if (want("templates") && await s.mustClick('button[aria-label*="emplate" i], button[title*="emplate" i]', "templates button", 3000)) {
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
      await s.scrollListTop();
      await s.shoot("unified-inbox");
    }
  }
  if (want("shared-mailbox")) {
    if (await s.openSupportInbox()) {
      await s.mustClick(`text=${F.support}`, "support request");
      await sleep(2500);
      await s.shoot("shared-mailbox");
    }
  }
  if (want("account-switcher")) await accountSwitcher(s);
  if (want("tag")) {
    // Back to the own inbox first: after the shared mailbox the list scope differs.
    await s.ownInbox();
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
  await s.ownInbox();

  if (want("shortcuts")) {
    await s.page.keyboard.press("Shift+?");
    await sleep(1500);
    if (await s.page.locator('text=/Keyboard shortcuts/i').first().isVisible().catch(() => false)) await s.shoot("shortcuts");
    else s.misses.push("shortcuts overlay");
    await s.page.keyboard.press("Escape");
    await sleep(600);
  }

  // Calendar
  if (want("calendar", "calendar-week", "calendar-event", "calendar-create", "tasks") && await s.rail("calendar")) {
    if (want("calendar")) await s.shoot("calendar");
    await s.weekView();
    if (want("calendar-week")) await s.shoot("calendar-week");
    if (want("calendar-event")) {
      if (await s.mustClick('[data-calendar-event]:has-text("go / no-go")', "go/no-go event in the week view", 4000)) {
        await sleep(1500);
        await s.shoot("calendar-event");
        await s.page.keyboard.press("Escape");
        await sleep(600);
      }
    }
    if (want("calendar-create")) {
      if (await s.mustClick('button[aria-label="Create event"]', "create event button")) {
        await sleep(2500);
        await s.shoot("calendar-create");
        await s.page.keyboard.press("Escape");
        await sleep(800);
        await s.tryClick('button:has-text("Discard")', 1500);
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
  if (want("contacts-detail", "contact-group") && await s.rail("contacts")) {
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
  if (want("files", "files-documents", "files-grid", "file-preview") && await s.rail("files")) {
    if (want("files")) await s.shoot("files");
    await s.page.locator("text=Documents").first().dblclick({ timeout: 6000 }).catch(() => s.misses.push("Documents folder"));
    await sleep(2500);
    if (want("files-documents")) await s.shoot("files-documents");
    if (want("files-grid")) {
      if (await s.mustClick('button[aria-label*="grid" i], button[title*="grid" i]', "grid view", 3000)) {
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

  // Settings: since 1.19.0 sixteen pages in three groups; themes, identities
  // and templates are sections inside them.
  if (want("settings", "settings-appearance", "identities", "filters", "settings-templates", "pro", "pro-calendar", "pro-composer", "search-palette") && await s.openSettings()) {
    if (want("settings")) await s.shoot("settings");
    if (want("settings-appearance") && await s.settingsPage("Appearance")) await s.shoot("settings-appearance");
    if (want("identities") && await s.settingsPage("Account")) {
      if (await s.mustClick('main button:has-text("Manage identities")', "manage identities")) {
        await sleep(2500);
        await s.scrollToTop();
        await s.shoot("identities");
        await s.page.keyboard.press("Escape");
        await sleep(800);
      }
    }
    if (want("filters") && await s.settingsPage("Filters")) await s.shoot("filters");
    if (want("settings-templates") && await s.settingsPage("Composing")) {
      if (await s.mustClick('main button:has-text("Manage templates")', "manage templates")) {
        await sleep(2500);
        await s.scrollToTop();
        await s.shoot("settings-templates");
        await s.page.keyboard.press("Escape");
        await sleep(800);
      }
    }

    // Pro shell: the Layout switch takes the standard routes over.
    if (want("pro", "pro-calendar", "pro-composer", "search-palette")) await pro(s);
  }

  await ctx.close();
  return s;
}

async function pro(s) {
  if (!(await s.settingsPage("Appearance"))) return;
  // The Pro switch is an advanced setting.
  await s.showAdvanced();
  await s.scrollToSection("layout", "layout");
  const toggle = s.page.locator('[data-testid="setting-pro-interface"]').first();
  await toggle.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  if (!(await toggle.count())) { s.misses.push("pro interface setting"); return; }
  await toggle.scrollIntoViewIfNeeded().catch(() => {});
  await toggle.click({ timeout: 5000 }).catch(() => s.misses.push("pro toggle"));
  await sleep(9000);
  await s.tryClick('button:has-text("Got it")', 1500);
  if (!((await s.page.locator('[role="tablist"]').count()) > 0)) { s.misses.push("pro shell"); return; }
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
}

/** The account switcher: the button at the top of the sidebar shows the address. */
async function accountSwitcher(s, name = "account-switcher") {
  if (await s.mustClick('[data-tour="sidebar"] button:has-text("nora@meridianla"), button:has-text("nora@meridianla")', "account switcher")) {
    await sleep(1200);
    await s.shoot(name);
    await s.page.keyboard.press("Escape");
    await sleep(600);
  }
}

// ── The column list (#262): one-line rows as a table under a header ─────
async function columns(browser, theme) {
  const ctx = await newContext(browser, { theme, settings: { listColumns: true, mailLayout: "horizontal" } });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] columns`);
  await s.signIn();
  await s.mustClick(`text=${F.rollbackThread.row}`, "conversation row");
  await sleep(3000);
  if (want("inbox-columns")) await s.shoot("inbox-columns");
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
    if (await s.mustClick('[data-tour="nav-calendar"], [aria-label="Calendar"], a[href$="/calendar"]', "phone calendar tab", 4000)) {
      await sleep(5000);
      await s.shoot("phone-calendar");
    }
  }
  await ctx.close();
  return s;
}

// ── PWA manifest screenshots: exact pixel sizes, light only ──────────────
async function pwa(browser) {
  if (!want("pwa")) return null;
  const out = path.join(SHOTS_DIR, "pwa");
  ensureDir(out);
  const sessions = [];
  for (const [w, h, mobile] of [[1280, 720, false], [540, 720, true]]) {
    const ctx = await newContext(browser, { theme: "light", size: { width: w, height: h, scale: 1, mobile } });
    const s = new Session(await ctx.newPage(), null, { out });
    console.log(`[pwa] ${w}x${h}`);
    await s.signIn();
    await s.mustClick(`text=${F.invoice.row}`, "message for the manifest shot");
    await sleep(3500);
    await s.shootPng(path.join(out, `screenshot-${w}x${h}.png`));
    await ctx.close();
    sessions.push(s);
  }
  return sessions;
}

// ── Admin console, its own session ────────────────────────────────────
async function adminConsole(browser, theme, shots) {
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  if (!(await withAdmin(ctx))) { s.misses.push("admin session (SHOOT_ADMIN_COOKIE_FILE)"); await ctx.close(); return s; }
  await s.page.clock.setFixedTime(new Date());
  await s.page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await s.page.locator('[data-testid="admin-page-dashboard"]').first().waitFor({ state: "visible", timeout: 90000 }).catch(() => s.misses.push("admin console"));
  await sleep(3000);
  for (const [name, fn] of shots) {
    if (!want(name)) continue;
    await fn(s);
  }
  await ctx.close();
  return s;
}

const adminShot = (name, page, { section = null, after = null } = {}) => [name, async (s) => {
  if (!(await s.adminPage(page))) return;
  if (section) await s.adminSection(section);
  if (after) await after(s);
  await s.shoot(name);
}];

async function admin(browser, theme) {
  console.log(`[${theme}] admin`);
  return adminConsole(browser, theme, [
    adminShot("admin-overview", "dashboard"),
    adminShot("admin-plugins", "plugins"),
    adminShot("admin-marketplace", "marketplace", { after: async () => { await sleep(4000); } }),
    adminShot("admin-telemetry", "telemetry"),
    adminShot("admin-updates", "version", { after: async (s) => { await s.mustClick('button:has-text("Check now")', "check for updates", 3000); await sleep(5000); } }),
  ]);
}

// ── Organisation, as the admin set it up ──────────────────────────────
async function orgadmin(browser, theme) {
  console.log(`[${theme}] organisation admin`);
  return adminConsole(browser, theme, [
    adminShot("admin-policy", "policy", { section: "Locked settings" }),
    adminShot("admin-domains", "organisation"),
    ["admin-domains-effective", async (s) => {
      if (!(await s.adminPage("organisation"))) return;
      await s.adminSection("Effective policy");
      // The user's address and their groups; the page answers as you type.
      const fields = s.page.locator('[data-settings-section="effective"] input');
      if ((await fields.count()) >= 2) {
        await fields.nth(0).fill("nora@meridianlabs.example");
        await fields.nth(1).fill("support@meridianlabs.example");
        await sleep(2500);
        await s.scrollToSection("effective");
        await s.shoot("admin-domains-effective");
        // Typing made the page dirty: clear both, so leaving it asks nothing.
        await fields.nth(0).fill("");
        await fields.nth(1).fill("");
        await sleep(800);
      } else s.misses.push("Effective policy address fields");
    }],
    adminShot("admin-auth", "auth"),
    adminShot("admin-signatures", "org-signatures"),
    adminShot("admin-org-templates", "org-templates"),
    adminShot("admin-security", "org-security", { section: "Sessions" }),
    adminShot("admin-third-party", "org-security", { section: "Third-party traffic" }),
    adminShot("admin-shared-tags", "org-sharing"),
    ["admin-branding", async (s) => {
      if (!(await s.adminPage("branding"))) return;
      await s.mustClick(`main button:has-text("${BRANDED_HOST}")`, "branding host scope", 5000);
      await sleep(1500);
      await s.shoot("admin-branding");
    }],
    adminShot("admin-audit-log", "logs"),
  ]);
}

async function org(browser, theme) {
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] organisation`);
  if (!(await withAdmin(ctx))) s.misses.push("admin session (SHOOT_ADMIN_COOKIE_FILE)");
  await s.signIn();

  // The External label on mail from outside, and the question before a reply leaves.
  if (want("external-mail")) {
    await s.mustClick(`text=${F.invoice.row}`, "external invoice");
    await sleep(3000);
    if (!(await s.page.locator("text=/^External$/").first().isVisible().catch(() => false))) s.misses.push("External label");
    await s.mustClick('button:has-text("Reply")', "reply to the invoice");
    await sleep(2500);
    // Sarah is a contact, and contacts count as known; the accounts address isn't.
    await s.addCc("accounts@designco.example");
    await s.typeBody("Hi Sarah,\n\nThanks, approved. It goes out with Friday's payment run.\n\nNora");
    await s.mustClick('button:visible:text-is("Send")', "send the reply");
    await sleep(1500);
    if (await s.page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: /outside|external/i }).first().isVisible().catch(() => false)) await s.shoot("external-mail");
    else s.misses.push("external recipient confirm dialog");
    await s.closeComposer();
  }

  // The organisation signature with Nora's details, and the disclaimer below it.
  if (want("composer-org-signature", "templates-org")) {
    await s.mustClick('[data-tour="compose-button"]', "compose button");
    await sleep(3000);
    await s.fillComposer({ to: "priya.sharma@meridianlabs.example", subject: "Beacon budget: the numbers for Thursday" });
    await s.typeBody("Hi Priya,\n\nThe soak test numbers are in. I've put them next to the budget so we can go through both on Thursday.");
    if (want("composer-org-signature")) await s.shoot("composer-org-signature");
    if (want("templates-org")) {
      if (await s.mustClick('button[aria-label*="emplate" i], button[title*="emplate" i]', "templates button", 3000)) {
        await sleep(800);
        if (await s.mustClick('[role="menu"] :text("Insert template")', "insert template", 3000)) {
          await sleep(1500);
          const heading = s.page.locator('[role="dialog"] >> text=/^Organisation$/').first();
          if (await heading.count()) { await heading.evaluate((el) => el.scrollIntoView({ block: "start" })); await sleep(800); await s.shoot("templates-org"); }
          else s.misses.push("Organisation section in the template picker");
          await s.page.keyboard.press("Escape");
          await sleep(600);
        }
      }
    }
    await s.closeComposer();
  }

  // Signed by Alice: the S/MIME plugin's banner.
  if (want("smime-signed")) {
    // The plugin's banner shows the stored check result when it mounts, so
    // the first open says only "Signed message": open another mail and come back.
    await s.ownInbox();
    await s.open(F.signed.query, F.signed.row, "signed message");
    await sleep(3000);
    await s.open(F.coffee.query, F.coffee.row, "another message");
    if (await s.open(F.signed.query, F.signed.row, "signed message again")) {
      await sleep(3000);
      if (!(await s.page.locator("text=/Valid signature/").first().isVisible().catch(() => false))) s.misses.push("S/MIME valid signature banner");
      await s.shoot("smime-signed");
    }
    await s.clearSearch();
  }

  if (want("recover-deleted") && await s.openSettings()) {
    if (await s.settingsPage("Recover deleted items")) {
      await sleep(2500);
      // Tick the deleted budget mail, then Restore.
      // The first box is "Select all"; the second is the first message (the budget mail).
      await s.page.locator('main input[type="checkbox"]').nth(1).click({ timeout: 5000 }).catch(() => s.misses.push("deleted message checkbox"));
      await sleep(800);
      if (await s.mustClick('main button:visible:has-text("Restore")', "restore a deleted message", 5000)) await sleep(2500);
      await s.shoot("recover-deleted");
    }
    await s.backToMail();
  }

  if (want("settings-locked", "settings-accessibility", "delegates", "shared-tags") && await s.openSettings()) {
    if (want("settings-locked") && await s.settingsPage("Appearance")) {
      await s.scrollToSection("text", "text & motion");
      await s.shoot("settings-locked");
    }
    if (want("delegates") && await s.settingsPage("Sharing")) {
      await sleep(2000);
      await s.shoot("delegates");
    }
    await s.backToMail();
  }

  if (want("shared-tags") && await s.openSupportInbox()) {
    await s.page.locator('[data-tour="sidebar"]').first().evaluate((el) => { const sc = el.querySelector('[class*="overflow-y"]') || el; sc.scrollTop = sc.scrollHeight; }).catch(() => {});
    await sleep(800);
    await s.mustClick(`text=${F.support}`, "support request");
    await sleep(2500);
    await s.shoot("shared-tags");
  }

  // Last: a preset changes the font and spacing everywhere after it.
  if (want("settings-accessibility") && await s.openSettings() && await s.settingsPage("Accessibility")) {
    if (await s.mustClick('main button:has-text("Dyslexia"), main [role="radio"]:has-text("Dyslexia"), main label:has-text("Dyslexia")', "dyslexia preset")) await sleep(2000);
    await s.scrollToSection("presets", "presets");
    // Down to the note that says what the preset changed.
    await s.page.locator("text=/changed \\d+ settings/").first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => s.misses.push("preset summary"));
    await sleep(800);
    await s.shoot("settings-accessibility");
  }

  await ctx.close();
  return s;
}

// ── Small business: the team's mailbox and calendars ─────────────────────
async function smallbiz(browser, theme) {
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] small business`);
  await s.signIn();

  if (want("shared-mailbox", "shared-mailbox-reply") && await s.openSupportInbox()) {
    await s.mustClick(`text=${F.support}`, "support request");
    await sleep(2500);
    if (want("shared-mailbox")) await s.shoot("shared-mailbox");
    if (want("shared-mailbox-reply")) {
      await s.mustClick('button:has-text("Reply")', "reply from the group");
      await sleep(3000);
      await s.typeBody("Hello Tomás,\n\nYes: the add-on goes to 100 tenants without a new contract. I've raised your limit, and the canary keeps its own five.");
      await s.shoot("shared-mailbox-reply");
      await s.closeComposer();
    }
  }

  if (want("vacation") && await s.openSettings()) {
    if (await s.settingsPage("Out of office")) {
      // The fixture has the reply filled in for the Lisbon trip but off; turn it on.
      await sleep(1500);
      const sw = s.page.locator('main [role="switch"]').first();
      if (await sw.count()) {
        if ((await sw.getAttribute("aria-checked")) !== "true") { await sw.click(); await sleep(1500); }
      } else s.misses.push("out of office switch");
      await s.tryClick('main button:visible:text-is("Save")', 3000);
      await sleep(1500);
      await s.scrollToTop();
      await s.shoot("vacation");
    }
    await s.backToMail();
  }

  if (want("calendar-shared", "calendar-availability") && await s.rail("calendar")) {
    await s.weekView();
    if (want("calendar-shared")) await s.shoot("calendar-shared");
    if (want("calendar-availability") && await s.mustClick('button[aria-label="Create event"]', "create event button")) {
      await sleep(2500);
      const title = s.page.locator('input[placeholder*="title" i], input[name="title"]').first();
      if (await title.count()) { await title.fill("Beacon launch retro"); }
      const att = s.page.locator('input[placeholder*="ttendee" i], input[placeholder*="articipant" i], input[placeholder*="Add people" i], input[placeholder*="email" i]').first();
      if (await att.count()) {
        for (const who of ["bob.chen@meridianlabs.example", "alice.johnson@meridianlabs.example", "priya.sharma@meridianlabs.example"]) {
          await att.click();
          await s.page.keyboard.type(who, { delay: 8 });
          await s.page.keyboard.press("Enter");
          await sleep(1200);
        }
        // Close the suggestions, move the event to an afternoon slot, show the list.
        await s.page.locator("text=Participants").first().click().catch(() => {});
        const times = s.page.locator('input[type="time"]');
        if ((await times.count()) >= 2) { await times.nth(0).fill("15:00"); await times.nth(1).fill("16:00"); }
        await s.page.locator("text=Participants").first().click().catch(() => {});
        await sleep(2500);
        await s.page.locator("text=Participants").first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
        await sleep(1000);
        await s.shoot("calendar-availability");
      } else s.misses.push("attendee field");
      await s.page.keyboard.press("Escape");
      await sleep(800);
      await s.tryClick('button:has-text("Discard")', 1500);
    }
  }
  await ctx.close();

  // Plugins the admin uploaded: they need the admin session in the browser.
  if (want("team-inbox", "e-invoice")) {
    const pctx = await newContext(browser, { theme });
    const p = new Session(await pctx.newPage(), theme);
    if (!(await withAdmin(pctx))) p.misses.push("admin session (SHOOT_ADMIN_COOKIE_FILE)");
    await p.signIn();
    if (want("team-inbox")) await p.enablePlugin("Team inbox");
    if (want("e-invoice")) await p.enablePlugin("E-Invoices");
    if (want("team-inbox") && await p.openSupportInbox()) {
      await sleep(3000);
      await p.mustClick(`text=${F.support}`, "support request");
      await sleep(3000);
      await p.shoot("team-inbox");
    }
    if (want("e-invoice")) {
      await p.ownInbox();
      if (await p.open(F.eInvoice.query, F.eInvoice.row, "e-invoice mail")) {
        await sleep(4000);
        // "Show invoice" is in the plugin's banner frame.
        let shown = false;
        for (const f of p.page.frames()) {
          const b = f.getByRole("button", { name: "Show invoice" });
          if (await b.count().catch(() => 0)) { await b.first().click().catch(() => {}); shown = true; break; }
        }
        if (!shown) p.misses.push("Show invoice button");
        await sleep(3500);
        await p.shoot("e-invoice");
        await p.page.keyboard.press("Escape");
      }
      await p.clearSearch();
    }
    await pctx.close();
    return [s, p];
  }
  return s;
}

// ── Login pages: a server with demo mode off ─────────────────────────────
async function login(browser, theme) {
  const api = await adminApi();
  if (!api) { console.log(`[${theme}] login skipped (no admin session for the non-demo instance)`); return null; }
  const port = new URL(BASE).port;
  const sessions = [];
  const page = async (name, host, config, { user = "" } = {}) => {
    if (!want(name)) return;
    await api.patchConfig(config);
    const ctx = await newContext(browser, { theme });
    const s = new Session(await ctx.newPage(), theme);
    console.log(`[${theme}] ${name} at ${host}`);
    await s.page.clock.setFixedTime(new Date());
    await s.page.goto(`http://${host}:${port}/login`, { waitUntil: "domcontentloaded" });
    await s.page.locator('input[type="password"], button:has-text("Sign in")').first().waitFor({ state: "visible", timeout: 60000 }).catch(() => s.misses.push(`${name} form`));
    await sleep(2500);
    if (user) {
      const field = s.page.locator('input[type="email"], input[name="username"], input[autocomplete="username"]').first();
      if (await field.count()) { await field.fill(user); await sleep(1200); } else s.misses.push(`${name} username field`);
    }
    await s.shoot(name, { allowLogin: true });
    await ctx.close();
    sessions.push(s);
  };
  await page("login-sso", "localhost", LOGIN_CONFIGS.sso);
  await page("login", "localhost", LOGIN_CONFIGS.plain);
  await page("login-branded", BRANDED_HOST, LOGIN_CONFIGS.plain);
  await page("login-servers", "localhost", LOGIN_CONFIGS.servers, { user: "nora@meridianlabs.example" });
  await api.patchConfig(LOGIN_CONFIGS.plain);
  return sessions;
}

// ── Setup wizard: empty admin dirs, no JMAP_SERVER_URL, the token from the state dir
async function setup(browser, theme) {
  const token = process.env.SHOOT_SETUP_TOKEN;
  if (!token) { console.log(`[${theme}] setup skipped (SHOOT_SETUP_TOKEN unset)`); return null; }
  const ctx = await newContext(browser, { theme });
  const s = new Session(await ctx.newPage(), theme);
  console.log(`[${theme}] setup wizard at ${BASE}`);
  await s.page.goto(`${BASE}/setup#token=${token}`, { waitUntil: "domcontentloaded" });
  await sleep(6000);
  // Over plain http the wizard first asks for an acknowledgement.
  if (await s.tryClick('button:has-text("Continue over HTTP")', 3000)) await sleep(2500);
  // Welcome: paste the token (the fragment is read too, but typing it is
  // reliable) and Continue verifies it.
  const tokenField = s.page.locator('input[placeholder*="hex token" i]').first();
  if (await tokenField.count()) { await tokenField.fill(token); await sleep(500); }
  if (want("setup-welcome")) await s.shoot("setup-welcome", { allowLogin: true });
  await s.mustClick('button:has-text("Continue")', "setup token step");
  await sleep(3500);
  // Server: the organisation's address, typed in. No "Test": a probe against
  // a server that doesn't exist would only show an error.
  const server = s.page.locator('input[placeholder="https://"], input[type="url"]').first();
  if (await server.count()) await server.fill(`https://${WORK_HOST}`).catch(() => {});
  else s.misses.push("setup server field");
  await sleep(1000);
  if (want("setup-server")) await s.shoot("setup-server", { allowLogin: true });
  // Auth, security, logging, branding, review: Next through them.
  const steps = [["setup-auth", true], ["setup-security", false], ["setup-logging", false], ["setup-branding", true], ["setup-review", true]];
  for (const [name, shoot] of steps) {
    if (!(await s.mustClick('button:has-text("Next")', name))) break;
    await sleep(3000);
    await s.page.evaluate(() => window.scrollTo(0, 0));
    if (shoot && want(name)) await s.shoot(name, { allowLogin: true });
  }
  await ctx.close();
  return s;
}

const FLOWS = { desktop, columns, phone, pwa, admin, org, orgadmin, smallbiz, login, setup };
const PER_RUN = new Set(["pwa"]);

(async () => {
  ensureDir(SHOTS_DIR);
  const browser = await launchBrowser();
  const sessions = [];
  const flows = Object.entries(FLOWS).filter(([name]) => !FLOW_FILTER || FLOW_FILTER.has(name));
  const unknownFlows = FLOW_FILTER ? [...FLOW_FILTER].filter((f) => !FLOWS[f]) : [];
  if (unknownFlows.length) console.log(`no flow ${unknownFlows.join(", ")} here; the flows are ${Object.keys(FLOWS).join(", ")}`);
  for (const [name, flow] of flows) {
    for (const theme of PER_RUN.has(name) ? [null] : THEMES) {
      const r = await flow(browser, theme).catch((e) => { console.log(`  ! ${name} (${theme}) failed: ${e.message}`); return { misses: [`${name} ${theme}: ${e.message}`], errors: [], written: [] }; });
      if (r) sessions.push(...(Array.isArray(r) ? r : [r]));
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
