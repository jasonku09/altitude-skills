import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readSkill() {
  return readFile(join(repoRoot, "skills/start-project/SKILL.md"), "utf8");
}

/**
 * The paid web onboarding interview was redesigned to `int-v4` (see
 * `docs/interview-redesign.md` in the altitude repo). Its diagnosis applies here
 * verbatim, because this skill carried the same script: asking a total beginner
 * to invent a software project is the hardest creative act in the product, and
 * it is the machine's job, not theirs. These tests pin the structural fixes so
 * the free path cannot silently drift back to the old form.
 */
test("never asks the beginner to invent the project", async () => {
  const skill = await readSkill();

  // The exact question that started the redesign. It asks for a solution when
  // the learner has no way to produce one, and the proposing step already does
  // this work from their raw life detail.
  assert.doesNotMatch(skill, /tool you wish(ed)? existed/i);
  assert.doesNotMatch(skill, /app or tool you'?ve wished existed/i);
  assert.match(
    skill,
    /describe, never to invent|never asking them to invent/i,
    "the skill must state its own stance: the learner describes, the skill ideates",
  );
});

test("gathers raw life detail through concrete breadth beats", async () => {
  const skill = await readSkill();

  assert.match(skill, /what do you actually do all day/i);
  assert.match(skill, /last working day/i);
  // The repeated-thing beat replaces "what feels tedious" — same target, but
  // answerable from memory instead of requiring self-diagnosis.
  assert.match(skill, /the same way every single time/i);
  // A real second person is the difference between a toy and something the
  // learner finishes and shows someone.
  assert.match(skill, /anyone else need to see/i);
});

test("treats a thin answer as the start of one, not a covered topic", async () => {
  const skill = await readSkill();

  assert.match(skill, /usable specific/i);
  assert.match(
    skill,
    /follow[- ]up/i,
    "thin answers must earn a follow-up rather than a checkmark",
  );
});

test("goes deep on one thread before proposing anything", async () => {
  const skill = await readSkill();

  assert.match(skill, /richest thread/i);
  assert.match(skill, /stay on one thread/i);
});

test("keeps the experience questions this surface has no assessment for", async () => {
  const skill = await readSkill();

  // int-v4 dropped these on the web because the assessment already measured
  // coding and AI depth and feeds them to the interviewer. This skill runs with
  // no assessment at all, so here they are the only source of that calibration
  // — porting int-v4's deletion would be porting it out of context.
  assert.match(skill, /written any code/i);
  assert.match(skill, /terminal/i);
});

test("asks how much time the learner actually has, once, near the end", async () => {
  const skill = await readSkill();

  assert.match(skill, /hours a week/i);
  assert.match(skill, /never open on logistics/i);
});

test("plays the conversation back before proposing ideas", async () => {
  const skill = await readSkill();

  assert.match(skill, /play(s|ing)? (it |that |the conversation )?back/i);
  assert.match(skill, /own nouns/i);
});

test("still forbids putting words in the learner's mouth", async () => {
  const skill = await readSkill();

  // Priming examples in prose are allowed (int-v4 decision 2); multiple-choice
  // panels are not, and that ban predates the redesign.
  assert.match(skill, /AskUserQuestion/);
  assert.match(skill, /own words/i);
});
