// Webmail instances for the captures: a scratch admin config per scenario,
// `next dev` started from the webmail checkout with that config, the admin
// API signed in once, and the small local servers some states need (an OIDC
// issuer, the version server, a static host for Lite). shoot-all.mjs runs
// them one after another; shoot.mjs only talks to whatever is running.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { WEBMAIL, STAGING, ensureDir } from "./paths.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Where the scratch admin dirs live: SHOOT_SCRATCH, or .staging/instances.
 * On Windows they must be `C:/...` paths: the webmail reads them as given.
 */
export const SCRATCH = path.resolve(process.env.SHOOT_SCRATCH || path.join(STAGING, "instances")).replace(/\\/g, "/");

export const ADMIN_PASSWORD = process.env.SHOOT_ADMIN_PASSWORD || "screenshots-only";

/**
 * Audit entries record the client address. Requests carry an address from
 * the documentation range, so the log in a capture shows a plausible office
 * address instead of ::1.
 */
export const OFFICE_IP = "203.0.113.24";

export function scenarioDirs(name) {
  const root = `${SCRATCH}/${name}`;
  return { root, admin: `${root}/admin`, state: `${root}/admin-state`, telemetry: `${root}/telemetry`, cookie: `${root}/admin-cookie.txt` };
}

/**
 * A fresh scratch admin config: config.json and policy.json as given, empty
 * state and telemetry (a stale version-check answer would show on the login
 * page), no cookie from an earlier run.
 */
export function writeScenario(name, { config = {}, policy = null } = {}) {
  const d = scenarioDirs(name);
  fs.rmSync(d.root, { recursive: true, force: true });
  for (const dir of [d.admin, d.state, d.telemetry]) ensureDir(dir);
  if (config) fs.writeFileSync(`${d.admin}/config.json`, JSON.stringify(config, null, 2));
  if (policy) fs.writeFileSync(`${d.admin}/policy.json`, JSON.stringify(policy, null, 2));
  return d;
}

async function status(url, ms = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "manual" });
    return r.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

/** Wait for a real 200: turbopack compiles a route on its first request. */
export async function waitFor(url, { timeout = 600000, want = 200 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await status(url, 120000)) === want) return true;
    await sleep(2000);
  }
  throw new Error(`${url} did not answer ${want} within ${timeout / 1000}s`);
}

/** The plugin frames load assets `npm run dev` builds first; `next dev` alone does not. */
function ensureSandboxAssets() {
  if (fs.existsSync(path.join(WEBMAIL, "public", "plugin-sandbox-assets", "manifest.json"))) return;
  console.log("  building the plugin sandbox assets");
  const r = spawnSync(process.execPath, ["scripts/build-plugin-sandbox.mjs"], { cwd: WEBMAIL, stdio: "inherit" });
  if (r.status !== 0) throw new Error("scripts/build-plugin-sandbox.mjs failed");
}

/**
 * `next dev` from the webmail checkout with a scenario's admin dirs. Only
 * one dev server runs per checkout, so stop one before starting the next.
 * `next dev` writes AGENTS.md and CLAUDE.md into the checkout; stop() takes
 * them away again when they were not there before.
 */
export async function startWebmail(name, { port, env = {}, demo = true, log = true, ready = "/login" } = {}) {
  ensureSandboxAssets();
  // The footer and the admin console show the commit. The captures run on
  // the release plus demo fixture changes, so they name the release's commit.
  const tag = fs.existsSync(path.join(WEBMAIL, "VERSION")) ? fs.readFileSync(path.join(WEBMAIL, "VERSION"), "utf8").trim() : "";
  const releaseCommit = tag ? spawnSync("git", ["-C", WEBMAIL, "rev-parse", "--short", `${tag}^{commit}`], { encoding: "utf8" }).stdout?.trim() : "";
  const d = scenarioDirs(name);
  const before = new Set(["AGENTS.md", "CLAUDE.md"].filter((f) => fs.existsSync(path.join(WEBMAIL, f))));
  const fullEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    DEMO_MODE: demo ? "true" : "false",
    DEV_MOCK_JMAP: "false",
    APP_NAME: "Bulwark Webmail",
    LOGIN_COMPANY_NAME: "",
    ADMIN_CONFIG_DIR: d.admin,
    ADMIN_STATE_DIR: d.state,
    TELEMETRY_DATA_DIR: d.telemetry,
    ADMIN_PASSWORD,
    BULWARK_UPDATE_CHECK: "off",
    ...(releaseCommit && !process.env.GIT_COMMIT ? { GIT_COMMIT: releaseCommit } : {}),
    ...env,
  };
  // An inherited JMAP_SERVER_URL would turn the setup wizard's server step into a read-only line.
  if (!("JMAP_SERVER_URL" in env)) delete fullEnv.JMAP_SERVER_URL;
  const logFile = `${d.root}/next-dev.log`;
  const out = fs.openSync(logFile, "a");
  const next = path.join(WEBMAIL, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "dev", "--turbopack", "-p", String(port)], { cwd: WEBMAIL, env: fullEnv, stdio: ["ignore", out, out], windowsHide: true });
  const base = `http://localhost:${port}`;
  if (log) console.log(`[${name}] next dev on ${base} (log ${logFile})`);
  const instance = {
    name, base, dirs: d, child,
    async stop() {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill("SIGTERM");
      await sleep(1500);
      for (const f of ["AGENTS.md", "CLAUDE.md"]) {
        if (!before.has(f)) fs.rmSync(path.join(WEBMAIL, f), { force: true });
      }
      if (log) console.log(`[${name}] stopped`);
    },
  };
  child.on("exit", (code) => { instance.exited = code ?? true; });
  try {
    // Before setup, /login redirects to /setup: wait for the page that answers.
    await waitFor(`${base}${ready}`);
    // Before setup the config route answers 503; after it, check demo mode took.
    if (ready === "/login") {
      await waitFor(`${base}/api/config`);
      const config = await fetch(`${base}/api/config`).then((r) => r.json());
      if (!!config.demoMode !== demo) throw new Error(`demoMode is ${config.demoMode}, expected ${demo}: the admin config beats the env`);
    }
  } catch (e) {
    await instance.stop();
    throw e;
  }
  return instance;
}

/**
 * The admin API with one session. The login is rate limited (5 tries per 15
 * minutes), so the cookie is kept in the scenario dir and reused by every
 * browser context and every later process against the same instance.
 */
export class AdminApi {
  constructor(base, cookieFile) {
    this.base = base;
    this.cookieFile = cookieFile;
    this.cookie = fs.existsSync(cookieFile) ? fs.readFileSync(cookieFile, "utf8").trim() : "";
  }

  headers(extra = {}) {
    return { cookie: this.cookie, "x-forwarded-for": OFFICE_IP, ...extra };
  }

  async signIn() {
    if (this.cookie && (await fetch(`${this.base}/api/admin/config`, { headers: this.headers() })).status === 200) return this;
    const r = await fetch(`${this.base}/api/admin/auth`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": OFFICE_IP },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });
    const set = r.headers.getSetCookie?.() ?? [];
    if (r.status !== 200 || !set.length) throw new Error(`admin sign-in failed: ${r.status} ${await r.text().catch(() => "")}`);
    this.cookie = set.map((c) => c.split(";")[0]).join("; ");
    fs.mkdirSync(path.dirname(this.cookieFile), { recursive: true });
    fs.writeFileSync(this.cookieFile, this.cookie);
    return this;
  }

  /** The session as Playwright cookies for one host (localhost or a *.localhost name). */
  browserCookies(host = "localhost") {
    return this.cookie.split("; ").filter(Boolean).map((pair) => {
      const i = pair.indexOf("=");
      return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: "/", httpOnly: true, sameSite: "Lax" };
    });
  }

  async call(method, p, body, { json = true } = {}) {
    const init = { method, headers: this.headers(body && json ? { "content-type": "application/json" } : {}) };
    if (body) init.body = json ? JSON.stringify(body) : body;
    const r = await fetch(`${this.base}${p}`, init);
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
  }

  get(p) { return this.call("GET", p); }
  patchConfig(values) { return this.call("PATCH", "/api/admin/config", values); }
  putPolicy(policy) { return this.call("PUT", "/api/admin/policy", policy); }

  async uploadPlugin(zip) {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(zip)], { type: "application/zip" }), path.basename(zip));
    return this.call("POST", "/api/admin/plugins", form, { json: false });
  }

  /** Install a plugin or theme from the extension directory. */
  marketplace(slug, version, type = "plugin") {
    return this.call("POST", "/api/admin/marketplace", { slug, version, type });
  }

  async uploadBranding(file, slot, host) {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(file)], { type: file.endsWith(".svg") ? "image/svg+xml" : "image/png" }), path.basename(file));
    form.append("slot", slot);
    if (host) form.append("host", host);
    return this.call("POST", "/api/admin/branding", form, { json: false });
  }
}

/** A JSON server on 127.0.0.1 for a local stand-in. Returns a close function. */
export function jsonServer(port, handler, label) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const [code, body, type] = await handler(url, req);
    res.writeHead(code, { "content-type": type || "application/json", "access-control-allow-origin": "*" });
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => {
    console.log(`  ${label} on http://127.0.0.1:${port}`);
    resolve(() => new Promise((r) => server.close(() => r())));
  }));
}

/**
 * An OpenID provider as far as the login page looks (discovery only: the SSO
 * button appears once the metadata route can fetch it; nobody clicks it), and
 * a JMAP session document for the setup wizard's server probe.
 */
export function mockOidc(port) {
  const B = `http://127.0.0.1:${port}`;
  return jsonServer(port, (url) => {
    if (url.pathname === "/.well-known/openid-configuration" || url.pathname === "/.well-known/oauth-authorization-server") {
      return [200, {
        issuer: B, authorization_endpoint: `${B}/authorize`, token_endpoint: `${B}/token`, userinfo_endpoint: `${B}/userinfo`,
        jwks_uri: `${B}/jwks`, end_session_endpoint: `${B}/logout`, revocation_endpoint: `${B}/revoke`,
        response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"], scopes_supported: ["openid", "email", "profile", "offline_access"],
        subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
      }];
    }
    if (url.pathname === "/.well-known/jmap" || url.pathname === "/jmap/session") {
      return [200, {
        capabilities: { "urn:ietf:params:jmap:core": { maxSizeUpload: 50000000 }, "urn:ietf:params:jmap:mail": {}, "urn:ietf:params:jmap:submission": {} },
        accounts: {}, primaryAccounts: {}, username: "", state: "1",
        apiUrl: `${B}/jmap/`, downloadUrl: `${B}/jmap/download/{accountId}/{blobId}/{name}?accept={type}`,
        uploadUrl: `${B}/jmap/upload/{accountId}/`, eventSourceUrl: `${B}/jmap/eventsource/`,
      }];
    }
    return [404, {}];
  }, "mock OpenID provider and JMAP session");
}

/**
 * The version server, answering the way the real one does for a release
 * that is current: the Updates page then shows "up to date" for the running
 * version, as it does on a real install today.
 */
export function mockVersionServer(port) {
  return jsonServer(port, (url) => {
    const v = url.searchParams.get("v") || "0.0.0";
    return [200, { schema: 1, current: v, latest: v, updateAvailable: false, severity: "none", url: `https://github.com/bulwarkmail/webmail/releases/tag/${v}`, advisory: null, checkedAt: new Date().toISOString() }];
  }, "mock version server");
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".eml": "message/rfc822", ".pdf": "application/pdf" };

/**
 * A static host for a Lite export built with NEXT_PUBLIC_BASE_PATH=<prefix>:
 * files under the prefix, then dir/index.html, then name.html, then the
 * client shells (`/<locale>/<surface>/`) the way _redirects asks.
 */
export function staticLite(port, dir, prefix = "/webmail") {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/" || p === prefix) { res.writeHead(302, { location: `${prefix}/` }); return res.end(); }
    if (!p.startsWith(`${prefix}/`)) { res.writeHead(404); return res.end(); }
    p = p.slice(prefix.length);
    const cands = [p, path.posix.join(p, "index.html"), `${p}.html`];
    const m = p.match(/^\/([a-z-]+)\/(mail|calendar|contacts|files|settings)\//i);
    if (m) cands.push(`/${m[1]}/${m[2]}/index.html`);
    for (const c of cands) {
      const f = path.join(root, c);
      if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
        return fs.createReadStream(f).pipe(res);
      }
    }
    res.writeHead(404, { "content-type": "text/html" });
    fs.createReadStream(path.join(root, "404.html")).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => {
    console.log(`  Lite at http://127.0.0.1:${port}${prefix}/`);
    resolve(() => new Promise((r) => server.close(() => r())));
  }));
}
