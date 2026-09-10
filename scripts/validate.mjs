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
const shortsExpansionStart = "2026-09-10";
const expectedFormatCounts = (date) =>
  date >= shortsExpansionStart
    ? { shorts: 10, youtube: 5, blog: 5 }
    : { shorts: 5, youtube: 5, blog: 5 };
const expectedIdeaCount = (date) =>
  Object.values(expectedFormatCounts(date)).reduce(
    (total, count) => total + count,
    0,
  );

function sourceIdeaFor(carryover) {
  const sourceRow = index.briefs.find((row) => row.date === carryover.date);
  assert(sourceRow, "Unknown carryover date " + carryover.date);
  const sourceEdition = sourceRow.editions
    ? sourceRow.editions.find((edition) => edition.id === carryover.edition)
    : carryover.edition
      ? null
      : undefined;
  assert(
    sourceEdition !== null,
    "Unknown carryover edition " + carryover.edition,
  );
  const sourceBrief = read(briefPath(carryover.date, sourceEdition?.id));
  const sourceIdea = sourceBrief.ideas.find(
    (idea) => idea.id === carryover.ideaId,
  );
  assert(sourceIdea, "Unknown carryover idea " + carryover.ideaId);
  return sourceIdea;
}

function isCarryoverPair(left, leftDate, right, rightDate) {
  const pointsTo = (candidate, candidateDate, source, sourceDate) =>
    candidate.carriedFrom?.date === sourceDate &&
    candidate.carriedFrom.ideaId === source.id &&
    candidateDate > sourceDate;
  return (
    pointsTo(left, leftDate, right, rightDate) ||
    pointsTo(right, rightDate, left, leftDate)
  );
}

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
  const formatCounts = expectedFormatCounts(brief.date);
  const expectedCount = expectedIdeaCount(brief.date);
  assert(
    brief.ideas.length === expectedCount && row.count === expectedCount,
    "Require exactly " + expectedCount + " verified ideas",
  );
  for (const [format, count] of Object.entries(formatCounts)) {
    assert(
      brief.ideas.filter((idea) => idea.format === format).length === count,
      "Need " + count + " " + format,
    );
  }
  if (brief.date >= shortsExpansionStart) {
    assert(
      brief.ideas.filter(
        (idea) => idea.format === "shorts" && idea.category === "우주",
      ).length === 5,
      "Need 5 space shorts",
    );
    assert(
      brief.ideas.filter(
        (idea) =>
          idea.format === "shorts" && idea.category === "신비한 생물",
      ).length === 5,
      "Need 5 mysterious-life shorts",
    );
  }
  const ideaIds = new Set(brief.ideas.map((idea) => idea.id));
  assert(ideaIds.size === expectedCount);
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

    if (idea.carriedFrom) {
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(idea.carriedFrom.date) &&
          /^run-\d+$/.test(idea.carriedFrom.edition) &&
          /^[a-z0-9-]+$/.test(idea.carriedFrom.ideaId) &&
          idea.carriedFrom.note,
        "Invalid carryover metadata",
      );
      assert(
        idea.carriedFrom.date < brief.date,
        "Carryover must come from an earlier edition",
      );
      const sourceIdea = sourceIdeaFor(idea.carriedFrom);
      const { carriedFrom, ...carriedIdea } = idea;
      assert.deepEqual(
        carriedIdea,
        sourceIdea,
        "Carryover must preserve the original idea without new research",
      );
    }

    const titleKey = idea.format + ":" + normalize(idea.title);
    if (Date.parse(index.latest) - Date.parse(brief.date) < 30 * 86400000) {
      const priorIdeas = recentTitles.get(titleKey) || [];
      assert(
        priorIdeas.every((prior) =>
          isCarryoverPair(idea, brief.date, prior.idea, prior.date),
        ),
        "Same title repeated in last 30 days",
      );
      recentTitles.set(titleKey, [
        ...priorIdeas,
        { idea, date: brief.date },
      ]);
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

const recentTitles = new Map();
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
        validDate(edition.generatedAt) &&
          edition.count === expectedIdeaCount(row.date),
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
    " published posts; sources, per-date format contracts, immutable editions, links and references validated.",
);
