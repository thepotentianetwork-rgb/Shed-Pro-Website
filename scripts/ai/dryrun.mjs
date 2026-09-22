/* A full dry run of the pipeline with no API keys and no network.
 *
 *   node scripts/ai/dryrun.mjs
 *
 * Stands up a stub that answers like the OpenAI API, then drives the real
 * plan.mjs, the real guard.mjs and the real review.mjs against a throwaway git
 * repository. Everything runs except the two things that need credentials: the
 * actual model calls, and Claude Code doing the edits.
 *
 * This is what "tested before enabling" means for something that cannot be run
 * for real without spending money and pushing a branch.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

const PLAN = `## Goal
Make the fictional widget on the home page say "hello" instead of "hi".

## Assessment
Clear and small. Fits the rules: no pricing, no Three.js, no build step.

## Approach
1. Find the heading in index.html.
2. Change the text.
3. Leave everything else alone.

## Risks
None worth noting. It is one string.

## Tests
Existing tests should still pass. Nothing here is worth a new test.

## Out of scope
Any other copy on the page.`;

const REVIEW = JSON.stringify({
  verdict: 'needs_work',
  summary: 'The change does what was asked, but the heading lost its punctuation.',
  issues: [{ title: 'Missing full stop', detail: 'The heading reads "hello" where the rest of the page uses sentences.', fix: 'Add the punctuation back.' }],
});

/* The stub is a separate process (scripts/ai/stub-openai.mjs) on purpose.
   In-process, the server could never answer: this script drives every step
   with execFileSync, which blocks the event loop the server needs. It
   deadlocked on the first call and printed nothing, because the logs were
   still in a pipe buffer when the timeout killed it. */
async function stub(port) {
  const tmp = mkdtempSync(join(tmpdir(), 'aistub-'));
  const planFile = join(tmp, 'plan.md');
  const reviewFile = join(tmp, 'review.json');
  writeFileSync(planFile, PLAN);
  writeFileSync(reviewFile, REVIEW);
  const child = spawn(process.execPath,
    [join(HERE, 'stub-openai.mjs'), String(port), planFile, reviewFile],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('stub did not start in 10s: ' + err)), 10000);
    child.stdout.on('data', (d) => { if (String(d).includes('STUB-READY')) { clearTimeout(t); resolve(); } });
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`stub exited ${c}: ${err}`)); });
    child.on('error', reject);
  });
  return { server: { close: () => { try { child.kill('SIGKILL'); } catch { /* gone */ } } } };
}

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'aidry-'));
  const run = (c) => execFileSync('bash', ['-c', c], { cwd: dir, encoding: 'utf8' });
  run('git init -q && git config user.email t@t && git config user.name t');
  // enough of the real repo for context.mjs and guard.mjs to behave
  for (const f of ['designer.html', 'index.html', 'vercel.json', '.gitignore']) {
    if (existsSync(join(REPO, f))) cpSync(join(REPO, f), join(dir, f));
  }
  mkdirSync(join(dir, 'scripts/ai'), { recursive: true });
  cpSync(join(REPO, 'scripts/ai'), join(dir, 'scripts/ai'), { recursive: true });
  cpSync(join(REPO, 'tests'), join(dir, 'tests'), { recursive: true, filter: (s) => !/three\.js$/.test(s) });
  run('git add -A && git commit -qm base');
  return { dir, run, base: run('git rev-parse HEAD').trim(), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const step = (n, s) => console.log(`\n── ${n}. ${s}`);
let failures = 0;
const check = (label, cond, detail) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  [' + detail + ']' : ''}`);
  if (!cond) failures++;
};

const PORT = Number(process.env.DRYRUN_PORT || 8899);
console.log('DRY RUN — the whole pipeline, no keys, no network, no branch pushed');
console.log('   starting stub on 127.0.0.1:' + PORT + ' …');
const { server } = await stub(PORT);
console.log('   building a throwaway repository …');
const box = sandbox();
console.log('   ready\n');
const env = { ...process.env, OPENAI_API_KEY: 'sk-dryrun-not-a-real-key', OPENAI_BASE_URL: `http://127.0.0.1:${PORT}/v1` };
const node = (args, extraEnv = {}) =>
  execFileSync('node', args, { cwd: box.dir, encoding: 'utf8', env: { ...env, ...extraEnv } });

try {
  step(1, 'OpenAI plans');
  const planOut = node(['scripts/ai/plan.mjs', '--task', 'Change the greeting on the home page.', '--out', 'plan.md', '--model', 'stub']);
  const plan = readFileSync(join(box.dir, 'plan.md'), 'utf8');
  check('a plan file is written', plan.length > 100, planOut.trim());
  check('it is marked as advice, not orders', /not orders/.test(plan));
  check('it has the sections the template asked for', ['## Goal', '## Approach', '## Risks', '## Tests'].every((h) => plan.includes(h)));

  step(2, 'Claude Code implements (simulated — a plain edit)');
  writeFileSync(join(box.dir, 'index.html'), readFileSync(join(box.dir, 'index.html'), 'utf8').replace(/<h1>/, '<h1>hello '));
  box.run('git add -A && git commit -qm "implement"');
  check('the diff is non-empty', box.run(`git diff --name-only ${box.base}...HEAD`).trim().length > 0);

  step(3, 'the guard inspects the diff');
  let guarded = true;
  try { node(['scripts/ai/guard.mjs', box.base, '--tests-before', '115', '--tests-after', '115']); }
  catch { guarded = false; }
  check('an honest change passes the guard', guarded);

  step(4, 'the guard catches a run that went wrong');
  writeFileSync(join(box.dir, 'vercel.json'), '{"cleanUrls":false}');
  box.run('git add -A && git commit -qm "touch the deploy config"');
  let blocked = false; let msg = '';
  try { node(['scripts/ai/guard.mjs', box.base, '--tests-before', '115', '--tests-after', '115']); }
  catch (e) { blocked = true; msg = (e.stdout || '') + (e.stderr || ''); }
  check('it refuses and the run would stop here', blocked, msg.split('\n').find((l) => l.includes('•'))?.trim());
  box.run('git revert --no-edit HEAD >/dev/null');   // -q is not a git revert flag

  step(5, 'OpenAI reviews the diff and the tests');
  writeFileSync(join(box.dir, 'tests.log'), '# tests 115\n# pass 115\n# fail 0\n');
  const revOut = node(['scripts/ai/review.mjs', '--base', box.base, '--tests', 'tests.log', '--plan', 'plan.md', '--out', 'review.json', '--model', 'stub'],
    { AI_TASK: 'Change the greeting on the home page.' });
  const review = JSON.parse(readFileSync(join(box.dir, 'review.json'), 'utf8'));
  check('a review is produced', !!review.verdict, revOut.trim());
  check('issues are extracted from the fenced JSON', (review.issues || []).length === 1, review.issues?.[0]?.title);
  check('the verdict would trigger exactly one fix round', review.verdict === 'needs_work');

  step(6, 'a reviewer that falls over does not look like approval');
  server.close();
  const badEnv = { ...env, OPENAI_BASE_URL: 'http://127.0.0.1:9/v1' };
  execFileSync('node', ['scripts/ai/review.mjs', '--base', box.base, '--tests', 'tests.log', '--out', 'review2.json', '--model', 'stub'],
    { cwd: box.dir, encoding: 'utf8', env: badEnv });
  const r2 = JSON.parse(readFileSync(join(box.dir, 'review2.json'), 'utf8'));
  check('it is recorded as unreviewed', r2.error === true);
  check('and it says so in words a person will read', /NOT been reviewed/i.test(r2.summary));
  check('the key does not appear in the recorded error', !/sk-dryrun/.test(JSON.stringify(r2)));

  step(7, 'an empty implementation is reported, not papered over');
  const box2 = sandbox();
  writeFileSync(join(box2.dir, 'tests.log'), '# fail 0\n');
  execFileSync('node', ['scripts/ai/review.mjs', '--base', box2.base, '--tests', 'tests.log', '--out', 'review.json', '--model', 'stub'],
    { cwd: box2.dir, encoding: 'utf8', env });
  const r3 = JSON.parse(readFileSync(join(box2.dir, 'review.json'), 'utf8'));
  check('an unchanged branch is flagged', r3.verdict === 'needs_work' && /No files were changed/.test(r3.summary));
  box2.cleanup();

  console.log(`\n${failures ? failures + ' CHECK(S) FAILED' : 'all dry-run checks passed'} — nothing pushed\n`);
} finally {
  try { server.close(); } catch { /* already closed */ }
  box.cleanup();
}
process.exit(failures ? 1 : 0);
