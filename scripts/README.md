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

### The demo instance

Everything is captured from demo mode, so no real mail can leak into a
published image. The admin config directory beats environment variables, so a
checkout whose `data/admin` pins `demoMode: false` ignores `DEMO_MODE=true`:
point the admin dirs at a scratch directory.

```sh
S=/tmp/bulwark-shots; mkdir -p $S/admin $S/admin-state $S/telemetry
printf '{"setupComplete":true,"demoMode":true}' > $S/admin/config.json
cd $BULWARK_WEBMAIL
DEMO_MODE=true DEV_MOCK_JMAP=false APP_NAME="Bulwark Webmail" LOGIN_COMPANY_NAME="Bulwark Webmail" \
  ADMIN_CONFIG_DIR=$S/admin ADMIN_STATE_DIR=$S/admin-state TELEMETRY_DATA_DIR=$S/telemetry \
  ADMIN_PASSWORD=screenshots-only BULWARK_UPDATE_CHECK=off \
  npx next dev --turbopack -p 3100
# Turbopack compiles routes on first request; wait for a real 200:
until [ "$(curl -s -m 20 -o /dev/null -w '%{http_code}' http://localhost:3100/login)" = "200" ]; do :; done
curl -s http://localhost:3100/api/config | grep -o '"demoMode":[a-z]*'   # must say true
```

On Windows (Git Bash) pass the directories as `C:/...` paths, not `/c/...`:
Node takes the latter literally.

## Capture

```sh
node scripts/shoot.mjs                       # every flow, light and dark
node scripts/shoot.mjs --theme dark          # one theme
node scripts/shoot.mjs --flow desktop,phone  # some flows
node scripts/shoot.mjs --only inbox,viewer   # some shots
```

Captures land in `.staging/screenshots/` as `<theme>-<name>.webp` at
5120x2880 (the app laid out at 1280x720 and rendered at 4x; `SHOOT_PNG=1`
keeps the PNG). Look at them before syncing: a bounced login page and a real
screenshot are the same thing to a shell script. The driver reports missed
click targets and exits non-zero, because a missed click leaves the previous
view in the next shot.

The clock is pinned to the next Tuesday at 09:41 (`SHOOT_CLOCK` overrides it),
so both themes show the same mail at the same times and "today" is a weekday.
The demo's simulated incoming mail is switched off for the run.

### Flows and shots

| Flow | Needs | Shots |
| --- | --- | --- |
| `desktop` | the demo instance | `inbox`, `viewer`, `mention-card`, `invite`, `read-receipt`, `unsubscribe`, `external-content`, `attachments`, `attachment-preview`, `search`, `search-filters`, `composer`, `composer-mention`, `templates`, `unified-inbox`, `shared-mailbox`, `account-switcher`, `tag`, `sender-check`, `scheduled`, `shortcuts`, `calendar`, `calendar-week`, `calendar-event`, `calendar-create`, `tasks`, `contacts-detail`, `contact-group`, `files`, `files-documents`, `files-grid`, `file-preview`, `settings`, `settings-appearance`, `themes`, `identities`, `filters`, `settings-templates`, `vacation`, `pro`, `pro-calendar`, `pro-composer`, `search-palette` |
| `columns` | the demo instance | `inbox-columns` (the one-line list as a table, #262) |
| `phone` | the demo instance | `phone-inbox`, `phone-message`, `phone-calendar` (390x844 at 3x) |
| `pwa` | the demo instance | `pwa/screenshot-1280x720.png`, `pwa/screenshot-540x720.png` for the web app manifest |
| `admin` | `SHOOT_ADMIN_PASSWORD` | `admin-overview`, `admin-plugins`, `admin-marketplace`, `admin-branding`, `admin-telemetry` |
| `login` | `SHOOT_LOGIN_BASE`: an instance with `DEMO_MODE=false` and any `JMAP_SERVER_URL` | `login` |
| `setup` | `SHOOT_SETUP_BASE` + `SHOOT_SETUP_TOKEN`: an instance with empty admin dirs and no `JMAP_SERVER_URL` at all (not in `.env.local` either); the token is in its log | `setup-welcome`, `setup-server`, `setup-auth`, `setup-branding`, `setup-review` |

Only one `next dev` runs per checkout, so the login and setup instances come
from a second checkout or run after the demo instance is stopped. The setup
probe goes green against any reachable JMAP server (`SHOOT_SETUP_SERVER`).

Click targets are the demo fixtures' subjects (`lib/demo/fixtures` in the
webmail). A fixture change that renames one shows up as a reported miss.

## Frame and compose

```sh
node scripts/frame.mjs          # .staging/framed/: window frames, laptop+phone hero, light/dark split
node scripts/og.mjs             # .staging/cards/og-{full,lite}.png
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
| Social | `og-full`, `og-lite`, the X header and the avatars |
