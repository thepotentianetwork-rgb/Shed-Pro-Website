/* ShedPro "Artist's rendering" — TEST endpoint (preview only, OFF by default).
 *
 *   POST /api/render  {image:"data:image/jpeg;base64,...", config:{...getDesignConfig()}, code?:"..."}
 *        -> 202 {id, etaSec, mock}
 *   GET  /api/render?id=...  -> {status:"pending"} | {status:"done", url, mock} | {status:"error"}
 *
 * Gates (all must pass, otherwise 404 so the client hides the feature silently):
 *   - RENDER_ENABLED=1            (not set anywhere yet)
 *   - VERCEL_ENV !== "production" (unless RENDER_ALLOW_PROD=1 — do not set without sign-off)
 *
 * Mode:
 *   - MOCK (default): no OpenAI call. Returns a canned dusk rendering from
 *     /designer-env/ai-mock/ after ~25 s so the polling UI can be tested.
 *   - REAL: only when RENDER_MOCK=0 AND OPENAI_API_KEY is set. Not configured.
 *     The real path calls gpt-image-2 /v1/images/edits (~$0.18/image at high
 *     quality, ~75 s) and needs durable storage (Vercel Blob) for the result —
 *     see TODO in realRender(). It is intentionally left unwired from storage,
 *     so it cannot run in production by accident.
 *
 * Limits here are best-effort and in-memory (per warm instance). Real limits
 * need durable storage (Upstash Redis / Vercel KV) — see docs in the PR notes.
 */
import crypto from 'node:crypto';

export const config = { maxDuration: 300 };

const PER_IP_PER_DAY = +(process.env.RENDER_PER_IP_DAY || 3);
const DAILY_CAP      = +(process.env.RENDER_DAILY_CAP || 20);
const MOCK_DELAY_MS  = 25000;
const SECRET = process.env.RENDER_SECRET || 'shedpro-render-preview-only';

const day = () => new Date().toISOString().slice(0, 10);
const mem = globalThis.__spRender || (globalThis.__spRender = { day: day(), total: 0, ip: new Map() });
function rollDay(){ const d = day(); if (mem.day !== d){ mem.day = d; mem.total = 0; mem.ip.clear(); } }

function enabled(){
  if (process.env.RENDER_ENABLED !== '1') return false;
  if (process.env.VERCEL_ENV === 'production' && process.env.RENDER_ALLOW_PROD !== '1') return false;
  return true;
}
const isMock = () => process.env.RENDER_MOCK !== '0' || !process.env.OPENAI_API_KEY;

const b64u = (b) => Buffer.from(b).toString('base64url');
function sign(obj){ const p = b64u(JSON.stringify(obj)); return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url').slice(0, 22); }
function verify(id){
  const [p, s] = String(id || '').split('.');
  if (!p || !s) return null;
  const want = crypto.createHmac('sha256', SECRET).update(p).digest('base64url').slice(0, 22);
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return null; }
}

/* ── prompt (ported from scratch/ai-render/gen.py, the version that tested best) ── */
const STYLE = {gable:'classic gable-roof',barn:'gambrel (barn-style) roof',leanto:'modern single-slope lean-to',hip:'hip-roof','4peak':'four-peak','3peak':'three-peak'};
const SIDING = {vertical:'vertical T1-11 style groove siding','board-batten':'board-and-batten siding',horizontal:'horizontal lap siding',pine:'pine tongue-and-groove siding'};
const DOOR = {craftsman:'double doors with a row of small glass transom lites across the top and raised trim panels below',resfull:'a single residential door with a large full-height glass panel',xtrim:'double barn doors with an X-brace trim pattern',cedar:'natural cedar-plank doors',resdouble:'residential double doors'};
const LIGHT = {modern:'modern black cylinder wall sconce',gooseneck:'black gooseneck barn light',lantern:'black lantern wall light'};
const FND = {pad:'a smooth poured gray concrete pad that extends a few inches past the walls',blocks:'concrete blocks',gravel:'a crushed-gravel pad'};
const hex = (h) => (typeof h === 'number' ? '#' + h.toString(16).padStart(6, '0').toUpperCase() : 'as shown');
function wallList(items, fn){ const by = {}; for (const it of items) (by[it.wall || 'front'] ||= []).push(fn(it)); return Object.entries(by).map(([w, v]) => `${w} wall: ${v.join(', ')}`).join('; '); }

export function describe(c){
  const L = [];
  L.push(`A ${c.w} ft wide x ${c.l} ft deep ${STYLE[c.style] || c.style} shed with ${c.h || 8} ft walls.`);
  L.push(`Siding: ${SIDING[c.siding] || c.siding}, painted ${hex(c.sidingColor)}. Trim and corner boards: ${hex(c.trimColor)}.`);
  const rt = c.roofType || 'shingle';
  L.push(`Roof: ${rt === 'metal' ? 'standing-seam / ribbed metal' : 'architectural asphalt shingle'} in ${hex(c.roofColor)}` + (c.ovh ? `, ${c.ovh}-inch overhangs` : '') + (c.soffit ? `, ${c.soffit} soffits` : '') + '.');
  if (c.porchLoc && c.porchLoc !== 'none' && c.porchDepth) L.push(`Porch: a ${c.porchDepth} ft deep covered ${c.porchLoc} porch with white square posts and a ${c.deckColor || ''} ${c.porchDeck || ''} deck floor.`);
  const d = c.doors || []; if (d.length) L.push(`Doors (exactly ${d.length}): ` + wallList(d, (x) => `${DOOR[x.style] || x.style}, ${x.w}" x ${x.h}"`) + '.');
  const w = c.windows || []; if (w.length) L.push(`Windows (exactly ${w.length}, no others): ` + wallList(w, (x) => String(x.type) + (/bar/i.test(String(x.type)) ? ' with an exterior stone serving-ledge bar counter projecting below it' : '')) + '.');
  const a = c.addons || {}, ex = [];
  if (a.flowerboxes) ex.push(`${a.fbColor || ''} window flower boxes under the windows that have them in the render`);
  if (a.shutters) ex.push(`${a.shutterColor || ''} shutters`);
  if (a.cupola && a.cupola !== 'none') ex.push(`a ${a.cupola} cupola on the ridge`);
  if (a.ridgeVent) ex.push('a ridge vent');
  if (a.doorAwning) ex.push('a small door overhang above the doors');
  if (ex.length) L.push('Add-ons (keep every one): ' + ex.join('; ') + '.');
  const pl = c.porchLights || [];
  if (pl.length) L.push(`Exterior lights: exactly ${pl.length} ${LIGHT[pl[0].style] || 'wall light'}${pl.length > 1 ? 's' : ''} on the ${pl[0].wall || 'front'} wall, mounted beside the door at the positions shown, glowing softly warm. No other fixtures on the building.`);
  else L.push('Exterior lights on the building: only what is visible in the render; do not add any wall-mounted fixtures.');
  if (c.elec && c.elec !== 'none') L.push('Electrical package: interior lights on, so the windows and door glass glow warm amber from inside.');
  if (c.elec === 'essential') L.push('Soffit lighting: small recessed LED downlights built into the soffits under the eaves, casting soft scallops of warm light down the walls (these are the only exterior lights besides any listed above).');
  L.push(`Foundation: the shed sits on ${FND[c.foundation] || c.foundation || 'a level base'}.`);
  return L.join('\n');
}
const FIDELITY = `FIDELITY RULES (most important):
- This is an edit of the input 3D render. Keep the exact building geometry, proportions, roof pitch, camera angle, framing and perspective.
- Keep every door, window, dormer, porch, awning/overhang, bar counter/serving ledge, flower box, cupola, shutter and trim piece exactly where it is in the render, same count, same size, same color. Do not remove or simplify any of them.
- Do NOT add anything to the building that is not in the render: no extra windows, doors, vents, gooseneck or barn lights, awnings, shutters, gutters, signage or decorations.
- Keep every color exactly as specified; only add realistic material texture (wood grain, paint sheen, shingle or metal texture, glass reflections).
- Replace the cartoon ground, the logo decals on the grass and the low-poly background with the real scene below. No logos, text or watermarks.`;
const SCENE_DUSK = 'SCENE: Photorealistic architectural real-estate photograph at blue-hour dusk in a Utah backyard. Twilight sky fading from deep blue to soft pink and amber at the horizon, the rugged Wasatch mountains in the background. Freshly mowed, manicured green lawn; a neat mulch or river-rock bed along the base of the shed with a few small boxwood shrubs; a handful of small ground-level landscape path/up lights in the yard (in the ground, never on the building); a dark wood privacy fence and a few trees softly out of focus. Warm interior glow from the windows. Shot on a full-frame camera, 24mm lens, eye level, crisp detail, natural colors, high dynamic range.';
export const buildPrompt = (c) => `Turn this 3D design render of a custom ShedPro backyard shed into a real photograph.\n\nTHE SHED (match exactly):\n${describe(c)}\n\n${FIDELITY}\n\n${SCENE_DUSK}`;

function mockImage(c){
  if (c && c.style === 'barn') return '/designer-env/ai-mock/barn.webp';
  if (c && ((c.porchLoc && c.porchLoc !== 'none') || c.w >= 14)) return '/designer-env/ai-mock/porch.webp';
  return '/designer-env/ai-mock/gable.webp';
}

/* Real path — NOT reachable until RENDER_MOCK=0 and OPENAI_API_KEY are set,
   and still throws until result storage is wired (Vercel Blob). */
async function realRender(image, cfg){
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(image || '');
  if (!m) throw new Error('bad image');
  const form = new FormData();
  form.append('image[]', new Blob([Buffer.from(m[2], 'base64')], { type: 'image/' + m[1] }), 'render.' + (m[1] === 'png' ? 'png' : 'jpg'));
  form.append('model', 'gpt-image-2'); form.append('prompt', buildPrompt(cfg));
  form.append('size', '1536x1024'); form.append('quality', process.env.RENDER_QUALITY || 'high');
  form.append('output_format', 'webp'); form.append('n', '1');
  // TODO before enabling: run this in a queue/background job (it takes ~75 s and
  // the org is limited to 5 images/min), retry on 429, store the bytes in Vercel
  // Blob at renders/<id>.webp, burn in the "Artist's rendering" caption with sharp.
  throw new Error('real rendering not enabled in this build');
  // eslint-disable-next-line no-unreachable
  return fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form });
}

function clientIp(req){ return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'; }
async function readJson(req){
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; let n = 0;
  for await (const ch of req){ n += ch.length; if (n > 4e6) throw new Error('too large'); chunks.push(ch); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function send(res, code, obj){ res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); }

export default async function handler(req, res){
  if (!enabled()) return send(res, 404, { error: 'not found' });
  rollDay();
  if (req.method === 'GET'){
    const url = new URL(req.url, 'http://x');
    const job = verify(url.searchParams.get('id'));
    if (!job) return send(res, 404, { error: 'unknown id' });
    if (job.mock){
      if (Date.now() - job.t < MOCK_DELAY_MS) return send(res, 200, { status: 'pending' });
      return send(res, 200, { status: 'done', url: job.img, mock: true });
    }
    return send(res, 200, { status: 'error' });   // real jobs need storage — not wired yet
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  let body; try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad body' }); }
  const cfg = body && body.config;
  if (!cfg || typeof cfg !== 'object' || !cfg.style) return send(res, 400, { error: 'config required' });
  const ip = clientIp(req), used = mem.ip.get(ip) || 0;
  if (used >= PER_IP_PER_DAY || mem.total >= DAILY_CAP) return send(res, 429, { error: 'limit' });
  mem.ip.set(ip, used + 1); mem.total++;
  if (isMock()) return send(res, 202, { id: sign({ t: Date.now(), mock: 1, img: mockImage(cfg) }), etaSec: Math.round(MOCK_DELAY_MS / 1000), mock: true });
  try { await realRender(body.image, cfg); } catch (e) { return send(res, 503, { error: 'unavailable' }); }
  return send(res, 503, { error: 'unavailable' });
}
