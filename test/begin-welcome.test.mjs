import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * Begin ends with a welcome, and lessons run only in the journey folder
 * (2026-09-28). A learner started Codex with `~/Projects` as its folder,
 * `/altitude:begin` created and bound `~/Projects/stitch`, then rolled straight
 * into the first lesson from the parent chat. The hooks reported the parent
 * folder, so session capture never attached to the project and every quiz save
 * was refused. Begin now stops after a tutor-authored welcome and tells the
 * learner how to reopen the journey folder in its own chat; next-lesson pauses
 * on the CLI's `outside_project` runtime status instead of teaching.
 */

const BEGIN = 'skills/begin/SKILL.md';
const NEXT = 'skills/next-lesson/SKILL.md';
const PAID = 'skills/next-lesson/references/paid-mode.md';

function section(text, start, end) {
  const from = text.indexOf(start);
  const to = end ? text.indexOf(end, from + start.length) : text.length;
  assert.ok(from !== -1 && to > from, `the "${start}" section moved or vanished`);
  return text.slice(from, to);
}

const REOPEN_START = '<!-- reopen-steps:start -->';
const REOPEN_END = '<!-- reopen-steps:end -->';
const reopenBlock = (text, name) => {
  const block = section(text, REOPEN_START, REOPEN_END);
  assert.ok(block.length > REOPEN_START.length, `${name} lost its reopen steps`);
  return block;
};

test('begin never rolls from a new journey into the first lesson', () => {
  const begin = read(BEGIN);
  assert.doesNotMatch(begin, /handoff should feel continuous/);
  assert.doesNotMatch(begin, /if their host requires reopening/);
  const step5 = section(begin, '## Step 5', '## Already bound');
  assert.doesNotMatch(step5, /continue directly/i, 'Step 5 still continues into the lesson');
  assert.match(step5, /Do not start the first task/);
  assert.match(step5, /Begin ends here/);
});

test("begin's welcome introduces the tutor and walks through this learner's journey", () => {
  const step5 = section(read(BEGIN), '## Step 5', '## Already bound');
  assert.match(step5, /introduce yourself as their tutor/i);
  assert.match(step5, /they write the code/i);
  for (const field of ['`journey.title`', '`journey.summary`', '`journey.sections[]`']) {
    assert.match(step5, new RegExp(field.replace(/[.[\]]/g, '\\$&')), `the welcome no longer draws on ${field}`);
  }
  assert.match(step5, /would fit any journey/, 'the welcome lost its no-generic-filler rule');
  assert.match(step5, /not a lecture/);
  assert.match(step5, /`learning_requirements`/, 'the welcome must say server requirements stay private');
  assert.match(step5, /raw JSON/);
  assert.match(step5, /no understanding check/i);
});

test('begin names the same-chat next-lesson invocation for every host, Copilot included', () => {
  const begin = read(BEGIN);
  assert.match(begin, /type next lesson in this same chat[^\n]*`\/next-lesson` in Cursor and GitHub Copilot/);
});

test('the folder check reads the chat root and the CLI status, never the shell directory', () => {
  const step5 = section(read(BEGIN), '## Step 5', '## Already bound');
  assert.match(step5, /`binding\.project_root`/);
  assert.match(step5, /`"outside_project"`/);
  assert.match(step5, /not wherever your shell has `cd`/);
  assert.match(step5, /cannot tell[^\n]*treat it as not the journey folder/);
  assert.match(step5, /same chat/);
});

test('already bound: an unstarted journey still gets its welcome, a journey under way checks the folder first', () => {
  const bound = section(read(BEGIN), '## Already bound');
  assert.match(bound, /`completed`/);
  assert.match(bound, /Step 5 in full/);
  assert.match(bound, /folder check/);
  assert.match(bound, /only when the folder check passes/);
  assert.match(bound, /never start the lesson from this chat/i);
});

test('begin and next-lesson carry the same host-specific reopen steps', () => {
  const begin = reopenBlock(read(BEGIN), BEGIN);
  const next = reopenBlock(read(NEXT), NEXT);
  assert.equal(begin, next, 'the two copies of the reopen steps must stay identical');
  for (const expected of [
    /`cd <journey folder>`[^\n]*`claude`/,
    /`cd <journey folder>`[^\n]*`codex`/,
    /File > Open Folder/,
    /VS Code/,
    /Cursor/,
    /GitHub Copilot/,
    /`cd <journey folder>`[^\n]*`copilot`/,
    /`\/altitude:next-lesson`/,
    /`\$next-lesson`/,
    /`\/next-lesson`/,
    /new chat/,
    /only works when the chat is opened in the project folder/,
  ]) {
    assert.match(begin, expected);
  }
  assert.doesNotMatch(begin, /—/, 'learner-facing reopen steps use no em-dashes');
});

test('outside_project pauses the lesson in every entry point and never falls back to free mode', () => {
  for (const path of [BEGIN, NEXT, PAID]) {
    const text = read(path);
    const rule = text.split('\n').find((line) => line.includes('`learning_runtime.status` is `outside_project`'));
    assert.ok(rule, `${path} does not route the outside_project status`);
    assert.match(rule, /`recovery_message`/, `${path} does not relay the CLI's recovery message`);
    assert.match(rule, /never[^\n]*free mode/i, `${path} could downgrade a wrong-folder lesson to free mode`);
    assert.match(rule, /emit/, `${path} does not forbid evidence from the wrong folder`);
  }
  const next = read(NEXT);
  const rule = next.split('\n').find((line) => line.includes('`learning_runtime.status` is `outside_project`'));
  assert.match(rule, /reopen steps/);
  assert.match(rule, /older CLI/);
});

test("begin's post-bind re-read treats outside_project as the expected state, not a failure", () => {
  const begin = read(BEGIN);
  const beat = begin.split('\n').find((line) => line.includes('Re-run the Step 1 read'));
  assert.match(beat, /`"outside_project"`/);
  assert.match(beat, /Step 5/);
});

test('begin no longer claims every route ends in next-lesson behavior', () => {
  const begin = read(BEGIN);
  assert.doesNotMatch(begin, /Every route through this skill ends in `\/altitude:next-lesson` behavior/);
  assert.doesNotMatch(begin, /when continuing directly into next-lesson/);
});

test('the README describes begin as ending in a welcome', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /rolls into the first task/);
  assert.doesNotMatch(readme, /straight into the first server-planned task/);
});

test('the compatibility notes record the outside_project status', () => {
  assert.match(read('WORKSHOP-COMPATIBILITY.md'), /outside_project/);
});

/**
 * Codex acceptance follow-ups (2026-09-28). A real `codex exec` run gave the
 * vague "open that folder as the project" instead of Codex CLI steps because
 * the tutor could not tell which Codex surface it was in. And the CLI now also
 * reports `outside_project` from a PARENT folder of a linked project, where
 * `binding` is null because the chat's own folder is not linked: that must
 * never read as "no binding, so free mode" or "no binding, so bind a new one".
 */

test('the reopen steps cover every surface of the host when the tutor cannot tell which one it is in', () => {
  for (const path of [BEGIN, NEXT]) {
    const block = reopenBlock(read(path), path);
    assert.match(block, /only the steps for the host they are actually in/, `${path} lost the only-this-host rule`);
    assert.match(block, /cannot tell which surface/i, `${path} has no rule for an unknown surface`);
    assert.match(block, /each surface of that host/i, `${path} does not give each surface's steps`);
    assert.match(block, /Codex CLI[^\n]*Codex (IDE )?extension/, `${path} does not name the Codex surfaces`);
    assert.match(block, /never a vague/i, `${path} still allows a generic reopen line`);
    assert.match(block, /never[^\n]*another host/i, `${path} could list other hosts' steps`);
  }
});

const outsideRule = (path) =>
  read(path).split('\n').find((line) => line.includes('`learning_runtime.status` is `outside_project`'));

test('outside_project names the folder through recovery_message even when binding is null, and never searches subfolders', () => {
  for (const path of [BEGIN, NEXT, PAID]) {
    const rule = outsideRule(path);
    assert.match(rule, /`binding` (may be|is) null/, `${path} assumes a binding comes with outside_project`);
    assert.match(rule, /parent folder/, `${path} does not cover the parent-folder case`);
    assert.match(rule, /`recovery_message`[^\n]*source of the folder path|folder path[^\n]*`recovery_message`/, `${path} does not take the folder from recovery_message`);
    assert.match(rule, /never search[^\n]*subfolders/i, `${path} could search subfolders for the binding`);
  }
});

test('next-lesson checks outside_project before any binding-null route to free mode', () => {
  const next = read(NEXT);
  const outside = next.indexOf('`learning_runtime.status` is `outside_project`');
  const bindingNull = next.search(/when `binding` is null or names another folder/i);
  assert.ok(outside !== -1 && bindingNull !== -1);
  assert.ok(outside < bindingNull, 'outside_project must be routed before the binding-null route');
  const nullLine = next.split('\n').find((line) => /when `binding` is null or names another folder/i.test(line));
  assert.match(nullLine, /`outside_project`/, 'the binding-null route does not defer to outside_project');
  const freeBullet = next.split('\n').find((line) => line.startsWith('- **Free mode:**'));
  assert.match(freeBullet, /`outside_project`/, 'the free-mode choice does not exclude outside_project');
});

test('paid-mode and free-mode references never route an outside_project read to free mode', () => {
  const paid = read(PAID);
  const outside = paid.indexOf('`learning_runtime.status` is `outside_project`');
  for (const marker of ['`binding` is null', 'free mode']) {
    const at = paid.indexOf(marker);
    if (at !== -1 && at !== paid.indexOf(marker, outside)) assert.ok(outside < at, `paid-mode routes "${marker}" before outside_project`);
  }
  const free = read('skills/next-lesson/references/free-mode.md');
  assert.match(free, /`outside_project`/, 'free-mode does not send an outside_project read back to the pause');
});

test('begin never creates or binds a new folder when the read says outside_project with no binding', () => {
  const rule = outsideRule(BEGIN);
  assert.match(rule, /Already bound/);
  assert.match(rule, /never create a new (journey )?folder/i);
  assert.match(rule, /never run `altitude bind`/i);
  const step5 = section(read(BEGIN), '## Step 5', '## Already bound');
  assert.match(step5, /when `binding` is null[^\n]*`recovery_message`/i, "Step 5's folder check needs the binding");
  const bound = section(read(BEGIN), '## Already bound');
  assert.match(bound, /`outside_project`/, 'Already bound does not take the parent-folder read');
});

test('no skill or note quotes the retired "run next lesson again" recovery wording', () => {
  for (const path of [BEGIN, NEXT, PAID, 'skills/next-lesson/references/free-mode.md', 'WORKSHOP-COMPATIBILITY.md', 'README.md']) {
    assert.doesNotMatch(read(path), /run next lesson again/i, `${path} quotes the old CLI message`);
  }
});
