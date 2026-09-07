import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('paid executor makes versioned server instructions authoritative over hands-on defaults', () => {
  const paid = read('skills/next-lesson/references/paid-mode.md');
  assert.match(paid, /current_task\.learning_requirements/);
  assert.match(paid, /override.*hands-on/s);
  assert.match(paid, /--plan-revision/);
  assert.match(paid, /never.*implementation.*(?:credit|competence)/i);
  assert.match(paid, /learning_runtime/);
  assert.match(paid, /--answer.*verbatim/);
  assert.match(paid, /--question.*exact.*question/);
});
test('entry points protect bound journeys from an offline downgrade', () => {
  for (const skill of ['begin', 'next-lesson']) {
    const text = read(`skills/${skill}/SKILL.md`);
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
