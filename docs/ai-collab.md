# AI collaboration — what it is, and what it will not do

OpenAI plans, Claude Code implements, tests run, OpenAI reviews, Claude gets
**one** round to fix what it found, and you get a pull request.

It runs on GitHub's servers from a button. Nothing needs to stay open.

> **It never merges and it never deploys.** This repository publishes
> shedpro-utah.com from `main`, so a merge *is* a deploy. Every run ends at a
> pull request with a human in front of it.

---

## Running one

Actions → **AI collaboration (manual)** → *Run workflow*. Describe the task the
way you would to a contractor. The other inputs have working defaults.

| Input | Default | |
|---|---|---|
| `task` | — | What to do. Plain English. |
| `openai_model` | `gpt-4o` | Planning and review. |
| `claude_model` | `claude-sonnet-5` | Implementation. |
| `skip_fix_round` | `false` | Open the PR with the review attached and no second edit. |

Expect **5–15 minutes** and **cents to a couple of dollars** per run, depending
on the models and how much of the diff the reviewer has to read. `designer.html`
is 864 KB, so a change to it produces a large diff; the review step caps what it
sends and says in the prompt that it was capped.

---

## What actually happens

1. **Check out `main`** and record the starting commit.
2. **Count the tests** before anything changes. A red baseline is flagged as a
   warning so it is not later mistaken for damage this run caused.
3. **OpenAI writes a plan** from a summary of the repository — the file tree,
   the rules, what the project is. It never sees the files and it has no tools.
4. **Claude Code implements**, with the plan in front of it and a standing
   instruction that *the plan is advice, not orders*. It can read, write and run
   the tests. It cannot run arbitrary shell commands.
5. **The guard inspects the diff.** If it fails, the run stops here — no branch,
   no pull request.
6. **Tests run.**
7. **OpenAI reviews** the diff, the plan and the test output, and returns JSON.
8. **One fix round**, if the reviewer raised something or the tests are red.
   Then the guard and the tests run again. There is no second round.
9. **A pull request** is opened, describing what happened, and stops.

---

## The guard

`scripts/ai/guard.mjs`. Every rule below is *also* written into the prompts,
and the prompts are not the protection. A prompt is a request; this is a check.

**Protected paths — a change to any of these fails the run:**

| Path | Why |
|---|---|
| `.github/` | A job that can rewrite its own workflow can widen its own permissions, and the next run starts with whatever it granted itself. |
| `scripts/ai/` | The guards and prompts are not the agent's to edit. |
| `vercel.json` | Deploy configuration. |
| `.gitignore` | Hiding a file from the diff hides it from this check. |

**Invariants that must still hold:**

- `designer.html` still loads `three@0.128.0`.
- `designer.html` still reads `quoteCache` — prices come from the pricing
  worker, never from this repository.
- No test file deleted, and **the test count may not fall**. Tests may be added.
  Deleting cases inside a surviving file is the same trick one level down, which
  is why the count is checked and not just the file list.

---

## What this does not protect against

Worth saying plainly.

- **A change that is wrong but legal.** The guard checks rules, not correctness.
  That is what the tests, the review and *you reading the pull request* are for.
- **Prompt injection.** The task text is yours, but repository content ends up
  in the planner's context and the plan ends up in the implementer's prompt. A
  file containing instructions could influence the plan. The guard runs
  regardless of what any model decided, and nothing merges, so the blast radius
  is a pull request you will read.
- **A reviewer that agrees with everything.** OpenAI reviewing a plan OpenAI
  wrote is not an independent check. Treat "ok" as "nothing obvious", not as
  approval.
- **A review that did not happen.** If the review call fails or returns
  something unparseable, the pull request says **the change has not been
  reviewed** rather than quietly showing no issues.
- **Cost, if triggered repeatedly.** It is manual, one run at a time, and
  capped per call — but nothing stops a person pressing the button a lot.

---

## Testing it without spending anything

```sh
node --test scripts/ai/ai-collab.test.mjs   # 23 tests
node scripts/ai/dryrun.mjs                  # the whole pipeline, no keys
```

The tests build real git repositories, make the exact edits a misbehaving run
would make, and check the guard refuses each one. A guard that has only been
read is not a guard.

The dry run stands up a stub OpenAI (`scripts/ai/stub-openai.mjs`) and drives
the real `plan.mjs`, `guard.mjs` and `review.mjs` end to end. Everything runs
except the two things needing credentials: the model calls, and Claude Code
doing the edits.

> The stub is a separate process for a reason. In-process it deadlocked: the
> dry run drives each step with `execFileSync`, which blocks the event loop the
> server needs to answer its own child.

---

## Turning it off

- **For one run:** cancel it in the Actions tab.
- **For good:** delete `.github/workflows/ai-collab.yml`. Nothing else in the
  repository depends on it.
- **Revoke access:** remove `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` from the
  repository secrets. Every run fails at the first call.

---

## Keys

They live in GitHub Actions secrets and reach only the step that needs them:
`OPENAI_API_KEY` for planning and review, `ANTHROPIC_API_KEY` for Claude Code.
Nothing echoes them, nothing writes them to a file, and error text is scrubbed
of anything key-shaped before it reaches a log — a 401 body can quote enough of
a key to be worth redacting.
