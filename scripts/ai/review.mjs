/* STEP 2 — OpenAI reviews the diff and the test output.
 *
 *   node scripts/ai/review.mjs --base <ref> --tests tests.log --plan plan.md --out review.json
 *
 * Produces JSON the workflow can branch on:
 *
 *   { "verdict": "ok" | "needs_work", "summary": "...", "issues": [ ... ] }
 *
 * A review that cannot be parsed is not fatal. The run treats it as "no issues
 * found" and says so in the pull request, because a malformed reply is a fact
 * about the reviewer, not evidence about the code — and the tests and the
 * guards have already had their say by this point.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { ask, extractJson, scrub } from './openai.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { return e.stdout || ''; } };

const SYSTEM = `You are reviewing a change to a static shed-builder website,
made by another model from a plan you wrote. Be a careful reviewer, not an
enthusiastic one.

You are looking for: things that are broken, things that do not do what the
task asked, things that will surprise the owner, and anything that breaks the
project's rules. You are NOT looking for style preferences, and you should not
invent work.

The rules, all enforced automatically elsewhere: Three.js stays at r128; no
pricing logic in this repository (the page must keep reading quoteCache from
the pricing worker); tests may be added but never removed; .github/ and
scripts/ai/ and vercel.json are untouchable; no build step or npm.

If the change is fine, say so. "needs_work" on a sound change costs a second
round of edits and a worse diff, so only use it when something is actually
wrong. Only report issues you can point at in the diff.`;

function truncate(s, max, label) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n…[${label} truncated: ${s.length - max} more characters]`;
}

async function main() {
  const base = arg('base');
  const testsLog = arg('tests');
  const planPath = arg('plan');
  const out = arg('out', 'review.json');
  const model = arg('model', process.env.OPENAI_MODEL || 'gpt-4o');
  const task = process.env.AI_TASK || '(task description not provided)';
  if (!base) { console.error('usage: review.mjs --base <ref> [--tests f] [--plan f] [--out f]'); process.exit(2); }

  /* Working tree against the base, NOT base...HEAD. The implementer does not
     commit, so the three-dot form was empty every time: this step read an
     empty diff, reported "nothing was implemented" about a change that was
     sitting right there on disk, and that false issue triggered a fix round
     that had nothing to fix. The review had never once looked at any code. */
  const stat = sh(`git diff --stat ${base}`);
  /* Untracked files, minus the run's own. The workflow keeps those out of
     git with .git/info/exclude, but the reviewer should not depend on an
     ignore file to know that its own plan.md is not part of the change. */
  const SCRATCH = new Set(['plan.md','review.json','task.txt','pr-body.md','tests.log',
    'tests-final.log','before.log','guard1.log','implement.log','fix.log',
    'implement-prompt.txt','fix-prompt.txt']);
  const newFiles = sh('git ls-files --others --exclude-standard').trim()
    .split('\n').filter((f) => f && !SCRATCH.has(f)).join('\n');
  /* The full diff of a change to designer.html can be enormous, and most of a
     huge diff tells a reviewer nothing it has not learnt in the first pages.
     Cap it, and say that it was capped so the reviewer knows not to conclude
     anything from the absence of the rest. */
  let raw = sh(`git diff ${base}`);
  // A brand new file is invisible to `git diff`, and is the thing most worth
  // reading. --no-index against /dev/null renders it as an addition.
  for (const f of newFiles ? newFiles.split('\n').filter(Boolean) : []) {
    raw += sh(`git diff --no-index -- /dev/null ${JSON.stringify(f)} || true`);
  }
  const diff = truncate(raw, Number(process.env.REVIEW_DIFF_CHARS || 90000), 'diff');
  const tests = testsLog && existsSync(testsLog)
    ? truncate(readFileSync(testsLog, 'utf8'), 20000, 'test output')
    : '(no test output captured)';
  const plan = planPath && existsSync(planPath) ? readFileSync(planPath, 'utf8') : '(no plan)';

  if (!stat.trim() && !newFiles) {
    writeFileSync(out, JSON.stringify({
      verdict: 'needs_work',
      summary: 'No files were changed. The implementation step produced an empty diff.',
      issues: [{ title: 'Nothing was implemented', detail: 'The branch is identical to the base. Either the task was misread, or the implementer decided no change was needed without saying so.' }],
    }, null, 2));
    console.log('review: empty diff');
    return;
  }

  const user = `# The task as the owner described it

${task}

# The plan

${plan}

# Files changed

${stat}

# The diff

\`\`\`diff
${diff}
\`\`\`

# Test output

\`\`\`
${tests}
\`\`\`

---

Reply with a JSON object and nothing else:

{
  "verdict": "ok" | "needs_work",
  "summary": "two or three sentences a repo owner would want to read first",
  "issues": [
    { "title": "short", "detail": "what is wrong and where", "fix": "what to do about it" }
  ]
}

Use "ok" with an empty issues array if the change is sound. Put anything worth
mentioning but not worth another edit round in the summary, not in issues —
issues trigger a round of automated changes.`;

  let text;
  try {
    text = await ask({ model, system: SYSTEM, user, maxOutputTokens: Number(process.env.REVIEW_MAX_TOKENS || 2500) });
  } catch (e) {
    /* A reviewer that fell over must not look like a reviewer that approved,
       and must not block the pull request either. Say exactly what happened. */
    writeFileSync(out, JSON.stringify({
      verdict: 'ok',
      summary: `The review step did not run: ${scrub(e.message)}. The change has NOT been reviewed by OpenAI — read the diff yourself.`,
      issues: [],
      error: true,
    }, null, 2));
    console.log('review: failed, recorded as unreviewed');
    return;
  }

  const parsed = extractJson(text);
  if (!parsed || !parsed.verdict) {
    writeFileSync(out, JSON.stringify({
      verdict: 'ok',
      summary: 'The reviewer replied in a format this workflow could not parse, so no issues were extracted. The change has NOT been meaningfully reviewed — read the diff yourself.',
      issues: [],
      raw: scrub(text).slice(0, 2000),
      error: true,
    }, null, 2));
    console.log('review: unparseable, recorded as unreviewed');
    return;
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  writeFileSync(out, JSON.stringify({
    verdict: issues.length ? (parsed.verdict || 'needs_work') : 'ok',
    summary: String(parsed.summary || '').slice(0, 4000),
    issues: issues.slice(0, 10),
  }, null, 2));
  console.log(`review: ${issues.length ? 'needs_work' : 'ok'} (${issues.length} issues)`);
}

main();
