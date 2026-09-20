import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Beta feedback, 2026-09-19 (plugin 0.6.0). A learner was handed a one-line
 * `teach` gap in a TypeScript task that was teaching union types. He had asked
 * for nothing, and the handover itself read:
 *
 *   I've added a TODO(you) marker at the bottom of type-sandbox/index.ts.
 *   Replace that comment line with your declaration —
 *   let rawTagCount: string | number = "3"; — save the file, and I'll pick it up.
 *
 * On a one-line gap the "finished code" IS the answer. His words afterwards:
 * asking for a hint and asking for the solution are different requests, and
 * unless he explicitly asks for the answer the implementation is his.
 *
 * Cause: the skill told the tutor three times to say "what a finished gap looks
 * like" at handover. It meant "the marker line is gone and your code stands in
 * its place" (how the watch tells typing from done); it reads as "show the
 * finished code". The hint ladder forbade unasked code only inside hints and
 * the expiry question, so nothing covered the handover message itself.
 *
 * The fix is prose, so these tests pin the prose, in the shape that has held in
 * headless replay: ONE emphasized atomic instruction per rule, the exact
 * anti-pattern quoted as the named miss, the corrected form beside it, and the
 * ambiguous wording gone from every file a tutor reads.
 */

const LEAKED_LINE = 'let rawTagCount: string | number = "3";';

const MISS =
  "I've added a `TODO(you)` marker at the bottom of `type-sandbox/index.ts`. Replace that comment line with your declaration — `let rawTagCount: string | number = \"3\";` — save the file, and I'll pick it up.";

const CORRECTED =
  "I've added a `TODO(you)` marker at the bottom of `type-sandbox/index.ts`. Replace that comment line with your own declaration: a variable named `rawTagCount` that may hold either a string or a number, starting out as the string \"3\". Save the file, and I'll pick it up.";

const RULE = "**The handover says what the gap must do, in words, and never the code that does it.**";

const CONSEQUENCE =
  "**The smaller the gap, the more the code is the answer, so a one-line gap gets the most care, not the least**";

const NOT_A_THIRD_WAY = "**The handover is not a third way.**";

const FINISHED_MEANS = "the `TODO(you)` line is gone and their own code stands in its place";

async function read(path) {
  return readFile(join(repoRoot, path), "utf8");
}

async function markdownUnder(dir) {
  const out = [];
  for (const entry of await readdir(join(repoRoot, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await markdownUnder(path)));
    else if (entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

/** Every file a tutor (plugin or no-plugin path) or a learner reads. */
async function tutorFacingFiles() {
  return [...(await markdownUnder("skills")), "PROMPTS.md", "README.md"];
}

function paragraphContaining(contents, needle) {
  const para = contents.split("\n\n").find((p) => p.includes(needle));
  assert.ok(para, `no paragraph contains ${JSON.stringify(needle)}`);
  return para;
}

test("the ambiguous 'what a finished gap looks like' wording is gone from every skill file", async () => {
  for (const path of await tutorFacingFiles()) {
    const contents = await read(path);
    // It reads as "show the finished code", and on a one-line gap that is the answer.
    assert.doesNotMatch(contents, /finished gap looks like/i, relative(repoRoot, join(repoRoot, path)));
    assert.doesNotMatch(contents, /what (a|the) finished (gap|line|function|version) (looks|should look)/i, path);
    assert.doesNotMatch(contents, /show(ing)? (them )?what the finished/i, path);
  }
});

test("'finished' means only that the marker line is gone and the learner's code stands in its place", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");

  // Both places that used to say "what a finished gap looks like": the
  // step-size handover paragraph and the fill-ins paragraph.
  const handover = paragraphContaining(skill, "**Every hand-over of a `teach` gap goes through the file");
  assert.ok(handover.includes(FINISHED_MEANS), "the handover paragraph defines finished as marker-gone, code-in-place");
  assert.match(handover, /finished means only that/i);

  const fillIns = paragraphContaining(skill, "**When a `teach` step uses fill-ins, they happen in the file, not the chat.**");
  assert.match(fillIns, /what each gap must do, in words and never in code/);
  assert.match(fillIns, /how you will know it is finished/);
  // The replacement instruction the watch rides on survives the rewrite.
  assert.ok(fillIns.includes("**replace each `TODO(you)` line with your code**"));
});

test("the handover states the job in words and never the code, at any grain", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);

  // What it may say.
  assert.match(rule, /its job/);
  assert.match(rule, /its name, where the name is not what is being taught/);
  assert.match(rule, /what it takes, returns, or holds/);

  // What it may never say — each escape hatch closed by name.
  assert.match(rule, /no line, no expression, no literal declaration/);
  assert.match(rule, /no "e\.g\." or "something like" rendering of it/);
  assert.match(rule, /no type annotation spelled out when the annotation is the taught thing/);
  assert.match(rule, /at any grain, however small the gap/);

  // The consequence, stated plainly: small gaps get MORE care.
  assert.ok(rule.includes(CONSEQUENCE), "the smaller-gap consequence is one emphasized sentence");

  // The rule sits in the step-size section, right where gaps are handed over,
  // after the through-the-file paragraph and before the knob-change pointer.
  const through = skill.indexOf("**Every hand-over of a `teach` gap goes through the file");
  const at = skill.indexOf(RULE);
  const pointer = skill.indexOf("A learner who asks for more or less than that grain");
  assert.ok(through !== -1 && at > through && pointer > at, "the rule sits inside '### Step size'");
});

test("the skeleton written into the file carries no answer either", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);

  assert.match(rule, /The same holds in the file/);
  assert.match(rule, /the marker comment, the docstring, and every other comment/);
  assert.match(rule, /never carry the code/);
});

test("the 2026-09-19 handover is quoted as the named miss, with the corrected handover beside it", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const rule = paragraphContaining(skill, RULE);

  assert.ok(rule.includes(MISS), "the miss is quoted with the leaked line verbatim");
  assert.match(rule, /The named miss/);
  assert.match(rule, /had asked for no hint/);
  // The learner's distinction, paraphrased, with no name attached.
  assert.match(rule, /asking for a hint and asking for the solution are different requests/);

  assert.ok(rule.includes(CORRECTED), "the corrected handover for the same gap is quoted");
  // The corrected form names the variable (not the taught thing) and keeps the
  // union syntax (the taught thing) unwritten.
  assert.doesNotMatch(CORRECTED, /string \| number/);
  assert.match(rule, /The name is given because the name is not what the task teaches/);
  assert.match(rule, /its syntax stays unwritten/);

  // The leaked line appears exactly once in the whole skill: inside the miss.
  assert.equal(skill.split(LEAKED_LINE).length - 1, 1, "the leaked line is quoted once, as the miss");
  assert.equal(skill.split("string | number").length - 1, 1, "the union syntax is never written outside the miss");
});

test("the handover is not a third way for tutor code to reach a teach gap", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const never = paragraphContaining(skill, "**You never fill a `teach` gap yourself.**");

  // The two legitimate ways stay exactly as they were.
  assert.match(never, /in exactly two ways/);
  assert.match(never, /the hint ladder's third rung/);
  assert.match(never, /the impatience rule/);

  // The tie-in, in the same paragraph: chat AND file.
  assert.ok(never.includes(NOT_A_THIRD_WAY), "the tie-in is one emphasized sentence");
  const tie = never.slice(never.indexOf(NOT_A_THIRD_WAY));
  assert.match(tie, /the message that hands a gap over/);
  assert.match(tie, /the skeleton you write into the file/);
  assert.match(tie, /marker comment, docstring/);
  assert.match(tie, /never carry the code/);

  // And the handover rule points back at the same two ways.
  const rule = paragraphContaining(skill, RULE);
  assert.match(rule, /rung 3 and the impatience rule/);
  assert.match(rule, /both of which the learner asks for/);
});

test("every grain states the gap in words", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");

  const line = skill.split("\n").find((l) => l.startsWith("- `line` — "));
  assert.match(line, /you state what the next line must do, in words/);

  const fn = skill.split("\n").find((l) => l.startsWith("- `function` (default) — "));
  assert.match(fn, /state what it must do, in words/);
});

test("a drill exercise statement describes the behavior and never dictates the code", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");
  const drill = skill.split("\n").find((l) => l.startsWith("2. **Drill**"));

  assert.match(drill, /what the file should do when run, not how/);
  assert.match(drill, /never the code that does it/);
});

test("the legitimate reveal is untouched: rung 3 still gives the exact code in chat", async () => {
  const skill = await read("skills/next-lesson/SKILL.md");

  assert.match(skill, /3\. \*\*Solution\*\* — the exact code, \*\*in chat\*\*/);
  assert.match(skill, /Rung 3 is given only on the third "hint" or on an explicit request for the answer/);
  assert.match(skill, /that request is legitimate: give rung 3 and no lecture/);
});

test("the no-plugin prompt carries the same handover rule", async () => {
  const prompts = await read("PROMPTS.md");
  const flat = prompts.replace(/\s+/g, " ");

  assert.match(flat, /tell me in words what each blank has to do, never the code that does it/);
  assert.match(flat, /however small the blank/);
});
