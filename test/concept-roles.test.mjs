import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The role-aware tutor (feat/skip-tutor) rests on a handful of sentences in
 * `next-lesson`: partition by server-authored role, never quiz an `exercise`
 * concept, answer questions without status framing, and keep every client
 * mutation off this thin client. Each of those is one careless rewrite away
 * from silently reverting to the always-teach behavior — or worse, from the
 * agent inventing a skip mutation the public client must never perform. These
 * checks pin the load-bearing lines the manual live-session plan
 * (TESTPLAN-skip-tutor.md) verifies behaviorally.
 */
async function readNextLesson() {
  return readFile(join(repoRoot, "skills/next-lesson/SKILL.md"), "utf8");
}

test("next-lesson partitions task concepts by role and defaults malformed roles to teach", async () => {
  const skill = await readNextLesson();

  assert.match(skill, /partition them into `teach` and `exercise`/);
  // The fallback direction matters: an old envelope must never smuggle
  // untaught material past the method by defaulting to `exercise`.
  assert.match(
    skill,
    /Treat a missing entry, missing role, or unknown role as `teach`/,
    "malformed envelopes must fall back to teaching, never to silent skipping",
  );
  // The role hides provenance by design; the tutor must not reconstruct it.
  assert.match(skill, /never infer or announce which one it was/);
});

test("exercise concepts are used without the teaching apparatus but stay load-bearing", async () => {
  const skill = await readNextLesson();

  assert.match(
    skill,
    /make no conceptual introduction, leave no fill-in scaffold, ask for no prediction, and pose no quiz/,
  );
  assert.match(
    skill,
    /In a mixed step, teach and scaffold only the `teach` concept/,
    "a mixed chunk must keep teaching its teach concepts",
  );
  assert.match(
    skill,
    /Do not drop the exercise concept just because it is not lesson content/,
  );
  // Both quiz surfaces carry the guard: Step 2's opening review and Step 3's
  // opportunistic checks. Either one alone leaves a door open.
  assert.match(
    skill,
    /A review question may target only a `teach` concept — never an `exercise` concept/,
  );
  assert.match(
    skill,
    /Never target an `exercise` concept with a quiz question or conversational check/,
  );
});

test("questions about known concepts get full answers without status framing", async () => {
  const skill = await readNextLesson();

  assert.match(skill, /\*\*Answer every question normally\.\*\*/);
  assert.match(
    skill,
    /"since you skipped this" or "you said you know this\."/,
    "the banned framings must be named, or the rule reads as tone advice",
  );
  assert.match(
    skill,
    /Never narrate the concept's status while answering their questions/,
  );
});

test("a prior-knowledge signal routes to the map once, with a session-only grace period", async () => {
  const skill = await readNextLesson();

  assert.match(skill, /Do not advertise this route before a signal/);
  assert.match(skill, /mark the concept known on `app\.learnaltitude\.com\/map`/);
  assert.match(skill, /an optional short quiz there can verify it/);
  // The accommodation is conversational only — the public client never
  // mutates skip/mastery state, and the next envelope is the authority.
  assert.match(
    skill,
    /do not wait for the map action, call a mutation endpoint, emit a skip, or claim that their account changed/,
  );
  assert.match(skill, /The conversation is a grace period, not stored state/);
  // Struggle fallback: both doors, offered once, then normal help.
  assert.match(skill, /two-minute refresher, which changes no state/);
  assert.match(skill, /un-marking it at `app\.learnaltitude\.com\/map`/);
  assert.match(
    skill,
    /If they decline both, answer and help normally, then drop the offer for the rest of the session/,
  );
});

test("bounded delegation requires an all-exercise chunk and a diff review, never a quiz", async () => {
  const skill = await readNextLesson();

  assert.match(
    skill,
    /only when \*\*every concept that chunk exercises is in the `exercise` set\*\*/,
  );
  assert.match(
    skill,
    /One `teach` concept puts the whole chunk back under the normal small-step method/,
  );
  assert.match(
    skill,
    /you review the diff before we commit, like a teammate's PR/,
  );
  assert.match(
    skill,
    /This is code review, not a quiz, so do not turn it into recall questions/,
  );
  // Substantive review may earn evidence; waving it through must not be
  // punished with a forced quiz — and evidence routing never loses the tag.
  assert.match(
    skill,
    /waving the diff through earns no conversational quiz credit/,
  );
  assert.match(
    skill,
    /concept tags must never be stripped or rerouted/,
  );
});

test("free mode records self-reported prior knowledge with the exact evidence note", async () => {
  const skill = await readNextLesson();

  // Step 3 names the accommodation; Step 4 carves the one exception to the
  // no-same-day-`understood` ceiling. Both must quote the note verbatim so
  // graph entries stay greppable across learners.
  const notes = skill.match(/`self-reported prior knowledge`/g) ?? [];
  assert.equal(
    notes.length >= 2,
    true,
    "both the Step 3 rule and the Step 4 evidence-ceiling exception must quote the exact note",
  );
  assert.match(skill, /this self-report exception applies to no other concept/);
  assert.match(
    skill,
    /There is no account mutation or map handoff in standalone free mode/,
  );

  // The copy-paste prompt for non-plugin users carries the same analog.
  const prompts = await readFile(join(repoRoot, "PROMPTS.md"), "utf8");
  assert.match(prompts, /record it as understood with the note "self-reported prior knowledge"/);
});

test("the thin client emits only the existing event vocabulary — no skip or mastery mutations", async () => {
  const skill = await readNextLesson();

  const emitted = [...skill.matchAll(/altitude emit ([a-z-]+)/g)].map((m) => m[1]);
  assert.equal(emitted.length > 0, true, "the paid evidence path lost its emit commands");
  assert.deepEqual(
    [...new Set(emitted)].sort(),
    ["quiz-moment", "task-completed"],
    "next-lesson may only emit the pre-existing events; a skip/mastery mutation belongs to the server and the map UI",
  );
});
