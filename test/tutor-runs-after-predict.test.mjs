import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SKILL = readFileSync(new URL("../skills/next-lesson/SKILL.md", import.meta.url), "utf8");

/**
 * The tutor runs it after the prediction (Jason, 2026-10-02): "Instead of
 * having the user run it after they predict, I want to try and see what it's
 * like if the tutor just runs it. After the learner does the predict, the tutor
 * will actually run the command and show what it outputs … most of the time
 * it's just an extra copy and paste."
 *
 * The prediction and the learner's reading of the real output are the check;
 * pasting the command is not. The output goes in the tutor's message because
 * some hosts never show tool output to the learner. The learner still types a
 * command when running it is itself what the lesson teaches. One intent
 * sentence, no command list.
 */

function sliceBetween(startHeading, endHeading) {
  const start = SKILL.indexOf(startHeading);
  const end = SKILL.indexOf(endHeading, start);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return SKILL.slice(start, end);
}

test("after the prediction, the tutor runs it and shows the real output; the learner reads the result", () => {
  const predictions = sliceBetween("### Predictions", "### Vocabulary");
  assert.match(predictions, /\*\*Once they have predicted, run it yourself and put the relevant real output in your message\*\*/);
  assert.match(predictions, /the learner may not see your tool output/);
  assert.match(predictions, /let them say whether it matched and why/);
  assert.match(predictions, /they run it themselves only when running it is what the lesson teaches/);
});

test("the learner types a command only when running it is what the lesson teaches", () => {
  const rules = sliceBetween("### General rules", "## Step 1");
  assert.match(rules, /when running a command is itself what the lesson teaches, the learner types it in their own terminal/);
  assert.doesNotMatch(rules, /Only once a command has become routine for them may you run it yourself/);
  const files = SKILL.slice(SKILL.indexOf("**When a command creates files**"));
  assert.doesNotMatch(files.slice(0, 400), /dictate it and let the learner run it/);
  assert.match(files.slice(0, 400), /the learner types it only when running it is what the lesson teaches/);
});

test("a drill stays learner-written but the tutor runs it after the prediction", () => {
  const drill = sliceBetween("2. **Drill**", "3. **Apply**");
  assert.match(drill, /the learner writes a small exercise/);
  assert.doesNotMatch(drill, /writes and runs/);
  assert.doesNotMatch(drill, /they run it in their own terminal/);
  assert.match(drill, /predict the output in one line; then you run it, show them what it printed, and they say whether it matched/);
  assert.match(drill, /You never write into the scratch file/);
});

test("updating the Altitude tools stays the learner's, without calling it like any other command", () => {
  assert.doesNotMatch(SKILL, /in their own terminal like any other/);
  assert.doesNotMatch(SKILL, /It dictates a command like any other/);
  const close = sliceBetween("**If Step 1 reported `update_available`**", "## When they broke something");
  assert.match(close, /let them run it in their own terminal; don't run it for them/);
  assert.match(close, /the learner runs it in their own terminal — never run it for them/);
});
