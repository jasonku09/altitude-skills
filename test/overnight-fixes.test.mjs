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

test("evidence: predictions, teach checks, explanations, decision reasons and critiques are sent; the question is copied exactly", () => {
  const paid = read(PAID);
  assert.match(paid, /The same `quiz-moment` template records every prediction and `teach` check, and every explanation, decision reason, or critique the learner gives, with `--concepts`/);
  // Jason, 2026-10-04: remove the contradiction instead of adding a rule. The
  // catch-all "every other check in the lesson" made tutors record what the
  // learner reported after a run as a graded check; narrowing it makes the
  // separate prohibition redundant, so it is gone.
  assert.doesNotMatch(paid, /every other check in the lesson/);
  assert.doesNotMatch(paid, /is not a prediction: never record it as one/);
  assert.match(paid, /must be the exact question you actually asked, copied word for word, not reworded or reconstructed from the answer/);
});

test("quiz moments go through --stdin when the CLI accepts it, falling back to the single-quoted flags", () => {
  const step2 = sliceBetween(read(PAID), "## Step 2", "## Step 3");
  assert.match(step2, /When the CLI accepts `--stdin`, pass the same fields instead as one JSON object on standard input/);
  assert.match(step2, /keys `question`, `answer`, `verdict`, `concepts` \(an array\), `task`, `plan_revision`, `session`/);
  // CLI 0.10.0 and older ignore standard input rather than refusing the option,
  // so they answer that --question and --answer are required (release 0.8.0).
  assert.match(step2, /if it reports the option unknown, or that `--question` and `--answer` are required, send the same emit again with the single-quoted flags/);
});

test("questions go only in a turn's final message, since text before a tool call reaches the learner too", () => {
  const rules = sliceBetween(read(SKILL), "### General rules", "## Step 1");
  assert.match(rules, /one question at a time, asked only in your turn's final message: text written before a tool call can reach the learner too, so a question there arrives twice/);
});

test("the close names the host's own next-lesson command and nudges a fresh chat, per agent", () => {
  const close = sliceBetween(read(SKILL), "## Step 4 — Close the loop", "**The method check-in comes after the recap");
  // Since 2026-10-05 (problem 10) the invitation is the close's last step.
  const invite = close.split("\n").find((l) => l.startsWith("7. "));
  assert.doesNotMatch(invite, /run `\/next-lesson` when ready/);
  assert.match(invite, /One line inviting the next lesson in a fresh chat, in their host's own words/);
  assert.match(invite, /Claude Code, `\/clear` then `\/altitude:next-lesson`/);
  assert.match(invite, /Codex, `\/new` then `\$next-lesson`/);
  assert.match(invite, /Cursor, a new Agent chat \(`\/clear` in the Cursor terminal agent\) then `\/next-lesson`/);
  assert.doesNotMatch(read(SKILL), /\$altitude:next-lesson/);
});

test("the tutor reads its model from the CLI when reported, with no self-knowledge fallback", () => {
  assert.match(read(PAID), /When the instructions name a recommended model, tell which model you are on from `model` in `altitude session --current --json` when the CLI reports one\./);
  // Jason, 2026-10-04: Codex fell back to self-knowledge and wrongly told
  // learners they were on the wrong model, so the fallback is deleted.
  assert.doesNotMatch(read(PAID), /what you know of yourself/);
});
