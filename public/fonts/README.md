# Self-Hosted Fonts

The app uses two self-hosted, offline-first web fonts, split by role:

| Role | Family | Token(s) | File expected here |
|------|--------|----------|--------------------|
| Story & headings (serif) | **Fraunces** | `--font-sans`, `--font-heading` | `fraunces-variable.woff2` |
| Story & headings (italic) | **Fraunces** italic | (same) | `fraunces-italic-variable.woff2` |
| UI / chrome (sans) | **Inter** | `--font-ui` | `inter-variable.woff2` |

`@font-face` declarations live in [`src/styles/fonts.css`](../../src/styles/fonts.css)
and reference the files by these exact names. Drop the `.woff2` files into this
directory (`public/fonts/`) and they activate automatically — no code change.

## Why the files aren't committed

They were prepared in a build sandbox with **no outbound network access**, so the
binaries couldn't be downloaded there. The CSS ships with **system-font fallbacks**
(Georgia/Palatino for the serif; system-ui for the sans) and `font-display: swap`,
so the app already looks correct and literary without them — the web fonts simply
upgrade the rendering once present.

## Getting the files

Both are open-source (SIL Open Font License). Recommended sources:

- **Fraunces** (variable): <https://github.com/undercasetype/Fraunces> —
  use `Fraunces[SOFT,WONK,opsz,wght].woff2` (rename to `fraunces-variable.woff2`)
  and its italic (`fraunces-italic-variable.woff2`).
- **Inter** (variable): <https://github.com/rsms/inter> —
  use `InterVariable.woff2` (rename to `inter-variable.woff2`).

Or via [Fontsource](https://fontsource.org/) (`@fontsource-variable/fraunces`,
`@fontsource-variable/inter`) — copy the variable `.woff2` from the package's
`files/` directory and rename to match the table above.

> Tip: single **variable** files (weight axis 100–900) keep the payload small and
> cover every weight the UI needs. If you only have static weights, add extra
> `@font-face` blocks in `fonts.css` for the weights you ship (400, 600, 700).

## Verifying

1. Place the files here.
2. Hard-refresh the app (the service worker caches them on first fetch).
3. In DevTools → Network, confirm the `.woff2` files load `200` from this origin
   (not a CDN), and the story/editor text renders in Fraunces, chrome in Inter.
