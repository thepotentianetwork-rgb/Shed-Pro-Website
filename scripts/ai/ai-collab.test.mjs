/* Tests for the AI collaboration prototype.
 *
 * Two things are being tested and only one of them is code.
 *
 * The first is ordinary: the OpenAI helper builds the right request, handles
 * failure without leaking the key, and can find JSON in a reply that is
 * wrapped in prose.
 *
 * The second matters more. The guards are the only thing standing between "a
 * model did something unexpected" and "a pull request that looks fine". They
 * are tested by building real git repositories, making the exact edits a
 * misbehaving run would make, and checking the guard refuses. A guard that has
 * only been read is not a guard.
 *
 * No network. No API keys. Run: node --test scripts/ai/ai-collab.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { ask, scrub, extractJson } from './openai.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');

// ── the OpenAI helper ────────────────────────────────────────────────────

test('the request carries the key as a bearer header and nothing else odd', async () => {
  let seen = null;
  const fake = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'hello' } }] }) };
  };
  const out = await ask({ model: 'm', user: 'u', apiKey: 'sk-test-abcdefghijklmnop', fetchImpl: fake });
  assert.equal(out, 'hello');
  assert.match(seen.url, /\/chat\/completions$/);
  assert.equal(seen.opts.headers.Authorization, 'Bearer sk-test-abcdefghijklmnop');
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.model, 'm');
  assert.ok(body.max_completion_tokens > 0, 'a token ceiling is always sent — this runs unattended');
});

test('a missing key fails before any request is made', async () => {
  let called = false;
  const fake = async () => { called = true; };
  await assert.rejects(
    () => ask({ model: 'm', user: 'u', apiKey: '', fetchImpl: fake }),
    /OPENAI_API_KEY is not set/);
  assert.equal(called, false, 'nothing was sent');
});

test('an API error surfaces the reason but never the key', async () => {
  const fake = async () => ({
    ok: false, status: 401,
    text: async () => 'Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz. Check your key.',
  });
  await assert.rejects(
    () => ask({ model: 'm', user: 'u', apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz', fetchImpl: fake }),
    (e) => {
      assert.match(e.message, /OpenAI 401/);
      assert.ok(!/sk-proj-abcdefghij/.test(e.message), `the key leaked into the error: ${e.message}`);
      assert.match(e.message, /REDACTED/);
      return true;
    });
});

test('scrub catches keys and bearer tokens wherever they turn up', () => {
  assert.match(scrub('key sk-proj-ABCDEFGHIJKLMNOP here'), /REDACTED/);
  assert.match(scrub('Authorization: Bearer abcdefghijklmnopqrs'), /Bearer \*\*\*REDACTED/);
  assert.equal(scrub('nothing secret'), 'nothing secret');
  assert.equal(scrub(null), '');
});

test('an empty completion is an error, not an empty plan', async () => {
  const fake = async () => ({ ok: true, status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }) });
  await assert.rejects(() => ask({ model: 'm', user: 'u', apiKey: 'k', fetchImpl: fake }), /no text.*length/);
});

test('JSON is found inside fences and inside prose', () => {
  assert.deepEqual(extractJson('```json\n{"verdict":"ok"}\n```'), { verdict: 'ok' });
  assert.deepEqual(extractJson('Sure! {"verdict":"needs_work"} hope that helps'), { verdict: 'needs_work' });
  assert.equal(extractJson('no json at all'), null);
  assert.equal(extractJson(''), null);
});

// ── the guards ───────────────────────────────────────────────────────────

/* A throwaway repo shaped like this one, so the guard is tested against real
   git output rather than a mock of it. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'aiguard-'));
  const run = (c) => execSync(c, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  run('git init -q');
  run('git config user.email t@t; git config user.name t');
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  mkdirSync(join(dir, 'scripts/ai'), { recursive: true });
  mkdirSync(join(dir, 'tests/geometry'), { recursive: true });
  writeFileSync(join(dir, 'designer.html'),
    '<script>scr.src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";' +
    'var p=quoteCache.optionPrices;</script>');
  writeFileSync(join(dir, 'vercel.json'), '{"cleanUrls":true}');
  writeFileSync(join(dir, '.gitignore'), 'tests/three.js\n');
  writeFileSync(join(dir, '.github/workflows/ai-collab.yml'), 'name: x\n');
  writeFileSync(join(dir, 'scripts/ai/guard.mjs'), '// the real one is copied in below\n');
  writeFileSync(join(dir, 'tests/geometry/porch.test.mjs'), 'export const a=1;\n');
  writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>');
  run('git add -A && git commit -qm base');
  const base = run('git rev-parse HEAD').trim();
  return { dir, run, base, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function guard(r, extra = '') {
  try {
    execSync(`node ${GUARD} ${r.base} ${extra}`, { cwd: r.dir, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('an ordinary change passes', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'index.html'), '<h1>hello there</h1>');
    r.run('git add -A && git commit -qm change');
    assert.equal(guard(r).ok, true);
  } finally { r.cleanup(); }
});

test('it refuses a change to its own workflow', () => {
  // The one that matters most: a job that can edit its workflow can widen its
  // own permissions, and the next run starts with whatever it granted itself.
  const r = repo();
  try {
    writeFileSync(join(r.dir, '.github/workflows/ai-collab.yml'), 'name: x\npermissions: write-all\n');
    r.run('git add -A && git commit -qm sneaky');
    const g = guard(r);
    assert.equal(g.ok, false);
    assert.match(g.out, /protected path: \.github/);
    assert.match(g.out, /rewrite itself or its permissions/);
  } finally { r.cleanup(); }
});

test('it refuses a change to the guards themselves', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'scripts/ai/guard.mjs'), '// no checks today\n');
    r.run('git add -A && git commit -qm sneaky');
    assert.match(guard(r).out, /protected path: scripts\/ai/);
  } finally { r.cleanup(); }
});

test('it refuses a change to the deploy config', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'vercel.json'), '{"cleanUrls":false}');
    r.run('git add -A && git commit -qm deployy');
    assert.match(guard(r).out, /protected path: vercel\.json/);
  } finally { r.cleanup(); }
});

test('it refuses a deleted test file', () => {
  const r = repo();
  try {
    r.run('git rm -q tests/geometry/porch.test.mjs && git commit -qm "tidy up"');
    const g = guard(r);
    assert.equal(g.ok, false);
    assert.match(g.out, /deleted a test file: tests\/geometry\/porch\.test\.mjs/);
  } finally { r.cleanup(); }
});

test('it refuses a suite that got smaller even with every file intact', () => {
  // Deleting cases inside a file that survives is the same trick one level
  // down, and a file list cannot see it.
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'index.html'), '<h1>x</h1>');
    r.run('git add -A && git commit -qm change');
    const g = guard(r, '--tests-before 115 --tests-after 97');
    assert.equal(g.ok, false);
    assert.match(g.out, /suite got smaller: 115 tests before, 97 after/);
  } finally { r.cleanup(); }
});

test('adding tests is fine', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'tests/geometry/new.test.mjs'), 'export const b=1;\n');
    r.run('git add -A && git commit -qm "more tests"');
    assert.equal(guard(r, '--tests-before 115 --tests-after 130').ok, true);
  } finally { r.cleanup(); }
});

test('it refuses a Three.js upgrade', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'designer.html'),
      '<script>scr.src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";' +
      'var p=quoteCache.optionPrices;</script>');
    r.run('git add -A && git commit -qm upgrade');
    const g = guard(r);
    assert.equal(g.ok, false);
    assert.match(g.out, /no longer loads three@0\.128\.0/);
  } finally { r.cleanup(); }
});

test('it refuses a designer that stopped reading prices from the server', () => {
  // The page quoting its own numbers is the failure with money attached.
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'designer.html'),
      '<script>scr.src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";' +
      'var PRICES={gable:4200};</script>');
    r.run('git add -A && git commit -qm "local prices"');
    const g = guard(r);
    assert.equal(g.ok, false);
    assert.match(g.out, /no longer reads quoteCache/);
  } finally { r.cleanup(); }
});

test('several violations are all reported, not just the first', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'vercel.json'), '{}');
    r.run('git rm -q tests/geometry/porch.test.mjs');
    r.run('git add -A && git commit -qm "several"');
    const g = guard(r);
    assert.equal(g.ok, false);
    assert.match(g.out, /vercel\.json/);
    assert.match(g.out, /deleted a test file/);
  } finally { r.cleanup(); }
});

// ── the workflow itself ──────────────────────────────────────────────────

const WF = readFileSync(join(HERE, '..', '..', '.github', 'workflows', 'ai-collab.yml'), 'utf8');

test('the workflow can only be started by hand', () => {
  assert.match(WF, /on:\s*\n\s*workflow_dispatch:/);
  assert.ok(!/^\s{2}(push|pull_request|schedule|issue_comment):/m.test(WF),
    'no automatic trigger — turning this on is a deliberate act');
});

test('the workflow never merges and never deploys', () => {
  for (const verb of ['pr merge', '--auto', '--squash --delete', 'vercel ', 'gh release create']) {
    assert.ok(!WF.includes(verb), `found "${verb}" — this must only ever open a pull request`);
  }
});

test('the token permissions are the two it needs', () => {
  const block = /permissions:\s*\n((?:\s{2}\S+:\s*\S+\n)+)/.exec(WF);
  assert.ok(block, 'permissions are declared explicitly rather than inherited');
  const perms = block[1].trim().split('\n').map((l) => l.trim());
  assert.deepEqual(perms.sort(), ['contents: write', 'pull-requests: write']);
});

test('both keys are checked before anything is spent', () => {
  /* Run #1 died four steps in on "OPENAI_API_KEY is not set" — true, but it
     reads like a broken script rather than a secret missing from the repo, and
     it said nothing about the Anthropic key, which would have been the next
     surprise. The check now happens before the install and the first paid
     call, and covers both. */
  const pre = /Check the keys are actually here[\s\S]*?(?=\n      - name:)/.exec(WF);
  assert.ok(pre, 'there is a preflight step');
  assert.ok(pre[0].includes('OPENAI_API_KEY') && pre[0].includes('ANTHROPIC_API_KEY'),
    'it checks both keys, not just the one that failed first');
  const idx = (n) => WF.indexOf(n);
  assert.ok(idx('Check the keys are actually here') < idx('Plan (OpenAI)'), 'before the first paid call');
  assert.ok(idx('Check the keys are actually here') < idx('Install Claude Code'), 'before the install');
  // Lengths only — a few characters of a key in a public log is still a few
  // characters of a key.
  assert.ok(/\$\{#openai\}/.test(pre[0]) && /\$\{#anthropic\}/.test(pre[0]),
    'it reports lengths');
});

test('which key is which is decided by the key, not by the secret name', () => {
  /* The keys on this repository are stored under names of the owner's
     choosing, and Actions can only read a secret whose name is written in the
     workflow — so the workflow lists the names it knows. Choosing the OpenAI
     key by its NAME would be a guess, and getting it backwards would post an
     Anthropic key to OpenAI's endpoint. The only reliable signal is the key
     itself: an Anthropic key begins sk-ant-. */
  const pre = /Check the keys are actually here[\s\S]*?(?=\n      - name:)/.exec(WF)[0];
  assert.ok(/sk-ant-\*\)/.test(pre), 'it sorts the candidates by the sk-ant- prefix');
  for (const name of ['SHEDPRO_RENDER_PROJECT', 'SHEDPRO_RENDER_PROJECT_GPT']) {
    assert.ok(pre.includes(`secrets.${name}`), `${name} is one of the names it looks under`);
  }
  /* Whatever it resolves is exported for the later steps, so those steps must
     NOT also declare a step-level env of the same name: a step env wins over
     the job env, and an unset secret there would blank the resolved key. This
     is exactly what broke the first attempt at this fix. */
  const after = WF.slice(WF.indexOf('Record the starting point'));
  assert.ok(!/OPENAI_API_KEY: \$\{\{ secrets\./.test(after),
    'no later step re-declares OPENAI_API_KEY from a secret');
  assert.ok(!/ANTHROPIC_API_KEY: \$\{\{ secrets\./.test(after),
    'no later step re-declares ANTHROPIC_API_KEY from a secret');
  assert.ok(pre.includes('::add-mask::'),
    'the trimmed values are masked — GitHub only auto-masks an exact match');
});

test('secrets reach the steps that need them and are never printed', () => {
  assert.ok(WF.includes('${{ secrets.OPENAI_API_KEY }}'));
  assert.ok(WF.includes('${{ secrets.ANTHROPIC_API_KEY }}'));
  assert.ok(!/echo[^\n]*secrets\./.test(WF), 'no step echoes a secret');
  assert.ok(!/cat[^\n]*secrets\./.test(WF));
  /* The only lines that write a key value are the two that populate
     $GITHUB_ENV, and they are inside a group redirected to that file — none
     of them reaches the run log. */
  for (const m of WF.matchAll(/^\s*echo "(OPENAI_API_KEY|ANTHROPIC_API_KEY)=/gm)) {
    const rest = WF.slice(m.index, WF.indexOf('\n', WF.indexOf('}', m.index)));
    assert.ok(rest.includes('GITHUB_ENV'), 'a key value only ever goes to $GITHUB_ENV');
  }
});

test('there is exactly one fix round', () => {
  const fixSteps = (WF.match(/Fix \(Claude Code\)/g) || []).length;
  assert.equal(fixSteps, 1, 'one fix step, and no loop construct to repeat it');
  assert.ok(!/strategy:\s*\n\s*matrix:/.test(WF), 'no matrix that could multiply the rounds');
});

test('the guard runs after implementation AND after the fix', () => {
  // A guard that only runs once can be walked past by the second edit.
  const runs = (WF.match(/scripts\/ai\/guard\.mjs/g) || []).length;
  assert.ok(runs >= 2, `guard runs ${runs} times; it must run after every round of edits`);
});

test('Claude Code is not handed a general shell', () => {
  const tools = [...WF.matchAll(/--allowedTools "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(tools.length >= 2, 'every claude invocation constrains its tools');
  for (const t of tools) {
    assert.ok(!/(^|,)Bash(,|$)/.test(t), `unrestricted Bash in: ${t}`);
    for (const call of t.split(',')) {
      if (call.startsWith('Bash(')) {
        assert.match(call, /^Bash\((node --test|git diff|git status|curl -sSfo tests\/three\.js)/,
          `unexpected shell command allowed: ${call}`);
      }
    }
  }
});
