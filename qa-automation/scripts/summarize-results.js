#!/usr/bin/env node
/**
 * Turns the Playwright JSON report into a scenario-level outcome report.
 *
 * Playwright-BDD names each generated test after its Gherkin scenario and
 * wraps it in a describe block named after the Feature, so the JSON report
 * already carries everything needed for a BDD-shaped summary.
 *
 * Usage:
 *   node scripts/summarize-results.js --input test-results/results.json --out report
 *
 * Writes:
 *   <out>/summary.md    Markdown table (also appended to the job summary in CI)
 *   <out>/summary.json  Same data, machine-readable
 *
 * Exits 0 even when scenarios failed — the workflow decides the job status
 * from the Playwright exit code so the report always gets published.
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith('--') ? (i += 1, next) : 'true';
  }
  return args;
}

const args = parseArgs(process.argv);
const inputFile = path.resolve(args.input || 'test-results/results.json');
const outDir = path.resolve(args.out || 'report');
const suiteLabel = args.suite || 'all';
const envLabel = args.env || 'unknown';
const runUrl = args['run-url'] || '';

const OUTCOMES = {
  expected: { label: 'Passed', icon: '✅', key: 'passed' },
  unexpected: { label: 'Failed', icon: '❌', key: 'failed' },
  flaky: { label: 'Flaky (passed on retry)', icon: '⚠️', key: 'flaky' },
  skipped: { label: 'Skipped', icon: '⏭️', key: 'skipped' },
};

function cell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function duration(ms) {
  if (!ms || ms < 0) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function firstErrorLine(test) {
  const results = test.results || [];
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const err = results[i].error || (results[i].errors || [])[0];
    const message = err && (err.message || err.value);
    if (!message) continue;
    return String(message)
      // Playwright colourises error messages
      .replace(/\[[0-9;]*m/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)[0]
      .slice(0, 240);
  }
  return '';
}

/** Walk the nested suite tree, remembering the closest Feature-level title. */
function collect(suites, featurePath, rows) {
  for (const suite of suites || []) {
    // The outermost suite is the generated spec file; inner suites are the
    // Feature (and any Rule) titles. On Windows the file-level suite title
    // comes back with backslashes while `suite.file` uses forward slashes,
    // so compare normalised, and fall back to the .spec.js suffix.
    const normalise = (s) => String(s || '').replace(/\\/g, '/');
    const isFile =
      normalise(suite.title) === normalise(suite.file) ||
      /\.spec\.(js|ts)$/.test(normalise(suite.title));
    const nextPath = isFile ? featurePath : [...featurePath, suite.title].filter(Boolean);

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const outcome = OUTCOMES[test.status] || {
          label: test.status || 'unknown',
          icon: '❔',
          key: 'other',
        };
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        rows.push({
          feature: nextPath.join(' › ') || path.basename(spec.file || suite.file || ''),
          scenario: spec.title,
          project: test.projectName || '',
          // Playwright reports tags without the leading '@'
          tags: (spec.tags || []).map((t) => (t.startsWith('@') ? t : `@${t}`)).join(' '),
          status: outcome.key,
          statusLabel: outcome.label,
          icon: outcome.icon,
          durationMs: results.reduce((sum, r) => sum + (r.duration || 0), 0),
          attempts: results.length,
          retries: Math.max(0, (last.retry || 0)),
          error: outcome.key === 'passed' || outcome.key === 'skipped' ? '' : firstErrorLine(test),
          line: spec.line,
          file: spec.file || suite.file || '',
        });
      }
    }

    collect(suite.suites, nextPath, rows);
  }
}

let report = null;
if (fs.existsSync(inputFile)) {
  try {
    report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } catch (err) {
    console.error(`Could not parse ${inputFile}: ${err.message}`);
  }
} else {
  console.error(`No Playwright JSON report at ${inputFile}`);
}

const rows = [];
if (report) collect(report.suites, [], rows);

// Keep failures at the top — that is what a reader wants first.
const order = { failed: 0, flaky: 1, other: 2, passed: 3, skipped: 4 };
rows.sort((a, b) => (order[a.status] - order[b.status]) || a.feature.localeCompare(b.feature) || a.scenario.localeCompare(b.scenario));

const totals = rows.reduce(
  (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
  { passed: 0, failed: 0, flaky: 0, skipped: 0, other: 0 },
);
const wallClock = report && report.stats && report.stats.duration
  ? report.stats.duration
  : rows.reduce((sum, r) => sum + r.durationMs, 0);

const overall = totals.failed > 0 ? '❌ FAILED' : rows.length === 0 ? '⚠️ NO SCENARIOS RAN' : totals.flaky > 0 ? '⚠️ PASSED WITH FLAKES' : '✅ PASSED';
const headline = `${overall} — ${totals.passed} passed, ${totals.failed} failed, ${totals.flaky} flaky, ${totals.skipped} skipped (${rows.length} scenarios, ${duration(wallClock)})`;

const md = [];
md.push('## QA Automation — scenario report', '');
md.push(`**${overall}**`, '');
md.push('| | |', '|---|---|');
md.push(`| Environment | \`${cell(envLabel)}\` |`);
md.push(`| Suite | \`${cell(suiteLabel)}\` |`);
md.push(`| Scenarios executed | ${rows.length} |`);
md.push(`| Passed | ${totals.passed} |`);
md.push(`| Failed | ${totals.failed} |`);
md.push(`| Flaky (passed on retry) | ${totals.flaky} |`);
md.push(`| Skipped | ${totals.skipped} |`);
md.push(`| Total duration | ${duration(wallClock)} |`);
if (runUrl) md.push(`| Run | ${runUrl} |`);
md.push('');

if (rows.length === 0) {
  md.push('> No scenarios were reported. Check the **Run scenarios** step log — the most');
  md.push('> common causes are a `--grep` filter that matched nothing, or `bddgen` not');
  md.push('> having produced specs into `.features-gen/`.', '');
} else {
  md.push('### Outcome by scenario', '');
  md.push('| Result | Feature | Scenario | Project | Tags | Duration | Retries |');
  md.push('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    md.push(`| ${r.icon} ${cell(r.statusLabel)} | ${cell(r.feature)} | ${cell(r.scenario)} | ${cell(r.project)} | ${cell(r.tags)} | ${duration(r.durationMs)} | ${r.retries} |`);
  }
  md.push('');

  const problems = rows.filter((r) => r.status === 'failed' || r.status === 'flaky');
  if (problems.length > 0) {
    md.push('### Failure detail', '');
    for (const r of problems) {
      md.push(`<details><summary>${r.icon} ${cell(r.scenario)} — ${cell(r.feature)}</summary>`, '');
      md.push(`- **Project:** \`${cell(r.project)}\``);
      md.push(`- **Feature file:** \`${cell(r.file)}${r.line ? `:${r.line}` : ''}\``);
      md.push(`- **Attempts:** ${r.attempts}`);
      if (r.error) md.push('', '```', r.error, '```');
      md.push('', '</details>', '');
    }
    md.push('Download the **playwright-html-report** artifact for the Gherkin steps,');
    md.push('screenshots, videos and traces of these scenarios.', '');
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.md'), md.join('\n'), 'utf8');
fs.writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify({ environment: envLabel, suite: suiteLabel, runUrl, overall, headline, totals, durationMs: wallClock, scenarios: rows }, null, 2),
  'utf8',
);

console.log(md.join('\n'));

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `headline=${headline}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `failed=${totals.failed}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `passed=${totals.passed}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `total=${rows.length}\n`);
}
