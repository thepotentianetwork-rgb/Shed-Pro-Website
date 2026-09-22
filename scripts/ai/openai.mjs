/* The one place this repo talks to OpenAI.
 *
 * Deliberately small. Planning and reviewing are text in, text out — there is
 * no agent loop here, no tools, no file access. The only thing that edits this
 * repository is Claude Code, under the guards in guard.mjs.
 *
 * THE KEY. Read from the environment, never logged, never written to a file,
 * never put in a prompt. If a request fails, the error is reported WITHOUT the
 * request headers, because a 401 body can echo enough to be worth redacting
 * and it costs nothing to be careful.
 */

const API = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

/** Strip anything that looks like a key out of text that might get logged. */
export function scrub(text) {
  return String(text == null ? '' : text)
    .replace(/sk-[A-Za-z0-9_\-]{12,}/g, 'sk-***REDACTED***')
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]{12,}/gi, '$1***REDACTED***');
}

/**
 * One completion. Returns the assistant's text.
 *
 * `maxOutputTokens` is a cost ceiling as much as a length one: this runs
 * unattended on a manual trigger, and an unbounded generation on a repo this
 * size is the difference between cents and something worth noticing.
 */
export async function ask({ model, system, user, maxOutputTokens = 4000, apiKey, fetchImpl }) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  if (!model) throw new Error('no OpenAI model given');

  const doFetch = fetchImpl || globalThis.fetch;
  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxOutputTokens,
  };

  let res;
  try {
    res = await doFetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`OpenAI request failed to send: ${scrub(e.message)}`);
  }

  const text = await res.text();
  if (!res.ok) {
    /* The model name is the most common cause of a 400 here and the error body
       says so plainly, so it is worth surfacing — scrubbed, and truncated so a
       long HTML error page does not end up in the run log. */
    throw new Error(`OpenAI ${res.status}: ${scrub(text).slice(0, 600)}`);
  }

  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`OpenAI returned non-JSON: ${scrub(text).slice(0, 300)}`); }

  const out = json?.choices?.[0]?.message?.content;
  if (!out || !String(out).trim()) {
    const reason = json?.choices?.[0]?.finish_reason;
    throw new Error(`OpenAI returned no text (finish_reason: ${reason || 'unknown'})`);
  }
  return String(out);
}

/**
 * Pull a fenced JSON object out of a reply.
 *
 * Models wrap JSON in prose and fences however they feel that day, and a
 * review that cannot be parsed should not take the whole run down — the caller
 * decides what a missing review means. Returns null rather than throwing.
 */
export function extractJson(text) {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced && fenced[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(c.slice(start, end + 1)); } catch { /* try the next */ }
  }
  return null;
}
