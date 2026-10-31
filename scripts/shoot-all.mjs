#!/usr/bin/env node
/**
 * Capture every screenshot: start each webmail instance the captures need,
 * set it up through the admin API, run its flows, stop it, next one.
 *
 *   node scripts/shoot-all.mjs                    # every instance, every flow, light and dark
 *   node scripts/shoot-all.mjs org nondemo        # some instances (scenarios.mjs)
 *   node scripts/shoot-all.mjs org -- --only admin-policy --theme dark
 *                                                 # anything after -- goes to shoot.mjs
 *   node scripts/shoot-all.mjs --serve org        # set one up and keep it running (Ctrl+C stops it)
 *
 * Needs BULWARK_WEBMAIL (a checkout whose `next dev` may be started and
 * stopped), BULWARK_WEBSITE (for sharp), SHOOT_PLUGINS (plugin zips, see
 * README.md) and SHOOT_LITE (a Lite export built with demo mode and the base
 * path /webmail) for the `lite` step. Scratch admin dirs go to SHOOT_SCRATCH
 * or .staging/instances, fresh for every start.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AdminApi, mockOidc, mockVersionServer, staticLite, startWebmail, waitFor, writeScenario } from "./lib/instance.mjs";
import { PORTS, SCENARIOS } from "./scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dash = argv.indexOf("--");
const own = dash >= 0 ? argv.slice(0, dash) : argv;
const passOn = dash >= 0 ? argv.slice(dash + 1) : [];
const serve = own.includes("--serve");
const names = own.filter((a) => !a.startsWith("--"));
const ORDER = [...Object.keys(SCENARIOS), "lite"];
const unknown = names.filter((n) => !ORDER.includes(n));
if (unknown.length) { console.error(`unknown instance ${unknown.join(", ")}; pick from ${ORDER.join(", ")}`); process.exit(2); }
const run = names.length ? ORDER.filter((n) => names.includes(n)) : ORDER;

const MOCKS = { oidc: () => mockOidc(PORTS.oidc), version: () => mockVersionServer(PORTS.version) };

function shoot(flows, env) {
  return new Promise((resolve) => {
    const args = [path.join(here, "shoot.mjs"), "--flow", flows.join(","), ...passOn];
    const child = spawn(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function webmail(name) {
  const sc = SCENARIOS[name];
  const dirs = writeScenario(name, { config: sc.config });
  const closers = [];
  for (const m of sc.mocks ?? []) closers.push(await MOCKS[m]());
  const inst = await startWebmail(name, { port: sc.port, env: sc.env, demo: sc.demo, ready: sc.config ? "/login" : "/setup" });
  let code = 0;
  try {
    const env = { SHOOT_BASE: inst.base, SHOOT_SCENARIO: name };
    if (sc.config) {
      const api = await new AdminApi(inst.base, dirs.cookie).signIn();
      console.log(`[${name}] setting up`);
      await sc.setup?.(api);
      env.SHOOT_ADMIN_COOKIE_FILE = dirs.cookie;
    } else {
      // The setup wizard: its token is written into the state dir on start.
      const tokenFile = `${dirs.state}/.setup-token`;
      env.SHOOT_SETUP_TOKEN = JSON.parse(fs.readFileSync(tokenFile, "utf8")).token;
    }
    if (serve) {
      console.log(`[${name}] serving ${inst.base}; cookie in ${dirs.cookie}. Ctrl+C stops it.`);
      await new Promise((r) => process.on("SIGINT", r));
    } else {
      code = await shoot(sc.flows, env);
    }
  } finally {
    await inst.stop();
    for (const close of closers) await close();
  }
  return code;
}

async function lite() {
  const dir = process.env.SHOOT_LITE;
  if (!dir || !fs.existsSync(path.join(dir, "lite-build.json"))) {
    console.log("[lite] skipped: SHOOT_LITE must point at a Lite export (README.md has the build command)");
    return 0;
  }
  const build = JSON.parse(fs.readFileSync(path.join(dir, "lite-build.json"), "utf8"));
  const close = await staticLite(PORTS.lite, dir, build.basePath || "/webmail");
  try {
    if (serve) { await new Promise((r) => process.on("SIGINT", r)); return 0; }
    return await shoot(["lite"], { SHOOT_LITE_BASE: `http://127.0.0.1:${PORTS.lite}${build.basePath || ""}` });
  } finally {
    await close();
  }
}

let failed = 0;
for (const name of run) {
  const code = await (name === "lite" ? lite() : webmail(name)).catch((e) => { console.log(`[${name}] FAILED: ${e.message}`); return 1; });
  if (code) failed++;
}
console.log(failed ? `\n${failed} instance(s) reported misses or failed; check the output above.` : "\nall instances done");
process.exit(failed ? 1 : 0);
