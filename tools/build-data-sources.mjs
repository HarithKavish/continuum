// Regenerates the catalogue section of docs/DATA_SOURCES.md from the provider metadata
// in src/config/providers/, so the documentation cannot drift from what the app shows.
// Usage: node --experimental-strip-types tools/build-data-sources.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { PROVIDERS } from '../src/config/providers/catalog.ts';
import { FUTURE_SOURCES } from '../src/config/providers/future.ts';

const START = '<!-- catalogue:start -->';
const END = '<!-- catalogue:end -->';
const cell = (s) =>
  String(s ?? 'Not stated')
    .replace(/\|/g, '\|')
    .replace(/\n/g, ' ');
const lines = [];

lines.push('| Provider | Category | Coverage | Resolution | Auth | CORS | Licence | Status |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const p of PROVIDERS) {
  lines.push(
    `| [${cell(p.name)}](#${p.id}) | ${p.category} | ${p.coverage.extent} | ${cell(p.resolution.split('.')[0])} | ${p.authentication} | ${p.cors.verified ? `verified ${p.cors.verifiedOn}` : 'no'} | ${cell(p.licence.name)} | ${p.status} |`,
  );
}
lines.push('');
for (const p of PROVIDERS) {
  lines.push(`### ${p.name}`, '', `<a id="${p.id}"></a>`, '');
  lines.push('| | |', '|---|---|');
  const rows = [
    ['Provider', p.organisation],
    ['Dataset', p.dataset],
    ['Description', p.description],
    ['Documentation', p.documentationUrl],
    ['Endpoint', `\`${p.endpoint.url}\` (${p.endpoint.protocol}; ${p.endpoint.format})`],
    ['Capabilities', p.capabilities.join(', ')],
    ['Authentication', 'None'],
    [
      'CORS (browser)',
      p.cors.verified
        ? `Verified ${p.cors.verifiedOn}; Access-Control-Allow-Origin: ${p.cors.allowOrigin}`
        : 'Not verified',
    ],
    ['Coverage', p.coverage.description],
    ['Resolution', p.resolution],
    ['Horizontal accuracy', p.accuracy.horizontal ?? 'Not stated by the provider'],
    ['Vertical accuracy', p.accuracy.vertical ?? 'Not stated by the provider'],
    ['Accuracy reference', p.accuracy.reference ?? '—'],
    ['Vertical datum', p.verticalDatum ?? 'Not applicable'],
    ['Surface model', p.surfaceModel ?? 'Not applicable'],
    ['Updates', `${p.temporal.kind}: ${p.temporal.description}`],
    ['Rate limits', p.rateLimits],
    ['Caching', p.caching],
    [
      'Licence',
      `[${p.licence.name}](${p.licence.url})${p.licence.notes ? ` — ${p.licence.notes}` : ''}`,
    ],
    ['Attribution', p.attribution.full],
    ['Limitations', p.limitations.length ? p.limitations.join(' ') : 'None recorded'],
    ['Status', p.status],
  ];
  for (const [k, v] of rows) lines.push(`| ${k} | ${cell(v)} |`);
  lines.push('');
}
lines.push('### Investigated, not integrated', '', '| Source | Reason |', '|---|---|');
for (const f of FUTURE_SOURCES) lines.push(`| ${cell(f.name)} | ${cell(f.reason)} |`);

const path = 'docs/DATA_SOURCES.md';
const doc = readFileSync(path, 'utf8');
const before = doc.slice(0, doc.indexOf(START) + START.length);
const after = doc.slice(doc.indexOf(END));
writeFileSync(path, `${before}\n\n${lines.join('\n')}\n\n${after}`);
console.log(
  `Wrote ${PROVIDERS.length} providers and ${FUTURE_SOURCES.length} future sources to ${path}`,
);
