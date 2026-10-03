import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SKILL = "skills/next-lesson/SKILL.md";
const PAID = "skills/next-lesson/references/paid-mode.md";

/**
 * Lesson shape (Jason, 2026-10-02). Intermediate lessons (`decide_inspect_verify`)
 * now get READING drills: the tutor writes a few runnable lines in the scratch
 * folder and the learner reads, predicts, runs, and explains them, in the shape
 * the server instructions describe. So `drills` applies at Intermediate beside
 * `check_density`; only `step_size` stays Beginner-only. Drills at both levels
 * must be relevant to the task at hand: "It doesn't have to be exact, but it
 * shouldn't be jarring, and it should make sense why we're drilling this in the
 * context of the implementation."
 *
 * Git moves to section 3 or later. Before the plan teaches version control the
 * tutor makes no commit at all (Jason, 2026-10-03: the quiet checkpoints did the
 * first Git lesson's job, "and if they do make a mistake in any of the lessons,
 * the tutor has the ability to help them fix it"); after that the commit is the
 * learner's, as before. Each rule is one intent sentence, so these tests pin the
 * intent, not a procedure.
 */

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading, start);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

test("Intermediate: drills and check_density apply, step_size alone is ignored (SKILL.md and paid-mode agree)", () => {
  const step3 = sliceBetween(read(SKILL), "## Step 3 — Execute the task", "### Introduce, drill, apply");
  assert.match(step3, /`decide_inspect_verify`, `drills` and `check_density` apply and `step_size` is ignored/);
  assert.doesNotMatch(step3, /only `check_density` applies/);

  const paid = read(PAID);
  assert.match(paid, /`drills` and `check_density` apply to this mode/);
  assert.match(paid, /`step_size` is ignored/);
  assert.doesNotMatch(paid, /only `check_density` applies/);
  assert.doesNotMatch(paid, /`drills` and `step_size` are ignored/);
});

test("Intermediate drills are reading drills the tutor writes, shaped by the server instructions", () => {
  const arc = sliceBetween(read(SKILL), "### Introduce, drill, apply", "1. **Introduce**");
  assert.match(arc, /reading drill/);
  assert.match(arc, /`decide_inspect_verify`/);
  assert.match(arc, /server instructions/);
});

test("drills at either level stay relevant to the task, without becoming the gap", () => {
  const arc = sliceBetween(read(SKILL), "### Introduce, drill, apply", "1. **Introduce**");
  assert.match(arc, /why it is being drilled/);
  // Beginner's material rule is kept: a drill is still a different problem from the gap.
  const drill = read(SKILL).split("\n").find((l) => l.startsWith("2. **Drill**"));
  assert.match(drill, /a different problem from the project gap/);
});

test("no_learner_lines is a hands_on signal only; drills_skipped stays a valid signal at either level", () => {
  const close = sliceBetween(read(SKILL), "## Step 4 — Close the loop", "## When they broke something");
  assert.match(close, /zero learner-written lines in a `hands_on` lesson \(`no_learner_lines`; never under `decide_inspect_verify`/);
  assert.match(close, /`drills_skipped`/);
});

test("no commit before the plan has taught version control; after that the commit is the learner's", () => {
  const skill = read(SKILL);
  assert.doesNotMatch(skill, /checkpoint commit/);
  assert.doesNotMatch(skill, /I saved a checkpoint of your work/);
  const close = sliceBetween(skill, "## Step 4 — Close the loop", "## When they broke something");
  const item3 = close.split("\n").find((l) => l.startsWith("3. "));
  assert.match(item3, /once their plan has taught version control, suggest a git commit with a message they write themselves/);
  assert.match(item3, /before that, make no commit and create no repository, because the first Git lesson teaches it from scratch/);
  assert.match(item3, /a mistake until then is fixed by reading the code with them/);
});

test("before Git, a breakage is found by reading the code together, never with git", () => {
  const skill = read(SKILL);
  const broke = sliceBetween(skill, "## When they broke something", "## When they want something not in the plan");
  assert.match(broke, /once their plan has taught version control, `git status` and `git diff` on their uncommitted changes; before that, the code they touched, read with them until the change is found/);
  assert.match(broke, /once Git is taught, have them commit the repair under Step 4's rule/);
  assert.match(skill, /a quick listing, plus `git status` once it has a repository/);
});

test("every other commit suggestion defers to the checkpoint rule instead of teaching Git early", () => {
  const skill = read(SKILL);
  const unplanned = skill.split("\n").find((l) => l.startsWith("- Unplanned sessions are lessons too."));
  assert.doesNotMatch(unplanned, /a suggested commit/);
  assert.match(unplanned, /Step 4/);

  const broke = sliceBetween(skill, "## When they broke something", "## When they want something not in the plan");
  assert.doesNotMatch(broke, /suggest committing the repair/);
  assert.match(broke, /Step 4/);

  assert.match(
    skill,
    /Delegation ends at the working tree: the commit stays learner-owned once version control has been taught \(before that, there is no commit\)/,
  );
  assert.match(skill, /once Git is taught, dictate the `git commit` line and leave the message theirs/);
});
