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
  const watch = watchSection(await readNextLesson());
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
  assert.match(watch, /stop the one still running/, "re-arming replaces, never adds");
  assert.match(watch, /never start a second because a chat turn came in/, "a chat turn does not re-arm a live watcher");
  assert.match(watch, /When the gap is finished, reviewed, or abandoned, stop its watcher/, "no watcher outlives its gap");
});

test("hosts without the capability keep the foreground watch, unchanged", async () => {
  const watch = watchSection(await readNextLesson());
  const foreground = sliceBetween(watch, "**Otherwise the watch runs in the foreground", "is work in progress, not a submission");

  assert.match(foreground, /Codex today/, "the foreground example host is named");
  assert.match(foreground, /under your tool's timeout/, "chunking under the tool timeout survives");
  assert.match(foreground, /issue the first poll chunk before that turn ends/, "the foreground handover turn still polls before it ends");
  assert.match(watch, /never end a turn on a promise to watch with no poll running/, "true on every host");
  assert.match(watch, /Read the poll's own outcome before reading anything into its result/, "poll error is not a struggle, on every host");
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

  // An emptied gap still wakes the tutor; the re-arm must not become a comment.
  assert.match(watch, /one tool call — the new watcher — and no reply text at all/, "a silent re-arm is a turn with no text");
  assert.match(watch, /"Still watching\."/, "the fallback where a host will not end a turn on nothing");
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
    assert.equal(version, "0.6.1", `${manifest}: the version stays 0.6.1`);
  }

  assert.match(compat, /Plugin 0\.6\.1[^]*background watch/i, "the 0.6.1 notes mention the background watch");
  assert.match(paid.split("-->")[0], /background/, "the paid-mode release comment mentions the watch change");
  assert.match(paid.split("-->")[0], /CLI 0\.8\.1 \/ plugin 0\.5\.8/, "the floor is unchanged");
});
