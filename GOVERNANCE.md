# Governance

This repository is part of the **HarithKavish ecosystem** and is governed by
[HarithKavish Governance](https://github.com/HarithKavish/harithkavish-governance).

Governance is read from that repository. It is not copied here.

## Start here

Agents: read [AGENTS.md](AGENTS.md) first, then follow
[AGENT_BOOTSTRAP.md](https://github.com/HarithKavish/harithkavish-governance/blob/main/AGENT_BOOTSTRAP.md).

## This repository

- **Role:** application
- **Surface:** https://continuum.harithkavish.com
- **Production branch:** `main`
- **Development branch:** `development`
- **Last verified against governance:** 2026-10-31T20:06:43Z

## Especially applicable

- [REPOSITORY](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/REPOSITORY.md)
- [BRANCHING](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/BRANCHING.md)
- [DESIGN_SYSTEM](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/DESIGN_SYSTEM.md)
- [DEVELOPMENT](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/DEVELOPMENT.md)
- [DEPLOYMENT](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/DEPLOYMENT.md)
- [SECURITY](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/SECURITY.md)

## Declared exceptions

Article 10. Each states what it deviates from, why, and what would end it.

1. **Dark theme by default when the reader has no ecosystem preference.**
   *Deviates from:* the shared theme toggle's fallback to the operating-system preference.
   *Why:* the surface is a full-screen globe against space; light chrome over it reads as
   a different product. A stored ecosystem preference is always honoured, and the default
   is applied without persisting it (`index.html`).
   *Ends when:* the design system offers a per-surface default theme, or the owner decides
   Continuum should follow the OS preference.
2. **Shared footer not rendered** (selective opt-out of `<harith-footer>`).
   *Why:* a full-viewport application with a fixed status bar has no document end for a
   footer; attribution and legal links are reachable from the header (Sources, About).
   *Ends when:* the design system has an application-shell variant with a compact footer.
3. **Local data-encoding colours** (`src/spatial/rendering/palettes.ts`, the flood
   legend colours copied from the GIBS colour map) and literal colours for
   elements drawn over imagery or space: the black scene background, the white crosshair,
   and the border and place-name colours drawn into imagery tiles
   (`src/spatial/imagery/vectorStyle.ts`).
   *Why:* these encode measured quantities or must stay legible over arbitrary imagery in
   both themes; the design system has no data-visualisation palette or over-imagery tokens.
   Interface chrome uses the shared tokens only.
   *Ends when:* the design system provides data-visualisation and over-imagery tokens.
4. **Brand mark with literal colours** (`public/branding/continuum-mark.svg`).
   *Why:* a standalone SVG used as favicon and brand mark cannot read CSS tokens; its
   colours are the design system's dark field and accent values.
   *Ends when:* the design system defines a pattern for per-surface marks.
5. **Header action buttons reset locally** (`button.site-nav__link` in `src/styles/app.css`).
   *Deviates from:* using the shared `.site-nav__link` styles unchanged.
   *Why:* the header's Sources, Controls and About items open dialogs, so the shell renders
   them as buttons. The design system styles `.site-nav__link` for links and leaves
   buttons with the browser's grey fill. The local rule only clears that fill.
   *Ends when:* the design system resets button backgrounds in `.site-nav__link`.
