import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = process.env.YOUTUBE_OS_DATA_DIR
  ? pathToFileURL(path.resolve(process.env.YOUTUBE_OS_DATA_DIR) + "/")
  : new URL("../public/data/", import.meta.url);
const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, dir)));
const index = read("index.json");
const posts = read("published.json");
const ids = new Set(posts.items.map((post) => post.id));
const validDate = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const normalize = (value) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const briefPath = (date, edition) =>
  edition
    ? "briefs/" + date + "/" + edition + ".json"
    : "briefs/" + date + ".json";

assert(ids.size === posts.items.length, "Duplicate published IDs");
assert(validDate(index.lastSuccessAt));
assert(index.briefs.some((brief) => brief.date === index.latest));
assert(
  new Set(index.briefs.map((brief) => brief.date)).size === index.briefs.length,
  "Duplicate archive dates",
);

function validateBrief(brief, row, edition, recentTitles) {
  assert(brief.date === row.date && validDate(brief.generatedAt));
  if (edition) {
    assert(
      brief.generatedAt === edition.generatedAt,
      "Edition timestamp mismatch",
    );
    assert(brief.ideas.length === edition.count, "Edition count mismatch");
  }
  assert(Array.isArray(brief.coverage) && brief.coverage.length > 0);
  for (const coverage of brief.coverage) {
    assert(
      coverage.title &&
        coverage.status &&
        coverage.note &&
        new URL(coverage.url).protocol === "https:",
    );
  }
  assert(
    brief.ideas.length === 15 && row.count === 15,
    "Require exactly 15 verified ideas",
  );
  for (const format of ["shorts", "youtube", "blog"]) {
    assert(
      brief.ideas.filter((idea) => idea.format === format).length === 5,
      "Need 5 " + format,
    );
  }
  const ideaIds = new Set(brief.ideas.map((idea) => idea.id));
  assert(ideaIds.size === 15);
  assert(brief.topIds.length === 3 && new Set(brief.topIds).size === 3);
  for (const id of brief.topIds) assert(ideaIds.has(id));

  for (const idea of brief.ideas) {
    for (const key of [
      "id",
      "title",
      "category",
      "summary",
      "whyNow",
      "fit",
      "hook",
      "guardrail",
    ]) {
      assert(
        typeof idea[key] === "string" && idea[key].trim(),
        idea.id + " missing " + key,
      );
    }
    assert(/^[a-z0-9-]+$/.test(idea.id));
    if (idea.image) {
      assert(
        /^assets\/topics\/[a-z0-9-]+\.png$/.test(idea.image.src) &&
          idea.image.alt &&
          idea.image.caption,
        "Invalid topic image",
      );
      assert(
        fs.existsSync(new URL("../public/" + idea.image.src, import.meta.url)),
        "Missing topic image file",
      );
    }
    assert(["시의성", "채널 적합", "후속 기획"].includes(idea.signal));
    assert(["sage", "blue", "lavender", "peach"].includes(idea.accent));
    assert(typeof idea.duration === "string" && idea.duration.length > 0);
    assert(
      idea.outline.length >= 3 &&
        idea.keywords.length >= 3 &&
        idea.sources.length >= 2,
    );
    assert(
      idea.outline.every((value) => typeof value === "string" && value.trim()),
    );
    assert(
      idea.keywords.every((value) => typeof value === "string" && value.trim()),
    );
    assert(["new", "followup"].includes(idea.duplicate.type));
    for (const id of idea.duplicate.related)
      assert(ids.has(id), "Unknown related post " + id);
    assert(idea.duplicate.note, "Missing duplicate explanation");
    if (idea.duplicate.type === "followup")
      assert(idea.duplicate.related.length > 0);

    const titleKey = idea.format + ":" + normalize(idea.title);
    if (Date.parse(index.latest) - Date.parse(brief.date) < 30 * 86400000) {
      assert(
        !recentTitles.has(titleKey),
        "Same title repeated in last 30 days",
      );
      recentTitles.add(titleKey);
    }
    const publishedMatch = posts.items.find(
      (post) => normalize(post.title) === normalize(idea.title),
    );
    if (publishedMatch) {
      assert(
        idea.duplicate.type === "followup" &&
          idea.duplicate.related.includes(publishedMatch.id),
        "Published title needs explicit follow-up",
      );
    }
    for (const source of idea.sources) {
      assert(new URL(source.url).protocol === "https:");
      assert(validDate(source.checkedAt));
      assert(source.publishedAt === null || validDate(source.publishedAt));
      assert(source.note && source.publisher && source.kind);
    }
  }
}

const recentTitles = new Set();
let latestGeneratedAt = "";
for (const row of index.briefs) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(row.date), "Invalid archive date");
  let currentBrief;
  let legacyBrief;
  const editionIdeaIds = new Set();

  if (row.editions) {
    assert(
      Array.isArray(row.editions) && row.editions.length > 0,
      "Missing editions",
    );
    assert(
      typeof row.legacyEdition === "string" &&
        typeof row.currentEdition === "string",
      "Missing edition pointers",
    );
    const editionIds = new Set(row.editions.map((edition) => edition.id));
    assert(editionIds.size === row.editions.length, "Duplicate edition IDs");
    assert(editionIds.has(row.legacyEdition), "Unknown legacy edition");
    assert(editionIds.has(row.currentEdition), "Unknown current edition");
    for (const edition of row.editions) {
      assert(/^run-\d+$/.test(edition.id), "Invalid edition ID");
      assert(
        validDate(edition.generatedAt) && edition.count === 15,
        "Invalid edition metadata",
      );
      const brief = read(briefPath(row.date, edition.id));
      for (const idea of brief.ideas) {
        assert(
          !editionIdeaIds.has(idea.id),
          "Same-date edition reuses idea ID " + idea.id,
        );
        editionIdeaIds.add(idea.id);
      }
      validateBrief(brief, row, edition, recentTitles);
      if (edition.id === row.legacyEdition) legacyBrief = brief;
      if (edition.id === row.currentEdition) currentBrief = brief;
    }
    const original = read(briefPath(row.date));
    assert.deepEqual(
      original,
      legacyBrief,
      "Legacy direct path must keep the original brief",
    );
  } else {
    currentBrief = read(briefPath(row.date));
    legacyBrief = currentBrief;
    validateBrief(currentBrief, row, null, recentTitles);
  }

  assert(currentBrief && legacyBrief);
  assert(
    row.count === currentBrief.ideas.length,
    "Current edition count mismatch",
  );
  if (row.date === index.latest) latestGeneratedAt = currentBrief.generatedAt;
}

assert(latestGeneratedAt === index.lastSuccessAt, "Latest timestamp mismatch");
console.log(
  "PASS: " +
    index.briefs.length +
    " brief date(s), " +
    posts.items.length +
    " published posts; sources, 5/5/5, immutable editions, links and references validated.",
);
