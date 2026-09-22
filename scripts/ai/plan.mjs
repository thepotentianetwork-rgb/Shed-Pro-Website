/* STEP 1 — OpenAI writes the implementation plan.
 *
 *   node scripts/ai/plan.mjs --task "<what to do>" --out plan.md
 *
 * Text in, text out. This script has no tools and cannot touch the repository;
 * its only output is a markdown file that becomes part of Claude Code's prompt.
 *
 * The plan is ADVICE, not an instruction the implementer must obey. That
 * distinction is written into the implementer's prompt too, because a plan
 * built from a summary of the repo will sometimes be wrong about the repo, and
 * an implementer that follows a wrong plan faithfully is worse than one that
 * notices.
 */
import { writeFileSync } from 'node:fs';
import { ask, scrub } from './openai.mjs';
import { buildContext } from './context.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};

const SYSTEM = `You are planning a change to a small static website for a shed
builder. A second model — Claude Code — will carry the plan out with full access
to the files; you have only the summary you are given.

Write the plan you would want to receive if you had to do the work and had not
seen the code. Be concrete about WHAT and WHY. Be light on HOW: you cannot see
the files, so detailed instructions about specific lines will be wrong, and
wrong specifics are worse than none because they get followed.

Say plainly when the task is ambiguous, or when you think it is a bad idea, or
when it cannot be done under the rules. A plan that says "this cannot be done
without breaking rule 2, here is what I would do instead" is a good plan.

Never suggest: upgrading Three.js, adding a build step or npm, computing prices
in this repository, deleting or weakening tests, or editing anything under
.github/ or scripts/ai/. Those are enforced automatically after the work and
will fail the run.`;

const TEMPLATE = `Write the plan as markdown with exactly these sections:

## Goal
One paragraph. What should be true when this is done, in terms a customer or
the owner would recognise.

## Assessment
Is this task clear? Is it a good idea? Does it fit the rules? If something is
ambiguous, say what you assumed. If you think it is wrong, say so here — you
are not obliged to like the task.

## Approach
The steps, in order. Name files where you are confident and say when you are
guessing. Prefer describing the outcome of a step over the exact edit.

## Risks
What could break that is not obvious. What a reviewer should look at hardest.

## Tests
What should be true afterwards that a test could check. Existing tests that
should still pass, and any new ones worth adding. Remember tests can only be
added, never removed.

## Out of scope
What you are deliberately NOT doing, so the implementer does not widen it.`;

async function main() {
  const task = arg('task');
  const out = arg('out', 'plan.md');
  const model = arg('model', process.env.OPENAI_MODEL || 'gpt-4o');
  if (!task) { console.error('usage: plan.mjs --task "<description>" [--out plan.md] [--model M]'); process.exit(2); }

  const context = buildContext({ task });

  let text;
  try {
    text = await ask({
      model,
      system: SYSTEM,
      user: `${context}\n\n---\n\n${TEMPLATE}`,
      maxOutputTokens: Number(process.env.PLAN_MAX_TOKENS || 3000),
    });
  } catch (e) {
    console.error(`planning failed: ${scrub(e.message)}`);
    process.exit(1);
  }

  const header = `<!-- Plan written by OpenAI (${model}). Advice for the implementer, not orders. -->\n\n`;
  writeFileSync(out, header + text, 'utf8');
  console.log(`plan written to ${out} (${text.length} chars)`);
}

main();
