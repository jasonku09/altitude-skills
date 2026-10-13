import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/**
 * The lesson page bootstrap (plugin 0.10.0; design docs/web-lesson-experience-design.md
 * in the monorepo, Q6/Q9/Q10/Q16/Q22). Paid lessons can move from the terminal to a
 * local browser page that the CLI serves. The tutor's page instructions ship with the
 * page bundle and `altitude lesson open` prints them, so the skill keeps exactly one
 * bootstrap rule: when the task read says the page is available, run
 * `altitude lesson open` and follow what it prints, which wins over the skill's
 * terminal rules. Its exit codes (CLI lane C1): 0 = opened, follow the printed
 * instructions; 3 = this machine or account can't show the page, use the terminal;
 * 4 = the agent's sandbox blocked the local server (Codex's default sandbox refuses
 * both the write and the 127.0.0.1 listen), escalate once, then the terminal.
 *
 * `lesson_page` rides on `altitude task --json` only from a CLI that declares
 * `page_protocol` to a server that answers it. Older CLIs strip it, so absence
 * means the terminal. Jason's 2026-10-12 completion-acknowledgement decision
 * deliberately changes the terminal fallback too. Pin that reviewed candidate
 * below; its new learner-facing wording still needs approval before merge.
 */

const SKILL = "skills/next-lesson/SKILL.md";
const PAID = "skills/next-lesson/references/paid-mode.md";
const FREE = "skills/next-lesson/references/free-mode.md";

// sha256 excluding the lesson-page bootstrap paragraph.
const SKILL_FEEDBACK_SHA256 = "8a0ad1741fcef25367f2842f57d35b1075dc4b25fa69de092270222f91d786ad";
// sha256 excluding the leading release note and lesson-page bootstrap paragraph.
const PAID_BODY_FEEDBACK_SHA256 = "c23404c7e5ec90305607ce4665b3d37b1ed3e0708b4eec83ec1ae3e558d604d2";

const SKILL_RULE_START = "**The lesson page (paid mode).**";
const PAID_RULE_START = "**The lesson page:**";

/** The paragraph that starts with `start`, through its end (exclusive of the blank line). */
function paragraph(text, start) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `no paragraph starting ${start}`);
  assert.equal(text.indexOf(start, from + 1), -1, `more than one paragraph starting ${start}`);
  const to = text.indexOf("\n\n", from);
  assert.notEqual(to, -1, "the paragraph ends in a blank line");
  return { from, to, text: text.slice(from, to) };
}

/** The file with that paragraph (and the blank line after it) cut out. */
function without(text, start) {
  const { from, to } = paragraph(text, start);
  return text.slice(0, from) + text.slice(to + 2);
}

const skillRule = () => flat(paragraph(read(SKILL), SKILL_RULE_START).text);

test("bootstrap: SKILL.md carries one lesson page rule, in Step 1 after the mode choice", () => {
  const skill = read(SKILL);
  const { from } = paragraph(skill, SKILL_RULE_START);
  assert.ok(from > skill.indexOf("**Before taking another step, read your mode's reference file**"), "after the mode file is read");
  assert.ok(from < skill.indexOf("### Match their shell"), "still inside Step 1's opening");
  assert.ok(from > skill.indexOf("## Step 1 — Orient"), "inside Step 1");
});

test("bootstrap: the rule fires on lesson_page.available and opens the page for this session", () => {
  const rule = skillRule();
  assert.match(rule, /`lesson_page\.available` is `true`/);
  assert.match(rule, /run `altitude lesson open --session '<this session's ID>'`/);
  assert.match(rule, /paid mode/i, "paid only (Q16)");
});

test("bootstrap: exit 0 follows what lesson open prints, and it wins over the skill's terminal rules", () => {
  const rule = skillRule();
  assert.match(rule, /exits 0, follow what it prints/);
  assert.match(rule, /where it differs from this file or your mode file, what it prints wins for the rest of the lesson/);
});

test("bootstrap: exit 3 (and any other failure) is the terminal lesson, said nothing about unless asked", () => {
  const rule = skillRule();
  assert.match(rule, /exits 3, or fails any other way, teach in the terminal exactly as below/);
  assert.match(rule, /say nothing about the page unless the learner asked for it/);
});

test("bootstrap: exit 4 is the sandbox: escalate once, then the terminal", () => {
  const rule = skillRule();
  assert.match(rule, /exits 4, the sandbox blocked the page's local server/);
  assert.match(rule, /run it once more with elevated permissions if this call didn't already have them/);
  assert.match(rule, /if it still can't open, teach in the terminal/);
});

test("bootstrap: Codex asks for escalation up front with a justification and an `altitude lesson` prefix rule", () => {
  const rule = skillRule();
  assert.match(rule, /In Codex, request escalated permissions on that call/);
  assert.match(rule, /one-line justification such as "Altitude's lesson page runs a local server outside the sandbox"/);
  assert.match(rule, /the prefix rule `\["altitude", "lesson"\]`/);
  assert.match(rule, /one approval covers the lesson's later `altitude lesson post` and `altitude lesson wait` calls/);
  // House pattern: the connect skill's Codex escalation.
  assert.match(flat(read("skills/connect/SKILL.md")), /Request escalated permissions for that one command with a one-line justification/);
});

test("bootstrap: an absent or unavailable lesson_page means the terminal, with no per-agent switch", () => {
  const rule = skillRule();
  assert.match(rule, /A `lesson_page` that is absent \(an older CLI or server\) or not `available` means the terminal, as today/);
  // Q9: the server switches agents on; the skill names no agent except for Codex's sandbox.
  for (const agent of ["Claude Code", "Cursor", "Copilot"]) assert.doesNotMatch(rule, new RegExp(agent), agent);
});

test("bootstrap: paid-mode.md's Step 1 points to the rule; free mode never opens the page", () => {
  const paid = read(PAID);
  const { from, text } = paragraph(paid, PAID_RULE_START);
  assert.ok(from > paid.indexOf("## Step 1 — Orient (paid)") && from < paid.indexOf("## Step 2"), "inside paid Step 1");
  assert.equal(text.includes("\n"), false, "one line");
  assert.match(text, /follow SKILL\.md's lesson page rule in Step 1/);
  assert.match(text, /what `altitude lesson open` prints outranks this file wherever they differ/);
  assert.doesNotMatch(read(FREE), /lesson open|lesson_page/, "free mode stays page-free");
});

test("bootstrap: the terminal fallback stays pinned outside the inserted rule (feedback candidate)", () => {
  assert.equal(sha256(without(read(SKILL), SKILL_RULE_START)), SKILL_FEEDBACK_SHA256, "SKILL.md changed outside the rule");
  const paid = read(PAID);
  const body = paid.slice(paid.indexOf("-->\n") + 4);
  assert.equal(sha256(without(body, PAID_RULE_START)), PAID_BODY_FEEDBACK_SHA256, "paid-mode.md changed outside the rule");
});
