import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * Drills are recorded as drills (Jason, 2026-10-05): the drill's prediction,
 * sent after the drill has run, is marked `--drill`, and the map shows the
 * concept as being practised. The smallest change: the sentence that already
 * tells the tutor to send a drill's prediction names the marker, and the
 * --stdin key list carries it.
 */

test("the drill's prediction is sent marked as a drill, in the sentence that already sends it", () => {
  const skill = read("skills/next-lesson/SKILL.md");
  assert.match(skill, /emit the drill's prediction as a quiz moment tagged with the concept and marked `--drill` through your mode file's quiz path/);
});

test("--stdin carries the drill marker as a key", () => {
  const paid = read("skills/next-lesson/references/paid-mode.md");
  assert.match(paid, /`drill` \(`true`\) for a drill's prediction/);
});

test("compatibility: older CLIs ignore --drill, so the answer is an ordinary quiz moment", () => {
  const compat = read("WORKSHOP-COMPATIBILITY.md").replace(/\s+/g, " ");
  assert.match(compat, /`--drill` \(key `drill` under `emit --stdin`\)/);
  assert.match(compat, /CLI 0\.10\.0 and older ignore `--drill`/);
});
