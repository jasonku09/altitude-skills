import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The first external beta session (2026-08-08) hit a check whose answer was two
 * lines up on the learner's screen, so they read it back. A check answerable by
 * scrolling teaches nothing, and it trains the learner to skim every check that
 * follows — the cost lands on the questions that would have taught them
 * something. PR #13 wrote the fix as a hard rule (checks probe forward:
 * prediction, application, or consequence) but only into the two lesson skills.
 *
 * The agent loads ONE SKILL.md at a time, so a rule stated in `begin` does not
 * govern `plan-journey`. Every teaching skill has to carry the rule text itself.
 *
 * `adopt-project` counts: it replaces `start-project` + `plan-journey` for a
 * learner arriving with an existing codebase and hands off to the same
 * `/next-lesson` loop, so it is a teaching surface, not a setup skill.
 */
const TEACHING_SKILLS = [
  "skills/adopt-project/SKILL.md",
  "skills/begin/SKILL.md",
  "skills/next-lesson/SKILL.md",
  "skills/plan-journey/SKILL.md",
  "skills/start-project/SKILL.md",
];

async function readSkill(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

test("every teaching skill carries the forward-probing rule itself", async () => {
  for (const relativePath of TEACHING_SKILLS) {
    const skill = await readSkill(relativePath);

    assert.match(
      skill,
      /probe forward, never backward/,
      `${relativePath} does not state the forward-probing rule; skills are loaded standalone, so it cannot inherit it`,
    );
    // The ban alone leaves the agent with no replacement question. Every copy
    // has to name the shape of a forward probe, or it just deletes the check.
    assert.match(
      skill,
      /predict/i,
      `${relativePath} bans backward checks without naming prediction as the alternative`,
    );
    assert.match(
      skill,
      /would (?:break|stop working|get harder|have to be true)/i,
      `${relativePath} gives no consequence-shaped example of a forward check`,
    );
  }
});

test("no teaching skill asks the learner to read back the explanation just given", async () => {
  const planJourney = await readSkill("skills/plan-journey/SKILL.md");

  // Step 2 of the design-decision walk recommends a choice and explains the
  // tradeoff; asking for that rationale back in step 3 is the beta defect
  // exactly, one paraphrase softer. The check itself is worth keeping — the
  // learner must own the decision — so it converts to a forward probe.
  assert.doesNotMatch(
    planJourney,
    /in their own words, why the recommended choice fits/,
    "plan-journey still asks the learner to restate the rationale it delivered a breath earlier",
  );

  const startProject = await readSkill("skills/start-project/SKILL.md");

  // Same shape at the end of the trunk: each component was just defined in
  // plain language, then explained back.
  assert.doesNotMatch(
    startProject,
    /explain back, in their own words, what one or two components are for/,
    "start-project still asks the learner to read the trunk back",
  );

  const adoptProject = await readSkill("skills/adopt-project/SKILL.md");

  // The inherited-stack walk explains what each dependency is, then asks the
  // learner to say what it does for their app — and the line calls itself "same
  // pedagogy as greenfield planning", which is a promise about this very rule.
  assert.doesNotMatch(
    adoptProject,
    /say in their own words what it does for their app/,
    "adopt-project still asks the learner to read back the stack description it just delivered",
  );
});
