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

test('a runtime that was read and says update_required stays the server message\'s to deliver', () => {
  // Two owners for one state is how the server's wording gets replaced by the
  // agent's. `update_required` means the runtime WAS read and said what to do,
  // so it is not a "no usable runtime context" branch at all.
  for (const skill of ENTRY_POINTS) {
    const text = read(skill);
    const bullet = text.split('\n').find((line) => line.includes('**Version evidence**'));
    assert.ok(bullet, `${skill} lost its version-evidence branch`);
    assert.match(bullet, /is not this branch/, `${skill} still lists update_required as version evidence`);
    assert.match(
      text,
      /server-authored `update_message` always outranks/,
      `${skill} does not give the server's message precedence`,
    );
    assert.match(text, /relay the envelope's server-authored `update_message` verbatim when it carried one/);
  }
  const paid = read(PAID);
  assert.doesNotMatch(paid, /a status of `update_required`/, 'paid-mode still files update_required as version evidence');
  assert.match(paid, /outranks/);
});

test('a cached copy with no runtime gets its own exit, not a branch that does not exist', () => {
  // `"cache"` + `network_blocked` is the NORMAL path in a sandboxed agent, and
  // Step 1 has no `"cache"` reason-exit to delegate to. A copy warmed before
  // the CLI upgrade carries no runtime on a perfectly current client.
  for (const skill of ENTRY_POINTS) {
    const text = read(skill);
    assert.match(text, /\*\*Stale copy\*\*/, `${skill} has no stale-copy branch`);
    assert.match(text, /predates what this lesson needs/, `${skill} never says why the copy is unusable`);
    assert.match(
      text,
      /Never re-read without `--session`/,
      `${skill} lets the refresh fall back to an unscoped read`,
    );
    const reach = text.split('\n').find((line) => line.includes('**Reach failure**'));
    assert.ok(reach, `${skill} lost its reach-failure branch`);
    assert.doesNotMatch(reach, /"cache"/, `${skill} still routes a cached answer through the reach exit`);
  }
  assert.match(read(PAID), /stale copy/i);
});

test('no host and no shell may borrow another session marker to satisfy the floor', () => {
  // Letting the CLI resolve the session is the borrowed-marker case --session
  // exists to close, so it can never be the fallback for a bound lesson.
  for (const path of [...ENTRY_POINTS, PAID]) {
    const text = read(path);
    assert.doesNotMatch(text, /drop(?:ping)? the flag/, `${path} still tells the agent to read unscoped`);
    assert.doesNotMatch(text, /omit the flag/, `${path} still tells the agent to read unscoped`);
    assert.match(text, /host that exposes no session ID/, `${path} never says what a host without one gets`);
    assert.match(
      text,
      /bound journey waits|bound lesson pauses/,
      `${path} does not pause bound execution when the session is unidentifiable`,
    );
  }
});

test('the compatibility doc records where session affinity holds and what closes the gap', () => {
  const doc = read('WORKSHOP-COMPATIBILITY.md').replace(/\s+/g, ' ');
  assert.match(doc, /rests on the host exposing a real session ID/);
  assert.match(doc, /bound journeys require a session-ID-exposing host/);
  // The fix lives in the CLI, not here; name it rather than inventing a command.
  assert.match(doc, /separate monorepo/);
});

test('no dictated task read is left unscoped, in any voice', () => {
  // Passive permission is still permission: the round-4 guard only caught the
  // active "drop the flag" and missed "flag dropped", so four command sites
  // survived the absolute they contradict.
  for (const path of [...ENTRY_POINTS, PAID]) {
    const text = read(path);
    assert.doesNotMatch(
      text,
      /(?:re-?run|run|running)\s+`altitude task --json`/i,
      `${path} still dictates a bare task read that another session's marker can answer`,
    );
    assert.doesNotMatch(text, /flag dropped/i, `${path} passively permits an unscoped read`);
    assert.doesNotMatch(text, /drop(?:ping)? the flag/i, `${path} permits an unscoped read`);
    assert.doesNotMatch(text, /omit(?:ting)? the flag/i, `${path} permits an unscoped read`);
  }
});

test("begin's post-bind re-read is scoped and defers to the stale-copy branch", () => {
  const begin = read('skills/begin/SKILL.md');
  const beat = begin.split('\n').find((line) => line.includes('Re-run the Step 1 read'));
  assert.ok(beat, 'begin lost its post-bind re-read beat');
  assert.match(beat, /never unscoped/, 'the post-bind re-read still allows an unscoped call');
  assert.doesNotMatch(
    beat,
    /a `"cache"` answer here is a complete one/,
    'a cached copy with no runtime is exactly what the stale-copy branch refuses to call complete',
  );
  assert.match(beat, /stale-copy/, 'the post-bind re-read never defers to the stale-copy branch');
});

test("a cache-warming run in the learner's own terminal carries this session's literal ID", () => {
  // `$CLAUDE_CODE_SESSION_ID` is the agent's variable, not theirs: dictated
  // into their shell it expands to nothing and the read goes out unscoped.
  for (const skill of ENTRY_POINTS) {
    const text = read(skill);
    assert.match(
      text,
      /--session '<this session's ID>'/,
      `${skill} never dictates the learner-terminal read with a literal, quoted ID`,
    );
    assert.match(text, /literal ID/, `${skill} does not say to substitute the literal ID`);
    assert.match(
      text,
      /is not set in their (?:own )?shell/,
      `${skill} does not say why the variable form cannot be pasted`,
    );
  }
  const stale = read('skills/next-lesson/SKILL.md')
    .split('\n')
    .find((line) => line.includes('**Stale copy**'));
  assert.doesNotMatch(
    stale,
    /the same session-scoped read in their own terminal/,
    'the stale-copy refresh still dictates a command the learner cannot run',
  );
});

test('both supported hosts name a real session marker, Codex included', () => {
  for (const path of [...ENTRY_POINTS, PAID]) {
    assert.match(read(path), /CODEX_THREAD_ID/, `${path} never names the Codex session marker`);
  }
  const doc = read('WORKSHOP-COMPATIBILITY.md').replace(/\s+/g, ' ');
  assert.match(doc, /CODEX_THREAD_ID/);
  // The claim is evidenced by the mapping this repo actually ships.
  assert.match(doc, /codex-field-mapping\.json/);
  assert.match(doc, /release prerequisite/);
  assert.match(read('README.md'), /CODEX_THREAD_ID/, 'Codex learners never learn this at onboarding');
});

test('the Codex marker rests on the probe that observed it, not on the hook mapping', () => {
  // hooks/codex-field-mapping.json maps a stdin payload field. It shows Codex
  // sends hooks a `session_id`; it never names an environment variable and
  // cannot establish that the two carry the same value. Only the probe can.
  const doc = read('WORKSHOP-COMPATIBILITY.md').replace(/\s+/g, ' ');
  assert.match(doc, /codex-cli 0\.153\.4/, 'the doc does not say which Codex build was observed');
  assert.match(doc, /printenv CODEX_THREAD_ID/, 'the doc does not say how the variable was read');
  assert.match(doc, /01a07eab-7516-7d70-aeb6-24f7e41c0ae2/, 'the observed matching ID is not recorded');
  assert.doesNotMatch(
    doc,
    /per the mapping this plugin ships/,
    'the mapping is still cited as proof of a variable it does not contain',
  );
  // One build, one probe, and no paid lesson: say so where the claim is made.
  assert.match(doc, /not a claim about every Codex version/i);
  assert.match(doc, /paid-lesson/);
  assert.match(read('README.md'), /0\.153\.4/, 'README states the capability with no observed-version hedge');
});

test('every host session variable carries its three shell forms', () => {
  // The round-2 PowerShell fix, reopened for the host added in round 5: an
  // agent given only the Claude Code variable has to guess both the name and
  // the syntax, and both guesses fail the same way — an empty expansion.
  for (const path of [...ENTRY_POINTS, PAID]) {
    const text = read(path);
    for (const form of [
      /\$env:CLAUDE_CODE_SESSION_ID/,
      /%CLAUDE_CODE_SESSION_ID%/,
      /\$env:CODEX_THREAD_ID/,
      /%CODEX_THREAD_ID%/,
    ]) {
      assert.match(text, form, `${path} is missing a per-shell session form: ${form}`);
    }
  }
});

test('command templates carry the resolved literal ID, not one host\'s variable', () => {
  for (const path of [...ENTRY_POINTS, PAID]) {
    assert.doesNotMatch(
      read(path),
      /--session "\$CLAUDE_CODE_SESSION_ID"/,
      `${path} hardcodes the Claude Code variable into a template a Codex agent also runs`,
    );
  }
  const paid = read(PAID);
  for (const name of ['quiz-moment', 'task-completed']) {
    const template = paid.match(new RegExp(`altitude emit ${name}[^\`]*`));
    assert.ok(template, `the ${name} template moved or vanished`);
    assert.match(template[0], /--session '<this session's ID>'/, `${name} does not pass a resolved ID`);
  }
  assert.doesNotMatch(
    paid,
    /so the two always agree/,
    'the hook/variable agreement is asserted unqualified for every host',
  );
});

test('the compatibility doc states the CLI contract for a refresh run outside the plugin', () => {
  // The stale-copy refresh is a scoped read from a shell with no plugin in it.
  // Whether that leaves the session's marker alone is CLI behavior this repo
  // cannot enforce, so it is recorded as an expectation on the monorepo PR.
  const doc = read('WORKSHOP-COMPATIBILITY.md').replace(/\s+/g, ' ');
  assert.match(doc, /must not create, replace, or clear/);
  assert.match(doc, /re-read under the same session/i);
});
