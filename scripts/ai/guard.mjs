/* THE GATES THAT DO NOT ASK A MODEL.
 *
 * Every rule below is also written into the prompts, and the prompts are not
 * the protection. A prompt is a request; this is a check. If a model ignores
 * an instruction — because it misread it, because the repo contained text that
 * steered it, because the plan drifted over two calls — the run fails here and
 * the branch never becomes a pull request worth looking at.
 *
 * Run against the diff, after implementation and again after the fix round.
 *
 *   node scripts/ai/guard.mjs <baseRef> [--tests-before N]
 *
 * Exits non-zero with a plain list of violations.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/* Paths this workflow may never touch.
 *
 * .github/ is first and matters most: a job that can rewrite its own workflow
 * can widen its own permissions, and the next run would do so with whatever it
 * granted itself. Everything else here is either how the site deploys or how
 * this system is governed. */
export const PROTECTED = [
  { pattern: /^\.github\//,        why: 'the workflow must not be able to rewrite itself or its permissions' },
  { pattern: /^scripts\/ai\//,     why: 'the guards and prompts are not the agent\'s to edit' },
  { pattern: /^vercel\.json$/,     why: 'deploy configuration — this repo deploys to production from main' },
  { pattern: /^\.gitignore$/,      why: 'hiding files from the diff would hide them from this check' },
  { pattern: /^docs\/ai-collab\.md$/, why: 'the description of the system is not the system\'s to revise' },
];

/* Things that must still be true afterwards. Each is a fact about the repo
   that a plausible-looking change could quietly break, phrased so the failure
   message tells you what was lost. */
export const INVARIANTS = [
  {
    name: 'Three.js stays pinned to r128',
    check: () => {
      const f = 'designer.html';
      if (!existsSync(f)) return 'designer.html is gone';
      const src = readFileSync(f, 'utf8');
      if (!/three@0\.128\.0/.test(src)) {
        return 'designer.html no longer loads three@0.128.0 — the whole designer is written against that API';
      }
      return null;
    },
  },
  {
    name: 'the price the customer sees still comes from the server',
    check: () => {
      const f = 'designer.html';
      if (!existsSync(f)) return 'designer.html is gone';
      const src = readFileSync(f, 'utf8');
      /* Prices are computed by the worker and read out of quoteCache. A local
         price table appearing in this file would mean the page had started
         quoting numbers of its own, which is the one thing it must never do. */
      if (!/quoteCache/.test(src)) {
        return 'designer.html no longer reads quoteCache — prices must come from the pricing worker, never from the page';
      }
      return null;
    },
  },
];

/* WHAT "CHANGED" MEANS, and why it is not `baseRef...HEAD`.
 *
 * It was, and the guard was inert for it. Claude Code edits the WORKING TREE
 * and never commits — its allowed tools are Read/Write/Edit and four specific
 * Bash commands, none of which is `git commit`. So at the moment the guard
 * runs, HEAD is still the base commit, `baseRef...HEAD` is empty, and the
 * guard printed `guard: ok` having looked at nothing. Every protected-path
 * and deleted-test check passed by default. The tests did not catch it
 * because they committed their changes first, which the real run never does.
 *
 * Two dots, no HEAD, compares the base commit to the working tree — which
 * covers the change whether it was committed, staged, or neither. Untracked
 * files are added separately because a diff cannot see a file git has never
 * heard of, and "the agent wrote a brand new file" is exactly the case a
 * protected-path check exists for. */
function untracked() {
  const out = sh('git ls-files --others --exclude-standard').trim();
  return out ? out.split('\n').filter(Boolean) : [];
}

export function changedFiles(baseRef) {
  const out = sh(`git diff --name-only ${baseRef}`).trim();
  const tracked = out ? out.split('\n').filter(Boolean) : [];
  return [...new Set([...tracked, ...untracked()])];
}

export function deletedFiles(baseRef) {
  const out = sh(`git diff --diff-filter=D --name-only ${baseRef}`).trim();
  return out ? out.split('\n').filter(Boolean) : [];
}

/* The run's own working files. They are written into the workspace by the
   workflow, not by the agent, and they have no business in a pull request:
   the first real run committed 2,254 lines of plan, prompts, review JSON and
   test logs alongside a three-line change. The workflow keeps them out of
   `git add` with .git/info/exclude; this is the check for when that stops
   working, because an ignore file failing silently is how they got in. */
export const SCRATCH = [
  'plan.md', 'review.json', 'task.txt', 'pr-body.md',
  'tests.log', 'tests-final.log', 'before.log', 'guard1.log',
  'implement.log', 'fix.log', 'implement-prompt.txt', 'fix-prompt.txt',
];

export function checkAll({ baseRef, testsBefore, testsAfter }) {
  const violations = [];

  for (const f of changedFiles(baseRef)) {
    for (const p of PROTECTED) {
      if (p.pattern.test(f)) violations.push(`touched a protected path: ${f} — ${p.why}`);
    }
    if (SCRATCH.includes(f)) {
      violations.push(`the run's own working file is in the diff: ${f} — it belongs in the log, not in the pull request`);
    }
  }

  /* Deleting a test is the cheapest way to make a suite pass, and it looks
     exactly like tidying up in a diff. No test file may disappear. */
  for (const f of deletedFiles(baseRef)) {
    if (/^tests\/.*\.test\.mjs$/.test(f)) violations.push(`deleted a test file: ${f}`);
  }

  /* And the count may not fall. Deleting cases inside a file that survives is
     the same trick one level down, and the count catches it where a file list
     cannot. */
  if (Number.isFinite(testsBefore) && Number.isFinite(testsAfter)) {
    if (testsAfter < testsBefore) {
      violations.push(
        `the suite got smaller: ${testsBefore} tests before, ${testsAfter} after. ` +
        `Tests may be added, never removed — removing them is how a suite goes green without the code being right.`
      );
    }
  }

  for (const inv of INVARIANTS) {
    const problem = inv.check();
    if (problem) violations.push(`${inv.name}: ${problem}`);
  }

  return violations;
}

/* CLI */
if (import.meta.url === `file://${process.argv[1]}`) {
  const baseRef = process.argv[2];
  if (!baseRef) { console.error('usage: guard.mjs <baseRef> [--tests-before N] [--tests-after N]'); process.exit(2); }
  const num = (flag) => {
    const i = process.argv.indexOf(flag);
    return i > 0 ? Number(process.argv[i + 1]) : NaN;
  };
  const violations = checkAll({
    baseRef,
    testsBefore: num('--tests-before'),
    testsAfter: num('--tests-after'),
  });
  if (violations.length) {
    console.error('\nGUARD FAILED — this change is not allowed to become a pull request:\n');
    for (const v of violations) console.error('  • ' + v);
    console.error('');
    process.exit(1);
  }
  console.log('guard: ok');
}
