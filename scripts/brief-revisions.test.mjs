import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { editionId, installBrief } from "./install-brief.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));

function createExpandedCandidate(source, generatedAt) {
  const currentEdition = "run-202609090545240900";
  const sourceShorts = source.ideas.filter((idea) => idea.format === "shorts");
  const carriedIdeas = source.ideas
    .filter((idea) => idea.format !== "shorts")
    .map((idea) => ({
      ...idea,
      carriedFrom: {
        date: "2026-09-09",
        edition: currentEdition,
        ideaId: idea.id,
        note: "2026-09-09 검증 회차에서 이월한 기획이며 신규 조사로 표시하지 않는다.",
      },
    }));
  const shorts = Array.from({ length: 10 }, (_, number) => {
    const sourceIdea = sourceShorts[number % sourceShorts.length];
    const category = number < 5 ? "우주" : "신비한 생물";
    return {
      ...sourceIdea,
      id: "shorts-contract-" + (number + 1),
      title: category + " 수량 계약 검증 " + (number + 1),
      category,
      duplicate: {
        type: "new",
        related: [],
        note: "수량 계약 검증용 신규 쇼츠 기획",
      },
    };
  });
  return {
    ...source,
    date: "2026-09-10",
    generatedAt,
    ideas: [...shorts, ...carriedIdeas],
    topIds: shorts.slice(0, 3).map((idea) => idea.id),
  };
}

function nextGeneratedAt(dataDir, date) {
  const index = readJson(path.join(dataDir, "index.json"));
  const row = index.briefs.find((brief) => brief.date === date);
  if (!row) return "2026-09-10T01:30:00+09:00";
  const current = row.editions
    ? row.editions.find((edition) => edition.id === row.currentEdition)
    : readJson(path.join(dataDir, "briefs", date + ".json"));
  return new Date(Date.parse(current.generatedAt) + 60_000).toISOString();
}

function removeBriefDate(dataDir, date) {
  const indexFile = path.join(dataDir, "index.json");
  const index = readJson(indexFile);
  const remaining = index.briefs.filter((brief) => brief.date !== date);
  const latest = remaining[0];
  const currentEdition = latest.editions?.find(
    (edition) => edition.id === latest.currentEdition,
  );
  const currentBrief = readJson(
    currentEdition
      ? path.join(
          dataDir,
          "briefs",
          latest.date,
          currentEdition.id + ".json",
        )
      : path.join(dataDir, "briefs", latest.date + ".json"),
  );
  index.briefs = remaining;
  index.latest = latest.date;
  index.lastSuccessAt = currentBrief.generatedAt;
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n");
  fs.rmSync(path.join(dataDir, "briefs", date + ".json"), { force: true });
  fs.rmSync(path.join(dataDir, "briefs", date), {
    recursive: true,
    force: true,
  });
}

test("a same-day refresh preserves the original direct brief and adds an immutable edition", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "contenthub-revision-test-"),
  );
  try {
    const dataDir = path.join(temporary, "data");
    fs.cpSync(path.join(root, "public/data"), dataDir, { recursive: true });
    const originalFile = path.join(dataDir, "briefs/2026-09-07.json");
    const originalText = fs.readFileSync(originalFile, "utf8");
    const original = readJson(originalFile);
    const previousIndex = readJson(path.join(dataDir, "index.json"));
    const previousRow = previousIndex.briefs.find(
      (brief) => brief.date === original.date,
    );
    assert.ok(previousRow, "fixture should include the original brief date");
    const priorCurrent = previousRow.editions?.find(
      (edition) => edition.id === previousRow.currentEdition,
    );
    const priorEditionCount = previousRow.editions?.length ?? 1;
    const priorCurrentFile = priorCurrent
      ? path.join(
          dataDir,
          "briefs/2026-09-07/" + priorCurrent.id + ".json",
        )
      : null;
    const priorCurrentText = priorCurrentFile
      ? fs.readFileSync(priorCurrentFile, "utf8")
      : null;
    const candidate = JSON.parse(JSON.stringify(original));
    candidate.generatedAt = new Date(
      Date.parse(priorCurrent?.generatedAt ?? original.generatedAt) + 60_000,
    ).toISOString();
    candidate.ideas = candidate.ideas.map((idea, number) => ({
      ...idea,
      id: "revision-test-" + (number + 1),
      title:
        "검증 회차 " + String(number + 1).padStart(2, "0") + " " + idea.title,
    }));
    candidate.topIds = candidate.ideas.slice(0, 3).map((idea) => idea.id);

    const result = installBrief(candidate, {
      rootDir: root,
      dataDir,
      expectedDate: "2026-09-07",
    });
    const index = readJson(path.join(dataDir, "index.json"));
    const row = index.briefs.find((brief) => brief.date === candidate.date);
    const legacyId = editionId(original.generatedAt);
    const currentId = editionId(candidate.generatedAt);

    assert.equal(result.legacyEdition, legacyId);
    assert.equal(result.currentEdition, currentId);
    assert.equal(fs.readFileSync(originalFile, "utf8"), originalText);
    if (priorCurrentFile) {
      assert.equal(
        fs.readFileSync(priorCurrentFile, "utf8"),
        priorCurrentText,
      );
    }
    assert.deepEqual(
      readJson(path.join(dataDir, "briefs/2026-09-07/" + legacyId + ".json")),
      original,
    );
    assert.deepEqual(
      readJson(path.join(dataDir, "briefs/2026-09-07/" + currentId + ".json")),
      candidate,
    );
    assert.equal(row.legacyEdition, legacyId);
    assert.equal(row.currentEdition, currentId);
    assert.equal(row.editions.length, priorEditionCount + 1);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the 2026-09-10 format contract requires 10 space-and-life shorts plus 5/5 carryovers", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "contenthub-expanded-format-test-"),
  );
  try {
    const dataDir = path.join(temporary, "data");
    fs.cpSync(path.join(root, "public/data"), dataDir, { recursive: true });
    removeBriefDate(dataDir, "2026-09-10");
    const source = readJson(
      path.join(
        dataDir,
        "briefs/2026-09-09/run-202609090545240900.json",
      ),
    );
    const candidate = createExpandedCandidate(
      source,
      nextGeneratedAt(dataDir, "2026-09-10"),
    );
    installBrief(candidate, {
      rootDir: root,
      dataDir,
      expectedDate: "2026-09-10",
    });

    const index = readJson(path.join(dataDir, "index.json"));
    const row = index.briefs.find((brief) => brief.date === candidate.date);
    const installed = readJson(
      path.join(
        dataDir,
        "briefs/2026-09-10/" + editionId(candidate.generatedAt) + ".json",
      ),
    );
    assert.equal(row.count, 20);
    assert.equal(
      installed.ideas.filter((idea) => idea.format === "shorts").length,
      10,
    );
    assert.equal(
      installed.ideas.filter((idea) => idea.category === "우주").length,
      5,
    );
    assert.equal(
      installed.ideas.filter((idea) => idea.category === "신비한 생물").length,
      5,
    );
    assert.equal(
      installed.ideas.filter((idea) => idea.carriedFrom).length,
      10,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the 2026-09-10 format contract rejects the former 5-short balance", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "contenthub-expanded-format-rejection-test-"),
  );
  try {
    const dataDir = path.join(temporary, "data");
    fs.cpSync(path.join(root, "public/data"), dataDir, { recursive: true });
    removeBriefDate(dataDir, "2026-09-10");
    const source = readJson(
      path.join(
        dataDir,
        "briefs/2026-09-09/run-202609090545240900.json",
      ),
    );
    const candidate = createExpandedCandidate(
      source,
      nextGeneratedAt(dataDir, "2026-09-10"),
    );
    candidate.ideas = candidate.ideas.slice(0, 5).concat(candidate.ideas.slice(10));
    candidate.topIds = candidate.ideas.slice(0, 3).map((idea) => idea.id);

    assert.throws(() =>
      installBrief(candidate, {
        rootDir: root,
        dataDir,
        expectedDate: "2026-09-10",
        validationStdio: "pipe",
      }),
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
