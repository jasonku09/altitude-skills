import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Week-1 beta feedback (2026-09-14). A learner was filling a `TODO(you)` gap in
 * a Python file. The tutor's file watch expired after sixty seconds while he was
 * still typing, and the skill's "offer one hint" produced this:
 *
 *   I didn't see a save in the first minute—no problem; the editor may still
 *   have the skeleton open. One hint: the expression after return should be
 *   sorted(folder.glob("*.md")), indented inside the function.
 *
 * That "hint" was the entire solution, handed over unasked. He asked for a hint
 * ladder, no automatic reveal, and control over when the tutor checks. A second
 * learner churned the same week because the tutor did the work.
 *
 * The fix is prose, so these tests pin the prose. The wording lesson from the
 * skip-tutor lane (PR #16) applies: descriptive rules failed 0/2 in headless
 * replay; what held was binding a move into ONE atomic instruction and quoting
 * the exact anti-pattern reply as the named miss. These assertions check for
 * that shape, not just for the topic being mentioned.
 */

const ANTI_PATTERN_HINT =
  "I didn't see a save in the first minute—no problem; the editor may still have the skeleton open. One hint: the expression after return should be sorted(folder.glob(\"*.md\")), indented inside the function.";

async function readNextLesson() {
  return readFile(join(repoRoot, "skills/next-lesson/SKILL.md"), "utf8");
}

async function readPaidMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/paid-mode.md"), "utf8");
}

async function readFreeMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/free-mode.md"), "utf8");
}

async function readPrompts() {
  return readFile(join(repoRoot, "PROMPTS.md"), "utf8");
}

/** The fill-in / watch / hint-ladder span of Step 3, wherever its heading sits. */
function watchSection(skill) {
  const start = skill.indexOf("When a `teach` step uses fill-ins, they happen in the file, not the chat.");
  const end = skill.indexOf("**When a command creates files**");
  assert.ok(start !== -1 && end > start, "the fill-in span of Step 3 moved or vanished");
  return skill.slice(start, end);
}

test("the watch window is three minutes, chunked under the tool timeout", async () => {
  const watch = watchSection(await readNextLesson());

  // Sixty seconds is how long the beta learner got before the reveal. The
  // window is stated as a total so the tutor cannot read "a few minutes" as
  // one minute, and the chunking guidance is there because a single shell
  // call that outlives the agent's tool timeout is killed, not completed.
  assert.match(watch, /3 minutes in all/, "the watch window must be stated as 3 minutes total");
  assert.doesNotMatch(watch, /for a few minutes/, "the vague window is still there");
  assert.match(
    watch,
    /under your tool's timeout/,
    "the watch must say to keep each shell call under the agent's tool timeout",
  );
});

test("the watch starts in the turn that hands the gap over", async () => {
  const watch = watchSection(await readNextLesson());

  // The handover promises "I read it the moment the markers are gone", and in a
  // single-turn host that promise is only true while a poll is running. One
  // replay turn wrote the skeleton, made the promise and ended — nothing was
  // watching the file, so the 3-minute window, the expiry question and the stop
  // below never happened at all. The window rule says how long to watch; this
  // says when it starts, in the same breath.
  assert.match(
    watch,
    /\*\*The watch starts in the same turn that hands the gap over\.\*\*/,
    "the start of the watch must be one atomic instruction in the watch paragraph",
  );
  assert.match(
    watch,
    /issue the first `wait` before that turn ends/,
    "the handover turn must issue the first poll chunk before it ends",
  );
  assert.match(
    watch,
    /never end a turn on a promise to watch with no poll running/,
    "the tutor must never end a turn promising to watch with nothing polling",
  );
  // The clause sits with the window and chunking rules, not off in its own
  // section where an agent can read it as a separate optional step.
  const startIdx = watch.indexOf("**The watch starts in the same turn that hands the gap over.**");
  const windowIdx = watch.indexOf("3 minutes in all");
  const guardIdx = watch.indexOf("is work in progress, not a submission");
  assert.ok(startIdx > windowIdx, "the start clause must sit in the watch paragraph, after the window rule");
  assert.ok(startIdx < guardIdx, "the start clause must stay inside the watch paragraph");
});

test("the expiry message is a question with no hint in it", async () => {
  const watch = watchSection(await readNextLesson());

  // One atomic rule, not a description of a mood. The whole message is the
  // question; nothing rides along with it.
  assert.match(
    watch,
    /\*\*The expiry message is a question with no hint in it\.\*\*/,
    "the expiry rule must be stated as one atomic instruction",
  );
  assert.match(watch, /Still working, or want a hint\?/, "the expiry question is not spelled out");
  assert.match(
    watch,
    /your whole message is one short question/,
    "the rule must bind the whole message to the question, not add the question to a hint",
  );
  assert.match(
    watch,
    /zero hint content, zero code, no "the answer is"/,
    "the rule must name the three things that never ride along with the question",
  );

  // The anti-pattern reply is quoted verbatim as the named miss. This is the
  // exact text a learner received; a paraphrase would leave the tutor free to
  // decide its own next paraphrase is different.
  assert.ok(
    watch.includes(ANTI_PATTERN_HINT),
    "The unasked reveal must be quoted verbatim as the named miss",
  );
  assert.match(watch, /is the miss/, "the quoted reply must be labelled as the miss");

  // The old rule is gone: silence no longer earns a hint the learner never
  // asked for.
  assert.doesNotMatch(watch, /offer one hint/, "the expiry still offers a hint on its own");
  assert.doesNotMatch(
    watch,
    /treat the silence as a struggle signal/,
    "silence is no longer a struggle signal that unlocks a hint",
  );
});

test("the expiry question is asked once per fill-in; later windows re-arm silently, then stop", async () => {
  const watch = watchSection(await readNextLesson());

  assert.match(watch, /once per fill-in/, "the question must be bounded to once per fill-in");
  assert.match(
    watch,
    /later expiries re-arm silently/,
    "later expiries must re-arm with no message at all",
  );
  // The explicit fallback: a learner who stepped away must not have the tutor
  // polling forever, and the fallback line is not allowed to smuggle a hint.
  assert.match(watch, /four windows/, "the stop rule must be stated in windows");
  assert.match(watch, /12 minutes/, "the stop rule must state the total time");
  assert.match(
    watch,
    /save and say "check" when they(?:'re| are) back/,
    "the fallback must tell them they can save and say check when they return",
  );
});

test("asking the expiry question re-arms the watch in the same turn, never ends it", async () => {
  const watch = watchSection(await readNextLesson());

  // "and then you wait for the answer" read, to an agent, as "end the turn" —
  // which stops the poll. A learner still typing at 3:00 (exactly the case the
  // longer window exists for) would then save into a watch nobody was running,
  // while README promises "it's watching the file, not the chat". It also made
  // the four-window stop below unreachable: that stop needs windows to keep
  // expiring with no save and no message.
  // Since the background watch (test/background-watch.test.mjs) the invariant is
  // "never ends the watch"; "never ends your turn" is how a FOREGROUND host keeps
  // it, and stays an emphasized clause for those hosts. On a background host the
  // turn does end, with the next watcher already running.
  assert.match(
    watch,
    /On a foreground host \*\*asking the question never ends your turn\*\*/,
    "on a foreground host the expiry question must be bound to not ending the turn, as one emphasized clause",
  );
  assert.match(
    watch,
    /in that same turn you re-arm the watch/,
    "the question and the re-arm must happen in the same turn",
  );
  assert.doesNotMatch(
    watch,
    /and then you wait for the answer/,
    "the old wording still reads as ending the turn to wait for a reply",
  );
  // Both ways the answer can arrive, so neither a save nor a reply is stranded.
  assert.match(watch, /on `SAVED`, read the file and respond to their real code/, "a save during the wait must still be reviewed");
  assert.match(
    watch,
    /on a foreground host anything the learner types mid-poll reaches you when the poll returns/,
    "a reply must arrive on the poll's return, per the mid-poll rule below",
  );
});

test("a save that still contains a TODO(you) marker is work in progress: the CLI waits silently", async () => {
  const watch = watchSection(await readNextLesson());

  // Autosaving editors fire the mtime on every keystroke pause. Reviewing a
  // half-typed line as if it were a submission is how the tutor ends up
  // correcting work that isn't finished.
  assert.match(
    watch,
    /\*\*A save with a `TODO\(you\)` still in the file — or with a marker deleted and nothing written in its place — is work in progress, not a submission\.\*\*/,
    "the autosave guard must be one atomic rule",
  );
  assert.match(
    watch,
    /no review, no comment/,
    "a work-in-progress save must earn no review and no comment",
  );
});

test("a save whose gap is empty is work in progress too, in the same rule as the marker", async () => {
  const watch = watchSection(await readNextLesson());

  // The handover asks the learner to delete the marker and write their code in
  // its place, so deleting it is usually its own keystroke. An autosave firing
  // in the pause that follows produces a file with no markers and an empty gap
  // — which a marker-only guard reads as a submission and reviews, the exact
  // miss the guard exists to prevent.
  assert.match(
    watch,
    /or with a marker deleted and nothing written in its place/,
    "the empty gap must ride in the guard's own atomic sentence, not a separate rule",
  );
  assert.match(
    watch,
    /`altitude watch wait` handles both states silently; the tutor is never even woken for them/,
    "the CLI handles emptied gaps and remaining markers without waking the tutor",
  );
  // The finished test now has both halves: markers gone AND code in their place.
  assert.match(
    watch,
    /every marker gone \*\*and\*\* the learner's code standing where each one was is the real one/,
    "the real save must require code in the gap, not just the markers being gone",
  );
});

test("the handover tells the learner to replace the TODO(you) line, not type under it", async () => {
  const watch = watchSection(await readNextLesson());

  // The guard below is mechanical: any marker left in the file means work in
  // progress. So the handover has to ask for the marker to go. "Fill them in
  // your editor and hit save" doesn't — a beginner who types under the comment
  // and leaves it has finished, but every save reads as unfinished: no review,
  // a silent re-arm, and finally "Still working, or want a hint?" sent to
  // someone who is already done.
  assert.match(
    watch,
    /\*\*replace each `TODO\(you\)` line with your code\*\*/,
    "the handover must tell the learner to replace the marker line, as an emphasized instruction",
  );
  assert.match(
    watch,
    /the marker comment goes away/,
    "the handover must say the comment itself is deleted, not just written under",
  );
  assert.match(
    watch,
    /I read it the moment the markers are gone/,
    "the handover must tell the learner what makes the tutor look: the markers being gone",
  );
  assert.match(
    watch,
    /say the replacement part every time you hand over a gap/,
    "the replacement instruction must be required at every handover, not just the first",
  );
  // And the worked example hands its gap over the same way.
  assert.match(
    watch,
    /that line goes where the `TODO\(you\)` comment is now, replacing it/,
    "the worked example's rung 3 must hand over with the same replacement wording",
  );
});

test("\"check\" is an optional early-review word, never a required one", async () => {
  const watch = watchSection(await readNextLesson());

  assert.match(
    watch,
    /\*\*"check" is an optional early-review word, never a required one\.\*\*/,
    "the check rule must be stated as optional in one atomic sentence",
  );
  assert.match(
    watch,
    /read the file from disk right then and review it/,
    "check must trigger a review of the real file contents",
  );
  assert.match(
    watch,
    /Never tell them to type "check" after every change/,
    "the learner must never be told to type check after every change",
  );
  assert.match(watch, /the save is the normal trigger/, "the save stays the normal trigger");
});

test("the hint ladder has three named rungs, climbed one per ask, in order", async () => {
  const watch = watchSection(await readNextLesson());

  assert.match(watch, /\*\*The hint ladder\.\*\*/, "the ladder needs its own atomic heading");
  assert.match(watch, /one rung per ask/, "one ask moves exactly one rung");
  assert.match(
    watch,
    /never climb a rung on your own initiative/,
    "the tutor must never climb a rung unasked",
  );

  // The rungs are an ordered list, and the order is load-bearing.
  const rung1 = watch.indexOf("1. **Orientation**");
  const rung2 = watch.indexOf("2. **Shape**");
  const rung3 = watch.indexOf("3. **Solution**");
  assert.ok(rung1 !== -1, "rung 1 (orientation) is missing");
  assert.ok(rung2 > rung1, "rung 2 (shape) must follow rung 1");
  assert.ok(rung3 > rung2, "rung 3 (solution) must follow rung 2");

  const rung1Text = watch.slice(rung1, rung2);
  const rung2Text = watch.slice(rung2, rung3);
  const rung3Text = watch.slice(rung3, watch.indexOf("The expiry question is not a rung"));

  assert.match(rung1Text, /No code\./, "rung 1 must say no code");
  assert.match(rung2Text, /No code, and not the line\./, "rung 2 must say no code and not the line");
  assert.match(rung3Text, /\*\*in chat\*\*/, "rung 3 gives the code in chat");
  assert.match(
    rung3Text,
    /they type it into the file/,
    "rung 3 leaves the typing to the learner",
  );
  assert.match(
    rung3Text,
    /you never write it into the file for them/,
    "rung 3 must forbid the tutor writing the solution into the file",
  );
  assert.match(
    rung3Text,
    /one forward prediction check/,
    "rung 3 must be followed by a single forward prediction check",
  );

  assert.match(
    watch,
    /The expiry question is not a rung/,
    "the expiry question must not count as a rung",
  );
});

test("an explicit request for the answer gets rung 3 and no lecture", async () => {
  const watch = watchSection(await readNextLesson());

  assert.match(
    watch,
    /third "hint" or on an explicit request for the answer/,
    "rung 3 must be reachable by the third hint or an explicit request",
  );
  assert.match(watch, /"just tell me the answer"/, "the explicit request must be quoted");
  assert.match(watch, /give rung 3 and no lecture/, "the explicit request earns no lecture");
  // The whole-task version is a different request and keeps its existing rule.
  assert.match(
    watch,
    /"Just write the whole thing".*stays under \*\*Handling impatience\*\*/s,
    "whole-task requests must stay under the impatience rule, unchanged",
  );
});

test("the worked example climbs the gap one rung at a time and reveals the code only on rung 3", async () => {
  const watch = watchSection(await readNextLesson());

  assert.match(watch, /def list_notes\(folder: Path\) -> list\[Path\]/, "the worked gap is missing");
  const solution = 'return sorted(folder.glob("*.md"))';
  const exampleStart = watch.indexOf("Worked example");
  assert.ok(exampleStart !== -1, "the worked example is missing");
  const example = watch.slice(exampleStart);

  const r1 = example.indexOf("Rung 1:");
  const r2 = example.indexOf("Rung 2:");
  const r3 = example.indexOf("Rung 3:");
  assert.ok(r1 !== -1 && r2 > r1 && r3 > r2, "the worked example must show all three rungs in order");

  const r1Text = example.slice(r1, r2);
  const r2Text = example.slice(r2, r3);
  const r3Text = example.slice(r3);

  assert.match(r1Text, /pathlib question/, "rung 1 names the concept");
  assert.match(r1Text, /look at what you used to find the config file/, "rung 1 points where to look");
  assert.doesNotMatch(r1Text, /glob|sorted/, "rung 1 must not name the method or the wrapper");

  assert.match(r2Text, /wildcard string/, "rung 2 describes the shape");
  assert.match(r2Text, /whatever makes the order stable/, "rung 2 describes the wrapper by constraint");
  assert.doesNotMatch(r2Text, /glob\(|sorted\(/, "rung 2 must not give the line");

  assert.ok(r3Text.includes(solution), "rung 3 gives the exact code");
  assert.match(r3Text, /type it in and save/, "rung 3 tells the learner to type it");
  assert.match(
    r3Text,
    /what would you get back if the folder were empty\?/,
    "rung 3 ends with a forward prediction check",
  );

  // The solution line appears only in rung 3 of the example and in the quoted
  // anti-pattern — never in the rules or earlier rungs.
  const beforeExample = watch.slice(0, exampleStart).replace(ANTI_PATTERN_HINT, "");
  assert.doesNotMatch(
    beforeExample,
    /sorted\(folder\.glob/,
    "the solution line leaked outside rung 3 and the quoted miss",
  );
});

test("the watch paragraph is honest about what the tutor can hear mid-poll", async () => {
  const watch = watchSection(await readNextLesson());

  // Agents cannot see chat during a running tool call. The old sentence told
  // the tutor to "stop polling and engage" as if it could notice the message
  // in flight; the accurate rule is about what happens when the poll returns.
  assert.match(
    watch,
    /You cannot see chat while a shell call is running/,
    "the watch must state plainly that chat is invisible during a running poll",
  );
  assert.match(
    watch,
    /reaches you when the poll returns/,
    "the watch must say a mid-poll message arrives when the poll returns",
  );
  assert.doesNotMatch(
    watch,
    /stop polling and engage it/,
    "the old sentence still claims the tutor can react mid-poll",
  );
  assert.match(
    watch,
    /handle the message first/,
    "a queued message must be handled before anything about the file",
  );
  // A queued "hint" is the answer to the question the tutor was about to ask.
  assert.match(
    watch,
    /A queued "hint" absorbs the expiry question/,
    "a hint typed mid-poll must be climbed, not answered with the expiry question",
  );

  // The PR #16 guarantees survive the rewrite.
  assert.match(watch, /is the learner speaking, and it outranks the watch/);
  assert.match(watch, /never a bare "the watcher is running" nudge/);
  assert.match(watch, /the chat channel is theirs/);
});

test("a rung-3 reveal earns no quiz credit in either mode, and the learner never hears that", async () => {
  const paid = await readPaidMode();
  const free = await readFreeMode();

  // Paid: the reveal itself is never a quiz-moment; the prediction check that
  // follows is a real check and is emitted with its honest verdict.
  assert.match(
    paid,
    /never emit `quiz-moment` for the reveal itself/,
    "paid mode must never emit a quiz-moment for a rung-3 reveal",
  );
  assert.match(
    paid,
    /never (?:say|mention) (?:that|this) to the learner/,
    "paid mode must keep the no-credit rule silent",
  );
  assert.match(
    paid,
    /forward prediction check that follows .* genuine check/,
    "paid mode must keep the post-reveal prediction check as real evidence",
  );

  // Free: a revealed gap is not a "correct fill-in" and moves no status.
  assert.match(
    free,
    /rung-3 reveal/,
    "free mode must name the rung-3 reveal in its evidence rules",
  );
  assert.match(
    free,
    /not a correct fill-in/,
    "free mode must exclude a revealed gap from the correct-fill-in evidence class",
  );
  assert.match(
    free,
    /never (?:say|mention) (?:that|this) to the learner/,
    "free mode must keep the no-credit rule silent",
  );
  assert.match(
    free,
    /forward prediction check that follows .* genuine check/,
    "free mode must keep the post-reveal prediction check as real evidence",
  );
});

test("the copy-paste prompt mirrors the ladder in the learner's own voice", async () => {
  const prompts = await readPrompts();

  // PROMPTS.md is the no-plugin path and already carries the fill-in flow
  // ("Leave 1–3 blanks marked TODO(you) …"), so the ladder has to live there
  // too, phrased as the learner asking for it.
  assert.match(prompts, /hint in steps/, "the prompt must ask for hints in steps");
  assert.match(
    prompts,
    /first where to look,\s+then the shape of the answer/,
    "the prompt must name the first two rungs",
  );
  assert.match(
    prompts,
    /never fill a blank in for me/,
    "the prompt must forbid the tutor filling the blank",
  );
  assert.match(
    prompts,
    /never hand me\s+the answer unasked/,
    "the prompt must forbid the unasked reveal",
  );
});
