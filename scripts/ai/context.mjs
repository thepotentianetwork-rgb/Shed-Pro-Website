/* What the planner is told about this repository.
 *
 * Not the repository itself. designer.html alone is 864 KB and would cost more
 * to send than the plan is worth, so this assembles a compact, honest picture:
 * the shape of the tree, the things that are true about the project, and the
 * rules the plan has to respect. The implementer (Claude Code) reads the real
 * files; the planner only needs enough to write a plan that is not nonsense.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

const sh = (c) => { try { return execSync(c, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); } catch { return ''; } };

/** Every tracked file, with size, excluding the image library that tells you nothing. */
export function fileTree() {
  const files = sh('git ls-files').trim().split('\n').filter(Boolean);
  return files
    .filter((f) => !/\.(webp|png|jpg|jpeg|gif|ico|svg)$/i.test(f))
    .map((f) => {
      let size = 0;
      try { size = statSync(f).size; } catch { /* deleted in working tree */ }
      return { path: f, size };
    })
    .sort((a, b) => b.size - a.size);
}

export function testFiles() {
  return sh('git ls-files "tests/**/*.test.mjs"').trim().split('\n').filter(Boolean);
}

/** A few lines from the top of a file, for flavour rather than content. */
function head(path, lines = 40) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8').split('\n').slice(0, lines).join('\n');
}

export function buildContext({ task }) {
  const tree = fileTree();
  const tests = testFiles();
  const imageCount = sh('git ls-files').trim().split('\n').filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f)).length;

  return `# ShedPro — repository context

## The task you are planning for

${task}

## What this repository is

A static marketing site for a custom shed builder, deployed to
https://www.shedpro-utah.com by Vercel **from the main branch**. There is no
build step, no package.json and no bundler. Every page is hand-written HTML
with inline CSS and JavaScript.

The centrepiece is \`designer.html\`: a real-time 3D shed configurator built on
Three.js r128, loaded from a CDN. A customer picks a style, size, siding,
roof, doors, windows and add-ons and watches the building update. It is one
file of about ${Math.round((tree.find((f) => f.path === 'designer.html')?.size || 0) / 1024)} KB.

**Prices are not computed here.** The designer sends its configuration to a
Cloudflare Worker in a separate repository and reads the prices back out of
\`quoteCache\`. Nothing in this repository may quote a number of its own.

## Tracked files (images omitted; ${imageCount} image files not listed)

${tree.slice(0, 60).map((f) => `  ${String(Math.round(f.size / 1024)).padStart(5)} KB  ${f.path}`).join('\n')}

## Tests

Run with the repo's own Node — there is no test framework and no npm:

    curl -sSo tests/three.js https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js
    node --test tests/geometry/*.test.mjs tests/ui/*.test.mjs

${tests.map((t) => `  - ${t}`).join('\n')}

They are not unit tests in the usual sense. \`tests/harness.mjs\` runs the real
\`designer.html\` inside a Node VM with the real Three.js and a stubbed DOM, then
**fires rays at the resulting 3D model**. A test asks "standing under the porch,
can I see the sky" rather than re-reading the numbers that placed the meshes.
\`tests/visual/\` drives headless Chromium for real WebGL screenshots.

### tests/README.md

${head('tests/README.md', 30)}

## Rules a plan must respect

These are enforced by \`scripts/ai/guard.mjs\` after the work is done. A plan
that requires breaking one of them cannot be carried out, and the run will
fail rather than open a pull request.

1. **Three.js stays at r128.** The designer is ~15,700 lines written against
   that API. Upgrading is a project, not a step in one.
2. **No pricing logic in this repository.** \`designer.html\` must keep reading
   \`quoteCache\`. A local price table here would mean the page quotes numbers
   the server does not know about.
3. **No test may be deleted, and the test count may not fall.** Tests may be
   added. Making a suite pass by shrinking it is the failure this guards.
4. **\`.github/\`, \`scripts/ai/\`, \`vercel.json\` and \`.gitignore\` are off limits.**
   The workflow may not edit itself or how the site deploys.
5. **No build step, no npm, no bundler.** It stays static files.
6. Nothing is merged or deployed automatically. The result is a pull request
   for a human to read.
`;
}
