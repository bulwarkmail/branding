# Bulwark Mail Branding

Official branding assets and the design system for Bulwark Mail. The rules for using them are in [GUIDELINES.md](GUIDELINES.md) and on [bulwarkmail.org/brand](https://bulwarkmail.org/brand).

## Structure

```
GUIDELINES.md         Logo rules and the design system: colour, type, layout, components, writing
favicon/              Favicon for Bulwark and Bulwark Lite in PNG and SVG
  source/             Gravit Designer source files
logo/                 Logo (icon only) in Color, Dark, and White variants
  source/             Gravit Designer source files
logo-with-lettering/  Logo with text in Dark and White variants
  source/             Gravit Designer source files
social/               Open Graph cards, X header and profile pictures, with safe-area guides
tokens/               Design tokens as CSS custom properties and JSON
```

## Variants

### Logo

| Variant | PNG                           | SVG                           |
| ------- | ----------------------------- | ----------------------------- |
| Color   | `logo/Bulwark Logo Color.png` | `logo/Bulwark Logo Color.svg` |
| Dark    | `logo/Bulwark Logo Dark.png`  | `logo/Bulwark Logo Dark.svg`  |
| White   | `logo/Bulwark Logo White.png` | `logo/Bulwark Logo White.svg` |

### Logo with Lettering

| Variant       | PNG                                                                   | SVG                                                                   |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Dark + Color  | `logo-with-lettering/Bulwark Logo with Lettering Dark and Color.png`  | `logo-with-lettering/Bulwark Logo with Lettering Dark Color.svg`      |
| White + Color | `logo-with-lettering/Bulwark Logo with Lettering White and Color.png` | `logo-with-lettering/Bulwark Logo with Lettering White and Color.svg` |

### Favicon

| Edition      | PNG                                | SVG                                |
| ------------ | ---------------------------------- | ---------------------------------- |
| Bulwark      | `favicon/Bulwark Favicon.png`      | `favicon/Bulwark Favicon.svg`      |
| Bulwark Lite | `favicon/Bulwark Favicon Lite.png` | `favicon/Bulwark Favicon Lite.svg` |

### Social

| Use                  | File                        | Size        |
| -------------------- | --------------------------- | ----------- |
| Open Graph, Bulwark  | `social/og-full.png`        | 1200 × 630  |
| Open Graph, Lite     | `social/og-lite.png`        | 1200 × 630  |
| X header             | `social/twitter-header.png` | 1500 × 500  |
| X profile picture    | `social/twitter-avatar.png` | 400 × 400   |
| GitHub profile image | `social/github-avatar.png`  | 500 × 500   |

Every image except the Open Graph cards also comes at `@2x`, and each has a `-guides` version that shows the platform's crop.

## Colours

| Token         | Bulwark   | Bulwark Lite |
| ------------- | --------- | ------------ |
| Brand, field  | `#db2d54` | `#0f8578`    |
| Link          | `#c01f46` | `#0a6b60`    |
| Text          | `#18181b` | `#18181b`    |
| Surface       | `#f4f4f5` | `#f4f4f5`    |

The full set, with dark values, is in [`tokens/bulwark.css`](tokens/bulwark.css) and [`tokens/tokens.json`](tokens/tokens.json). Type is [Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk) at weight 400, and code is [JetBrains Mono](https://www.jetbrains.com/lp/mono/).
