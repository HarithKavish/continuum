# Agent Instructions

This repository is part of the **HarithKavish ecosystem**.

**Before changing anything**, read
[AGENT_BOOTSTRAP.md](https://github.com/HarithKavish/harithkavish-governance/blob/main/AGENT_BOOTSTRAP.md)
and follow it. See [GOVERNANCE.md](GOVERNANCE.md) for what governs this repository.

Do not begin implementation work before discovery is complete.

## Hard stops

A reminder, not the rule. These restate doctrine articles so an agent that reads nothing
else still has the guardrails. Governance is authoritative; if these ever disagree with
it, governance wins.

- Do not commit to the production branch (Article 6).
- Do not commit secrets or credentials (Article 5, SECURITY).
- Do not redefine design foundations locally (Article 4).
- Do not copy governance or the design system into this repository (Article 3).
- Do not act outside the scope you were given (Article 9).

## About this repository

Continuum is a browser-only spatial exploration application: a 3D Earth built from real,
publicly accessible data (terrain, imagery, bathymetry, natural events), navigable by
mouse, keyboard, touch and gamepad. It has no backend.

## Working here

- **No backend, ever, without an explicit decision.** No server, function, worker,
  database or proxy. Every provider request originates in the browser. A source that
  needs a key, a login or a proxy is a *future* integration, recorded in
  `docs/DATA_SOURCES.md`, not something to work around.
- **No persisted provider data.** Provider responses live in memory only. `localStorage`
  holds user preferences (controller bindings, layer choices) and nothing fetched.
- **Never fabricate data or metadata.** If a value, an accuracy figure or a datum is not
  documented by the provider, the UI says it is unavailable.
- **Adding a provider** means: metadata in `src/config/providers/`, an adapter in
  `src/providers/`, a row in `docs/DATA_SOURCES.md`, and a browser CORS check with
  `node tools/probe-endpoints.mjs`.
