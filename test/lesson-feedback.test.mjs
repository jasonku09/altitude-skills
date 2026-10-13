import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const skill = readFileSync(new URL('../skills/next-lesson/SKILL.md', import.meta.url), 'utf8');
const paid = readFileSync(new URL('../skills/next-lesson/references/paid-mode.md', import.meta.url), 'utf8');
test('paid lesson close offers optional open feedback after recap, never a performance proposal', () => {
  const close = skill.slice(skill.indexOf('## Step 4 — Close the loop'), skill.indexOf('## Direct knob changes'));
  assert.match(close, /5\. The optional feedback question/);
  assert.match(close, /every paid lesson/);
  assert.match(close, /skip|say nothing/);
  assert.match(close, /question block with an answer box/);
  assert.match(close, /never propose fewer drills from performance/);
  assert.doesNotMatch(close, /method_checkin|hints_heavy|drills_skipped|no_learner_lines|--answer yes|`floor`/);
  assert.match(close, /Direct knob changes/);
});
test('every nonempty answer uses stdin feedback; old CLIs silently skip recording', () => {
  assert.match(paid, /altitude emit lesson-feedback --stdin/);
  assert.match(paid, /verbatim/);
  assert.match(paid, /every non-empty answer/);
  assert.match(paid, /quoted delimiter/);
  assert.match(paid, /unknown.*silently/s);
  assert.ok(paid.includes("--stdin is not supported for emit lesson-feedback"), "CLI 0.13.0 rejects stdin before dispatching the unknown emit");
  assert.doesNotMatch(paid, /teaching-checkin|method_checkin|--observation|--signal/);
});
