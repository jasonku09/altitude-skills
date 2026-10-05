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

const generalRules = () => sliceBetween(read(SKILL), "### General rules", "## Step 1");

test("problem 9: ask for one thing at a time, at every level, in the general rules", () => {
  const rules = generalRules();
  assert.match(rules, /Ask for one thing at a time — one action or one answer — and wait for it before the next\./);
  // The new sentence covers the old "One command, one prediction at a time."
  assert.doesNotMatch(rules, /One command, one prediction at a time\./);
  assert.match(rules, /Never queue a second command or prediction while one is still pending/);
});

test("problem 10: the fresh-chat invitation is the close's last step, after the check-in and the update lines", () => {
  const lines = close().split("\n");
  const step = (n) => lines.find((l) => l.startsWith(`${n}. `));
  // Step 4 keeps only the recap and the motto; a learner who clears the chat
  // on the invitation never answers a check-in asked after it.
  assert.equal(step(4), "4. A one-line recap of the new leaves added to their tree. **Never ship a line of code you can't explain.**");
  assert.match(step(5), /^5\. The method check-in/);
  assert.match(step(6), /^6\. The update lines/);
  assert.match(step(7), /^7\. One line inviting the next lesson in a fresh chat, in their host's own words:/);
  assert.equal(lines.filter((l) => /fresh chat/.test(l)).length, 1, "the invitation is said once, last");
});

test("problem 11: the no-scratchpad rule sits in the general rules, read before Step 1's tool calls", () => {
  const moved =
    'Every word you emit is read by the learner as you work — including notes between tool calls while orienting; there is no private scratchpad. Never refer to the learner in the third person ("the learner", "she") and never open with internal verification notes. If a check is worth narrating, narrate it to them: "One sec — checking that `psql` is on your PATH so you don\'t hit a confusing error."';
  assert.ok(generalRules().includes(`- ${moved}\n`), "the sentences are a general rule, unchanged");
  assert.equal(read(SKILL).split(moved).length, 2, "and appear once");
  const orient = sliceBetween(read(SKILL), "### Orient in the project", "## Step 2");
  assert.doesNotMatch(orient, /no private scratchpad/);
});
