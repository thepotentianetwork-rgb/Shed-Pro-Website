/* A stand-in for the OpenAI API, for the dry run.
 *
 *   node scripts/ai/stub-openai.mjs <port> <plan-file> <review-file>
 *
 * It answers /v1/chat/completions with the contents of the two files, choosing
 * between them by whether the prompt asks for a verdict. That is enough to
 * exercise plan.mjs and review.mjs for real — the request shape, the parsing,
 * the fence handling — without a key or a network.
 *
 * It runs as its OWN PROCESS on purpose. The dry run drives every step with
 * execFileSync, which blocks the event loop, so a server inside that process
 * could never answer the request its own child was making. It deadlocked on
 * the first call and printed nothing, because the logs were still sitting in a
 * pipe buffer when the timeout killed it.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const [, , portArg, planFile, reviewFile] = process.argv;
const port = Number(portArg);
if (!port || !planFile || !reviewFile) {
  console.error('usage: stub-openai.mjs <port> <plan-file> <review-file>');
  process.exit(2);
}
const plan = readFileSync(planFile, 'utf8');
const review = readFileSync(reviewFile, 'utf8');
let calls = 0;

createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    calls++;
    let prompt = '';
    try { prompt = JSON.parse(body).messages.map((m) => m.content).join('\n'); } catch { /* shape does not matter here */ }
    // The review prompt asks for a "verdict" field; the plan prompt does not.
    const wantsReview = prompt.includes('"verdict"');
    // Fenced, because that is how a model usually returns JSON and extractJson
    // should be exercised against the awkward version rather than the tidy one.
    const content = wantsReview ? '```json\n' + review + '\n```' : plan;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
  });
}).listen(port, '127.0.0.1', () => console.log('STUB-READY ' + port));

process.on('SIGTERM', () => { console.log('stub calls: ' + calls); process.exit(0); });
