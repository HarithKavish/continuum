# Contributing

Continuum is part of the HarithKavish ecosystem. Read [AGENTS.md](../AGENTS.md) and
[GOVERNANCE.md](../GOVERNANCE.md) first; governance is read from its own repository, not
copied here.

## Setup

```
corepack enable            # or: npm i -g pnpm
pnpm install
pnpm dev                   # http://localhost:5173
```

No environment variables, keys or accounts are needed — Continuum has none.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | Type-check and production build to `dist/` |
| `pnpm preview` | Serve `dist/` on :4173 |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm lint` | ESLint |
| `pnpm format` / `format:write` | Prettier check / write (code only; Markdown is hand-wrapped) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Browser tests (Playwright) against the production build and live providers |
| `pnpm probe:endpoints` | Re-verify every provider endpoint from a real browser |

End-to-end tests start `pnpm preview` themselves; run `pnpm build` first. They render with
a software GPU (SwiftShader), so they are slow, and they depend on live public services.

## Rules

- **Browser only.** No server code, proxy, worker or database. A source that needs one is a
  future integration (record it in `src/config/providers/future.ts`).
- **Real data only.** Never synthesise terrain, events or metadata. Unknown accuracy or
  datum is shown as not stated.
- **Provenance.** Normalised records keep the provider id, the source's own id and the
  attribution.
- **No persisted provider data.** Only the reader's preferences go into `localStorage`.
- **Design system.** UI uses the shared tokens and classes; do not add colours, type or
  spacing scales. Data-encoding palettes live in `src/spatial/rendering/palettes.ts` (a
  declared exception).

## Adding a data source

1. Verify browser access: add a line to `tools/probe-endpoints.mjs` and run it. A tile
   source must pass the canvas read-back; check `opaqueBlackPct` for overlays.
2. Read the provider's terms and documentation; record licence, attribution, rate limits,
   coverage, resolution and documented accuracy in `src/config/providers/catalog.ts`.
3. Tiles: add a layer definition in `src/config/providers/layers.ts`. Data: add an adapter
   in `src/providers/` that validates with zod and returns normalised records.
4. Regenerate the catalogue in docs: `node --experimental-strip-types tools/build-data-sources.mjs`.
5. Add tests; add the host to `tests/e2e/helpers.ts` `ALLOWED_HOSTS`.

## Regenerating assets

- EGM96 geoid grid: `node tools/build-geoid-grid.mjs` (needs the `egm96-universal` dev
  dependency).
- Social preview: `.github/social-preview.png` (1280×640) — upload it in repository
  settings when it changes.
