import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SKILL = "skills/next-lesson/SKILL.md";
const PAID = "skills/next-lesson/references/paid-mode.md";

/**
 * The lesson-start review is graded by the server against one capability card
 * (Jason, 2026-10-04). The server's `due_review` names the card (`capability`)
 * and the kind of question (`ask`); the tutor asks one question of that kind
 * and sends the answer marked with `--review` so the server can grade it.
 * Without the marker the card never moved and every lesson opened with the
 * same review.
 */

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading, start);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

test("the review asks the kind of question the server's ask describes, for the capability under review", () => {
  const step2 = sliceBetween(read(SKILL), "## Step 2", "## Step 3");
  assert.match(step2, /the `capability` under review and a one-line `ask` for the kind of question that tests it/);
  assert.match(step2, /the kind its `ask` describes when there is one/);
  const paid = read(PAID);
  assert.match(paid, /the one card under review: that capability of that concept, with a one-line `ask` for the kind of question that tests it/);
});

test("the review's answer is sent marked as the review of that card, and the server grades it", () => {
  const paid = read(PAID);
  assert.match(paid, /--concepts <due_review\.concept_id> --review '<due_review\.concept_id>:<due_review\.capability>'/);
  assert.match(paid, /`--review` marks the answer as the review of that one card, so the server grades it itself and needs no `--verdict`/);
  assert.match(paid, /When `due_review` carries no `capability`, leave `--review` out and add `--verdict <correct\|partial\|incorrect>` as for any other check/);
});

test("--stdin carries the same review marker", () => {
  const step2 = sliceBetween(read(PAID), "## Step 2", "## Step 3");
  assert.match(step2, /`review` \(the same `<concept-id>:<capability>` text\) for the review that opens the lesson/);
});
