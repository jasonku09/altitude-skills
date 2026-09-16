import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Week-1 beta feedback (2026-09-14). A learner marked 53 concepts known on the
 * web ("Mark what you already know"). His next task — a branch-and-push
 * workflow — came back with every concept in the `exercise` role, and the tutor
 * still walked him through it by hand, just without the explanations. In his
 * words:
 *
 *   I was still doing basic git walkthrough. I tried setting my known skills,
 *   but this didn't jump forward.
 *
 * "Bounded code delegation" already let the tutor *offer* to write an
 * all-exercise chunk, but the offer was buried mid-task and rarely made. The
 * owner's decision (2026-09-15): on an all-`exercise` task the offer is
 * proactive — one line, at the task's start, then wait. Delegation stays never
 * automatic (PR #16) and a mixed task still gets no offer.
 *
 * The fix is prose, so these tests pin the prose. The PR #16 wording lesson
 * applies: descriptive wording fails in headless replay; what holds is ONE
 * atomic rule (trigger + the line + wait), the anti-pattern quoted verbatim as
 * the named miss, and the "never automatic" guard in the same paragraph so the
 * halves never travel separately.
 */

const RICK =
  "I was still doing basic git walkthrough. I tried setting my known skills, but this didn't jump forward.";

const OFFER_LINE =
  "You've marked everything in this step as known. Want me to do it while you review the diff and write the commit, or do you want to type it yourself?";

async function readNextLesson() {
  return readFile(join(repoRoot, "skills/next-lesson/SKILL.md"), "utf8");
}

async function readPaidMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/paid-mode.md"), "utf8");
}

async function readFreeMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/free-mode.md"), "utf8");
}

/** The "Bounded code delegation" span of Step 3, wherever its heading sits. */
function delegationSection(skill) {
  const start = skill.indexOf("### Bounded code delegation");
  const end = skill.indexOf("**When a `teach` step uses fill-ins, they happen in the file, not the chat.**");
  assert.ok(start !== -1 && end > start, "the bounded-delegation span of Step 3 moved or vanished");
  return skill.slice(start, end);
}

/** The single paragraph that carries the offer line. */
function offerParagraph(section) {
  const paragraphs = section.split(/\n\s*\n/);
  const hits = paragraphs.filter((p) => p.includes(OFFER_LINE));
  assert.equal(hits.length, 1, "the offer line must appear in exactly one paragraph");
  return hits[0];
}

test("the fast-forward offer fires on an all-exercise task, as one atomic rule", async () => {
  const section = delegationSection(await readNextLesson());

  // An atomic heading, in the style that held for the ladder and the expiry
  // question: the rule is one instruction, not a description of a mood.
  assert.match(section, /\*\*The fast-forward offer\.\*\*/, "the offer needs its own atomic heading");
  const para = offerParagraph(section);
  assert.match(
    para,
    /every concept the current task carries is in the `exercise` set/,
    "the trigger must be the whole task, every concept, in the exercise role",
  );
  // Both modes have to know how to evaluate the trigger; the paragraph names
  // the paid-mode read directly and defers free mode to its reference file.
  assert.match(para, /every entry in the task's `concepts` array has role `exercise`/);
  assert.match(para, /free mode: your mode file's analog/);
});

test("the offer line gives the learner two choices: delegate and review, or type it", async () => {
  const para = offerParagraph(delegationSection(await readNextLesson()));

  // The exact line, so the tutor has a shape to reuse rather than a mood to
  // improvise from. Its two halves are load-bearing: "do it while you review
  // the diff and write the commit" keeps the review and the commit with the
  // learner even when the typing moves; "type it yourself" is a real option,
  // not a polite formality.
  assert.ok(para.includes(OFFER_LINE), "the offer line must be spelled out verbatim");
  assert.match(para, /one line of this shape/, "the line must be bound as the whole message");
  assert.match(para, /and then you wait; the learner picks/, "the tutor must wait for the answer");
});

test("the offer is made once per task, at the start, before any code", async () => {
  const para = offerParagraph(delegationSection(await readNextLesson()));

  assert.match(
    para,
    /after Step 1's orientation and Step 2's review question, before any code, any dictated command, any scaffold/,
    "the offer's slot must be pinned: after routing and the review question, before the task's first code",
  );
  assert.match(
    para,
    /\*\*once per task, at the start, only when the task is all-`exercise`\*\*/,
    "the once-at-the-start bound must be stated as one emphasized clause",
  );
  assert.match(para, /never mid-task/, "the offer must never appear mid-task");
});

test("a mixed task gets no offer at all", async () => {
  const section = delegationSection(await readNextLesson());
  const para = offerParagraph(section);

  assert.match(para, /never on a mixed task/, "the mixed-task exclusion must sit in the offer paragraph");
  assert.match(
    para,
    /one `teach` concept anywhere in the task means no offer at all/,
    "a single teach concept must be enough to suppress the offer",
  );
  // The chunk-level rule from PR #16 stays as the permission boundary on what
  // may ever be written; the tutor's own offer is now the task-level one.
  assert.match(section, /One `teach` concept puts the whole chunk back under the normal small-step method/);
  assert.match(
    section,
    /on a mixed task you never volunteer it/,
    "the section must say the tutor never volunteers delegation on a mixed task",
  );
});

test("delegation stays never automatic, in the same paragraph as the offer", async () => {
  const section = delegationSection(await readNextLesson());
  const para = offerParagraph(section);

  // The PR #16 guard, verbatim, kept.
  assert.match(section, /makes delegation \*offerable\*, never automatic/);
  assert.match(section, /the learner asks for it or accepts your offer before you write a line/);
  // And restated inside the offer paragraph itself, so a tutor reading the
  // proactive rule in isolation cannot read "offer" as "do".
  assert.match(para, /Delegation is never automatic/, "the never-automatic guard must ride with the offer");
  assert.match(
    para,
    /until they answer it not a line of the task is yours to write/,
    "the guard must bind writing to the learner's answer, not to the offer having been made",
  );
});

test("Rick's sentence is quoted verbatim as the named miss", async () => {
  const para = offerParagraph(delegationSection(await readNextLesson()));

  // The exact words a learner used; a paraphrase would leave the tutor free to
  // decide its own next walkthrough is different.
  assert.ok(para.includes(RICK), "Rick's sentence must be quoted verbatim");
  assert.match(para, /is the named miss/, "the quoted sentence must be labelled as the miss");
  assert.match(para, /marked 53 concepts known/, "the miss must carry its context: a learner who had marked everything known");
});

test("accept applies the existing bounded-delegation rules unchanged", async () => {
  const section = delegationSection(await readNextLesson());
  const para = offerParagraph(section);

  assert.match(para, /Accept → the rules above apply unchanged/);
  assert.match(para, /diff review before the commit \(code review, not a quiz\)/);
  assert.match(para, /dictate the `git commit` line and leave the message theirs/);
  assert.match(para, /a wave-through earns no quiz credit/);
  // The originals those clauses point at are still there.
  assert.match(section, /you review the diff before we commit, like a teammate's PR/);
  assert.match(section, /Delegation ends at the working tree: the commit stays learner-owned/);
  assert.match(section, /waving the diff through earns no conversational quiz credit/);
});

test("decline means hands-on with no teaching, and no second offer for the rest of the task", async () => {
  const para = offerParagraph(delegationSection(await readNextLesson()));

  assert.match(para, /Decline → hands-on as normal/);
  // The four things an exercise concept never gets, restated on the decline
  // path so "they said no" cannot become "so teach it after all".
  assert.match(para, /no conceptual introduction, no fill-in scaffold, no prediction, no quiz/);
  assert.match(para, /do not offer again for the rest of that task/);
  assert.match(para, /never a second time after a decline/);
});

test("both mode files define the all-known trigger in their own terms", async () => {
  const paid = await readPaidMode();
  const free = await readFreeMode();

  // Paid: the partition already exists; all-known is the case where it leaves
  // teach empty. An empty or missing concepts array is not all-known — it
  // falls back to teach like every other malformed envelope.
  assert.match(paid, /If the partition leaves `teach` empty and `exercise` non-empty, the task is all-known/);
  assert.match(paid, /the fast-forward offer/);
  assert.match(
    paid,
    /A task whose `concepts` array is empty or missing is not all-known/,
    "paid mode must not let an empty concepts array read as all-known",
  );

  // Free: no envelope roles, so the graph decides — `understood` on every
  // concept the task exercises; one seed/introduced/practicing/missing concept
  // makes it mixed. `practicing` is deliberately below the bar: it is the cap
  // on first contact, so counting it would fast-forward past yesterday's
  // lesson, and SKILL.md's Step 3 still hands `practicing` concepts the larger
  // fill-in gaps.
  assert.match(free, /\*\*The fast-forward offer \(free\)\.\*\*/);
  assert.match(free, /every concept it exercises stands at `understood` in `learning\/knowledge-graph\.md`/);
  assert.match(
    free,
    /mixed the moment one of them is `seed`, `introduced`, `practicing`, or missing from the graph/,
  );
  assert.match(free, /\*\*`practicing` is not enough\.\*\*/, "the free-mode bar must exclude practicing explicitly");
});

test("the README names the proactive offer where it describes delegation", async () => {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");

  // README's "Do the typing yourself" bullet is the one place outside the
  // skill that describes delegation; it has to say the offer comes up front
  // and that the tutor never just does it.
  assert.match(readme, /a task built entirely from concepts you've marked known opens with an offer/);
  assert.match(readme, /it never just does it/);
});
