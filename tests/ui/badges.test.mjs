/* A STYLE TILE'S BADGE GOES WHERE ITS DESCRIPTION WAS.
 *
 * The badge used to be an 8px corner label sitting above a subtitle saying
 * much the same thing - "Most space" over "Max loft space", "Modern" over
 * "Modern look". Two labels competing for a space that fits one. Now the badge
 * takes the description's line, and a tile with no badge keeps its description
 * untouched.
 *
 * The part worth testing is the way back. applyRecommendations runs again on
 * every step and use change, and a badge can disappear - a recommendation that
 * no longer applies. If the original text were not kept, the line would go
 * blank instead of returning to its description.
 *
 * The page's real DOM stubs are too thin for this, so the test builds a small
 * document of its own: a style grid of four tiles, each with the caption
 * structure the markup has.
 *
 * Run: node --test tests/ui/badges.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';
const { c } = loadDesigner();

// A DOM small enough to hand-check and big enough for applyRecommendations.
function El(cls, attrs){
  const e = {
    className: cls||'', attrs: Object.assign({}, attrs||{}), children: [], parentNode: null,
    _text: '',
    get textContent(){ return this._text; },
    set textContent(v){ this._text = String(v); this.children = []; },
    get firstChild(){ return this.children[0] || null; },
    set innerHTML(v){
      const m = /class="([^"]+)"/.exec(v);
      this.children = [ El(m ? m[1] : '') ];
      this.children[0].parentNode = this;
      this._text = '';
    },
    getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; },
    setAttribute(k,v){ this.attrs[k] = String(v); },
    removeAttribute(k){ delete this.attrs[k]; },
    appendChild(ch){ ch.parentNode = this; this.children.push(ch); return ch; },
    removeChild(ch){ this.children = this.children.filter(x => x !== ch); },
    querySelector(sel){ return descend(this).find(x => matches(x, sel)) || null; },
    closest(sel){ let p = this; while(p){ if (matches(p, sel) || p.__id === sel.slice(1)) return p; p = p.parentNode; } return null; },
  };
  return e;
}
const descend = (n) => n.children.flatMap(ch => [ch, ...descend(ch)]);
function matches(el, sel){
  if (sel.startsWith('.')) return (' '+el.className+' ').includes(' '+sel.slice(1)+' ');
  const m = /^\[data-([a-z]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (m) return m[2] == null ? el.getAttribute('data-'+m[1]) != null : el.getAttribute('data-'+m[1]) === m[2];
  return false;
}
const STYLES = [['gable','Most popular'],['barn','Max loft space'],['leanto','Modern look'],['hip','Hip roof']];
let grid, tiles;
function buildDom(){
  grid = El(''); grid.__id = 'styleGrid';
  tiles = {};
  for (const [st, desc] of STYLES){
    const t = El('tile', {'data-style': st});
    const cap = El('tile-cap'); const price = El('tile-price');
    price.textContent = desc; cap.appendChild(price); t.appendChild(cap);
    grid.appendChild(t); tiles[st] = { tile:t, price };
  }
  c.document = {
    querySelectorAll(sel){
      if (sel === '.tile-rec') return descend(grid).filter(x => matches(x,'.tile-rec'));
      if (sel.startsWith('#styleGrid ')) {
        const inner = sel.slice('#styleGrid '.length);
        if (inner === '.tile-price') return descend(grid).filter(x => matches(x,'.tile-price'));
        if (inner === '.tile[data-badged]') return descend(grid).filter(x => matches(x,'.tile') && x.getAttribute('data-badged')!=null);
      }
      return descend(grid).filter(x => matches(x, sel));
    },
    createElement: () => El(''),
    getElementById: () => null,
  };
}
const shown = (st) => { const p = tiles[st].price; return p.firstChild ? p.firstChild.textContent : p.textContent; };
const isBadge = (st) => { const p = tiles[st].price; return !!(p.firstChild && p.firstChild.className === 'tile-price-badge'); };


buildDom();
c.SHED_USE = 'custom';
c.stampStaticBadges = function(){};

test('a style with a badge shows it instead of its description', () => {
  c.applyRecommendations();
  for (const [st, desc] of STYLES) {
    if (c.STYLE_BADGES[st]) {
      assert.ok(isBadge(st), `${st} shows a badge`);
      assert.equal(shown(st), c.STYLE_BADGES[st], `${st} shows "${c.STYLE_BADGES[st]}"`);
    } else {
      assert.ok(!isBadge(st), `${st} has no badge`);
      assert.equal(shown(st), desc, `${st} keeps "${desc}"`);
    }
  }
});

test('running it again changes nothing', () => {
  // It runs on every step change, and a badge that re-badged itself would
  // stack, while one that restored first and then failed would go blank.
  c.applyRecommendations(); c.applyRecommendations(); c.applyRecommendations();
  assert.equal(shown('barn'), c.STYLE_BADGES['barn']);
  assert.ok(isBadge('barn'));
  assert.equal(shown('gable'), 'Most popular');
  assert.ok(!isBadge('gable'));
});

test('a recommendation badges a plain tile, and giving it up restores the words', () => {
  c.SHED_USE = 'golfsim'; c.applyRecommendations();
  assert.ok(isBadge('gable'), 'the recommended style is badged');
  assert.equal(shown('gable'), 'Recommended');

  c.SHED_USE = 'custom'; c.applyRecommendations();
  assert.ok(!isBadge('gable'), 'the badge is gone');
  assert.equal(shown('gable'), 'Most popular', 'and the description came back');
});

test('a recommendation beats a standing badge rather than stacking with it', () => {
  c.SHED_USE = 'golfsim'; c.applyRecommendations();
  const badged = STYLES.filter(([st]) => isBadge(st)).map(([st]) => st);
  for (const st of badged) {
    const t = tiles[st].price;
    assert.equal(t.children.length, 1, `${st} carries exactly one label`);
  }
  c.SHED_USE = 'custom'; c.applyRecommendations();
});
