import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

/**
 * Plugin 0.8.0 (2026-10-05): the lesson-shape, drill-evidence and tutor-fix
 * waves. Learners only receive an update when the manifest version moves, so
 * every host manifest moves together. The release adds no enforced floor: the
 * new `emit --stdin`, `--review` and `--drill` need CLI 0.11.0 and degrade on
 * CLI 0.10.0 and older (ordinary quiz moments; flags instead of stdin).
 */

// The host-manifest version pin moved to test/release-0-8-1.test.mjs: 0.8.1 is a
// prose-only patch on 0.8.0 and carries 0.8.0 unchanged.

test("0.8.0: the paid-mode release note names what needs CLI 0.11.0 and moves no floor", () => {
  const paid = read("skills/next-lesson/references/paid-mode.md");
  assert.ok(paid.startsWith("<!-- Release note (plugin 0.8.1)"), "the release note leads the file under the current version");
  const note = flat(paid.slice(0, paid.indexOf("-->")));
  assert.match(note, /0\.8\.0 adds no new enforced CLI or server requirement/);
  assert.match(note, /`emit --stdin`, `--review`, and `--drill` need CLI 0\.11\.0/);
  assert.match(note, /CLI 0\.8\.1 \/ plugin 0\.5\.8/, "the floor is unchanged");
});

/**
 * Published CLI 0.10.0 accepts any flag name, so `emit quiz-moment --stdin`
 * is not refused as an unknown option: it ignores standard input and answers
 * "emit quiz-moment requires --question and --answer" (exit 1). A fallback
 * that waits for "unknown option" never fires there, and the tutor files the
 * answer as a missed sync. The fallback names the answer 0.10.0 actually gives.
 */
test("--stdin falls back to flags on the answer an older CLI actually gives", () => {
  const paid = flat(read("skills/next-lesson/references/paid-mode.md"));
  assert.match(paid, /if it reports the option unknown, or that `--question` and `--answer` are required, send the same emit again with the single-quoted flags/);
});

test("compatibility notes: plugin 0.8.0 pairs with CLI 0.11.0 and publishes after it", () => {
  const compat = flat(read("WORKSHOP-COMPATIBILITY.md"));
  assert.match(compat, /Plugin 0\.8\.0 .*CLI 0\.11\.0/);
  assert.match(compat, /Publish CLI 0\.11\.0 before plugin 0\.8\.0/);
  assert.match(compat, /CLI 0\.10\.0 and older answer `emit --stdin` that `--question` and `--answer` are required/);
});

// Jason, 2026-10-05: no "what's new" line in the README; the server's update reminders cover it.
test("README keeps the minimum versions and drops the stale Cursor release note", () => {
  const readme = flat(read("README.md"));
  assert.match(readme, /The minimum versions stay CLI 0\.8\.1 \/ plugin 0\.5\.8/);
  assert.doesNotMatch(readme, /release candidate is not yet published/);
});

/**
 * The manual role-aware test plan predates the familiarity question, the
 * one-drill familiar arc, and the rule that the tutor never suggests marking
 * a concept known on the map (SKILL.md, 2026-10-05). It must not expect the
 * behavior the skill now forbids.
 */
test("the role-aware test plan matches today's prior-knowledge rules", () => {
  const plan = flat(read("TESTPLAN-skip-tutor.md"));
  assert.doesNotMatch(plan, /The tutor suggests marking Shell functions known/);
  assert.doesNotMatch(plan, /unprompted-fluency signal/);
  assert.match(plan, /never suggests marking Shell functions known on the map/);
  assert.match(plan, /one drill that tests it/);
  assert.match(plan, /familiarity question/);
});
