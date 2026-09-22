import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const skill = read("skills/next-lesson/SKILL.md");
const fallbackText = read("skills/next-lesson/references/watch-fallback.md");
const watch = skill.slice(skill.indexOf("**The watch.**"), skill.indexOf("**The hint ladder.**"));
const paragraph = (rule) => {
  const result = watch.split("\n\n").find((p) => p.startsWith(rule));
  assert.ok(result, `missing watch rule: ${rule}`);
  return result;
};

test("watch command: arm the skeleton in the same turn with the marker count and teaching windows", () => {
  const arm = paragraph("**The watch.**");
  assert.match(arm, /altitude watch start <file> --markers <N> --window-seconds 180 --max-windows 4 --json/);
  assert.match(arm, /N is the number of markers you just wrote/);
  assert.match(arm, /right after writing the skeleton, in that same turn/);
  assert.match(arm, /`SAVED` with `already: true`.*read the file and review/);
  assert.match(arm, /`ARMED`.*go on to `wait`/);
  assert.match(arm, /fewer than N.*work in progress/);
  assert.match(arm, /CLI owns the baseline, deadline, marker checks, and window count/);
  assert.doesNotMatch(watch, /stat -[fc]|base=\d|deadline=\d|LastWriteTime|POLL_ERROR/);
});

test("watch command: hosts choose background wake or foreground slices by capability", () => {
  const background = paragraph("**If your host can run a command in the background");
  assert.match(background, /altitude watch wait <file> --json/);
  assert.match(background, /background command/);
  assert.match(background, /final message of the turn/);
  assert.match(background, /If you are not certain your host wakes you, it does not/);
  const foreground = paragraph("**Otherwise the watch runs in the foreground");
  assert.match(foreground, /altitude watch wait <file> --json --slice-seconds <S>/);
  assert.match(foreground, /under your tool's timeout/);
  assert.match(foreground, /`WAITING`.*call `wait` again at once.*nothing in chat/);
  assert.match(foreground, /A chunk ending is not the window ending/);
});

test("watch command: SAVED reviews real code and work in progress never wakes the tutor", () => {
  const saved = paragraph("**A save with a");
  assert.match(saved, /marker deleted and nothing written in its place/);
  assert.match(saved, /`altitude watch wait` handles both states silently; the tutor is never even woken for them/);
  assert.match(saved, /no review, no comment, not even "I see you've started\."/);
  assert.match(saved, /`SAVED`.*read the file and respond to their real code/);
  assert.match(saved, /`already: true`.*read and review.*even if the gap is empty/);
});

test("watch command: question_due is only permission to ask once on EXPIRED", () => {
  const expiry = paragraph("**The expiry message");
  assert.match(expiry, /Only when `question_due` is true and the learner has not already spoken during this fill-in/);
  assert.match(expiry, /Still working, or want a hint\?/);
  assert.match(expiry, /zero hint content, zero code/);
  assert.match(expiry, /once per fill-in/);
  assert.match(expiry, /otherwise silence/);
  assert.match(expiry, /never on `WAITING` alone and never just because a command returned/);
  assert.match(expiry, /never with a new `start`/);
});

test("watch command: foreground expiry speaks first and immediately waits in the same turn", () => {
  const expiry = paragraph("**The expiry message");
  const foreground = expiry.slice(expiry.indexOf("On a foreground host"), expiry.indexOf("On a background host"));
  assert.match(foreground, /`EXPIRED`, send the one-line question if it is due \(otherwise send nothing\), then call `wait` again at once in that same turn/);
  assert.match(foreground, /asking the question never ends your turn/);
});

test("watch command: background expiry starts wait before ending with the question or silence", () => {
  const expiry = paragraph("**The expiry message");
  const background = expiry.slice(expiry.indexOf("On a background host"), expiry.indexOf("This reply,"));
  assert.match(background, /start the next `wait` first, then end the turn with the question as your whole reply/);
  assert.match(background, /when no question is due, with no reply text/);
  assert.match(background, /the turn ends and the watch does not/);
});

test("watch command: expiry has no pending question or first-slice outcome mechanism", () => {
  assert.doesNotMatch(skill, /pending question|first (?:short )?slice|question from `EXPIRED` is still due|asking a stale question|start the next `wait` FIRST/);
});

test("watch replay: later background expiries end with no reply, including no reassurance", () => {
  const expiry = paragraph("**The expiry message");
  assert.match(expiry, /\*\*On a background host, a later expiry ends your turn with no reply text at all\./);
  assert.match(expiry, /not a second question, and not a nudge or a reassurance\*\*/);
  assert.match(expiry, /The miss, in replay: "Take your time — no rush\.".*"No rush\. Take the time you need\.".*"Still here whenever you're ready\."/);
  assert.match(expiry, /messages to someone who has stepped away.*stop below is what the silence is saving them for/);
});

test("watch replay: tool-call preambles and wake commentary are learner-visible plumbing", () => {
  const plumbing = paragraph("**The watch is plumbing;");
  assert.match(plumbing, /\*\*This includes your own narration around a tool call\.\*\*/);
  assert.match(plumbing, /host that shows the learner everything you say/);
  for (const miss of [
    "Now I'll arm the save-watch on the gap",
    "The watch is armed",
    "The watcher has exited again, so I'll read its outcome and the sandbox file together",
    "The window ran out with the marker still in the file",
    "I'll re-arm the watch first, then ask the one check-in question",
  ]) assert.ok(plumbing.includes(`"${miss}"`), `missing narration miss: ${miss}`);
  assert.match(plumbing, /Between the handover and the review, say nothing at all about the mechanism/);
  assert.match(plumbing, /the call needs no announcement and the wake needs no commentary/);
});

test("watch replay: SAVED already cancels the unsent handover instead of assigning finished work", () => {
  const arm = paragraph("**The watch.**");
  assert.match(arm, /`SAVED` with `already: true`.*read the file and review, never rewrite the marker over their code/);
  assert.match(arm, /\*\*do not send the handover you were about to send\*\*/);
  assert.match(arm, /gap is already filled.*telling them to replace a marker that is gone/);
  assert.match(arm, /The miss, in replay:.*`already: true`.*"Replace the `TODO\(you\)` line with your own declaration.*Save the file; I'll read the saved code".*two seconds later.*correct/);
  assert.match(arm, /told to redo finished work/);
});

test("watch command: STOPPED is a plain stop and SUPERSEDED is silence", () => {
  const stop = paragraph("**One live watcher per gap**");
  assert.match(stop, /`SUPERSEDED`.*nothing at all.*another watcher owns the gap/);
  assert.match(stop, /starting a new `wait` supersedes the old one/);
  assert.match(stop, /TaskStop.*courtesy, not a correctness requirement/);
  assert.match(paragraph("**Stop only a watcher that may still be live.**"), /altitude watch stop <file> --json/);
  const expiry = paragraph("**The expiry message");
  assert.match(expiry, /`STOPPED`.*save and say "check" when they're back.*no hint/);
});

test("watch command: ERROR is not learner evidence and only NOT_ARMED re-starts", () => {
  const error = paragraph("**Read the command's own outcome");
  assert.match(error, /`ERROR`.*never.*learner who typed nothing/);
  assert.match(error, /`NOT_ARMED`.*re-run `start`.*same flags.*handle its result/);
  assert.match(error, /every other.*save and say "check"/);
  assert.match(error, /false evidence entry/);
  assert.match(error, /JSON `ERROR`.*not.*fallback/);
});

test("watch command: only observable no-result start failure loads the fallback", () => {
  const fallback = paragraph("**Fallback only on observable command failure.**");
  assert.match(fallback, /Only if `altitude watch start` returns no result/);
  assert.match(fallback, /\[references\/watch-fallback\.md\]\(references\/watch-fallback\.md\)/);
  assert.match(fallback, /never.*version.*host.*guess/);
  assert.match(fallback, /not the `update_required` path/);
  assert.match(fallback, /never blocks the lesson on updating/);
  assert.equal((skill.match(/\]\(references\/watch-fallback\.md\)/g) || []).length, 1);
});

test("watch command: fallback update nudge is once at session close, never mid-gap", () => {
  const close = skill.slice(skill.indexOf("6. The update lines"));
  assert.match(close, /If the command was unknown/);
  assert.match(close, /once, at session close and never mid-gap/);
  assert.match(close, /`altitude update` gets them a more reliable save-watcher/);
  assert.match(close, /never block.*lesson.*updat/);
});

test("watch fallback: the 0.6.1 shell mechanics and replay misses remain available", () => {
  assert.match(fallbackText, /stat -f %m.*stat -c %Y/);
  assert.match(fallbackText, /LastWriteTime\.Ticks.*Start-Sleep/);
  assert.match(fallbackText, /baseline is taken once/);
  assert.match(fallbackText, /deadline is taken once/);
  assert.match(fallbackText, /24 seconds after writing the skeleton/);
  assert.match(fallbackText, /31 seconds into a 3-minute watch/);
  assert.match(fallbackText, /finished save landed in the 11 seconds between two chunks/);
});

test("watch smoke: SAVED, already, and check require a fresh disk read before review", () => {
  const rule = paragraph("**Read the gap file itself before every review.**");
  assert.match(rule, /`SAVED`.*`already: true`.*"check".*next tool call reads the gap file from disk/);
  assert.match(rule, /Every word of the review comes from that read/);
  assert.match(rule, /THAT a save landed, never WHAT was saved/);
  for (const text of [skill, fallbackText]) {
    const readRule = text.split("\n\n").find((p) => p.startsWith("**Read the gap file itself"));
    assert.ok(readRule);
    assert.match(readRule, /next tool call reads the gap file from disk/);
    assert.match(readRule, /The miss, in replay:.*background command's output.*never opened the file.*right only by luck/);
    assert.doesNotMatch(text, /that wake is the next window's start or the review/);
  }
});

test("watch smoke: stop is only for a possibly live watch, never terminal results", () => {
  const rule = paragraph("**Stop only a watcher that may still be live.**");
  assert.match(rule, /"check".*missed-wake.*`wait` may still be running/);
  assert.match(rule, /abandoned or replaced mid-watch/);
  assert.match(rule, /after the disk read/);
  assert.match(rule, /never after `SAVED` or `STOPPED`/);
  assert.match(rule, /already ended the watch and deleted its state/);
  assert.match(rule, /The miss, in both smoke replays:.*`stop` after `SAVED`.*narrated it/);
  for (const text of [skill, fallbackText]) {
    assert.doesNotMatch(text, /When the gap is finished, reviewed, or abandoned, stop its watcher|reviewed via "check", finished, or abandoned/);
  }
  assert.match(fallbackText, /Stop only a watcher that may still be live/);
  assert.match(fallbackText, /never run `altitude watch stop` for a shell watcher/);
});

test("watch smoke: plumbing stays out of learner chat, including silent re-arms", () => {
  for (const text of [skill, fallbackText]) {
    const rule = text.split("\n\n").find((p) => p.startsWith("**The watch is plumbing; the learner never hears about it.**"));
    assert.ok(rule);
    assert.match(rule, /No learner-visible sentence about watchers, commands, exits, windows, slices, re-arming or outcomes/);
    assert.match(rule, /"save and I'll read it".*one-time "say check" line.*expiry question.*stop message/);
    assert.match(rule, /command description shown by the host stays as it is/);
    assert.match(rule, /The miss, in replay: "The save-watcher has exited\. I'll read what it reported\." and "I'll stop that watcher, since the gap is now reviewed\."/);
    assert.doesNotMatch(text, /Still watching\./);
  }
});

test("watch smoke: fallback scope and update advice depend on observable cause", () => {
  for (const text of [skill, fallbackText]) {
    const rule = text.split("\n\n").find((p) => p.startsWith("**Fallback is per cause, not a one-way door.**"));
    assert.ok(rule);
    assert.match(rule, /unknown command: watch.*usage text that lists no `watch`.*rest of the session/);
    assert.match(rule, /permission error, crash, empty output.*this gap only.*try `altitude watch start` again at the next gap/);
    assert.match(rule, /do not tell the learner to update/);
    assert.match(rule, /The miss, in replay:.*harness wrapper fault.*silently downgraded the whole session/);
    assert.doesNotMatch(text, /without retrying the command path at each gap|never retry the command path|follow it for the rest of the session|Remember that fallback was used|If the watch fallback was used/);
  }
  assert.match(skill, /If the command was unknown.*once, at session close/);
});

test("watch smoke: no result means no stdout JSON line with outcome under --json", () => {
  for (const text of [skill, fallbackText]) {
    const rule = text.split("\n\n").find((p) => p.startsWith("**Define no result by stdout under `--json`.**"));
    assert.ok(rule);
    assert.match(rule, /stdout has no line that parses as JSON with an `outcome` field/);
    assert.match(rule, /Without `--json`.*plain text.*skill always passes `--json`/);
    assert.match(rule, /The miss.*nonzero exit with no `outcome`.*JSON line/);
    assert.doesNotMatch(text, /returns no JSON result with an `outcome`, as specified|unknown command, usage text, or a nonzero exit/);
  }
});


test("watch command: compatibility documents the optional CLI feature without moving either floor", () => {
  const compat = read("WORKSHOP-COMPATIBILITY.md");
  const release = compat.slice(compat.indexOf("Plugin 0.7.0"), compat.indexOf("The following 0.6.1 notes"));
  assert.match(release, /CLI 0\.10\.0 when present and falls back\s+below it/);
  assert.match(release, /CLI 0\.8\.1 \/ plugin 0\.5\.8/);
  assert.match(release, /no JSON result with\s+an `outcome`/);
  assert.match(release, /not\s+the paid runtime's `update_required` path/);
  assert.match(read("README.md"), /Plugin 0\.7\.0 uses `altitude watch` from CLI 0\.10\.0/);
});
