import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SKILL = "skills/next-lesson/SKILL.md";

/**
 * Tutor fixes from the 2026-10-05 problem walk (Jason), over the release
 * candidate's overnight simulated lessons. Each is one intent sentence or a
 * move of existing words, so these tests pin the intent, not a script.
 */

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading, start);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

const close = () => sliceBetween(read(SKILL), "## Step 4 — Close the loop", "**The method check-in comes after the recap");

test("problem 6: the close records any explanation, decision reason or critique not yet recorded", () => {
  const step1 = close().split("\n").find((l) => l.startsWith("1. "));
  assert.equal(
    step1,
    "1. Record today's evidence through your mode file's Step 4 rules — the local knowledge graph in free mode, the server event path in paid mode — including any explanation, decision reason or critique the learner gave that is not yet recorded.",
  );
});
