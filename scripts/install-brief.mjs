// Validate a candidate in a temporary data copy before adding an immutable brief edition.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const koreaDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
const directPath = (date) => path.posix.join("briefs", date + ".json");
const revisionPath = (date, edition) =>
  path.posix.join("briefs", date, edition + ".json");
const jsonText = (value) => JSON.stringify(value, null, 2) + "\n";

export const editionId = (generatedAt) => {
  if (!Number.isFinite(Date.parse(generatedAt)))
    throw new Error("Invalid generatedAt");
  const digits = generatedAt.replace(/[^0-9]/g, "");
  if (digits.length < 14)
    throw new Error("generatedAt needs a precise timestamp");
  return "run-" + digits;
};

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));

function writeAtomically(filename, contents) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = path.join(
    path.dirname(filename),
    "." + path.basename(filename) + "." + process.pid + ".tmp",
  );
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, filename);
}

function editionFor(brief) {
  return {
    id: editionId(brief.generatedAt),
    generatedAt: brief.generatedAt,
    count: brief.ideas.length,
  };
}

function assertEditionRow(row, date) {
  if (
    !Array.isArray(row.editions) ||
    !row.editions.length ||
    !row.legacyEdition ||
    !row.currentEdition
  ) {
    throw new Error("Invalid archived editions for " + date);
  }
  if (!row.editions.some((edition) => edition.id === row.legacyEdition))
    throw new Error("Missing legacy edition for " + date);
  if (!row.editions.some((edition) => edition.id === row.currentEdition))
    throw new Error("Missing current edition for " + date);
}

export function installBrief(
  candidate,
  {
    rootDir = root,
    dataDir = path.join(root, "public/data"),
    expectedDate = koreaDate(),
    validationStdio = "inherit",
  } = {},
) {
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date))
    throw new Error("Invalid date");
  if (candidate.date !== expectedDate)
    throw new Error("Candidate must be for today in Korea: " + expectedDate);
  if (!Number.isFinite(Date.parse(candidate.generatedAt)))
    throw new Error("Invalid generatedAt");

  const staged = fs.mkdtempSync(
    path.join(os.tmpdir(), "contenthub-candidate-"),
  );
  const changed = new Set();
  try {
    fs.cpSync(dataDir, staged, { recursive: true });
    const indexFile = path.join(staged, "index.json");
    const index = readJson(indexFile);
    const oldRow = index.briefs.find((row) => row.date === candidate.date);
    const sourceFile = path.join(staged, directPath(candidate.date));
    let legacyEdition;
    let editions;

    if (oldRow) {
      if (!fs.existsSync(sourceFile))
        throw new Error(
          "Missing existing original brief for " + candidate.date,
        );
      if (oldRow.editions) {
        assertEditionRow(oldRow, candidate.date);
        legacyEdition = oldRow.legacyEdition;
        editions = oldRow.editions.map((edition) => ({ ...edition }));
      } else {
        const original = readJson(sourceFile);
        legacyEdition = editionId(original.generatedAt);
        editions = [editionFor(original)];
        const legacyFile = revisionPath(candidate.date, legacyEdition);
        writeAtomically(
          path.join(staged, legacyFile),
          fs.readFileSync(sourceFile),
        );
        changed.add(legacyFile);
      }
    } else {
      if (fs.existsSync(sourceFile))
        throw new Error("Unindexed brief already exists for " + candidate.date);
      legacyEdition = editionId(candidate.generatedAt);
      editions = [];
    }

    const currentEdition = editionId(candidate.generatedAt);
    if (editions.some((edition) => edition.id === currentEdition)) {
      throw new Error(
        "A brief edition already exists for " +
          candidate.date +
          "; immutable editions are not overwritten",
      );
    }
    const priorCurrent = oldRow?.currentEdition
      ? editions.find((edition) => edition.id === oldRow.currentEdition)
      : null;
    if (
      priorCurrent &&
      Date.parse(candidate.generatedAt) <= Date.parse(priorCurrent.generatedAt)
    ) {
      throw new Error(
        "Same-date refresh must have a later generatedAt than the current edition",
      );
    }
    const candidateEdition = editionFor(candidate);
    editions.push(candidateEdition);
    editions.sort(
      (left, right) => Date.parse(left.generatedAt) - Date.parse(right.generatedAt),
    );

    const candidateFile = revisionPath(candidate.date, currentEdition);
    const candidateText = jsonText(candidate);
    writeAtomically(path.join(staged, candidateFile), candidateText);
    changed.add(candidateFile);

    if (!oldRow) {
      writeAtomically(sourceFile, candidateText);
      changed.add(directPath(candidate.date));
    }

    const nextRow = {
      date: candidate.date,
      count: candidate.ideas.length,
      legacyEdition,
      currentEdition,
      editions,
    };
    index.latest = candidate.date;
    index.lastSuccessAt = candidate.generatedAt;
    index.briefs = [
      nextRow,
      ...index.briefs.filter((row) => row.date !== candidate.date),
    ].sort((left, right) => right.date.localeCompare(left.date));
    writeAtomically(indexFile, jsonText(index));
    changed.add("index.json");

    execFileSync(process.execPath, ["scripts/validate.mjs"], {
      cwd: rootDir,
      env: { ...process.env, YOUTUBE_OS_DATA_DIR: staged },
      stdio: validationStdio,
    });

    for (const relative of changed) {
      writeAtomically(
        path.join(dataDir, relative),
        fs.readFileSync(path.join(staged, relative)),
      );
    }
    return {
      date: candidate.date,
      legacyEdition,
      currentEdition,
      changed: [...changed].sort(),
    };
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.argv[2])
    throw new Error(
      "Usage: node scripts/install-brief.mjs work/candidate.json",
    );
  const candidate = readJson(path.resolve(process.argv[2]));
  const result = installBrief(candidate);
  console.log(
    "Installed verified brief " +
      result.date +
      " as " +
      result.currentEdition +
      "; deployment is still required before public success.",
  );
}
