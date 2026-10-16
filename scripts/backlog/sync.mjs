#!/usr/bin/env node
// Creates the GitHub labels and issues for the backlog from specs/001-mvp/tasks.md
// (168 MVP issues) and scripts/backlog/demo-issues.json (the spec's nine Backlog items).
//
//   node scripts/backlog/sync.mjs                      dry run: prints the plan, creates nothing
//   node scripts/backlog/sync.mjs --show T015,T017,B4  also print those issue bodies
//   node scripts/backlog/sync.mjs --out plan.md        write every issue body to a file
//   node scripts/backlog/sync.mjs --apply labels,mvp,demo [--max 3]   write to GitHub
//
// Safe to re-run: labels are upserted, and an issue whose title already exists is skipped.
// Issues are created in order, and "#N" references in bodies are predicted from the next free
// number. The script checks every number it gets back and stops on a mismatch, so do not open
// issues or PRs while it runs. Needs an authenticated `gh` in a clone of the repo.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const apply = new Set(String(flag('apply') ?? '').split(',').filter(Boolean));
const show = String(flag('show') ?? '').split(',').filter(Boolean);
const outFile = flag('out');
const max = flag('max') ? Number(flag('max')) : Infinity;

function gh(ghArgs, input) {
  const r = spawnSync('gh', ghArgs, { encoding: 'utf8', input, cwd: root });
  if (r.status !== 0) throw new Error(`gh ${ghArgs.slice(0, 3).join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ---------------------------------------------------------------- parse tasks.md
const PHASES = {
  1: { label: 'phase:1-pipeline', gate: null },
  2: { label: 'phase:2-foundation', gate: 'Phase 1 checkpoint (skeleton deployed, CI and `db` job green)' },
  3: { label: 'phase:3-signin-balances', gate: 'Phase 2 checkpoint (schema, helpers, seed, rows 1-9 and 25 green)' },
  4: { label: 'phase:4-request-leave', gate: 'Phase 3 checkpoint (US1)' },
  5: { label: 'phase:5-approvals', gate: 'Phase 4 checkpoint (US2)' },
  6: { label: 'phase:6-calendar', gate: 'Phase 2 checkpoint (can run alongside Phase 5)' },
  7: { label: 'phase:7-profile', gate: 'Phase 3 checkpoint (US1); T135 also needs `submit_leave_request` from Phase 4' },
  8: { label: 'phase:8-admin', gate: 'Phases 3, 4 and 5 (the demo loader submits and decides through the RPCs)' },
  9: { label: 'phase:9-polish', gate: 'the stories each check exercises' },
};

// Phase 1 ordering from the "Phase dependencies" section of tasks.md, plus the CI jobs'
// need for the scripts they call. Everything else comes from "T###" mentions in the text.
const PHASE1_EDGES = {
  T002: ['T001'], T003: ['T001'], T004: ['T001'], T005: ['T001'], T006: ['T001'],
  T007: ['T006'], T008: ['T002', 'T003', 'T004', 'T007'], T010: ['T006', 'T008'], T011: ['T010'],
  T012: ['T001'], T013: ['T012'], T014: ['T013'], T015: ['T014'], T016: ['T008', 'T015'],
  T017: ['T016'], T018: ['T017'], T019: ['T018'],
  T020: ['T008'], T021: ['T008', 'T020'], T022: ['T008', 'T016'], T023: ['T020', 'T021', 'T022'],
};

const titles = Object.fromEntries(
  readFileSync(join(here, 'titles.tsv'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')),
);

function parseTasks() {
  const tasks = [];
  const phaseText = {};
  let phase = 0;
  for (const line of readFileSync(join(root, 'specs/001-mvp/tasks.md'), 'utf8').split(/\r?\n/)) {
    const ph = line.match(/^## Phase (\d+):/);
    if (ph) phase = Number(ph[1]);
    const pur = line.match(/^\*\*(?:Purpose|Goal)\*\*: (.*)$/);
    if (pur && phase && !phaseText[phase]) phaseText[phase] = pur[1];
    const m = line.match(/^- \[[ x]\] (T\d{3})( \[P\])?(?: \[US(\d)\])? (.*)$/);
    if (!m) continue;
    const [, id, par, us, rest] = m;
    const manual = rest.startsWith('🧑 manual:');
    tasks.push({
      id, phase, parallel: Boolean(par), story: us ? `us${us}` : null, manual,
      text: rest.replace(/^🧑 manual:\s*/, ''),
      title: titles[id] ?? (() => { throw new Error(`no title for ${id}`); })(),
    });
  }
  if (tasks.length !== Object.keys(titles).length) {
    throw new Error(`tasks.md has ${tasks.length} tasks, titles.tsv has ${Object.keys(titles).length}`);
  }
  return { tasks, phaseText };
}

function taskRefs(text, self) {
  const ids = new Set();
  for (const m of text.matchAll(/T(\d{3})[–-]T?(\d{3})/g)) {
    for (let n = Number(m[1]); n <= Number(m[2]); n++) ids.add(`T${String(n).padStart(3, '0')}`);
  }
  for (const m of text.matchAll(/T(\d{3})/g)) ids.add(`T${m[1]}`);
  ids.delete(self);
  return [...ids].sort();
}

function filesIn(text) {
  const out = new Set();
  const notThese = new Set([...text.matchAll(/not in `([^`]+)`/g)].map((m) => m[1]));
  const known = /\.(ts|tsx|mjs|sql|ya?ml|json|jsonc|md|css|html|toml)$/;
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    let t = m[1];
    if (/\s|[?=]/.test(t) || t.startsWith('/')) continue;
    if (/^\*_.*\.sql$/.test(t)) t = `supabase/migrations/${t}`;
    if (known.test(t) || /^(src|supabase|scripts|tests|docs|specs|\.github)\//.test(t) || t.startsWith('.env')) {
      if (!t.includes('()') && !notThese.has(t)) out.add(t);
    }
  }
  for (const m of text.matchAll(/\]\(([^)#]+\.md)\)/g)) {
    out.add(m[1].startsWith('../../') ? m[1].slice(6) : `specs/001-mvp/${m[1]}`);
  }
  return [...out];
}

const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sentences = (text) => text.split(/(?<=[.;])\s+(?=[A-Z`(])/).map((s) => upper(s.trim().replace(/[.;]$/, ''))).filter(Boolean);
const firstSentence = (s) => (s.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? s).replace(/\.$/, '');
const isMigration = (t) => /migration `\*_/.test(t.text);

// ---------------------------------------------------------------- build issues
function buildPlan(existing, base) {
  const { tasks, phaseText } = parseTasks();
  const issues = [];
  let next = base;
  const numberOf = {};
  for (const [id, n] of Object.entries(existing)) numberOf[id] = n;
  const pending = [...tasks.map((t) => t.id), ...JSON.parse(readFileSync(join(here, 'demo-issues.json'), 'utf8')).map((d) => d.id)];
  for (const id of pending) if (!(id in numberOf)) numberOf[id] = next++;
  const ref = (id) => `#${numberOf[id]} (${id})`;

  let prevMigration = null;
  for (const t of tasks) {
    const refs = taskRefs(t.text, t.id);
    const before = refs.filter((r) => r < t.id);
    const after = refs.filter((r) => r > t.id);
    const blockers = [...new Set([...(t.phase === 1 ? PHASE1_EDGES[t.id] ?? [] : []), ...before])].sort();
    const gate = t.phase > 1 || blockers.length === 0 ? PHASES[t.phase].gate : null;
    const ready = t.phase === 1 && blockers.length === 0;
    const files = filesIn(t.text);
    const criteria = sentences(t.text).map((s) => `- [ ] ${s}`);
    criteria.push(t.manual
      ? '- [ ] The outcome is recorded where the task says to; no secrets or real emails in the repo or in comments'
      : '- [ ] Lint, typecheck and tests pass in CI (and a `Closes #N` line in the PR)');
    const outOfScope = [
      '- Anything not listed in the acceptance criteria; neighbouring tasks own it',
      '- MCP server work, and adding any service or dependency with a cost (ask Sam first)',
    ];
    if (t.manual) outOfScope.unshift('- Agents must not link Cloudflare or Supabase or handle credentials. Sam does this; an agent may only prepare instructions');
    if (after.length) outOfScope.unshift(`- Later work that uses this: ${after.map(ref).join(', ')} (separate issues)`);
    const dep = [`Blocked by: ${blockers.length ? blockers.map(ref).join(', ') : 'none'}`];
    if (gate) dep.push(`Starts after: ${gate}`);
    if (isMigration(t) && prevMigration) dep.push(`Merge order: migrations merge one at a time, after ${ref(prevMigration.id)}`);
    if (after.length) dep.push(`Related (later): ${after.map(ref).join(', ')}`);
    dep.push(`Parallel-safe: ${t.parallel ? 'yes (marked [P] in tasks.md)' : 'no'}`);
    if (isMigration(t)) prevMigration = t;

    const body = [
      '## Goal', '',
      `**${t.title}.** Part of phase ${t.phase} of the MVP task list: ${upper(firstSentence(phaseText[t.phase] ?? ''))}.`,
      `Source: \`specs/001-mvp/tasks.md\`, ${t.id}${t.story ? ` (${t.story.toUpperCase()})` : ''}.`, '',
      '## Acceptance criteria', '', ...criteria, '',
      '## Files to touch', '',
      ...(files.length ? files.map((f) => `- \`${f}\``) : [t.manual ? '- None in the repo (dashboard work)' : '- Named in the acceptance criteria above']), '',
      '## Out of scope', '', ...outOfScope, '',
      '## Dependencies', '', ...dep.map((d) => `${d}  `), '',
    ].join('\n');
    const labels = [PHASES[t.phase].label];
    if (t.story) labels.push(`story:${t.story}`);
    if (t.manual) labels.push('manual');
    if (ready) labels.push('status:ready');
    issues.push({ id: t.id, number: numberOf[t.id], title: `${t.id}: ${t.title}`, labels, body });
  }

  for (const d of JSON.parse(readFileSync(join(here, 'demo-issues.json'), 'utf8'))) {
    const body = [
      '## Goal', '', d.goal, '',
      '## Acceptance criteria', '', ...d.acceptance.map((a) => `- [ ] ${a}`), '- [ ] Lint, typecheck and tests pass in CI (and a `Closes #N` line in the PR)', '',
      '## Files to touch', '', ...d.files.map((f) => `- ${f}`), '',
      '## Out of scope', '', ...d.outOfScope.map((o) => `- ${o}`), '- Anything else in the MVP task list', '',
      '## Dependencies', '', `Blocked by: ${d.blockedBy.map(ref).join(', ')}  `,
      'Starts after: the MVP is merged (Phases 1-5 at least). Not part of the MVP.  ', '',
    ].join('\n');
    issues.push({ id: d.id, number: numberOf[d.id], title: d.title, labels: ['backlog', ...(d.ready ? ['status:ready'] : [])], body });
  }
  return issues;
}

// ---------------------------------------------------------------- run
const labels = JSON.parse(readFileSync(join(here, 'labels.json'), 'utf8'));
const existingIssues = JSON.parse(gh(['issue', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title']));
const highest = Number(gh(['api', 'repos/{owner}/{repo}/issues?state=all&per_page=1&sort=created&direction=desc', '--jq', '.[0].number // 0']));
const demoTitles = Object.fromEntries(JSON.parse(readFileSync(join(here, 'demo-issues.json'), 'utf8')).map((d) => [d.title, d.id]));
const existing = {};
for (const i of existingIssues) {
  const id = i.title.match(/^(T\d{3}):/)?.[1] ?? demoTitles[i.title];
  if (id) existing[id] = i.number;
}
const plan = buildPlan(existing, highest + 1);
const todo = plan.filter((i) => !(i.id in existing));

console.log(`Repo issues+PRs so far: ${highest}. Existing backlog issues: ${Object.keys(existing).length}.`);
console.log(`Labels: ${labels.length}. Issues to create: ${todo.length} (${todo.filter((i) => /^T/.test(i.id)).length} MVP, ${todo.filter((i) => /^B/.test(i.id)).length} backlog).`);
if (todo.length) console.log(`Numbers: #${todo[0].number} .. #${todo.at(-1).number}`);
const count = {};
for (const i of todo) for (const l of i.labels) count[l] = (count[l] ?? 0) + 1;
console.log('Per label:', Object.entries(count).sort().map(([k, v]) => `${k}=${v}`).join('  '));

for (const id of show) {
  const i = plan.find((p) => p.id === id);
  if (!i) { console.log(`\n(no issue ${id})`); continue; }
  console.log(`\n=== #${i.number} ${i.title}\nlabels: ${i.labels.join(', ')}\n\n${i.body}`);
}
if (outFile) {
  writeFileSync(outFile, plan.map((i) => `# #${i.number} ${i.title}\n\nlabels: ${i.labels.join(', ')}\n\n${i.body}\n---\n`).join('\n'));
  console.log(`\nWrote ${plan.length} issue bodies to ${outFile}`);
}

if (apply.has('labels') || apply.has('all')) {
  for (const l of labels) {
    gh(['label', 'create', l.name, '--color', l.color, '--description', l.description, '--force']);
    console.log(`label ${l.name}`);
  }
}
const wanted = (i) => (/^T/.test(i.id) ? apply.has('mvp') : apply.has('demo')) || apply.has('all');
let made = 0;
for (const i of todo.filter(wanted)) {
  if (made >= max) break;
  const url = gh(['issue', 'create', '--title', i.title, '--body-file', '-', '--label', i.labels.join(',')], i.body);
  const n = Number(url.split('/').pop());
  console.log(`#${n} ${i.title}`);
  if (n !== i.number) {
    throw new Error(`Expected #${i.number} but GitHub gave #${n}. Something else was opened meanwhile; cross-references from here on may be off. Stopping.`);
  }
  made++;
  sleep(1500);
}
if (apply.size) console.log(`Created ${made} issues.`);
else console.log('\nDry run: nothing was written to GitHub.');
