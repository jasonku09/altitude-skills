import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The silent handover (replay, 2026-09-19). On Claude Code, in roughly half of
 * replayed lessons, the tutor wrote the skeleton with its `TODO(you)` marker and
 * went straight into the 3-minute blocking poll with no chat text at all: no
 * introduction, no handover. The raw transcripts show the speech drafted word
 * for word in the model's private reasoning, followed directly by the poll's
 * tool call. The learner's first words from the tutor, three minutes later,
 * were "Still working, or want a hint?".
 *
 * Three prose tightenings about ordering and visibility scored 0 of 7 in replay.
 * The cause is structural: text before a long blocking tool call is the one
 * channel that host does not reliably use, and the final message of a turn is
 * the one it always delivers. So on a host that can run a command in the
 * background and wake the agent when it exits, the watch moves to the
 * background and every message that matters becomes the final message of a
 * turn. Hosts without that capability keep the foreground watch unchanged.
 *
 * The fix is prose, so these tests pin the prose: one atomic rule per move,
 * phrased by capability rather than by product, with the named miss beside it.
 */

async function readNextLesson() {
  return readFile(join(repoRoot, "skills", "next-lesson", "SKILL.md"), "utf8");
}

async function readFallback() {
  return readFile(join(repoRoot, "skills", "next-lesson", "references", "watch-fallback.md"), "utf8");
}

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.ok(start !== -1, `missing marker: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return text.slice(start, end);
}

function watchSection(skill) {
  return sliceBetween(
    skill,
    "When a `teach` step uses fill-ins, they happen in the file, not the chat.",
    "**When a command creates files**",
  );
}

function handoverParagraph(skill) {
  return sliceBetween(skill, "**Every hand-over of a `teach` gap goes through the file", "\n\n");
}

const BACKGROUND_RULE =
  "**If your host can run a command in the background and wake you when it exits, the watch is a background command and your message ends the turn.**";

test("the background watch is one capability-conditional rule, with Claude Code as the example", async () => {
  const watch = watchSection(await readNextLesson());

  assert.ok(watch.includes(BACKGROUND_RULE), "the background rule must be one emphasized instruction, phrased by capability");
  assert.match(watch, /Claude Code is the example: the Bash tool's `run_in_background`/, "the host mechanism is named as an example");
  assert.match(watch, /whose exit re-invokes you/, "the wake is what makes the background watch a watch");
  // A plain shell `&` looks like the capability and is not: nothing wakes the agent.
  assert.match(watch, /A shell `&` is not this/, "a bare & must be ruled out");
  assert.match(watch, /If you are not certain your host wakes you, it does not/, "doubt resolves to the foreground watch");
});

test("the background watcher exits on a real save, on expiry, or on a poll error, and says which", async () => {
  const watch = await readFallback();
  const background = sliceBetween(watch, BACKGROUND_RULE, "**Otherwise the watch runs in the foreground");

  assert.match(background, /One command is one 3-minute window/, "one command per window keeps the four-window stop countable");
  assert.match(background, /`SAVED`/, "the real-save outcome is named");
  assert.match(background, /`EXPIRED`/, "the expiry outcome is named");
  assert.match(background, /`POLL_ERROR`/, "a poll that cannot read the time must say so, not look like silence");
  // Autosave churn: a save that still carries a marker must not cost the learner a wake.
  assert.match(background, /grep -q 'TODO\(you\)' "\$f"/, "the watcher checks for the marker itself (macOS/Linux)");
  assert.match(background, /Select-String -Quiet -SimpleMatch 'TODO\(you\)'/, "the PowerShell variant of the marker check");
  assert.match(background, /A save that still carries a marker never wakes you at all/, "work-in-progress saves make no noise");
  assert.match(background, /set it above the window/, "a tool timeout below the window would kill the watcher");
});

test("on a background host the learner-facing message is the FINAL message of the turn", async () => {
  const watch = watchSection(await readNextLesson());
  const background = sliceBetween(watch, BACKGROUND_RULE, "**Otherwise the watch runs in the foreground");

  assert.match(background, /as your reply, the final message of the turn/, "the message is bound to the end of the turn");
  assert.match(
    background,
    /a message written before a long tool call is the one the learner may never get, and the final message is the one they always do/,
    "the reason is stated once, as the mechanism",
  );
  assert.match(background, /Never run this watch in the foreground there/, "no blocking poll on a background host");
  assert.match(background, /never sleep, poll, or wait in the turn after starting it/, "the turn ends; it does not idle");
  // The host prints the command's description to the learner.
  assert.match(background, /The host shows the learner the command's description/, "the description is learner-visible");
  assert.match(background, /put no hint in it/, "the description is not a side channel for a hint");
});

test("one live watcher per gap", async () => {
  const watch = watchSection(await readNextLesson());

  assert.match(watch, /\*\*One live watcher per gap\*\*/, "the no-stacking rule is one emphasized instruction");
  assert.match(watch, /starting a new `wait` supersedes the old one/, "the CLI enforces ownership");
  assert.match(watch, /TaskStop.*courtesy, not a correctness requirement/, "host cleanup is optional");
  assert.match(watch, /never start a second because a chat turn came in/, "a chat turn does not re-arm a live watcher");
  assert.match(watch, /When the gap is finished, reviewed, or abandoned, stop its watcher/, "no watcher outlives its gap");
});

test("hosts without the capability keep the foreground watch through wait slices", async () => {
  const watch = watchSection(await readNextLesson());
  const foreground = sliceBetween(watch, "**Otherwise the watch runs in the foreground", "is work in progress, not a submission");

  assert.match(foreground, /Codex today/, "the foreground example host is named");
  assert.match(foreground, /under your tool's timeout/, "chunking under the tool timeout survives");
  assert.match(foreground, /issue the first `wait` before that turn ends/, "the foreground handover turn still polls before it ends");
  assert.match(watch, /never end a turn on a promise to watch with no poll running/, "true on every host");
  assert.match(watch, /Read the command's own outcome before reading anything into its result/, "poll error is not a struggle, on every host");
});

test("the handover paragraph binds 'spoken' to the channel the host delivers, and names the silent miss", async () => {
  const handover = handoverParagraph(await readNextLesson());

  assert.match(handover, /\*\*The handover is spoken before it is watched\.\*\*/, "the rule keeps its name");
  assert.match(handover, /Where the watch runs in the background/, "background hosts are addressed");
  assert.match(handover, /your reply, the final message of that turn, with nothing after it/, "background: the handover ends the turn");
  assert.match(handover, /chat text sent before the first poll/, "foreground: the handover precedes the poll");
  assert.match(handover, /A handover composed in your reasoning and followed by a tool call has been said to nobody/, "the mechanism of the miss is stated");
  // The named miss, in full.
  assert.match(handover, /A skeleton written silently and then watched is the miss/);
  assert.match(handover, /left the whole introduction and handover in its own head/, "the named miss says where the speech went");
  assert.match(handover, /"Still working, or want a hint\?"/, "the learner's first words from the tutor are quoted");
});

test("the expiry question never ends the watch; whether it ends the turn depends on the host", async () => {
  const watch = watchSection(await readNextLesson());

  assert.match(watch, /\*\*Asking the question never ends the watch\.\*\*/, "the invariant is host-independent");
  assert.match(watch, /On a foreground host \*\*asking the question never ends your turn\*\*/, "the foreground rule is kept, conditionally");
  assert.match(
    watch,
    /On a background host the order is re-arm first, question last/,
    "background: the question is the final message of the turn that re-armed the watcher",
  );
  assert.match(watch, /the turn ends and the watch does not/, "the background turn ends with a watcher running");
  assert.match(watch, /with the question as your whole reply/, "still zero hint content: the question is the whole reply");
});

test("silent re-arms and chat on a background host", async () => {
  const watch = watchSection(await readNextLesson());

  // Both partial saves and emptied gaps are now handled without waking the tutor.
  assert.match(watch, /the tutor is never even woken for them/, "work in progress stays silent");
  // Chat no longer queues behind a poll.
  assert.match(watch, /On a background host the learner's message arrives as its own turn at once/, "chat is immediate");
  assert.match(watch, /with the watcher still running behind it/, "the watcher survives the chat turn");
  assert.match(watch, /has absorbed it too/, "a learner who already spoke this fill-in is not asked the expiry question");
  // Fail-safe: a missed wake must not strand the learner, and must not nag them either.
  assert.match(watch, /a save you were never woken for/, "a missed wake is named");
  assert.match(watch, /is a "check"/, "any learner message after an unseen save reads the file");
  assert.match(watch, /or if a save ever goes unanswered/, "the once-per-session check line covers the missed wake");
});

test("the release notes mention the watch change and move no floor", async () => {
  const compat = await readFile(join(repoRoot, "WORKSHOP-COMPATIBILITY.md"), "utf8");
  const paid = await readFile(join(repoRoot, "skills", "next-lesson", "references", "paid-mode.md"), "utf8");
  for (const manifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const { version } = JSON.parse(await readFile(join(repoRoot, manifest), "utf8"));
    assert.equal(version, "0.7.0", `${manifest}: the version is 0.7.0`);
  }

  assert.match(compat, /Plugin 0\.7\.0[^]*background/i, "the current notes mention the background watch");
  assert.match(paid.split("-->")[0], /background/, "the paid-mode release comment mentions the watch change");
  assert.match(paid.split("-->")[0], /CLI 0\.8\.1 \/ plugin 0\.5\.8/, "the floor is unchanged");
});

/**
 * The save lost between poll chunks (learner-model replay, 2026-09-20). A
 * foreground tutor chained 25-second poll chunks and opened every chunk with a
 * fresh `last=$(stat …)`. The learner's finished save landed in the 11 seconds
 * between two chunks, became the next chunk's baseline, and was never seen: five
 * more chunks reported no change and the finished code sat unreviewed. A
 * background watcher re-armed mid-turn has the same hole if it takes its own
 * reading at start. One rule for both: the baseline is a number the tutor
 * carries, not a reading a command takes when it happens to start.
 */
const BASELINE_RULE =
  "**The baseline is taken once, when the watch is armed, and carried as a literal value into every command that watches after it.**";

test("the baseline is taken once and carried as a literal, on every host", async () => {
  const watch = await readFallback();
  const rule = watch.split("\n\n").find((p) => p.includes(BASELINE_RULE));
  assert.ok(rule, "the baseline rule is one emphasized instruction inside the watch section");

  assert.ok(rule.startsWith("**The watch.**"), "the rule lives in the host-independent watch paragraph");
  assert.match(rule, /right after you write the skeleton/, "when the baseline is taken");
  assert.match(rule, /`base=\d+`/, "the literal is shown as a literal (macOS/Linux)");
  assert.match(rule, /PowerShell: `\$base = \d+`, the `Ticks` value/, "the PowerShell variant carries the Ticks value the same way");
  assert.match(rule, /never against a fresh reading taken when the command starts/, "the hole is named");
  assert.match(rule, /becomes the new baseline and is never seen/, "the mechanism of the miss is stated");
  assert.match(rule, /compares once before its first sleep/, "a save that landed while nothing polled is caught at once");
  assert.match(rule, /Re-take the baseline only when you read the file in response to a change/, "the only re-take");
  assert.match(rule, /take the time first and read the file second/, "a save that lands during the read is not swallowed");
});

test("foreground chunks share one baseline, and the replayed miss is named", async () => {
  const watch = await readFallback();
  const foreground = sliceBetween(watch, "**Otherwise the watch runs in the foreground", "is work in progress, not a submission");

  assert.match(foreground, /several calls make one window and one baseline/, "chunks make one window AND one baseline");
  assert.match(foreground, /takes no reading of its own/, "a later chunk never re-reads the baseline");
  assert.match(foreground, /The miss, in replay/);
  assert.match(foreground, /each opened with `last=\$\(stat …\)`/, "the anti-pattern is quoted");
  assert.match(foreground, /in the 11 seconds between two chunks/, "where the save landed");
  assert.match(foreground, /sat unreviewed/, "what it cost the learner");
});

test("a re-armed background watcher compares against the carried baseline, not the time at re-arm", async () => {
  const watch = await readFallback();
  const background = sliceBetween(watch, BACKGROUND_RULE, "**Otherwise the watch runs in the foreground");

  assert.doesNotMatch(background, /it records the modification time/, "the watcher no longer takes its own baseline");
  assert.match(background, /takes the baseline you carry as a literal/, "the watcher is handed its baseline");
  assert.match(background, /A re-armed watcher gets the same carried baseline, never the time at re-arm/, "re-arm rule");
  assert.match(background, /a save that landed while you were mid-turn/, "the swallowed save is named");
  assert.match(background, /reports it at once/, "the new watcher exits SAVED on its first comparison");
});

test("a silent re-arm after a work-in-progress save re-takes the baseline time-first", async () => {
  const watch = await readFallback();
  const wip = watch.split("\n\n").find((p) => p.includes("is work in progress, not a submission"));

  assert.match(wip, /from the time you took just before that read/, "the re-arm's baseline predates the read");
});

test("the 0.7.0 notes delegate the baseline to altitude watch", async () => {
  const compat = await readFile(join(repoRoot, "WORKSHOP-COMPATIBILITY.md"), "utf8");
  const paid = await readFile(join(repoRoot, "skills", "next-lesson", "references", "paid-mode.md"), "utf8");

  assert.match(compat.replace(/\s+/g, " "), /Plugin 0\.7\.0.*baseline/i);
  assert.match(paid.split("-->")[0], /CLI owns the baseline/);
});

/**
 * The expiry question 31 seconds into a 3-minute watch (learner-model replay,
 * 2026-09-20). A foreground tutor borrowed the background watcher's outcome
 * words for its 25-second poll chunks: each chunk set
 * `deadline=$((SECONDS+25))` and printed `EXPIRED` when its own slice ran out.
 * The tutor read that as the window's expiry and asked "Still working, or want
 * a hint?" 31 to 37 seconds after the handover, in 3 of 5 cells whose watch
 * outlived one chunk. The background paragraph defined `EXPIRED` for a command
 * that IS the whole window; a chunk is only a slice of one. One rule for both
 * hosts: the deadline, like the baseline, is a number the tutor carries, and
 * `EXPIRED` means that number has passed.
 */
const DEADLINE_RULE =
  "**The window's deadline is taken once too, when the window opens, and carried as a literal beside the baseline.**";

const CHUNK_RULE = "**A chunk ending is not the window ending.**";

test("the deadline is taken once per window and carried as a literal, on every host", async () => {
  const watch = await readFallback();
  const rule = watch.split("\n\n").find((p) => p.includes(DEADLINE_RULE));
  assert.ok(rule, "the deadline rule is one emphasized instruction inside the watch section");

  assert.ok(rule.startsWith("**The watch.**"), "the rule lives in the host-independent watch paragraph, beside the baseline rule");
  assert.ok(rule.indexOf(DEADLINE_RULE) > rule.indexOf(BASELINE_RULE), "it follows the baseline rule it mirrors");
  assert.match(rule, /`deadline=\d+`/, "the literal is shown as a literal clock time (macOS/Linux)");
  assert.match(rule, /`date \+%s`/, "where the clock time comes from (macOS/Linux)");
  assert.match(rule, /PowerShell: `\$deadline = \d+`/, "the PowerShell variant carries the deadline the same way");
  assert.match(rule, /\(Get-Date\)\.AddMinutes\(3\)\.Ticks/, "where the PowerShell deadline comes from");
  assert.match(rule, /`EXPIRED` means one thing on every host: the clock has passed the deadline you carry/, "EXPIRED is defined once");
  assert.match(rule, /never measures the window from its own start/, "the hole is named");
  assert.match(rule, /`\$\(\(SECONDS\+25\)\)`/, "the anti-pattern is quoted");
});

test("a new deadline opens only after EXPIRED; every other re-arm gets the remainder", async () => {
  const watch = await readFallback();
  const rule = watch.split("\n\n").find((p) => p.includes(DEADLINE_RULE));

  assert.match(rule, /A new window, with a new deadline, opens only when the one you carry has passed/, "what opens a window");
  assert.match(rule, /gets the remainder, never a fresh 3 minutes/, "a re-arm inside a window does not extend it");
  assert.match(rule, /a work-in-progress save moves the baseline and never the deadline/, "autosaves do not push the question away");
  assert.match(rule, /four windows stay about 12 minutes/, "the stop rule stays countable by the clock");
});

test("a foreground chunk that runs out of its slice says WAITING, and the tutor chains on in silence", async () => {
  const watch = await readFallback();
  const foreground = sliceBetween(watch, "**Otherwise the watch runs in the foreground", "is work in progress, not a submission");

  assert.ok(foreground.includes(CHUNK_RULE), "the chunk rule is one emphasized instruction in the foreground paragraph");
  assert.match(foreground, /handed both literals/, "every chunk gets the baseline and the deadline");
  assert.match(foreground, /`WAITING`/, "the slice-ran-out outcome has its own word");
  assert.match(foreground, /prints `EXPIRED` only when the carried deadline has passed/, "EXPIRED is reserved for the window");
  assert.match(foreground, /`WAITING` is not news/, "WAITING carries nothing for the learner");
  assert.match(foreground, /no message to the learner, no question/, "the next chunk is chained silently");
  assert.match(foreground, /with the same two literals/, "the chained chunk carries the same numbers");
  // The named miss, from replay.
  assert.match(foreground, /`deadline=\$\(\(SECONDS\+25\)\)`/, "the replayed chunk is quoted");
  assert.match(foreground, /31 seconds into a 3-minute watch/, "what it cost the learner");
  assert.match(foreground, /its own slice running out/, "the mechanism of the miss is stated");
});

test("the background watcher is handed its deadline too", async () => {
  const watch = await readFallback();
  const background = sliceBetween(watch, BACKGROUND_RULE, "**Otherwise the watch runs in the foreground");

  assert.match(background, /takes the baseline you carry as a literal and the deadline beside it/, "the watcher is handed both numbers");
  assert.match(background, /the carried deadline passed → `EXPIRED`/, "EXPIRED is the carried deadline, not the command's age");
  assert.doesNotMatch(background, /3 minutes passed → `EXPIRED`/, "the command-relative wording is gone");
  assert.match(background, /keeps waiting from the new time, toward the same deadline/, "the watcher's own silent re-arm keeps the deadline");
  assert.match(background, /re-armed inside a window gets that window's deadline/, "a watcher restarted mid-window gets the remainder");
});

test("the expiry question is bound to the carried deadline", async () => {
  const watch = await readFallback();
  const expiry = watch.split("\n\n").find((p) => p.includes("**The expiry message is a question with no hint in it.**"));

  assert.match(expiry, /When the deadline you carry passes with no real save/, "expiry is the carried deadline");
  assert.match(expiry, /never on `WAITING`/, "a chunk running out is not an expiry");
});

test("the 0.7.0 notes delegate the deadline and arming check to altitude watch", async () => {
  const compat = await readFile(join(repoRoot, "WORKSHOP-COMPATIBILITY.md"), "utf8");
  const paid = await readFile(join(repoRoot, "skills", "next-lesson", "references", "paid-mode.md"), "utf8");

  assert.match(compat.replace(/\s+/g, " "), /Plugin 0\.7\.0.*deadline/i);
  assert.match(paid.split("-->")[0], /CLI owns the baseline, deadline, and marker check at arming/);
  assert.match(compat.replace(/\s+/g, " "), /Plugin 0\.7\.0.*marker check at arming/i);
});

/**
 * The save that became the baseline (learner-model replay, lane 5). A tutor
 * wrote the skeleton, then took 24 seconds to issue the call that read the
 * baseline; the learner's finished save had landed 9 seconds before that call.
 * The finished code's modification time became the number the tutor carried, and
 * four chunks printed `WAITING` at code that was already done. The baseline
 * rule says "right after you write the skeleton", and a slow host makes "right
 * after" long enough to type a line in. So the first reading checks the marker.
 */
test("the baseline reading checks for the marker, so a save that beat it is not swallowed", async () => {
  const watch = await readFallback();
  const rule = watch.split("\n\n").find((p) => p.includes(BASELINE_RULE));

  assert.match(rule, /\*\*The call that reads the baseline also checks that the marker is still in the file\.\*\*/, "one emphasized instruction");
  assert.match(rule, /`grep -c 'TODO\(you\)' "\$f"`/, "the check is shown (macOS/Linux)");
  assert.match(rule, /PowerShell: `\(Select-String -SimpleMatch 'TODO\(you\)' \$f\)\.Count`/, "the PowerShell variant");
  assert.match(rule, /fewer markers than you wrote/, "what the check looks for");
  assert.match(rule, /never arm a watch on it/, "no watch is armed on an already-changed file");
  assert.match(rule, /read the file and respond as you would to any save/, "the change is handled under the normal save rules");
  assert.match(rule, /The miss, in replay/);
  assert.match(rule, /24 seconds after writing the skeleton/, "how late the baseline was");
  assert.match(rule, /printed `WAITING` at code that was already finished/, "what it cost the learner");
});

/**
 * The learner's save, erased (lane 5 replay). With the marker check in place a
 * tutor whose baseline call ran 35 seconds after the skeleton found the gap
 * already written. It could not feel its own 35 seconds pass, decided the code
 * had appeared "before you had a chance to type", and wrote the marker back over
 * the learner's finished work.
 */
test("a save that arrived fast is still the learner's: never doubted, never overwritten with the marker", async () => {
  const watch = watchSection(await readNextLesson());
  const rule = watch.split("\n\n").find((p) => p.includes("**Code in the gap"));

  assert.match(rule, /\*\*Code in the gap is the learner's code, however fast it arrived\.\*\*/, "one emphasized instruction");
  assert.match(rule, /you cannot feel them pass/, "the mechanism: the tutor's own latency is invisible to it");
  assert.match(rule, /Never doubt a save for its speed/, "speed is not evidence against the learner");
  assert.match(rule, /never write the marker back over code the learner saved/, "the destructive move is ruled out by name");
  assert.match(rule, /"before you had a chance to type"/, "the replayed miss is quoted");
});
