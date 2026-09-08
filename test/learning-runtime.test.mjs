import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * Versioned paid lesson execution (plugin 0.5.7 + CLI 0.8.1). Every rule below
 * is a sentence an agent executes at runtime, so each one is pinned here the
 * way concept-roles.test.mjs and sandbox-reach.test.mjs pin theirs — a
 * paraphrase that drops the discriminator silently restores the failure mode.
 *
 * The load-bearing distinction: a bound lesson refuses to run on a client
 * below the floor, but an unreachable read produces the SAME absent
 * `learning_runtime` on a current client. The envelope never carries a client
 * version, so absence alone can never be read as "your tools are old" — a
 * sandboxed Codex learner on 0.8.1 would be told to update something that is
 * already current.
 */
const ENTRY_POINTS = ['skills/begin/SKILL.md', 'skills/next-lesson/SKILL.md'];
const PAID = 'skills/next-lesson/references/paid-mode.md';

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

test('paid executor makes versioned server instructions authoritative over hands-on defaults', () => {
  const paid = read(PAID);
  assert.match(paid, /current_task\.learning_requirements/);
  assert.match(paid, /override.*hands-on/s);
  assert.match(paid, /--plan-revision/);
  assert.match(paid, /never.*implementation.*(?:credit|competence)/i);
  assert.match(paid, /learning_runtime/);
  assert.match(paid, /--answer.*verbatim/);
  assert.match(paid, /--question.*exact.*question/);
});
test('entry points protect bound journeys from an offline downgrade', () => {
  for (const skill of ENTRY_POINTS) {
    const text = read(skill);
    assert.match(text, /Bound-journey runtime precedence/);
    assert.match(text, /update_required/);
    assert.match(text, /never.*(?:fall back|downgrade).*free/i);
  }
});
test('free reference retains its standalone evidence method', () => {
  const free = read('skills/next-lesson/references/free-mode.md');
  assert.match(free, /knowledge-graph\.md/);
  assert.doesNotMatch(free, /decide_inspect_verify|learning_runtime/);
});

test('every surface that runs a bound lesson names the supported-client floor', () => {
  // The floor is what makes the refusal legible instead of a stall: a learner
  // told "requirements could not be read" has nothing to act on.
  for (const skill of ENTRY_POINTS) {
    const text = read(skill);
    assert.match(text, /CLI 0\.8\.1 or later/, `${skill} does not name the CLI floor`);
    assert.match(text, /0\.5\.7 or later/, `${skill} does not name the plugin floor`);
  }
  assert.match(read(PAID), /CLI 0\.8\.1 or later with plugin 0\.5\.7 or later/);
});

test('a bound project is recognized from disk before any free-mode degrade', () => {
  // When the CLI itself fails there is no envelope to read `binding` from, so
  // the only way to know this is a paid project is the `.altitude` file.
  for (const skill of ENTRY_POINTS) {
    const text = read(skill);
    const rules = text
      .split('\n')
      .filter((line) => /free mode/i.test(line) && /missing command, nonzero exit/.test(line));
    assert.equal(rules.length > 0, true, `${skill} lost its CLI-error rule`);
    for (const rule of rules) {
      assert.match(rule, /`\.altitude`/, `${skill} degrades to free mode without checking for a binding: ${rule}`);
    }
  }
});

test('absence of a runtime is never reported to the learner as an out-of-date client', () => {
  // The whole point of the discriminator. A blocked or offline read carries no
  // version signal at all, so the update copy must not fire there.
  for (const skill of ENTRY_POINTS) {
    const text = read(skill);
    assert.match(text, /\*\*Version evidence\*\*/, `${skill} never names what counts as version evidence`);
    assert.match(text, /\*\*Reach failure\*\*/, `${skill} never names the reach-failure branch`);
    assert.match(
      text,
      /absence alone is never version evidence/,
      `${skill} still lets a missing field imply an old client`,
    );
    assert.match(
      text,
      /says nothing about their (?:client )?version/,
      `${skill} must say a reach failure proves nothing about the client version`,
    );
  }
  const paid = read(PAID);
  assert.match(paid, /version evidence/);
  assert.match(paid, /reach failure/);
});

test("begin's reach exits never route a bound project into the free method", () => {
  const begin = read('skills/begin/SKILL.md');
  const route = sliceBetween(begin, '## Step 1 — Find their route', '## Step 2 — Protect existing work');

  const offline = route.split('\n').find((line) => line.includes('`reason: "offline"`'));
  assert.ok(offline, 'the offline exit moved or vanished');
  assert.match(offline, /`\.altitude`/, 'the offline exit offers a free route without checking for a binding');
  assert.match(offline, /do not continue today in free mode/i);

  const older = route.split('\n').find((line) => line.includes('with no `reason`'));
  assert.ok(older, 'the older-CLI exit moved or vanished');
  assert.match(older, /`altitude update`/);
  assert.match(older, /`\.altitude`/, 'the older-CLI exit keeps the free route open for a bound project');
});

test('the session reference is written for the shell the learner is actually in', () => {
  // `$CLAUDE_CODE_SESSION_ID` is bash syntax. Pasted into PowerShell it expands
  // to nothing, the CLI resolves the session itself, and the event attributes to
  // whichever concurrent session it picks — the borrowed marker the flag exists
  // to prevent.
  for (const path of [...ENTRY_POINTS, PAID]) {
    const text = read(path);
    assert.match(text, /\$env:CLAUDE_CODE_SESSION_ID/, `${path} never gives the PowerShell form`);
    assert.match(text, /%CLAUDE_CODE_SESSION_ID%/, `${path} never gives the cmd form`);
  }
});

test('both emit templates carry the retained task and revision, and single-quote learner text', () => {
  const paid = read(PAID);
  const quiz = paid.match(/altitude emit quiz-moment[^`]*/);
  const completed = paid.match(/altitude emit task-completed[^`]*/);
  assert.ok(quiz && completed, 'an emit template moved or vanished');

  for (const [name, template] of [['quiz-moment', quiz[0]], ['task-completed', completed[0]]]) {
    assert.match(template, /--task /, `${name} drops the retained task id`);
    assert.match(template, /--plan-revision /, `${name} drops the retained plan revision`);
  }
  // Double quotes still expand $(...), backticks and $VAR in bash and zsh, and
  // the answer is required to be the learner's message verbatim.
  assert.match(quiz[0], /--question '/);
  assert.match(quiz[0], /--answer '/);
  assert.doesNotMatch(quiz[0], /--question "/);
  assert.doesNotMatch(quiz[0], /--answer "/);
  assert.match(paid, /must never be passed in double quotes/);
});

test('a rejected flag is an update prompt — never a bare retry, never a false sync', () => {
  const paid = read(PAID);
  assert.match(paid, /rather than re-running the command without the flag/);
  assert.match(paid, /never drop it to get a rejected command to succeed/);
  assert.match(paid, /never call a rejected emit recorded, queued, or synced/);
  assert.match(paid, /never report a failed emit as queued or synced/);
  assert.match(read('skills/begin/SKILL.md'), /Do not re-run a rejected command with older flags/);
});

test('the compatibility doc sequences the notice window ahead of the plugin-side floor', () => {
  // The doc is hard-wrapped prose, so assert against it unwrapped: a sentence
  // must not become unpinned because a word moved to the next line.
  const doc = read('WORKSHOP-COMPATIBILITY.md').replace(/\s+/g, ' ');

  // The floor lives in the skill markdown, so shipping the plugin IS turning
  // enforcement on for every install that auto-updates.
  assert.match(doc, /publishing the plugin is itself an enforcement step/i);
  assert.match(doc, /notice window/);
  assert.ok(
    doc.indexOf('notice window') < doc.indexOf('server-side enforcement'),
    'the notice window must be documented before server-side enforcement',
  );
  // Honest limitation: the live sessions predate the current templates.
  assert.match(doc, /70d6d6a/);
  assert.match(doc, /unexercised by a real agent session/);
});
