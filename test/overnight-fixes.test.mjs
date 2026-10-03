import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SKILL = "skills/next-lesson/SKILL.md";
const PAID = "skills/next-lesson/references/paid-mode.md";

/**
 * Wording fixes from the overnight simulated lessons (Jason, 2026-10-03). Each
 * is one intent sentence, so these tests pin the intent, not a script; the one
 * per-agent list is the close's next-lesson line, where the exact command is the
 * point (19 of 29 Codex lessons ended by naming `$altitude:next-lesson`, which
 * does not exist).
 */

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading, start);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

test("Intermediate's optional command entry never takes the command a lesson teaches", () => {
  assert.match(read(PAID), /without mandatory TODO fill-ins or learner command entry, except the command or action the lesson teaches, which stays the learner's/);
});

test("evidence: explanations, decision reasons and critiques are sent too; a post-run result is never a prediction; the question is copied exactly", () => {
  const paid = read(PAID);
  assert.match(paid, /and every explanation, decision reason, or critique the learner gives, with `--concepts`/);
  assert.match(paid, /A result the learner reports after running something themselves is not a prediction: never record it as one/);
  assert.match(paid, /must be the exact question you actually asked, copied word for word, not reworded or reconstructed from the answer/);
});

test("quiz moments go through --stdin when the CLI accepts it, falling back to the single-quoted flags", () => {
  const step2 = sliceBetween(read(PAID), "## Step 2", "## Step 3");
  assert.match(step2, /When the CLI accepts `--stdin`, pass the same fields instead as one JSON object on standard input/);
  assert.match(step2, /keys `question`, `answer`, `verdict`, `concepts` \(an array\), `task`, `plan_revision`, `session`/);
  assert.match(step2, /if it reports the option unknown, use the single-quoted flags/);
});

test("questions go only in a turn's final message, since text before a tool call reaches the learner too", () => {
  const rules = sliceBetween(read(SKILL), "### General rules", "## Step 1");
  assert.match(rules, /one question at a time, asked only in your turn's final message: text written before a tool call can reach the learner too, so a question there arrives twice/);
});

test("the close names the host's own next-lesson command and nudges a fresh chat, per agent", () => {
  const close = sliceBetween(read(SKILL), "## Step 4 — Close the loop", "**The method check-in comes after the recap");
  const item4 = close.split("\n").find((l) => l.startsWith("4. "));
  assert.doesNotMatch(item4, /run `\/next-lesson` when ready/);
  assert.match(item4, /one line inviting the next lesson in a fresh chat, in their host's own words/);
  assert.match(item4, /Claude Code, `\/clear` then `\/altitude:next-lesson`/);
  assert.match(item4, /Codex, `\/new` then `\$next-lesson`/);
  assert.match(item4, /Cursor, a new Agent chat \(`\/clear` in the Cursor terminal agent\) then `\/next-lesson`/);
  assert.doesNotMatch(read(SKILL), /\$altitude:next-lesson/);
});

test("the tutor reads its model from the CLI when reported, else from what it knows of itself", () => {
  assert.match(read(PAID), /When the instructions name a recommended model, tell which model you are on from `model` in `altitude session --current --json` when the CLI reports one, and otherwise from what you know of yourself/);
});
