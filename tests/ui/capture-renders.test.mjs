// captureRenders must take only the perspective snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer.html');

test('captureRenders lists only the perspective view', () => {
  const src = fs.readFileSync(PAGE, 'utf8');
  const m = src.match(/function captureRenders\(\)\{[\s\S]*?var views=\[([\s\S]*?)\];/);
  assert.ok(m, 'captureRenders views array not found');
  const views = m[1];
  assert.match(views, /view:'perspective'/);
  assert.doesNotMatch(views, /view:'front'/);
  assert.doesNotMatch(views, /view:'right'/);
  assert.doesNotMatch(views, /view:'back'/);
  assert.doesNotMatch(views, /view:'left'/);
});
