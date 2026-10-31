# Product images

Every screenshot on bulwarkmail.org, in the webmail README and in the press
kit comes out of the scripts in this folder. Nothing is edited by hand: a UI
change means running them again. They capture a demo instance of the webmail
with Playwright, frame and compose the results with headless Chromium, and
copy the files into the repos that show them.

## Setup

This repo has no dependencies. Playwright comes from the webmail checkout and
sharp from the website checkout; both default to the nested layout of the
webmail repo (`repos/branding`, `repos/website`). Elsewhere:

```sh
export BULWARK_WEBMAIL=/path/to/webmail
export BULWARK_WEBSITE=/path/to/website
```

### The instances

Everything is captured from demo mode or from a login page, so no real mail
can leak into a published image. `shoot-all.mjs` runs the webmail instances
the captures need one after another (only one `next dev` runs per checkout),
each with a fresh scratch admin config written by the script. The admin
config beats environment variables, so a checkout's own `data/admin` is never
used. `scenarios.mjs` says what each instance is:

| Instance | Port | What it is | Flows |
| --- | --- | --- | --- |
| `demo` | 3122 | demo mode as a home user has it: a second push relay, three plugins and the Bolt theme from the directory, the update check answered "up to date" by a local mock | `desktop`, `columns`, `phone`, `pwa`, `homelab`, `admin` |
| `org` | 3123 | demo mode at Meridian Labs: the organisation policy (locks, signature, disclaimer, templates, external mail, scopes), OpenID Connect settings, branding for `mail.meridianlabs.localhost`, S/MIME from the directory, team inbox and e-invoice uploaded, no third-party traffic | `org`, `orgadmin`, `smallbiz` |
| `nondemo` | 3124 | demo mode off, against a local mock OpenID provider | `login` |
| `setup` | 3125 | empty admin dirs, so the setup wizard runs | `setup` |
| `lite` | 3129 | a Lite export with demo mode on, served under `/webmail` | `lite` |

Every admin change goes through the admin API the way the console would
send it, so the audit log shows that work. Requests carry an address from the
documentation range (203.0.113.24), which is what the log shows.

Flows that show what the organisation set up sign in to the admin console in
the same browser before "Launch Demo" (the cookie in the scenario dir; the
admin login allows five tries per 15 minutes, so one session serves the whole
run). Without it the demo gets only the public part of the policy and no
admin-installed plugins.

Per-host branding uses `mail.meridianlabs.localhost`: `next dev` only finishes
loading on `localhost` and `*.localhost`, and Chromium resolves both to the
loopback address by itself.

The footer and the admin console show the release's commit (from the tag
named in the webmail's `VERSION`), since the captures run on the release plus
demo fixture changes. `GIT_COMMIT` overrides it.

### Before a run

Plugin zips, built from the plugins repository's `origin/main` without
touching its working tree (`SHOOT_PLUGINS` points at the folder):

```sh
P=/path/to/plugins-build; mkdir -p $P
git -C $BULWARK_WEBMAIL/repos/plugins fetch origin
git -C $BULWARK_WEBMAIL/repos/plugins archive origin/main team-inbox e-invoice scripts package.json | tar -x -C $P
# node_modules: a link to the webmail's (esbuild and jszip are all the build needs)
# e-invoice says minAppVersion 1.20.0; its APIs shipped in 1.19.1, so the scratch copy is lowered:
node -e "const f='$P/e-invoice/manifest.json',fs=require('fs'),m=JSON.parse(fs.readFileSync(f));m.minAppVersion='1.19.1';fs.writeFileSync(f,JSON.stringify(m,null,2))"
(cd $P && node scripts/build.mjs team-inbox && node scripts/build.mjs e-invoice)
```

S/MIME comes from the extension directory. The e-invoice capture shows a
plugin that needs Bulwark 1.20 to install unmodified; say so wherever it is
shown.

The Lite export, built in a throwaway copy (the build deletes the server
code from the tree it runs in; `SHOOT_LITE` points at its `out/`):

```sh
L=/path/to/lite-src; mkdir -p $L
git -C $BULWARK_WEBMAIL archive <release tag> | tar -x -C $L   # then link node_modules to the webmail's
cd $L && LITE_DEMO_MODE=true NEXT_PUBLIC_BASE_PATH=/webmail LITE_LOCALES=en \
  LITE_JMAP_SERVER_URL=https://mail.example.com node scripts/lite/build.mjs --in-place
```

On Windows (Git Bash) pass every directory as a `C:/...` path, not `/c/...`:
Node takes the latter literally. A checkout whose `node_modules` is a link
outside it needs `NEXT_TURBOPACK_ROOT` set to a folder above both.

## Capture

```sh
node scripts/shoot-all.mjs                         # every instance, every flow, light and dark
node scripts/shoot-all.mjs org nondemo             # some instances
node scripts/shoot-all.mjs org -- --only admin-policy --theme dark   # after --: passed to shoot.mjs
node scripts/shoot-all.mjs --serve org             # set one up and keep it running, for debugging
SHOOT_BASE=http://localhost:3123 SHOOT_ADMIN_COOKIE_FILE=<scratch>/org/admin-cookie.txt \
  node scripts/shoot.mjs --flow org --only external-mail   # against a running instance
```

Captures land in `.staging/screenshots/` as `<theme>-<name>.webp` at
5120x2880 (the app laid out at 1280x720 and rendered at 4x; `SHOOT_PNG=1`
keeps the PNG; `SHOOT_SCALE=1` is quicker while debugging). Look at them
before syncing: a bounced login page and a real screenshot are the same thing
to a shell script. The driver reports missed click targets and exits
non-zero, because a missed click leaves the previous view in the next shot.

The clock is pinned to the next Tuesday at 09:41 (`SHOOT_CLOCK` overrides it),
so both themes show the same mail at the same times and "today" is a weekday.
The demo's simulated incoming mail is switched off for the run. Chromium runs
with `--lang=en-US` as well as the en-US locale: native date and time fields
follow the former.

### Flows and shots

| Flow | Instance | Shots |
| --- | --- | --- |
| `desktop` | demo | `inbox`, `viewer`, `mention-card`, `invite`, `read-receipt`, `unsubscribe`, `external-content`, `attachments`, `attachment-preview`, `search`, `search-filters`, `composer`, `composer-mention`, `templates`, `unified-inbox`, `shared-mailbox`, `account-switcher`, `tag`, `sender-check`, `scheduled`, `shortcuts`, `calendar`, `calendar-week`, `calendar-event`, `calendar-create`, `tasks`, `contacts-detail`, `contact-group`, `files`, `files-documents`, `files-grid`, `file-preview`, `settings`, `settings-appearance`, `identities`, `filters`, `settings-templates`, `pro`, `pro-calendar`, `pro-composer`, `search-palette` |
| `columns` | demo | `inbox-columns` (the one-line list as a table, #262) |
| `phone` | demo | `phone-inbox`, `phone-message`, `phone-calendar` (390x844 at 3x) |
| `pwa` | demo | `pwa/screenshot-1280x720.png`, `pwa/screenshot-540x720.png` for the web app manifest |
| `homelab` | demo | `contacts-import`, `settings-notifications`, `filters-sieve`, `account-switcher`, `themes` |
| `admin` | demo | `admin-overview`, `admin-plugins`, `admin-marketplace`, `admin-telemetry`, `admin-updates` |
| `org` | org | `external-mail`, `composer-org-signature`, `templates-org`, `smime-signed`, `recover-deleted`, `settings-locked`, `delegates`, `shared-tags`, `settings-accessibility` |
| `orgadmin` | org | `admin-policy`, `admin-domains`, `admin-domains-effective`, `admin-auth`, `admin-signatures`, `admin-org-templates`, `admin-security`, `admin-third-party`, `admin-shared-tags`, `admin-branding`, `admin-audit-log` |
| `smallbiz` | org | `shared-mailbox`, `shared-mailbox-reply`, `vacation`, `calendar-shared`, `calendar-availability`, `team-inbox`, `e-invoice` |
| `login` | nondemo | `login-sso`, `login`, `login-branded`, `login-servers` |
| `setup` | setup | `setup-welcome`, `setup-server`, `setup-auth`, `setup-branding`, `setup-review` |
| `lite` | lite | `lite-inbox` |

Click targets are the demo fixtures' subjects (`lib/demo/fixtures` in the
webmail). A fixture change that renames one shows up as a reported miss.

## Frame and compose

```sh
node scripts/frame.mjs          # .staging/framed/: window frames, laptop+phone hero, light/dark split
node scripts/og.mjs             # .staging/cards/og-{full,organisations,small-business,homelab}.png
node scripts/twitter-header.mjs # X header, with --guides for the safe areas
node scripts/avatar.mjs         # X and GitHub profile pictures
node scripts/launch-images.mjs  # the Stalwart 1.0 launch boards (needs Google Fonts)
```

The framed images are 2400x1500 WebP under 400 KB, in the website's flat
style: a 1px window edge on a plain ground, no shadow, the raspberry field
only under the laptop-and-phone hero. The cards are PNG because social
crawlers are unreliable with WebP.

## Sync

```sh
node scripts/sync.mjs --dry-run
node scripts/sync.mjs
```

Run it against the checkouts that should receive the images, for example
`BULWARK_WEBSITE=/path/to/website BULWARK_WEBMAIL=/path/to/webmail node scripts/sync.mjs`.
Copies the staging folders into the website (`public/screenshots`,
`public/beauty`, `public/press/...`, `public/og-*.png`), the webmail
(`screenshots/` for the README, `public/screenshot-*.png` for the manifest)
and `social/` here. Nothing is deleted on the target, so a renamed capture
leaves its old file behind; check `git status` there.

## Where the images are used

| Where | Images |
| --- | --- |
| Website landing page | `inbox` (hero), `composer`, `calendar`, `files` |
| Website docs | one or two per feature page; the docs embed the light and the dark file and let CSS pick |
| Website press page | `inbox`, `composer`, `calendar`, `files` as downloads |
| Press kit (`public/press/beauty`) | the framed set |
| Webmail README | `laptop-phone`, `calendar-week`, `contacts-detail`, `composer`, `split-inbox` (framed) |
| Web app manifest | the two PWA screenshots |
| Social | `og-full`, the audience cards (`og-organisations`, `og-small-business`, `og-homelab`), the X header and the avatars |
