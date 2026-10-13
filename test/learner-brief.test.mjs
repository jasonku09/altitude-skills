import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * The server down-syncs `journey.learner_brief` (2026-10-12): a few lines on who
 * the learner is, rendered from their onboarding interview. It is tutor-facing
 * context only. It must never reach `learning/plan.md`, which sits in a repo the
 * learner may push publicly ("tried Python twice and quit" must not land on GitHub).
 */

const PAID = 'skills/next-lesson/references/paid-mode.md';
const BEGIN = 'skills/begin/SKILL.md';

const materialization = (text) => {
  const match = text.match(/^Create `learning\/` if needed and render the [\s\S]*?nondeterministic data in the file\.$/m);
  assert.notEqual(match, null, 'the plan-materialization spec moved or vanished');
  return match[0];
};

test('the paid tutor reads the learner brief by its path under journey, as private context', () => {
  const paid = read(PAID);
  const orient = paid.slice(paid.indexOf('## Step 1'), paid.indexOf('## Step 2'));
  assert.match(orient, /`journey\.learner_brief`/);
  assert.match(orient, /absent or `null`/i, 'an absent brief must mean teaching as usual');
  assert.match(orient, /never recite it/i);
});

test('neither plan renderer writes the learner brief into learning/plan.md', () => {
  for (const path of [PAID, BEGIN]) {
    assert.match(materialization(read(path)), /Never render `learner_brief`/, `${path} may render the learner brief`);
  }
});
