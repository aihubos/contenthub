import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { editionId, installBrief } from "./install-brief.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));

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
