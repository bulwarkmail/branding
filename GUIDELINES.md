# Bulwark brand and design system

The Bulwark logos and the rules for using them, followed by the design system: principles, colour, type, layout, shape, components, Bulwark Lite, writing and social images. The live version is at [bulwarkmail.org/brand](https://bulwarkmail.org/brand).

## Logo

The mark comes in three colours, each for its own ground. The geometry of the mark and the name are fixed.

| File | Ground |
| --- | --- |
| `logo/Bulwark Logo Color` | Light and dark neutral grounds |
| `logo/Bulwark Logo Dark` | Light grounds |
| `logo/Bulwark Logo White` | Dark grounds and the field |
| `logo-with-lettering/… Dark Color` | Light grounds |
| `logo-with-lettering/… White and Color` | Dark grounds |
| `favicon/Bulwark Favicon` | Browser tabs, Bulwark |
| `favicon/Bulwark Favicon Lite` | Browser tabs, Bulwark Lite |

### Rules for using the logo

1. **Keep clear space.** Leave room around the logo and keep other elements out of it.
2. **Keep it legible.** The mark is never smaller than 24 × 24 pixels.
3. **Leave it as it is.** The logo is never stretched, rotated or recoloured, and it takes no shadow, glow or outline.
4. **Match the ground.** The colour mark works on light and dark neutral grounds, the dark mark on light grounds, and the white mark on dark grounds and on the field.
5. **Pick the right format.** SVG on the web, PNG where vector files are not supported.

## Principles

Six things make a page recognisably Bulwark. The test for anything new: take the logo away and ask whether it could still only be Bulwark.

1. **One flat field.** The nav and the hero share a single raspberry field, the screenshot leaves it at the right edge of the page, and the field returns once for install.
2. **One family at regular weight.** Hanken Grotesk 400 for headings and body. Hierarchy comes from size and position. 500 is for buttons and table headers, 600 for the wordmark.
3. **Square, with shared edges.** Tiles meet on 1px rules with the title top-left and the arrow bottom-right. Radius is 0, and 2px on the things you press or type into.
4. **The product is the picture.** Real screenshots in a 1px frame, cropped where that helps, in the theme the viewer is using.
5. **Colour is an area.** Raspberry is the field and a few small marks: primary buttons, icons, links, the edge of a note.
6. **Plain sentences.** A heading says what the thing is or does, with at most one paragraph under it and no label above it.

Three habits bring the generic look back:

1. **A heavier headline.** Weight above 500, tracking tighter than -0.02em, a size above 72, or an accent on one word.
2. **A label.** An eyebrow above a heading, a caption above a screenshot, a step numeral used as decoration, or anything in uppercase monospace.
3. **Softening.** A radius above 4px, a shadow under a screenshot, a gradient inside the field, or a dark section between two light ones.

## Colour

Colour is assigned by role. Components read tokens, never hex values. The grounds are neutral grey, so the only colour on a page is the brand itself. The tokens are in [`tokens/bulwark.css`](tokens/bulwark.css) and [`tokens/tokens.json`](tokens/tokens.json).

| Role | Token | Light | Dark | Lite, light | Lite, dark | Used for |
| --- | --- | --- | --- | --- | --- | --- |
| Page | `--bw-page` | `#ffffff` | `#131315` | `#ffffff` | `#131315` | Page ground |
| Surface | `--bw-surface` | `#f4f4f5` | `#1f1f22` | `#f4f4f5` | `#1f1f22` | Quiet bands, footer, code blocks, notes, tile hover |
| Text | `--bw-text` | `#18181b` | `#f2f2f3` | `#18181b` | `#f2f2f3` | Headings and body |
| Muted text | `--bw-text-muted` | `#56565d` | `#ababb2` | `#56565d` | `#ababb2` | Supporting paragraphs, captions |
| Rule | `--bw-rule` | `#dddde1` | `#36363b` | `#dddde1` | `#36363b` | Tile edges, table rows, image frames |
| Control border | `--bw-control` | `#7f7f87` | `#85858d` | `#7f7f87` | `#85858d` | Inputs, outlined buttons, the edition switch |
| Brand | `--bw-brand` | `#db2d54` | `#db2d54` | `#0f8578` | `#0f8578` | Primary buttons, icons, the mark, note and active edges |
| Field | `--bw-field` | `#db2d54` | `#c4264b` | `#0f8578` | `#0c7267` | Nav, hero, install section |
| On field | `--bw-on-field` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | Text and buttons on the field |
| Link | `--bw-link` | `#c01f46` | `#ff91a8` | `#0a6b60` | `#6fd3c5` | Text links and the focus ring |
| Ink | `--bw-ink` | `#18181b` | `#18181b` | `#18181b` | `#18181b` | Code and button hover on the field |
| Error | `--bw-error` | `#b42318` | `#ff9b8f` | `#b42318` | `#ff9b8f` | Validation, with an icon and words |
| Warning | `--bw-warning` | `#8a5d00` | `#e2b341` | `#8a5d00` | `#e2b341` | The warning note edge |
| Success | `--bw-success` | `#17784a` | `#4cc38a` | `#17784a` | `#4cc38a` | The copied state |

### Contrast

WCAG 2.1 ratios for every pair the pages rely on. Text needs 4.5:1, borders and focus rings 3:1.

| Pair | Minimum | Light | Dark | Lite, light | Lite, dark |
| --- | --- | --- | --- | --- | --- |
| Text on page | 4.5:1 | 17.7:1 | 16.6:1 | 17.7:1 | 16.6:1 |
| Text on surface | 4.5:1 | 16.1:1 | 14.7:1 | 16.1:1 | 14.7:1 |
| Muted on page | 4.5:1 | 7.3:1 | 8.1:1 | 7.3:1 | 8.1:1 |
| Muted on surface | 4.5:1 | 6.6:1 | 7.2:1 | 6.6:1 | 7.2:1 |
| Link on page | 4.5:1 | 6.0:1 | 8.7:1 | 6.4:1 | 10.4:1 |
| Link on surface | 4.5:1 | 5.4:1 | 7.7:1 | 5.8:1 | 9.2:1 |
| Button text on brand | 4.5:1 | 4.65:1 | 4.65:1 | 4.52:1 | 4.52:1 |
| Text on the field | 4.5:1 | 4.65:1 | 5.6:1 | 4.52:1 | 5.8:1 |
| Ink text on the white field button | 4.5:1 | 17.7:1 | 17.7:1 | 17.7:1 | 17.7:1 |
| Code on ink | 4.5:1 | 15.8:1 | 15.8:1 | 15.8:1 | 15.8:1 |
| Control border on page | 3:1 | 4.0:1 | 5.1:1 | 4.0:1 | 5.1:1 |
| Focus ring on page | 3:1 | 6.0:1 | 8.7:1 | 6.4:1 | 10.4:1 |
| Error text on page | 4.5:1 | 6.6:1 | 9.1:1 | 6.6:1 | 9.1:1 |

White on raspberry and white on teal are the tight pairs. Text on the field is therefore never smaller than 17px, never lighter than 400 and never muted, and raspberry itself is never used for text on a grey ground. Raspberry is close to an error red, so errors and warnings have their own colours and always carry an icon and words.

## Type

Hanken Grotesk sets everything except code, which is JetBrains Mono. Both families are open source. Sizes are desktop / phone.

| Style | Spec | Sample |
| --- | --- | --- |
| Display | 60 / 36 px · 400 · 1.06 · -0.015em | Webmail for Stalwart |
| Heading 2 | 40 / 28 px · 400 · 1.12 · -0.015em | Two editions from the same code. |
| Heading 3, tile title | 21 / 19 px · 400 · 1.2 · -0.015em | Bulwark Legacy Proxy |
| Lead | 19 / 17 px · 400 · 1.45 | Bulwark puts mail, calendar, contacts and files in one browser client. |
| Body | 17 / 16 px · 400 · 1.55 | The setup wizard finds your Stalwart server and sets the admin password. |
| Small, tile text | 15 px · 400 · 1.5 | Several address books, groups, and vCard import and export. |
| Button, label, table header | 15 px · 500 · 1.2 | Read the docs |
| Caption, footer, breadcrumb | 13.5 px · 400 · 1.5 | Docs / Deployment |
| Code | 13.5 px · 400 · 1.65 · JetBrains Mono | `docker run -d -p 3000:3000` |

## Layout

Pages sit on a 12-column grid with an 8px unit.

- **Spacing.** An 8px unit with a 4px half step: 4, 8, 12, 16, 24, 32, 48, 64, 80, 120. Section padding is 120 on desktop, 96 on a tablet and 64 on a phone.
- **Grid.** 12 columns inside 1120px with 32px gaps. The page gutter is 80px, 40px on a tablet and 20px on a phone. Splits are 5 + 7, 4 + 8, 7 + 5 and 6 + 6, and they stack below 900px.
- **Screenshots.** Real captures in a 1px frame, cropped with object-position. They bleed off the field or sit flush in a row. Nothing is drawn, generated or staged, and nothing sits above them as a caption.

## Shape and motion

Everything is square, flat and still.

- **Border and radius.** 1px rules in the rule colour, 1px control borders, a 3px edge on notes. Radius is 0, and 2px on buttons, inputs, inline code and the edition switch. There are no shadows, gradients or blurs.
- **Focus ring.** 2px solid in the link colour, offset 2px. On the field the ring is white.
- **Motion.** Colour and border changes take 120ms with ease-out. Nothing moves, fades in or scrolls into place, and with reduced motion the changes are instant.
- **Icons.** Tabler Icons on a 24px grid with a 1.5px stroke, square caps and mitred joins. Sizes are 16, 20 and 24px, in the text colour or the brand colour, never inside a filled circle.

## Components

The pages are built from a small set of components.

- **Buttons.** Primary is a brand fill, secondary an outline. On the field both turn white. One arrow, on the right, when the button goes somewhere. Every control in the nav is 36px high.
- **Links.** Inline links are underlined in the link colour. A standalone link carries an arrow. Visited links keep their colour.
- **Edition switch.** A two-part segmented control. The active side is filled with the text colour, and on the field it is filled white. The install section uses the wide form with full labels.
- **Tiles.** Tiles share their edges. Title top-left, one line of text, arrow bottom-right, an optional brand-coloured icon above the title. Hover fills the tile with the surface colour. The list form has no minimum height.
- **Fact row and steps.** Facts are four unboxed columns: a brand icon, a title, one line. Numbered steps are used only for a real sequence, such as an install.
- **Tables.** A strong rule under the header, light rules between rows, no vertical rules and no zebra. Wide tables scroll inside their own container.
- **Code.** Blocks sit on the surface colour with a copy button. On the field they are ink. Strings take the link colour and comments the muted colour. Monospace appears nowhere except code.
- **Notes.** One shape, three kinds (edition, note, warning), told apart by their first words and the colour of the edge.
- **Search dialog.** Opens with the slash key. Results are grouped by section, the active row carries the surface colour and a brand edge, and the match is marked.
- **Form fields.** Label above, help below, a 1px control border and the focus ring. An error thickens the border, adds an icon and says how to fix it.

## Bulwark Lite

Bulwark Lite is the same design in teal.

1. **Four tokens change.** Brand, field, link and focus turn teal. Every neutral, the layout, the type and the radius stay as they are.
2. **The mark keeps its geometry.** It takes the brand colour on a page ground and white on the field, so one asset serves Bulwark, Lite and the field. Lite has its own favicon.
3. **Copy is written per edition.** Where the facts differ, both versions are written and the edition shows one. Pages that exist in one edition say so in a note.

## Writing

Headings say what the thing is or does. Sentence case throughout, and the facts come first.

- **One positive sentence.** "Webmail for Stalwart Mail Server." "Run Bulwark as one container." "Files sit on the mail server, next to your mail."
- **One paragraph at most.** A section is a heading, up to one paragraph, and up to one link or button.
- **Two labels a page at most.** A label is small text above a heading. Most pages have none, and the docs have the breadcrumb.
- **Questions belong to the FAQ.** Headings elsewhere are statements, and they say something about Bulwark rather than about another product.
- **Controls say what happens.** "Copy the command", then "Copied". An error says what went wrong and how to fix it.

## Social images

The social images follow the page: the flat field, the white mark and wordmark, the display heading at weight 400, and a real screenshot leaving the image at the right and the bottom. The files are in [`social/`](social/).

| File | Size | Safe area |
| --- | --- | --- |
| `og-full.png`, `og-lite.png` | 1200 × 630 | Open Graph card per edition |
| `twitter-header.png` | 1500 × 500 | The profile picture covers about x 0–400, y 300–500, and phones crop about 60px off the top and bottom. Text sits top-left inside y 60–440, and the corner under the avatar is empty field. |
| `twitter-avatar.png` | 400 × 400 | Cropped to a circle. The mark is 56% of the edge and stays well inside it. |
| `github-avatar.png` | 500 × 500 | Shown as a rounded square and down to 20px. The mark runs larger, at 64% of the edge. |

Each file with `-guides` in its name shows the crop over the image. The images are rendered, not edited: `scripts/og.mjs`, `scripts/twitter-header.mjs` and `scripts/avatar.mjs` in the [website repository](https://github.com/bulwarkmail/website) re-create them.

A profile bio follows the writing rules: "Open-source webmail for Stalwart Mail Server. Mail, calendar, contacts and files in one browser client."

## Checks before anything ships

- Count the labels above headings. Two at most, and none is better.
- Read every heading aloud and rewrite any that sets something up in order to knock it down.
- Measure every radius: 0, or 2px on a control.
- Check light and dark, Bulwark and Lite, then a 390px phone.
- Recheck the contrast table when a colour changes.
