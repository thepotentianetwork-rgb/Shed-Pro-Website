/* THE QUOTE FORM HAS TO REFUSE AN INCOMPLETE SUBMISSION.
 *
 * submitQuote used to check three fields - name, email, phone - and send
 * whatever else it found. The delivery address was never looked at, so quotes
 * arrived with nowhere to deliver to: no distance to price the haul, nothing to
 * geocode onto the map, and a phone call needed before the job could even be
 * scheduled. Nothing on the form said those fields were needed either, so a
 * customer skipping them was doing what the form told them they could.
 *
 * What is worth testing is not that the happy path works - it already did. It
 * is that each gate actually stops the send. A validation block that reports an
 * error and then falls through to the network call is worse than no validation:
 * the customer sees "Please add the city" AND the lead lands with no city.
 * So every assertion here is about saveDesignAndGetLink, the first thing that
 * leaves the browser. Refused means it was never called.
 *
 * The page's real DOM stubs hand back a fresh empty element per lookup, which
 * would make every field read as blank. This builds a form of its own, one
 * object per id, so a value set stays set.
 *
 * Run: node --test tests/ui/quotevalidation.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer.html'), 'utf8');

// A form a customer filled in correctly, top to bottom.
const GOOD = {
  qName: 'Jane Doe', qEmail: 'jane@example.com', qPhone: '(435) 555-0123',
  qAddr: '123 Main St', qCity: 'Hurricane', qState: 'UT', qZip: '84737',
};
const REQUIRED = Object.keys(GOOD);

function field(value, opts) {
  return {
    value: value || '', style: {}, focused: 0, scrolled: 0,
    focus(o) {
      if (opts && opts.throwOnOptions && o) throw new Error('no options here');
      this.focused++; this.lastFocusOpts = o;
    },
    scrollIntoView(o) { this.scrolled++; this.lastScrollOpts = o; },
  };
}

/* Loads the page fresh each time: submitQuote is read off the context, and a
   shared one would carry over a previous case's error box and button state. */
function form(values, opts) {
  const { c } = loadDesigner();
  const els = {
    qErr: { textContent: '', style: { display: '' } },
    qSend: { textContent: 'Send my request →', style: {} },
    qHeard: { value: '' }, qHeardOther: field(''), qNotes: field(''),
    qWebsite: { value: '' }, qSms: { checked: false },
  };
  for (const id of REQUIRED) els[id] = field(values[id], opts);
  c.document.getElementById = (id) => (id in els ? els[id] : null);

  // The first thing that leaves the browser. Never resolves, so nothing past
  // it runs - this test is about whether the send is reached at all.
  const sent = [];
  c.saveDesignAndGetLink = (contact) => { sent.push(contact); return new Promise(() => {}); };

  return { c, els, sent, submit: () => c.submitQuote() };
}

test('a form filled in correctly is sent', () => {
  const f = form(GOOD);
  f.submit();
  assert.equal(f.sent.length, 1, 'a complete form should submit');
  assert.deepEqual(
    { address: f.sent[0].address, city: f.sent[0].city, state: f.sent[0].state, zip: f.sent[0].zip },
    { address: '123 Main St', city: 'Hurricane', state: 'UT', zip: '84737' },
    'the address the customer typed should be the address that is sent');
});

test('a form filled in correctly leaves no error showing', () => {
  const f = form(GOOD);
  f.submit();
  assert.equal(f.els.qErr.style.display, 'none');
});

test('every required field, left blank on its own, stops the send', () => {
  for (const id of REQUIRED) {
    const f = form({ ...GOOD, [id]: '' });
    f.submit();
    assert.equal(f.sent.length, 0, `${id} blank should not submit`);
    assert.equal(f.els.qErr.style.display, 'block', `${id} blank should show a message`);
    assert.ok(f.els.qErr.textContent.trim(), `${id} blank should say something`);
  }
});

test('a field holding only spaces counts as blank', () => {
  for (const id of REQUIRED) {
    const f = form({ ...GOOD, [id]: '   ' });
    f.submit();
    assert.equal(f.sent.length, 0, `${id} of spaces should not submit`);
  }
});

test('the field that is wrong is the field focused and scrolled to', () => {
  for (const id of REQUIRED) {
    const f = form({ ...GOOD, [id]: '' });
    f.submit();
    assert.equal(f.els[id].focused, 1, `${id} should be focused`);
    assert.equal(f.els[id].scrolled, 1, `${id} should be scrolled into view`);
    for (const other of REQUIRED) {
      if (other === id) continue;
      assert.equal(f.els[other].focused, 0, `${other} should not be focused when ${id} is the problem`);
    }
  }
});

/* The scroll is the reason focus is asked not to scroll: two of them fight,
   and the field lands at the top edge instead of centred. */
test('the focus does not scroll, the scroll does', () => {
  const f = form({ ...GOOD, qCity: '' });
  f.submit();
  assert.equal(f.els.qCity.lastFocusOpts.preventScroll, true);
  assert.equal(f.els.qCity.lastScrollOpts.block, 'center');
});

test('a browser that rejects the focus options object still gets the field focused', () => {
  const f = form({ ...GOOD, qZip: '' }, { throwOnOptions: true });
  f.submit();
  assert.equal(f.els.qZip.focused, 1, 'the fallback focus() should have run');
  assert.equal(f.sent.length, 0);
});

/* An empty form has seven problems. Reporting the last one sends someone
   scrolling past the six above it. */
test('an empty form complains about the first field, not the last', () => {
  const blank = {};
  for (const id of REQUIRED) blank[id] = '';
  const f = form(blank);
  f.submit();
  assert.match(f.els.qErr.textContent, /name/i);
  assert.equal(f.els.qName.focused, 1);
  assert.equal(f.els.qZip.focused, 0);
});

test('the message names the field it is about', () => {
  const cases = [
    ['qName', /name/i], ['qEmail', /email/i], ['qPhone', /phone/i],
    ['qAddr', /address|street/i], ['qCity', /city/i], ['qState', /state/i], ['qZip', /zip/i],
  ];
  for (const [id, re] of cases) {
    const f = form({ ...GOOD, [id]: '' });
    f.submit();
    assert.match(f.els.qErr.textContent, re, `${id}: got "${f.els.qErr.textContent}"`);
  }
});

test('a value that is present but not usable is still refused', () => {
  const bad = [
    ['qEmail', 'jane'], ['qEmail', 'jane@example'], ['qEmail', 'jane example.com'],
    ['qEmail', 'ja ne@example.com'],
    ['qPhone', '435-555'], ['qPhone', '123456789'],
    ['qState', 'Utah'], ['qState', 'U'], ['qState', '84'],
    ['qZip', '8473'], ['qZip', '847370'], ['qZip', 'UT737'], ['qZip', '84737-12'],
  ];
  for (const [id, value] of bad) {
    const f = form({ ...GOOD, [id]: value });
    f.submit();
    assert.equal(f.sent.length, 0, `${id}="${value}" should be refused`);
  }
});

test('the formats people really type are accepted', () => {
  const ok = [
    ['qPhone', '4355550123'], ['qPhone', '(435) 555-0123'], ['qPhone', '+1 435 555 0123'],
    ['qZip', '84737'], ['qZip', '84737-1234'],
    ['qState', 'ut'], ['qState', 'Ut'],
    ['qEmail', 'jane.doe+sheds@mail.example.co'],
  ];
  for (const [id, value] of ok) {
    const f = form({ ...GOOD, [id]: value });
    f.submit();
    assert.equal(f.sent.length, 1, `${id}="${value}" should be accepted`);
  }
});

/* A refused form that has already turned its button into "Sending..." looks
   like it sent. The validation runs first for that reason. */
test('a refused form leaves the send button alone', () => {
  const f = form({ ...GOOD, qAddr: '' });
  f.submit();
  assert.equal(f.els.qSend.textContent, 'Send my request →');
  assert.notEqual(f.els.qSend.style.opacity, '.6');
});

test('a sent form shows the button working', () => {
  const f = form(GOOD);
  f.submit();
  assert.equal(f.els.qSend.textContent, 'Sending...');
});

/* The form has to SAY which fields it will refuse. Otherwise the first a
   customer hears of it is the submit button turning them down. */
test('the markup marks every required field', () => {
  for (const [id, label] of [['qName', 'Name'], ['qEmail', 'Email'], ['qPhone', 'Phone']]) {
    assert.match(HTML, new RegExp(`for="${id}">${label} \\*<`), `${label} should be marked required`);
  }
  assert.ok(HTML.includes('>Delivery Address *<'),
    'the address section covers street/city/state/zip, which have no labels of their own');
});

test('the fields that are not required are not marked as if they were', () => {
  assert.ok(!HTML.includes('>Tell us more *<'));
  assert.ok(!HTML.includes('>Anything Else? *<'));
  assert.ok(!HTML.includes('How did you hear about us? *'));
});
