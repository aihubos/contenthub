import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = process.env.YOUTUBE_OS_DATA_DIR ? pathToFileURL(path.resolve(process.env.YOUTUBE_OS_DATA_DIR)+'/') : new URL('../public/data/', import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL('index.json',dir)));
const posts = JSON.parse(fs.readFileSync(new URL('published.json',dir)));
const ids = new Set(posts.items.map(p=>p.id));
assert(ids.size === posts.items.length, 'Duplicate published IDs');
const validDate = x => typeof x==='string' && Number.isFinite(Date.parse(x));
assert(validDate(index.lastSuccessAt));
assert(index.briefs.some(b=>b.date===index.latest));
assert(new Set(index.briefs.map(b=>b.date)).size===index.briefs.length, 'Duplicate archive dates');
const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const recentTitles = new Set();
for (const row of index.briefs) {
 assert(/^\d{4}-\d{2}-\d{2}$/.test(row.date), 'Invalid archive date');
 const brief = JSON.parse(fs.readFileSync(new URL(`briefs/${row.date}.json`,dir)));
 assert(brief.date===row.date && validDate(brief.generatedAt));
 if(row.date===index.latest) assert(brief.generatedAt===index.lastSuccessAt, 'Latest timestamp mismatch');
 assert(Array.isArray(brief.coverage) && brief.coverage.length>0);
 for(const c of brief.coverage) assert(c.title && c.status && c.note && new URL(c.url).protocol==='https:');
 assert(brief.ideas.length===15 && row.count===15, 'Require exactly 15 verified ideas');
 for (const format of ['shorts','youtube','blog']) assert(brief.ideas.filter(i=>i.format===format).length===5, `Need 5 ${format}`);
 const ideaIds = new Set(brief.ideas.map(i=>i.id));
 assert(ideaIds.size===15); assert(brief.topIds.length===3 && new Set(brief.topIds).size===3);
 for (const id of brief.topIds) assert(ideaIds.has(id));
 for (const i of brief.ideas) {
  for(const key of ['id','title','category','summary','whyNow','fit','hook','guardrail']) assert(typeof i[key]==='string' && i[key].trim(), `${i.id} missing ${key}`);
  assert(/^[a-z0-9-]+$/.test(i.id));
  assert(['시의성','채널 적합','후속 기획'].includes(i.signal));
  assert(['sage','blue','lavender','peach'].includes(i.accent));
  assert(typeof i.duration==='string' && i.duration.length>0);
  assert(i.outline.length>=3 && i.keywords.length>=3 && i.sources.length>=2);
  assert(i.outline.every(s=>typeof s==='string'&&s.trim()) && i.keywords.every(s=>typeof s==='string'&&s.trim()));
  assert(['new','followup'].includes(i.duplicate.type));
  for(const id of i.duplicate.related) assert(ids.has(id), `Unknown related post ${id}`);
  assert(i.duplicate.note, 'Missing duplicate explanation');
  if(i.duplicate.type==='followup') assert(i.duplicate.related.length>0);
  const titleKey=i.format+':'+normalize(i.title);
  if(Date.parse(index.latest)-Date.parse(brief.date)<30*86400000){assert(!recentTitles.has(titleKey), 'Same title repeated in last 30 days');recentTitles.add(titleKey);}
  const publishedMatch=posts.items.find(p=>normalize(p.title)===normalize(i.title));
  if(publishedMatch) assert(i.duplicate.type==='followup'&&i.duplicate.related.includes(publishedMatch.id), 'Published title needs explicit follow-up');
  for(const s of i.sources) { assert(new URL(s.url).protocol==='https:'); assert(validDate(s.checkedAt)); assert(s.publishedAt===null || validDate(s.publishedAt)); assert(s.note && s.publisher && s.kind); }
 }
}
console.log(`PASS: ${index.briefs.length} brief(s), ${posts.items.length} published posts; sources, 5/5/5, links and references validated.`);
