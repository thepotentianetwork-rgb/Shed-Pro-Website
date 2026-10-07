/* THE CALL-BACK FORM HAS TO BEHAVE LIKE THE QUOTE FORM.
 *
 * "Talk to a designer" is the second lead form in the designer, and it is the
 * one people reach when they are already half out the door — so its gates were
 * right from the start (a name, a real phone number, and an email checked only
 * if they typed one). Two things were not:
 *
 *   - It never said which fields it would refuse. Email is marked "(optional)",
 *     so by the form's own convention Name and Phone read as required, but
 *     neither carried the mark that says so.
 *   - It only showed a message. The quote form puts the customer ON the broken
 *     field; this one left them to find it, which on a phone can mean the error
 *     line is the only thing off-screen.
 *
 * Both forms now report through one shared formFail, so this file also pins the
 * part of that sharing that is easy to lose: the consult form passing a field id
 * at all. A fail() that still takes only a message compiles, reads fine, and
 * silently stops focusing anything.
 *
 * The send here is behind a promise chain, so the assertions await a tick and
 * check fetch — refused means nothing was ever sent.
 *
 * Run: node --test tests/ui/consultvalidation.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer.html'), 'utf8');

const GOOD = { cName: 'Jane Doe', cPhone: '(435) 555-0123', cEmail: 'jane@example.com' };

function field(value) {
  return {
    value: value || '', style: {}, focused: 0, scrolled: 0,
    focus(o) { this.focused++; this.lastFocusOpts = o; },
    scrollIntoView(o) { this.scrolled++; this.lastScrollOpts = o; },
  };
}

function form(values) {
  const { c } = loadDesigner();
  const els = {
    cErr: { textContent: '', style: { display: '' } },
    cSend: { textContent: 'Request a call →', style: {} },
    cTime: { value: 'Morning' }, cQ: field(''),
    cWebsite: { value: '' }, cSms: { checked: false },
  };
  for (const id of Object.keys(GOOD)) els[id] = field(values[id]);
  c.document.getElementById = (id) => (id in els ? els[id] : null);

  // Step 1 means there is no design worth saving, so the chain is a resolved
  // promise straight to the fetch — the one thing that leaves the browser.
  c.wizStep = 0;
  const sent = [];
  c.fetch = (url, opts) => { sent.push({ url, opts }); return new Promise(() => {}); };

  return { c, els, sent, submit: () => c.submitConsult() };
}
const tick = () => new Promise((r) => setImmediate(r));

test('a complete call-back request is sent', async () => {
  const f = form(GOOD);
  f.submit();
  await tick(); await tick();
  assert.equal(f.sent.length, 1);
  assert.equal(f.els.cErr.style.display, 'none');
});

test('no name, no send', async () => {
  const f = form({ ...GOOD, cName: '' });
  f.submit();
  await tick(); await tick();
  assert.equal(f.sent.length, 0);
  assert.match(f.els.cErr.textContent, /name/i);
  assert.equal(f.els.cErr.style.display, 'block');
});

test('a phone number too short to dial is no send', async () => {
  for (const bad of ['', '   ', '435-555', '123456789']) {
    const f = form({ ...GOOD, cPhone: bad });
    f.submit();
    await tick(); await tick();
    assert.equal(f.sent.length, 0, `cPhone="${bad}" should be refused`);
    assert.match(f.els.cErr.textContent, /phone/i);
  }
});

/* Email is genuinely optional here — this form's job is to get a phone call
   booked, and demanding an address would cost exactly the lead it exists to
   save. But a typo in one they DID type fails silently where a bad phone
   number does not. */
test('no email is fine, a broken email is not', async () => {
  const blank = form({ ...GOOD, cEmail: '' });
  blank.submit();
  await tick(); await tick();
  assert.equal(blank.sent.length, 1, 'email left empty should still send');

  for (const bad of ['jane', 'jane@example', 'jane example.com']) {
    const f = form({ ...GOOD, cEmail: bad });
    f.submit();
    await tick(); await tick();
    assert.equal(f.sent.length, 0, `cEmail="${bad}" should be refused`);
    assert.match(f.els.cErr.textContent, /email/i);
  }
});

test('the field that is wrong is the field focused and scrolled to', async () => {
  for (const [id, values] of [
    ['cName', { ...GOOD, cName: '' }],
    ['cPhone', { ...GOOD, cPhone: '435' }],
    ['cEmail', { ...GOOD, cEmail: 'jane' }],
  ]) {
    const f = form(values);
    f.submit();
    assert.equal(f.els[id].focused, 1, `${id} should be focused`);
    assert.equal(f.els[id].scrolled, 1, `${id} should be scrolled into view`);
    assert.equal(f.els[id].lastFocusOpts.preventScroll, true, `${id} focus should not scroll`);
    assert.equal(f.els[id].lastScrollOpts.block, 'center', `${id} should be centred`);
    for (const other of Object.keys(GOOD)) {
      if (other === id) continue;
      assert.equal(f.els[other].focused, 0, `${other} should not be focused when ${id} is the problem`);
    }
  }
});

test('a refused request leaves the button alone', async () => {
  const f = form({ ...GOOD, cName: '' });
  f.submit();
  await tick();
  assert.equal(f.els.cSend.textContent, 'Request a call →');
});

test('the markup marks the two fields this form will refuse without', () => {
  assert.match(HTML, /for="cName">Name \*</, 'Name should be marked required');
  assert.match(HTML, /for="cPhone">Phone \*</, 'Phone should be marked required');
});

test('the one field that is optional still says so, and is not marked required', () => {
  assert.ok(!/for="cEmail">Email \*/.test(HTML), 'email is not required here');
  assert.match(HTML, /for="cEmail">Email <span[^>]*>\(optional\)<\/span>/,
    'email should keep saying it is optional');
});

/* Both forms report through one function now. If that is ever inlined back
   into one of them, the other quietly loses the focus behaviour. */
test('both lead forms report through the one shared reporter', () => {
  assert.equal((HTML.match(/function formFail\(/g) || []).length, 1,
    'there should be exactly one formFail');
  assert.equal((HTML.match(/return formFail\(err, m, id\);/g) || []).length, 2,
    'the quote form and the consult form should both defer to it');
});
