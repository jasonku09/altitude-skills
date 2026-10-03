import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SKILL = "skills/next-lesson/SKILL.md";
const PAID = "skills/next-lesson/references/paid-mode.md";
const FREE = "skills/next-lesson/references/free-mode.md";

/**
 * More hand-holding (Jason, 2026-10-02): "when we introduce a topic, first ask
 * how comfortable the learner is already with that topic … if they have no
 * experience with it, then the tutor would give an intro … followed by some
 * drills. If they are currently familiar … 'Here are a couple of drills to
 * test your knowledge.'"
 *
 * The question covers every concept not yet shown in a lesson, `exercise` ones
 * included (known only from the skill check, an inference, or a mark), asked
 * once, just before the concept comes up. `drills` becomes a ceiling. A concept
 * marked known but never shown gets a declinable quick check instead; a gap is
 * taught right there and the mark stays. The server names those concepts in the
 * lesson instructions; free mode has no lesson record and uses its graph. One
 * intent sentence per idea, so these tests pin the intent, not a script.
 */

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading, start);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

const arc = () => sliceBetween(read(SKILL), "### Introduce, drill, apply", "1. **Introduce**");

test("just before a new concept comes up, the tutor asks how comfortable the learner already is with it", () => {
  const text = arc();
  assert.match(text, /\*\*Just before a new concept comes up, ask how comfortable the learner already is with it\*\*/);
  // Paid mode reads the set from the server's lesson instructions, exercise concepts included.
  assert.match(text, /every concept the lesson instructions name as not yet shown in a lesson, `exercise` ones included/);
  // Free mode has no lesson record and says so through its mode file.
  assert.match(text, /in free mode, your mode file says which/);
});

test("the answer sets the arc, with drills as a ceiling, and is not a prior-knowledge signal", () => {
  const text = arc();
  assert.match(text, /`drills` being a ceiling/);
  assert.match(text, /new to them gets all three moves/);
  assert.match(text, /familiar gets no introduction and one drill that tests it \(none when `drills` is 0\)/);
  assert.doesNotMatch(text, /fewer drills/);
  assert.match(text, /Only their answer to this question makes a concept familiar, never another answer, and it is not the prior-knowledge signal below/);
  assert.match(text, /concepts that come up together may share one question/);
});

test("a concept marked known but not yet shown gets a declinable quick check; a gap is taught there and the mark stays", () => {
  const text = arc();
  assert.match(text, /offer a quick check of that knowledge instead, which they may decline/);
  assert.match(text, /if it shows a gap, teach it right there, and the mark stays/);
});

test("only exercise concepts already shown in a lesson skip the drill", () => {
  const skill = read(SKILL);
  assert.match(skill, /\*\*An `exercise` concept already shown in a lesson never gets a drill\*\*/);
  assert.doesNotMatch(skill, /\*\*`exercise` concepts never get a drill\*\*/);
});

test("exercise use and the no-quiz guard hold except where the familiarity question applies", () => {
  const step3 = sliceBetween(read(SKILL), "## Step 3 — Execute the task", "### Introduce, drill, apply");
  assert.match(step3, /\*\*Use `exercise` concepts without teaching them\*\*, unless the familiarity question below finds one new to the learner:/);
  assert.match(step3, /the familiarity question and its quick check below are the only exception/);
});

test("a concept not yet shown in a lesson keeps the task out of the fast-forward offer and delegation", () => {
  const skill = read(SKILL);
  assert.match(skill, /every entry in the task's `concepts` array has role `exercise` and none is named by the lesson instructions as not yet shown in a lesson/);
  const paid = read(PAID);
  assert.match(paid, /counts as `teach` for delegation and the all-known case until this lesson has shown it/);
});

test("paid mode may name a mark only for the quick check", () => {
  assert.match(read(PAID), /never infer or announce which one it was, beyond the marks the instructions name for a quick check/);
});

test("free mode asks about the concepts its graph marks new, having no lesson record", () => {
  assert.match(read(FREE), /free mode has no lesson record, so SKILL\.md's familiarity question covers exactly these/);
});
