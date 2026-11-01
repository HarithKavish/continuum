# Deployment

Continuum is a static site. Production is `https://continuum.harithkavish.com`, served by
**GitHub Pages**, published by the workflow
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) on every push
to `main`. There is no server, function, worker or database anywhere in the path.

## Why GitHub Pages, not Cloudflare Pages

The original brief recommended connecting the repository to Cloudflare Pages. That would
make the deployment a platform setting — invisible in the repository and unreviewable —
which the ecosystem's deployment standard does not permit
([DEPLOYMENT.md in governance](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/DEPLOYMENT.md)).
Cloudflare Pages driven by Wrangler from a workflow would comply, but needs a Cloudflare API
token as a repository secret. GitHub Pages deployed by a committed workflow complies with
nothing extra and is how the sibling subdomains (blog, nexus, timeline) are served. DNS for
`harithkavish.com` is on Cloudflare, so the site sits behind Cloudflare's proxy exactly as
those siblings do.

Switching to Cloudflare Pages later means: add `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets, replace the Pages steps with `wrangler pages deploy dist`,
and repoint DNS. The build output (`dist/`) is identical.

## Build

| | |
|---|---|
| Node | 22 |
| Package manager | pnpm (version pinned in `package.json`) |
| Build command | `pnpm build` (type-check, then Vite) |
| Output | `dist/` |
| SPA routing | The workflow copies `index.html` to `404.html` |
| Size | 14 MB total (measured): app JS 0.47 MB, CesiumJS 4.2 MB, Cesium workers/assets/widgets 7.6 MB, geoid grid 0.9 MB; no source maps |

The workflow runs type-check, lint and unit tests before building, and publishes `dist/`
with `actions/upload-pages-artifact` and `actions/deploy-pages`. The live commit and time
are visible as the workflow run and the `github-pages` environment's deployment history.

## Branch flow

Per [BRANCHING.md](https://github.com/HarithKavish/harithkavish-governance/blob/main/standards/BRANCHING.md):
`feature/claude` → pull request → `development` → `runway` → `main`. Production deploys
only from `main`. All three long-lived branches are protected (pull request required, the
`gate` check required, force-push and deletion refused, admins included).

## One-time setup (owner actions)

These require account permissions and are not done by any workflow.

1. **Repository visibility.** The repository was created private. GitHub Pages on a private
   repository needs a paid plan (the account's branch protection on a private repository
   shows it has one); the published site is public either way. Make the repository public
   if the source should be public — a decision for the owner.
2. **Enable Pages with the workflow build type**
   (Settings → Pages → Source: *GitHub Actions*), or:
   ```
   gh api -X POST repos/HarithKavish/continuum/pages -f build_type=workflow
   ```
3. **Custom domain**: Settings → Pages → Custom domain: `continuum.harithkavish.com`, or:
   ```
   gh api -X PUT repos/HarithKavish/continuum/pages -f cname=continuum.harithkavish.com
   ```
   `harithkavish.com` is already a verified Pages domain on the account
   (`protected_domain_state: verified` on sibling sites).
4. **DNS (Cloudflare, zone `harithkavish.com`)** — add exactly one record; change nothing
   else. Inspected 2026-11-01: `continuum.harithkavish.com` does not currently resolve.

   | Type | Name | Target | Proxy |
   |---|---|---|---|
   | CNAME | `continuum` | `harithkavish.github.io` | Proxied (as the sibling subdomains) |

   With the proxy on, Cloudflare terminates HTTPS (the zone's existing SSL mode applies, as
   for blog.harithkavish.com). If the proxy is turned off instead, enable *Enforce HTTPS*
   in Pages once GitHub has issued its certificate.
5. **Automated review secret**: set `CLAUDE_CODE_OAUTH_TOKEN` on the repository so
   `claude-review.yml` can review pull requests; the required `gate` check waits for its
   verdict.

## Verifying a deployment

```
curl -sI https://continuum.harithkavish.com/ | head -5           # 200, served via Cloudflare
curl -s  https://continuum.harithkavish.com/ | grep '<title>'     # Continuum
curl -sI https://continuum.harithkavish.com/cesium/Assets/approximateTerrainHeights.json
curl -sI https://continuum.harithkavish.com/data/egm96-15min.bin.gz
curl -sI https://continuum.harithkavish.com/any/deep/link         # serves the app (404.html)
```

Then open the site with the browser's network panel: requests go only to the app's own
origin, `harithkavish.com/design-system`, and the provider hosts listed in
[DATA_SOURCES.md](DATA_SOURCES.md). The end-to-end suite runs against a deployed site with
`PLAYWRIGHT_BASE_URL=https://continuum.harithkavish.com pnpm test:e2e --workers=1`.

## Caching

GitHub Pages serves static files with a short cache lifetime and ETags; Cesium's assets and
the geoid grid are revalidated cheaply. Provider responses are cached only by the browser,
according to each provider's own headers.
