import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Headless replay of the 0.6.1 text (2026-09-20): a tutor read `teaching_knobs`
 * at the TOP level of the `altitude task --json` output in 9 of 22 cells, got
 * `null`, and taught with the default knobs; in 3 of those it ran scratch
 * drills for a learner whose setting was `drills: 0`. The same first read also
 * asked for `.current_task.*` at the top level; that null is obviously wrong, so
 * the tutor went looking and found `journey.current_task` — but a null knob
 * field looked exactly like "the server has not sent it, the defaults apply",
 * which is what paid-mode.md said. The learner's Teaching settings were ignored
 * and nothing on screen said so.
 *
 * Ground truth is the wire contract (`currentJourneySnapshotSchema` in the
 * monorepo's packages/shared/src/settings.ts) and the CLI's task envelope:
 * `{source, connected, entitled, journey: {...}, learning_runtime, ...}` with
 * `journey.teaching_knobs`, `journey.current_task.learning_requirements`,
 * `journey.current_task.due_review`, `journey.current_task.method_checkin`.
 *
 * These tests pin: the exact path at every point of reading, a wrong-path read
 * made detectable (defaults only when `journey` is there and the key is not in
 * it; one more look before concluding that), the three held values in the
 * private orientation with no learner-facing noise, and the named miss.
 */

const PATHS = [
  "journey.teaching_knobs",
  "journey.current_task.learning_requirements",
  "journey.current_task.due_review",
  "journey.current_task.method_checkin",
];

async function readNextLesson() {
  return readFile(join(repoRoot, "skills/next-lesson/SKILL.md"), "utf8");
}

async function readPaidMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/paid-mode.md"), "utf8");
}

function between(text, start, end) {
  const a = text.indexOf(start);
  assert.notEqual(a, -1, `missing: ${start}`);
  const b = end ? text.indexOf(end, a + start.length) : text.length;
  assert.notEqual(b, -1, `missing: ${end}`);
  return text.slice(a, b);
}

function paidOrient(paid) {
  return between(paid, "## Step 1 — Orient (paid)", "### Partition the task's concepts");
}

test("paths: paid mode says once, as one emphasized rule, that every lesson field is inside `journey`", async () => {
  const orient = paidOrient(await readPaidMode());

  assert.match(
    orient,
    /\*\*Every server field you teach from is inside `journey`, never beside it\.\*\*/,
    "the rule must be one emphasized sentence",
  );
  const rule = between(orient, "**Every server field you teach from is inside `journey`", "\n\n");
  for (const path of PATHS) assert.ok(rule.includes("`" + path + "`"), `the rule must name ${path}`);
  // The top level is about the read, and the siblings locate the knobs.
  assert.match(rule, /`source`, `connected`, `entitled`/, "the top-level keys must be named as the read's own");
  assert.match(rule, /`journey\.journey_id`, `journey\.learning_level`, (and )?`journey\.plan_revision`/, "the knobs' siblings must be named");
  assert.match(rule, /`current_task\.…`/, "the shorthand used elsewhere must be tied to the path under `journey`");
});

test("paths: the knob read names `journey.teaching_knobs`, and defaults need `journey` present with the key absent from it", async () => {
  const orient = paidOrient(await readPaidMode());

  assert.match(orient, /Read `journey\.teaching_knobs` in the same pass/, "the read must carry its path");
  assert.match(
    orient,
    /\*\*The defaults apply only when `journey` is present and `journey\.teaching_knobs` is absent from it\.\*\*/,
    "the defaults condition must be one emphasized sentence",
  );
  assert.match(
    orient,
    /looks once more, at `journey\.teaching_knobs` by that exact path, before it concludes that/,
    "a tutor that found no knobs must look once more at the exact path",
  );
  assert.match(orient, /a `null` you got from the top level of the output is a wrong path, never an absent field/, "a top-level null must be named a wrong path");
  // The clause that made a wrong-path read look legitimate is gone.
  assert.doesNotMatch(orient, /Read `teaching_knobs` from the journey envelope/, "the pathless read must be gone");
  assert.doesNotMatch(orient, /An absent field means the server has not resolved them/, "the bare 'absent means defaults' clause must be gone");
  // Defaults themselves are untouched and still never inferred.
  assert.match(orient, /never infer a knob from the level, the plan, or the learner's mood/);
});

test("paths: the three values are held in the private orientation and never announced", async () => {
  const orient = paidOrient(await readPaidMode());

  assert.match(
    orient,
    /\*\*Hold the three values for the lesson in your private orientation\*\*/,
    "holding the values must be one emphasized instruction",
  );
  const hold = between(orient, "**Hold the three values for the lesson in your private orientation**", "\n\n");
  assert.match(hold, /`drills`, `step_size`, and `check_density`/, "the three values must be named");
  assert.match(hold, /`journey\.teaching_knobs` or the default/, "each value's origin must be held too");
  assert.match(hold, /say none of it to the learner/, "no learner-facing noise about settings");
});

test("paths: the named miss is drills run for a `drills: 0` learner because the field was looked for beside `journey`", async () => {
  const orient = paidOrient(await readPaidMode());

  assert.match(orient, /The named miss:/, "the miss must be named");
  const miss = between(orient, "The named miss: a tutor looked for `teaching_knobs` beside `journey` instead of inside it", "\n\n");
  assert.match(miss, /got `null`/, "what the wrong path returned");
  assert.match(miss, /ran scratch drills for a learner whose setting was `drills: 0`/, "what it cost the learner");
  assert.match(miss, /nothing on screen/, "why nobody noticed");
});

test("paths: SKILL.md gives the path at each point of reading", async () => {
  const skill = await readNextLesson();
  const step2 = between(skill, "## Step 2 — Review one due concept", "## Step 3");
  const step3 = between(skill, "## Step 3 — Execute the task", "### Introduce, drill, apply");
  const step4 = between(skill, "**The method check-in comes after the recap", "\n\n");

  assert.match(step2, /the source is `journey\.current_task\.due_review` and nothing else/, "Step 2 reads the review by its path");
  assert.match(step3, /Read them from `journey\.teaching_knobs` in paid mode/, "Step 3 reads the knobs by their path");
  assert.match(step3, /inside the `journey` object of the `altitude task --json` output, never beside it/, "Step 3 says where that is");
  assert.match(
    step3,
    /a `null` read from the top level of the output is a wrong path, not an absent field/,
    "Step 3 must keep a wrong-path null from reading as 'absent'",
  );
  assert.match(step4, /Read `journey\.current_task\.method_checkin` from the paid-mode envelope/, "Step 4 reads the check-in by its path");
  // The defaults sentence itself is unchanged.
  assert.match(
    step3,
    /\*\*when the field is absent, and always in free mode, use the defaults: `drills` 2, `step_size` `function`, `check_density` `teach_runs`\.\*\*/,
  );
});

test("paths: paid mode gives the path at each point of reading, and no read is left pathless", async () => {
  const paid = await readPaidMode();
  const skill = await readNextLesson();

  assert.match(paid, /Read `journey\.current_task\.learning_requirements` and retain/, "requirements are read by their path");
  assert.match(
    paid,
    /\*\*The review question comes only from `journey\.current_task\.due_review`\.\*\*/,
    "the sole review source carries its path",
  );
  for (const [name, text] of [["paid-mode.md", paid], ["SKILL.md", skill]]) {
    assert.doesNotMatch(text, /Read `current_task\./, `${name}: a read of a current_task field must carry the journey path`);
    assert.doesNotMatch(text, /Read (them from )?`teaching_knobs`/, `${name}: a read of the knobs must carry the journey path`);
    assert.doesNotMatch(text, /the source is `current_task\.due_review`/, `${name}: the review source must carry the journey path`);
  }
});

test("paths: /begin checks for versioned requirements at their path under `journey`", async () => {
  const begin = await readFile(join(repoRoot, "skills/begin/SKILL.md"), "utf8");

  assert.match(begin, /When `journey\.current_task\.learning_requirements` is present/, "a top-level read would say 'not present' on every lesson");
  assert.doesNotMatch(begin, /When `current_task\.learning_requirements` is present/);
});

test("paths: the 0.6.1 notes list the change and add no requirement", async () => {
  const paid = await readPaidMode();
  const compat = await readFile(join(repoRoot, "WORKSHOP-COMPATIBILITY.md"), "utf8");
  const note = between(paid, "<!-- Release note (plugin 0.6.1)", "-->");

  assert.match(note, /every server field is read by its exact path under `journey`/, "the release note lists the change");
  assert.match(note, /0\.6\.1 is a prose-only patch on 0\.6\.0 with no new CLI or server requirement/, "still no new requirement");
  assert.match(compat, /`journey\.teaching_knobs`/, "the compatibility notes name the path");
  assert.match(compat, /It adds no\s+CLI, server, or envelope requirement and moves no floor/, "still no floor move");
  for (const manifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const json = JSON.parse(await readFile(join(repoRoot, manifest), "utf8"));
    assert.equal(json.version, "0.6.1", `${manifest} stays 0.6.1`);
  }
});
