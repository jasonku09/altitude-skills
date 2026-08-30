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
 *
 * The skill is split by mode: SKILL.md carries the mode-neutral method and a
 * mandatory read-gate; references/paid-mode.md and references/free-mode.md
 * carry each mode's binding rules. Every pinned sentence lives in exactly one
 * of the three files, and the assertions below read the file that owns it.
 */
async function readNextLesson() {
  return readFile(join(repoRoot, "skills/next-lesson/SKILL.md"), "utf8");
}

async function readPaidMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/paid-mode.md"), "utf8");
}

async function readFreeMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/free-mode.md"), "utf8");
}

test("next-lesson partitions task concepts by role and defaults malformed roles to teach", async () => {
  const paid = await readPaidMode();

  assert.match(paid, /partition them into `teach` and `exercise`/);
  // The fallback direction matters: an old envelope must never smuggle
  // untaught material past the method by defaulting to `exercise`.
  assert.match(
    paid,
    /Treat a missing entry, missing role, or unknown role as `teach`/,
    "malformed envelopes must fall back to teaching, never to silent skipping",
  );
  // The role hides provenance by design; the tutor must not reconstruct it.
  assert.match(paid, /never infer or announce which one it was/);
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
  // Both quiz surfaces carry the guard: paid Step 2's opening review (in the
  // paid reference file) and Step 3's opportunistic checks (mode-neutral).
  // Either one alone leaves a door open.
  const paid = await readPaidMode();
  assert.match(
    paid,
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
  const paid = await readPaidMode();

  // The signal definition and the once-per-concept bound are mode-neutral and
  // stay in SKILL.md; the paid response itself lives in the paid reference.
  assert.match(skill, /Do not advertise this route before a signal/);
  assert.match(paid, /mark the concept known on `app\.learnaltitude\.com\/map`/);
  assert.match(paid, /an optional short quiz there can verify it/);
  // The accommodation is conversational only — the public client never
  // mutates skip/mastery state, and the next envelope is the authority.
  assert.match(
    paid,
    /do not wait for the map action, call a mutation endpoint, emit a skip, or claim that their account changed/,
  );
  assert.match(paid, /The conversation is a grace period, not stored state/);
  // Demonstrated fluency is a signal equal to the explicit claim, and it earns
  // the full response. The 2026-08-27 headless verification's one hard FAIL was
  // exactly this: fluent dictated conventions got the accommodation but never
  // the map suggestion, so the durable handoff was lost every session.
  assert.match(
    skill,
    /Demonstrated fluency counts the same as the explicit claim/,
    "fluent instructions about the code must be named as a prior-knowledge signal",
  );
  assert.match(skill, /dictates conventions the lesson hasn't taught/);
  assert.match(
    skill,
    /the full response in your mode file, map suggestion included/,
    "accommodation without the map suggestion drops the durable half of the move",
  );
  // Naming the signal was not enough: two post-fix reruns still accommodated
  // without routing. The halves must be one atomic reply, and the absorption
  // anti-pattern (treating dictated conventions as a style preference and
  // quietly building to spec) must be named as the miss it is.
  assert.match(
    paid,
    /one reply carrying both halves, accommodation and routing, together/,
  );
  assert.match(paid, /The halves never travel separately/);
  assert.match(
    paid,
    /absorbing the signal as a mere style preference/,
    "the absorption failure mode must be named, or the model keeps making it",
  );
  // Struggle fallback: both doors, offered once, then normal help. The map
  // door self-conditions on "if they marked it known", so the paragraph stays
  // shared in SKILL.md rather than splitting a pinned sentence across files.
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
  // An all-exercise chunk permits delegation; it never mandates it. The
  // headless verification's scenario B watched an all-exercise task get
  // written, staged, and committed by the tutor on turn 1, unprompted.
  assert.match(
    skill,
    /makes delegation \*offerable\*, never automatic/,
    "delegation must wait for the learner's request or acceptance",
  );
  assert.match(
    skill,
    /the learner asks for it or accepts your offer before you write a line/,
  );
  assert.match(
    skill,
    /you review the diff before we commit, like a teammate's PR/,
  );
  // Delegation stops at the working tree. Scenario E2's "Looks fine. Commit
  // it." made the tutor run git commit and author the message itself, one turn
  // after correctly saying the message was the learner's to write.
  assert.match(
    skill,
    /Delegation ends at the working tree: the commit stays learner-owned/,
  );
  assert.match(
    skill,
    /leave the message theirs to write/,
    "a direct imperative must not flip commit ownership to the agent",
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
  const free = await readFreeMode();

  // Step 3 names the accommodation; Step 4 carves the one exception to the
  // no-same-day-`understood` ceiling. Both must quote the note verbatim so
  // graph entries stay greppable across learners.
  const notes = free.match(/`self-reported prior knowledge`/g) ?? [];
  assert.equal(
    notes.length >= 2,
    true,
    "both the Step 3 rule and the Step 4 evidence-ceiling exception must quote the exact note",
  );
  assert.match(free, /this self-report exception applies to no other concept/);
  assert.match(
    free,
    /There is no account mutation or map handoff in standalone free mode/,
  );

  // The copy-paste prompt for non-plugin users carries the same analog,
  // including the demonstrated-fluency half of the signal.
  const prompts = await readFile(join(repoRoot, "PROMPTS.md"), "utf8");
  assert.match(prompts, /record it as understood with the note "self-reported prior knowledge"/);
  assert.match(
    prompts,
    /by saying so or by showing\s+unprompted fluency/,
    "the free-mode prompt must count demonstrated fluency as the signal too",
  );
});

test("chat arriving mid-file-watch outranks the watch and is the learner's own words", async () => {
  const skill = await readNextLesson();

  // The watch state made engagement flaky in the headless verification: one
  // run answered fully, one gave only a "watcher's running" nudge, and one
  // quarantined the learner's own chat as an instruction that didn't come
  // from them. The channel distinction is the load-bearing part: file
  // contents can carry text from anywhere, chat is the learner.
  assert.match(
    skill,
    /is the learner speaking, and it outranks the watch/,
  );
  assert.match(
    skill,
    /never a bare "the watcher is running" nudge/,
    "a mid-watch message must get a real answer, not watch-status narration",
  );
  assert.match(
    skill,
    /the chat channel is theirs/,
    "learner chat must never be quarantined as injected instructions",
  );
  // Both post-fix fluency reruns answered a mid-watch signal with exactly the
  // bare-nudge shape; the anti-pattern has to be quoted in the watch text.
  assert.match(
    skill,
    /is the miss, not the response/,
    "the watch paragraph must name the bare watch-nudge as the failure shape",
  );
  assert.match(skill, /Then re-arm the watch/);
});

test("the thin client emits only the existing event vocabulary — no skip or mastery mutations", async () => {
  // Scan all three files together so no file can smuggle a new emit in.
  const combined =
    (await readNextLesson()) + (await readPaidMode()) + (await readFreeMode());

  const emitted = [...combined.matchAll(/altitude emit ([a-z-]+)/g)].map((m) => m[1]);
  assert.equal(emitted.length > 0, true, "the paid evidence path lost its emit commands");
  assert.deepEqual(
    [...new Set(emitted)].sort(),
    ["quiz-moment", "task-completed"],
    "next-lesson may only emit the pre-existing events; a skip/mastery mutation belongs to the server and the map UI",
  );
});

test("the mode split is wired: read-gate present, reference files real, moved rules gone", async () => {
  const skill = await readNextLesson();

  // The gate is the whole mechanism: without it the reference files are dead
  // weight and every session silently runs on the neutral half alone.
  assert.match(skill, /read your mode's reference file/);
  assert.match(skill, /`references\/paid-mode\.md`/);
  assert.match(skill, /`references\/free-mode\.md`/);
  assert.match(
    skill,
    /proceeding without it silently reverts/,
    "the read-gate must say why, or a future edit will soften it into a suggestion",
  );

  const paid = await readPaidMode();
  const free = await readFreeMode();
  assert.equal(paid.length > 1000, true, "paid-mode.md is missing or gutted");
  assert.equal(free.length > 1000, true, "free-mode.md is missing or gutted");

  // Moved markers must not linger in SKILL.md, or the split regresses
  // silently into two homes for one rule.
  assert.doesNotMatch(skill, /altitude:generated from your journey/);
  assert.doesNotMatch(skill, /altitude emit/);
  assert.doesNotMatch(skill, /Partition the task's concepts/);
  // Free mode is emit-free by design: session capture is a paid-mode path.
  assert.doesNotMatch(free, /altitude emit/);
});
