// Preloaded into the webmail's `next dev` (NODE_OPTIONS=--import) where a
// page shows an outside address the capture can't reach: the page keeps the
// real-looking address, and the server's request goes to a local stand-in
// (lib/instance.mjs). SHOOT_FETCH_MAP is JSON, URL prefix -> replacement:
//
//   {"https://version.telemetry.bulwarkmail.org/": "http://127.0.0.1:3128/"}
//
// Only fetch() from the server is touched, and only for those prefixes.
let map = {};
try { map = JSON.parse(process.env.SHOOT_FETCH_MAP || "{}"); } catch { map = {}; }
const prefixes = Object.keys(map);

if (prefixes.length) {
  const original = globalThis.fetch;
  globalThis.fetch = function fetchWithStandIns(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    const prefix = url && prefixes.find((p) => url.startsWith(p));
    if (prefix) return original(map[prefix] + url.slice(prefix.length), init);
    return original(input, init);
  };
}
