#!/usr/bin/env python3
"""Build the designer's brand paint colour files (paint-colors/*.json).

Every hex comes from a published source -- nothing is typed in by hand. The
sources, the exact files fetched and what each one is are listed in SOURCES
below and written to paint-colors/SOURCES.md.

    python3 -m venv /tmp/pv && /tmp/pv/bin/pip install openpyxl
    /tmp/pv/bin/python scripts/paint/build_paint_colors.py [--cache DIR]

Output, one file per brand, loaded by paint-codes.js only when someone first
searches (never on page load):

    {"b":"sw","brand":"Sherwin-Williams","n":1732,
     "c":[["SW 7006","Extra White","EEEFEA","sw7006 7006|extra white"], ...]}

The fourth field is the precomputed search key: the compact codes (lowercase,
letters and digits only, with and without the brand prefix) then "|" then the
folded name. The page matches against it directly and never re-normalises the
catalogue.
"""
import argparse, io, json, os, re, sys, unicodedata, urllib.request, zipfile
from datetime import date

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124 ShedPro-paint-build'}
COLORNERD = 'https://raw.githubusercontent.com/jpederson/colornerd/b91a655b638d94df598442a276b5c5dd13fa35d4/json/'
WESBOS = 'https://raw.githubusercontent.com/wesbos/benjamin-moore-css/fa99ce05c36b981b2a56bf450e4b527bb126e1c6/colors.json'

SOURCES = {
  'sw': dict(brand='Sherwin-Williams', urls=[
      'https://images.sherwin-williams.com/content_images/SW-XCL-SHERWIN-WILLIAMS-COLORC.zip',
      'https://images.sherwin-williams.com/content_images/sw-xcl-sherwin-williams-ede.zip'],
    note='Sherwin-Williams\' own downloadable colour palettes (ColorSnap collection + Emerald Designer Edition), '
         'Excel files with colour number, name, RGB and hex, published for designers at '
         'https://www.sherwin-williams.com/painting-contractors/color/color-tools/downloadable-color-palettes',
    license='Published by Sherwin-Williams for designers/specifiers; no open licence. Colour names and numbers are Sherwin-Williams trademarks, used here only to identify the colour.'),
  'behr': dict(brand='Behr', urls=['https://www.behr.com/mainService/services/colornx/all.js'],
    note='Behr\'s own colour feed (the data behr.com\'s colour tools load): id, name, rgb.',
    license='Published by Behr on behr.com; no open licence. Names/codes are Behr trademarks, used only to identify the colour.'),
  'bm': dict(brand='Benjamin Moore', urls=[WESBOS],
    note='wesbos/benjamin-moore-css colors.json -- Benjamin Moore\'s own website colour data (number, name, hex) collected by Wes Bos. '
         'Stain-only entries are dropped.',
    license='Repository package.json says ISC (no LICENSE file). Colour names/numbers are Benjamin Moore trademarks.'),
  'valspar': dict(brand='Valspar', urls=[COLORNERD + 'valspar.json'],
    note='jpederson/colornerd valspar.json (community compilation of the Valspar colour book).',
    license='colornerd is MIT (package.json); its README notes colour names belong to their owners.'),
  'ppg': dict(brand='PPG / Glidden', urls=[COLORNERD + 'ppg.json'],
    note='jpederson/colornerd ppg.json. Glidden sells these same colours under the PPG codes (e.g. PPG1025-1 Commercial White on glidden.com).',
    license='colornerd is MIT (package.json); its README notes colour names belong to their owners.'),
  'de': dict(brand='Dunn-Edwards', urls=[COLORNERD + 'dunn-edwards.json'],
    note='jpederson/colornerd dunn-edwards.json.',
    license='colornerd is MIT (package.json); its README notes colour names belong to their owners.'),
}

def fetch(url, cache):
  name = re.sub(r'[^A-Za-z0-9._-]', '_', url.split('//', 1)[1])
  p = os.path.join(cache, name) if cache else None
  if p and os.path.exists(p):
    return open(p, 'rb').read()
  data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
  if p:
    os.makedirs(cache, exist_ok=True); open(p, 'wb').write(data)
  return data

def fold(s):
  s = unicodedata.normalize('NFKD', s)
  return ''.join(ch for ch in s if not unicodedata.combining(ch))

def clean_name(s):
  s = str(s).replace('\u00c2', '').replace('\u00ae', '').replace('\u2122', '').strip()
  return re.sub(r'\s+', ' ', s)

def smart_title(s):
  # "PAINTER'S WHITE" -> "Painter's White"; keeps hyphenated words capitalised.
  def cap(w): return w[:1].upper() + w[1:].lower()
  return re.sub(r"[A-Za-z][A-Za-z']*", lambda m: cap(m.group(0)), s.lower())

def hex6(v):
  v = str(v).strip()
  m = re.match(r'^#?([0-9a-fA-F]{6})$', v)
  if m: return m.group(1).upper()
  m = re.match(r'^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$', v)
  if m: return ''.join('%02X' % int(x) for x in m.groups())
  raise ValueError('bad colour %r' % v)

def compact(s): return re.sub(r'[^a-z0-9]', '', fold(s).lower())

def key(codes, name):
  ks = []
  for c in codes:
    c = compact(c)
    if c and c not in ks: ks.append(c)
  nm = re.sub(r'[^a-z0-9 ]', ' ', fold(name).lower().replace("'", ''))
  return ' '.join(ks) + '|' + re.sub(r'\s+', ' ', nm).strip()

def xlsx_rows(blob):
  import openpyxl
  z = zipfile.ZipFile(io.BytesIO(blob))
  for n in z.namelist():
    if n.endswith('.xlsx') and not n.startswith('__MACOSX'):
      wb = openpyxl.load_workbook(io.BytesIO(z.read(n)), read_only=True, data_only=True)
      yield n, list(wb.worksheets[0].iter_rows(values_only=True))

def build_sw(cache):
  out = {}
  cs, ede = SOURCES['sw']['urls']
  for _, rows in xlsx_rows(fetch(cs, cache)):
    hdr = [str(x or '').strip().upper() for x in rows[1]]
    i = {h: hdr.index(h) for h in ('COLOR #', 'COLOR NAME', 'RED', 'GREEN', 'BLUE', 'HEX')}
    for r in rows[2:]:
      if not r or not r[i['COLOR #']]: continue
      num = re.sub(r'^SW\s*', '', str(r[i['COLOR #']]).strip(), flags=re.I)
      rgb = '%02X%02X%02X' % (r[i['RED']], r[i['GREEN']], r[i['BLUE']])
      if r[i['HEX']] and hex6(r[i['HEX']]) != rgb: raise ValueError('SW hex/rgb disagree ' + num)
      out[num] = ['SW ' + num, clean_name(r[i['COLOR NAME']]), rgb]
  for _, rows in xlsx_rows(fetch(ede, cache)):
    hdr = [str(x or '').strip() for x in rows[0]]
    i = {h: hdr.index(h) for h in ('Color Name', 'Color ID', 'R', 'G', 'B')}
    for r in rows[1:]:
      if not r or not r[i['Color ID']]: continue
      num = re.sub(r'^SW\s*', '', str(r[i['Color ID']]).strip(), flags=re.I)
      if num in out: continue
      out[num] = ['SW ' + num, clean_name(r[i['Color Name']]), '%02X%02X%02X' % (r[i['R']], r[i['G']], r[i['B']])]
  res = []
  for num, (code, name, hx) in sorted(out.items()):
    res.append([code, name, hx, key([code, num], name)])
  return res

def build_behr(cache):
  src = fetch(SOURCES['behr']['urls'][0], cache).decode('utf8')
  arr = json.loads(src[src.index('['):src.rindex(']') + 1])
  hdr = arr[0]; ii = {h: hdr.index(h) for h in ('id', 'name', 'rgb')}
  seen, res = set(), []
  for r in arr[1:]:
    code = str(r[ii['id']]).strip()
    if not code or code in seen: continue
    seen.add(code)
    name = smart_title(clean_name(r[ii['name']]))
    res.append([code, name, hex6(r[ii['rgb']]), key([code], name)])
  return res

def build_bm(cache):
  arr = json.loads(fetch(SOURCES['bm']['urls'][0], cache))
  res, seen = [], set()
  for c in arr:
    if c.get('productTypesAvailable') == 'stain': continue
    code = str(c['number']).strip()
    if code in seen: continue
    seen.add(code)
    name = clean_name(c['name'])
    res.append([code, name, hex6(c['hex']), key([code], name)])
  return res

def build_cn(b, cache):
  arr = json.loads(fetch(SOURCES[b]['urls'][0], cache))
  res, seen = [], set()
  for c in arr:
    code = str(c['label']).strip()
    if code in seen: continue
    seen.add(code)
    codes = [code]
    if b == 'ppg' and re.match(r'^\d{4}-\d$', code):
      code = 'PPG' + code; codes = [code, codes[0]]
    name = clean_name(c['name'])
    res.append([code, name, hex6(c['hex']), key(codes, name)])
  return res

def main():
  ap = argparse.ArgumentParser(); ap.add_argument('--cache'); ap.add_argument('--out', default=None)
  a = ap.parse_args()
  root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
  out = a.out or os.path.join(root, 'paint-colors'); os.makedirs(out, exist_ok=True)
  built = {'sw': build_sw(a.cache), 'behr': build_behr(a.cache), 'bm': build_bm(a.cache),
           'valspar': build_cn('valspar', a.cache), 'ppg': build_cn('ppg', a.cache), 'de': build_cn('de', a.cache)}
  md = ['# Brand paint colours', '',
        'Generated by `scripts/paint/build_paint_colors.py` on %s. Do not edit the JSON by hand; rerun the script.' % date.today(), '',
        'On-screen colours are approximate. Every hex below is the brand\'s published RGB/hex for that colour, not a measured paint chip.', '',
        '| File | Brand | Colours | Source | Licence / terms |', '|---|---|---|---|---|']
  for b, rows in built.items():
    s = SOURCES[b]
    doc = {'b': b, 'brand': s['brand'], 'n': len(rows), 'c': [r for r in rows]}
    with open(os.path.join(out, b + '.json'), 'w') as f:
      json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    md.append('| `%s.json` | %s | %d | %s (%s) | %s |' % (b, s['brand'], len(rows), s['note'], ', '.join(s['urls']), s['license']))
    print('%-8s %-18s %5d' % (b, s['brand'], len(rows)))
  open(os.path.join(out, 'SOURCES.md'), 'w').write('\n'.join(md) + '\n')

if __name__ == '__main__':
  main()
