import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { chartScale } from '../src/chart-scale.ts';

// Different series can start on different days. Their dates must share one axis.
const scale = chartScale([{date:'2026-09-01', value:1}, {date:'2026-09-05', value:5}], true);
assert.equal(scale.x('2026-09-03'), 0.5);
assert.equal(scale.y(1), 0);
assert.equal(scale.y(5), 1);
assert.equal(chartScale([{date:'2026-09-01', value:0}], false).y(0), 1);
const data = JSON.parse(readFileSync(new URL('../public/data/trends.json', import.meta.url)));
assert.deepEqual(data.platforms.map(p => p.id).sort(), ['google','naver','youtube']);
for (const p of data.platforms) {
  assert.ok(p.metricLabel && p.period && p.sourceUrl.startsWith('https://'));
  assert.ok(Number.isFinite(Date.parse(p.checkedAt)));
  assert.equal(new Set(p.items.map(i => i.id)).size, p.items.length);
  for (const i of p.items) {
    assert.ok(i.title && i.url.startsWith('https://'));
    assert.ok(i.value === null || (Number.isFinite(i.value) && i.value >= 0));
    assert.ok(i.rank === null || (Number.isInteger(i.rank) && i.rank >= 1));
    if (p.id === 'google') assert.equal(i.rank, null, 'RSS order is not a popularity rank');
  }
  for (const s of p.series) {
    assert.ok(s.points.length > 0);
    for (const [n, point] of s.points.entries()) {
      assert.ok(Number.isFinite(Date.parse(point.date)) && Number.isFinite(point.value));
      if (n) assert.ok(s.points[n-1].date < point.date);
    }
  }
}
console.log('PASS: trend data and shared date/rank chart scale');

const visuals = JSON.parse(readFileSync(new URL('../public/data/visuals.json', import.meta.url)));
for (const visual of Object.values(visuals)) {
  assert.ok(visual.alt && visual.caption);
  assert.ok(visual.src.startsWith('https://') || existsSync(new URL('../public/' + visual.src.replace(/^\//, ''), import.meta.url)));
  assert.ok(!visual.sourceUrl || visual.sourceUrl.startsWith('https://'));
}
console.log('PASS: recommendation image references');
