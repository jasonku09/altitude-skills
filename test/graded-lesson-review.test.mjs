import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SKILL = "skills/next-lesson/SKILL.md";
const PAID = "skills/next-lesson/references/paid-mode.md";
const COMPAT = "WORKSHOP-COMPATIBILITY.md";

/**
 * The lesson-start review is graded by the server and counts towards the
 * concept's mastery (Jason, 2026-10-04). Mastery has two tracks per concept,
 * and the review grades understanding, so the server names the concept only:
 * `due_review` carries `ask` (the kind of question to ask) and no capability.
 * The tutor asks one question of that kind and sends the answer with
 * `--review <concept id>` and no verdict, so the server grades it. Without an
 * `ask` the review is ungraded: a quiz moment with a verdict, as before.
 */

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading, start);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

test("the review asks the kind of question the server's ask describes", () => {
  const step2 = sliceBetween(read(SKILL), "## Step 2", "## Step 3");
  assert.match(step2, /usually with a one-line `ask` for the kind of question to ask/);
  assert.match(step2, /the kind its `ask` describes when there is one/);
  const paid = sliceBetween(read(PAID), "## Step 2", "## Step 3");
  assert.match(paid, /and, usually, a one-line `ask` for the kind of question to ask/);
});

test("the review's answer is sent marked with the concept id only, and the server grades it", () => {
  const paid = sliceBetween(read(PAID), "## Step 2", "## Step 3");
  assert.match(paid, /--concepts <due_review\.concept_id> --review '<due_review\.concept_id>'`/);
  assert.match(paid, /`--review` marks the answer as that concept's review, so the server grades it itself and needs no `--verdict`/);
  assert.match(paid, /When `due_review` carries no `ask`, leave `--review` out and add `--verdict <correct\|partial\|incorrect>` as for any other check/);
});

test("--stdin carries the same review marker: the concept id", () => {
  const step2 = sliceBetween(read(PAID), "## Step 2", "## Step 3");
  assert.match(step2, /`review` \(`due_review\.concept_id`\) for the review that opens the lesson/);
});

test("no tutor-facing text names a capability for the review", () => {
  for (const [path, contents] of [
    [SKILL, sliceBetween(read(SKILL), "## Step 2", "## Step 3")],
    [PAID, sliceBetween(read(PAID), "## Step 2", "## Step 3")],
  ]) {
    assert.doesNotMatch(contents, /capability/, `${path} Step 2 still mentions a capability`);
  }
});

test("compatibility: graded reviews need the server that sends ask and a CLI newer than 0.10.0", () => {
  const compat = read(COMPAT);
  const note = compat.slice(compat.indexOf("The graded lesson-start review"), compat.indexOf("The following 0.6.1 notes")).replace(/\s+/g, " ");
  assert.match(note, /--review <concept-id>/);
  assert.doesNotMatch(note, /capability/);
  assert.match(note, /CLI 0\.10\.0 and older/);
  assert.match(note, /ordinary, ungraded quiz moment/);
});
