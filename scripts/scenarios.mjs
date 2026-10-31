// The webmail instances the captures need, and how each one is set up.
// shoot-all.mjs starts them one after another (one `next dev` per checkout)
// and runs the flows listed under each.
//
// Every admin change goes through the admin API, the way an admin's clicks
// would, so the audit log shows that work. Only what an admin can't do from
// the console (demo mode, the setup marker) is written into config.json
// before the start.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS = path.join(here, "assets");

/**
 * Plugin zips built from the plugins repository's origin/main (README.md
 * has the commands). SHOOT_PLUGINS points at the folder holding
 * <name>/<name>.zip; a missing zip skips that plugin and the shots that
 * need it report a miss.
 */
export const PLUGINS_DIR = process.env.SHOOT_PLUGINS || "";
const pluginZip = (name) => (PLUGINS_DIR ? path.join(PLUGINS_DIR, name, `${name}.zip`) : "");

export const PORTS = { demo: 3122, org: 3123, nondemo: 3124, setup: 3125, oidc: 3127, version: 3128, lite: 3129 };

export const WORK_HOST = "mail.meridianlabs.example";

/** Env that preloads lib/fetch-redirect.mjs with these prefixes. */
function standIns(map) {
  return {
    SHOOT_FETCH_MAP: JSON.stringify(map),
    NODE_OPTIONS: `--import ${pathToFileURL(path.join(here, "lib", "fetch-redirect.mjs")).href}`,
  };
}
export const BRANDED_HOST = "mail.meridianlabs.localhost"; // *.localhost: the only names that load in `next dev`

const FEATURES = {
  pluginsEnabled: true, pluginsUploadEnabled: false, requirePluginApproval: true,
  crossUnreadViewEnabled: true, crossStarredViewEnabled: true, crossAllViewEnabled: true, unifiedCrossAccountEnabled: true,
};

/** The home lab: two relays to pick from, plugins and a theme from the directory. */
const HOME_POLICY = {
  features: FEATURES,
  pushRelays: [{ label: "Home relay", url: "https://push.lindqvist.example" }],
};

/** Meridian Labs: locks, the organisation's signature, templates, external mail, scopes. */
const ORG_POLICY = {
  restrictions: {
    density: { locked: true, value: "comfortable" },
    interfaceLayout: { locked: true, value: "default" },
    externalContentPolicy: { locked: true, value: "ask" },
    deleteAction: { allowedValues: ["trash", "trash-and-read"] },
    signature: { locked: true },
    sharedTags: { locked: true },
  },
  features: FEATURES,
  defaults: { density: "comfortable" },
  // S/MIME for everyone. Team inbox and e-invoice are installed but not
  // forced: neither is in the directory yet, so only the flows that show
  // them turn them on (Settings > Add-ons), and no other capture shows them.
  forceEnabledPlugins: ["smime"],
  pushRelays: [{ label: "Meridian Labs relay", url: "https://push.meridianlabs.example" }],
  pushRelayUrl: "https://push.meridianlabs.example",
  pushRelayUrlLocked: true,
  organisation: {
    externalMail: { senderLabel: true, recipientWarning: true, domains: ["meridianlabs.example"], trustContacts: true },
    signature: {
      html: "<p><b>{name}</b><br>{title}, {department}<br>{company}<br>Phone: {phone}</p>",
      text: "{name}\n{title}, {department}\n{company}\nPhone: {phone}",
      fields: ["title", "department", "phone"],
    },
    disclaimer: {
      html: "<p style=\"color:#666;font-size:11px\">Meridian Labs GmbH, Torstraße 140, 10119 Berlin. This message may contain confidential information.</p>",
      text: "Meridian Labs GmbH, Torstraße 140, 10119 Berlin. This message may contain confidential information.",
    },
    templates: {
      library: [
        { id: "org-ooo-handover", name: "Handover before leave", subject: "Handover: {{subject}}", body: "Hi,\n\nI'm away from {{date}}. Until I'm back, please contact Alice Johnson for anything on Beacon.\n\nThanks,\nNora", isHTML: false, category: "Meridian Labs" },
        { id: "org-customer-ack", name: "Support: we got your request", subject: "We received your request", body: "Hello {{recipientName}},\n\nThanks for writing to Meridian Support. We have your request and will answer within one working day.\n\nMeridian Support", isHTML: false, category: "Support" },
      ],
    },
    session: { idleMinutes: 30, maxHours: 12, warnSeconds: 60 },
    recovery: { days: 30 },
  },
  scopes: [
    { id: "meridian-staff", label: "Meridian Labs staff", match: { domains: ["meridianlabs.example"] }, policy: { features: {}, restrictions: { singleKeyShortcuts: { locked: true, value: true } }, defaults: {}, organisation: {} } },
    { id: "support-team", label: "Support team", match: { groups: ["support@meridianlabs.example"] }, policy: { features: {}, restrictions: {}, defaults: {}, organisation: { session: { idleMinutes: 15 } } } },
  ],
};

const BRANDED = {
  host: BRANDED_HOST,
  appName: "Meridian Mail",
  pwaThemeColor: "#0f766e",
  loginCompanyName: "Meridian Labs",
  loginWebsiteUrl: "https://meridianlabs.example",
  loginImprintUrl: "https://meridianlabs.example/imprint",
  loginPrivacyPolicyUrl: "https://meridianlabs.example/privacy",
  loginUsernamePlaceholder: "name@meridianlabs.example",
};

async function brandHost(api) {
  await api.patchConfig({ domainBranding: [BRANDED] });
  await api.uploadBranding(path.join(ASSETS, "meridian-logo-light.svg"), "loginLogoLightUrl", BRANDED_HOST);
  await api.uploadBranding(path.join(ASSETS, "meridian-logo-dark.svg"), "loginLogoDarkUrl", BRANDED_HOST);
  await api.uploadBranding(path.join(ASSETS, "meridian-mark.svg"), "appLogoLightUrl", BRANDED_HOST);
}

/** Install the version the directory offers this Bulwark. */
async function fromDirectory(api, slug, type = "plugin") {
  const list = await api.get(`/api/admin/marketplace?q=${encodeURIComponent(slug)}&type=${type}&perPage=50`);
  const ext = (list.data ?? []).find((e) => e.slug === slug && e.type === type);
  const version = ext?.latest?.version;
  if (!version) throw new Error(`${slug} is not in the directory (${type})`);
  await api.marketplace(slug, version, type);
  console.log(`  installed ${slug} ${version} from the directory`);
}

async function upload(api, name) {
  const zip = pluginZip(name);
  if (!zip || !fs.existsSync(zip)) { console.log(`  ! ${name}: no zip at ${zip || "(SHOOT_PLUGINS unset)"}, skipped`); return; }
  await api.uploadPlugin(zip);
  console.log(`  uploaded ${name}`);
}

export const SCENARIOS = {
  // Demo mode as a home user has it: the mail, calendar, contacts and files
  // flows, the phone and the column list, and the admin console of a home lab.
  demo: {
    port: PORTS.demo,
    demo: true,
    config: { setupComplete: true, demoMode: true },
    // The update check keeps its default endpoint; lib/fetch-redirect.mjs
    // sends the request to the local mock, which answers "up to date".
    env: {
      BULWARK_UPDATE_CHECK: "on",
      ...standIns({ "https://version.telemetry.bulwarkmail.org/": `http://127.0.0.1:${PORTS.version}/` }),
    },
    mocks: ["version"],
    async setup(api) {
      await api.putPolicy({ ...(await api.get("/api/admin/policy")), ...HOME_POLICY });
      for (const slug of ["calendar-agenda", "translate", "paperless"]) await fromDirectory(api, slug).catch((e) => console.log(`  ! ${e.message}`));
      await fromDirectory(api, "bolt", "theme").catch((e) => console.log(`  ! ${e.message}`));
      const policy = await api.get("/api/admin/policy");
      await api.putPolicy({ ...policy, approvedPlugins: ["calendar-agenda", "translate", "paperless"] });
    },
    flows: ["desktop", "columns", "phone", "pwa", "homelab", "admin", "demologin"],
  },

  // Demo mode at Meridian Labs: the organisation policy, its plugins, the
  // branding per web address and no third-party traffic.
  org: {
    port: PORTS.org,
    demo: true,
    config: { setupComplete: true, demoMode: true },
    env: { JMAP_SERVER_URL: `https://${WORK_HOST}` },
    async setup(api) {
      await api.patchConfig({
        loginCompanyName: "Meridian Labs",
        oauthEnabled: true,
        oauthClientId: "bulwark-webmail",
        oauthIssuerUrl: "https://sso.meridianlabs.example/realms/meridian",
        oauthScopes: "openid email profile offline_access",
        wopiClientUrl: "https://office.meridianlabs.example",
        accessibilityStatementUrl: "https://meridianlabs.example/accessibility",
      });
      await brandHost(api);
      await fromDirectory(api, "smime").catch((e) => console.log(`  ! ${e.message}`));
      await upload(api, "team-inbox");
      await upload(api, "e-invoice");
      await api.putPolicy({ ...(await api.get("/api/admin/policy")), ...ORG_POLICY });
      // Last, as an admin would: the directory is out of reach once it is on.
      await api.patchConfig({ noThirdPartyTraffic: true });
    },
    flows: ["org", "orgadmin", "smallbiz"],
  },

  // A real login page (demo mode off), against a mock OpenID provider.
  nondemo: {
    port: PORTS.nondemo,
    demo: false,
    config: { setupComplete: true, demoMode: false },
    env: { JMAP_SERVER_URL: `https://${WORK_HOST}` },
    mocks: ["oidc"],
    async setup(api) {
      await brandHost(api);
    },
    flows: ["login"],
  },

  // The setup wizard: no admin config at all. Its server step probes the
  // address typed in; the probe reaches the local stand-in, which answers
  // with a JMAP session as Stalwart would.
  setup: {
    port: PORTS.setup,
    demo: false,
    config: null,
    env: standIns({ [`https://${WORK_HOST}/`]: `http://127.0.0.1:${PORTS.oidc}/` }),
    mocks: ["oidc"],
    flows: ["setup"],
  },
};

/** The login flow switches the non-demo instance between these. */
export const LOGIN_CONFIGS = {
  sso: { oauthEnabled: true, oauthClientId: "bulwark-webmail", oauthIssuerUrl: `http://127.0.0.1:${PORTS.oidc}`, oauthAllowPrivateEndpoints: true, oauthScopes: "openid email profile offline_access", jmapServers: [] },
  plain: { oauthEnabled: false, jmapServers: [] },
  servers: {
    oauthEnabled: false,
    jmapServerAutoPickByDomain: true,
    jmapServers: [
      { id: "meridian", label: "Meridian Labs", url: `https://${WORK_HOST}`, domains: ["meridianlabs.example"] },
      { id: "lumen", label: "Lumen Logistics", url: "https://mail.lumenlogistics.example", domains: ["lumenlogistics.example"] },
      { id: "cooper", label: "Cooper Creative", url: "https://mail.coopercreative.example", domains: ["coopercreative.example"] },
    ],
  },
};
