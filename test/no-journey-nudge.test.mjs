import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * Paying learners finished onboarding but never pressed "Build my journey" on
 * the web Journey tab, and the tutor's "plan or select one on the Altitude web
 * app" did not say where. The no-journey route now names the place. Wording
 * approved verbatim by Jason, 2026-10-06.
 */
test("begin's no-journey route sends the learner to the Journey tab's Build my journey button", () => {
  const lines = read("skills/begin/SKILL.md").split("\n").filter((line) => /ready yet/.test(line));
  assert.deepEqual(lines, [
    '- If `source` is `"network"` and `journey` is null, say that this account does not have a journey ready yet. Send them to the Journey tab on the Altitude web app, where their journey gets built (once their prototype is ready, that\'s the "Build my journey" button), then run `/altitude:begin` again, or offer the standalone free route now. This is the only reading that may say so.',
  ]);
});

test("no skill still tells a learner to plan or select a journey without saying where", () => {
  for (const path of ["skills/begin/SKILL.md", "skills/next-lesson/SKILL.md"]) {
    assert.doesNotMatch(read(path), /plan or select one on the Altitude web app/, path);
  }
});
