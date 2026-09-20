import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The introduction example that IS the answer (learner-model replay, 2026-09-20).
 *
 * Once the handover rule forbade the code in the handover, the pull moved one
 * paragraph upstream. On one learner model, in 2 of 2 runs of a task whose gap
 * was a function body returning the `.md` files in `folder`, sorted, the concept
 * introduction's "minimal example" was the gap's own expression on the
 * project's own variable — `for path in folder.glob("*.md"):` — directly before
 * a handover that was clean and in words. On another, a one-line TypeScript gap
 * was preceded by an example that was the gap's declaration with only the name
 * changed, and one handover said "give it the union type from the example".
 *
 * Teaching the syntax with an example is legitimate and stays. What the example
 * is made of is the rule: different material than the gap. The fix is prose, so
 * these tests pin the prose: one emphasized rule, the test the tutor can apply
 * to its own example, the named miss, and the same rule for drills.
 */

const RULE = "**The introduction's example teaches the concept on different material than the gap.**";

const SELF_TEST =
  "**If the learner could finish the gap by changing only a name in something you showed, you showed the answer.**";

const HANDOVER_RULE = "**The handover says what the gap must do, in words, and never the code that does it.**";

async function read(path) {
  return readFile(join(repoRoot, path), "utf8");
}

function paragraphContaining(contents, needle) {
  const para = contents.split("\n\n").find((p) => p.includes(needle));
  assert.ok(para, `no paragraph contains ${JSON.stringify(needle)}`);
  return para;
}

test("the introduction's example is on different material than the gap: one emphasized rule, inside 'Introduce, drill, apply'", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);

  // What "different material" rules out, each by name.
  assert.match(rule, /not the project's identifiers/);
  assert.match(rule, /not the gap's values/);
  assert.match(rule, /in the gap's arrangement where a different pairing teaches the same idea/);
  // The worked contrast: a different pairing teaches the same idea.
  assert.match(rule, /teach a union with `boolean \| string`/);
  // The test a tutor can apply to its own example before sending it.
  assert.ok(rule.includes(SELF_TEST), "the change-only-a-name test is one emphasized sentence");

  const section = skill.indexOf("### Introduce, drill, apply");
  const next = skill.indexOf("### The learner writes the `teach` lines");
  const at = skill.indexOf(RULE);
  assert.ok(section !== -1 && at > section && next > at, "the rule sits inside '### Introduce, drill, apply'");
});

test("teaching the syntax with an example stays legitimate", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);
  const introduce = skill.split("\n").find((l) => l.startsWith("1. **Introduce**"));

  assert.match(introduce, /with a minimal example/, "the introduction still carries an example");
  assert.match(introduce, /on different material than the gap/, "the Introduce step points at the rule");
  assert.match(rule, /Showing the syntax is the point of the example and stays/);
});

test("the replayed introduction is quoted as the named miss", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);

  assert.match(rule, /The named miss/);
  assert.ok(rule.includes('`for path in folder.glob("*.md"):`'), "the leaked example is quoted verbatim");
  assert.match(rule, /the gap's own expression on the project's own variable/);
  assert.match(rule, /one paragraph before a handover that was clean and in words/);
  // The one-line variant, stated without writing the union syntax a second time in the skill.
  assert.match(rule, /the answer with only the name changed/);
  assert.equal(skill.split("string | number").length - 1, 1, "the union syntax is still written once, inside the handover miss");
});

test("the handover never points back at the example as the thing to copy", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);
  const handover = paragraphContaining(skill, HANDOVER_RULE);

  assert.match(rule, /The handover never points back at the example as the thing to copy/);
  assert.match(rule, /"like the example"/);
  assert.match(rule, /"give it the union type from the example"/);
  // The handover rule closes the same hatch by name, where handovers are written.
  assert.match(handover, /no pointing back at the introduction's example as the thing to copy/);
});

test("a drill is a different problem from the project gap, not the gap under another name", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);
  const drill = skill.split("\n").find((l) => l.startsWith("2. **Drill**"));

  assert.match(rule, /a drill's exercise is a different problem from the project gap, not the gap under another name/);
  assert.match(drill, /a different problem from the project gap/, "the Drill step says it where exercises are stated");
});

test("the no-plugin prompt asks for an example that is not the blank's answer", async () => {
  const flat = (await read("PROMPTS.md")).replace(/\s+/g, " ");

  assert.match(flat, /minimal example that isn't my project's code/);
  assert.match(flat, /different names and values from the blank I'm about to fill/);
});

test("the 0.6.1 notes mention the introduction-example rule", async () => {
  const compat = await read("WORKSHOP-COMPATIBILITY.md");
  const paid = await read("skills/next-lesson/references/paid-mode.md");

  assert.match(compat.replace(/\s+/g, " "), /Plugin 0\.6\.1.*introduction's example/i);
  assert.match(paid.split("-->")[0], /introduction example on different material than the gap/);
});

/**
 * "Different material" read as "no material" (learner-model replay, 2026-09-20).
 * After the rule above landed, one learner model gave no code example at all in
 * 2 of 7 introductions: a union was described as a variable that "may be either
 * a boolean (true/false) or text", and the `|` operator never appeared before
 * the learner's save. The rule already says showing the syntax stays; this pins
 * the sentence that makes the example itself non-optional.
 */
test("different material is never no material: the introduction always shows a runnable example of the syntax", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);

  assert.match(rule, /\*\*Different material is never no material:\*\*/, "one emphasized sentence-opener inside the rule");
  assert.match(rule, /always shows a runnable minimal example of the taught syntax/, "the example is not optional");
  assert.match(rule, /on that different material/, "and it is still on different material");
  assert.match(rule, /described only in words/, "the opposite miss is named");
  assert.match(rule, /the `\|` never on screen before the gap/, "the replayed miss: the operator was never shown");
  assert.ok(
    rule.indexOf("**Different material is never no material:**") > rule.indexOf("Showing the syntax is the point of the example and stays"),
    "it follows the sentence it hardens",
  );
});

test("the 0.6.1 notes mention that the example is always shown", async () => {
  const compat = await read("WORKSHOP-COMPATIBILITY.md");
  const paid = await read("skills/next-lesson/references/paid-mode.md");

  assert.match(compat.replace(/\s+/g, " "), /Plugin 0\.6\.1.*always shows a runnable example/i);
  assert.match(paid.split("-->")[0], /always a runnable example/);
});

/**
 * Lane 5 replay: with the sentence above in place, one introduction in twelve on
 * the same learner model still described the concept in words only. The rule
 * paragraph is long; the numbered Introduce step is where the tutor acts, so the
 * step itself says the example is code.
 */
test("the Introduce step itself says the example is shown as code", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const introduce = skill.split("\n").find((l) => l.startsWith("1. **Introduce**"));

  assert.match(introduce, /with a minimal example/, "unchanged opener");
  assert.match(introduce, /shown as code, in a fenced block/, "the example is code on screen, not a description");
  assert.match(introduce, /a sentence about what the syntax would do is not an example/, "the words-only introduction is ruled out where the tutor acts");
  assert.match(introduce, /on different material than the gap/, "still points at the rule");
});
