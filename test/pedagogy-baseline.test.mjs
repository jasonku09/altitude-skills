import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Week-1 beta feedback (2026-09-14) and the 2026-09-16 review call with Jon, a
 * learner who churned. Six of seven learners who replied described the same
 * lesson: the tutor wrote about 95% of every file and left trivial `TODO(you)`
 * gaps (a return statement, a catch block, a console.log), used vocabulary it
 * had not taught, answered its own prediction questions, and opened each lesson
 * with a "review" question about a concept no lesson had taught yet, drawn from
 * the current task's own concepts. Jon's words:
 *
 *   Codex teaches by explaining. An actual tutor would spend way more time
 *   diagnosing, then way more time giving you fundamentals, then letting you
 *   do the problems.
 *
 * The redesign (decided 2026-09-17, docs/next-lesson-pedagogy-redesign.md in
 * the monorepo) puts the invariants in the skill and the per-task shape in the
 * server-authored instructions. These tests pin the invariants A..H from the
 * lane card as atomic rules, in the style that held in headless replay for the
 * hint ladder: ONE emphasized instruction per rule, the exact learner-facing
 * line where there is one, the anti-pattern named as the miss, and the old
 * skeleton-with-1-3-gaps wording gone.
 */

const JON =
  "Codex teaches by explaining. An actual tutor would spend way more time diagnosing, then way more time giving you fundamentals, then letting you do the problems.";

const DRILL_ASK = "Another one, or into the project?";

const CHECKIN_OBSERVATION = "You asked for the solution on both fill-ins in the fetch step";

const TEACHING_SET = "altitude teaching set <knob>=<value> --session '<this session's ID>'";

const CHECKIN_EMIT =
  "altitude emit teaching-checkin --session '<this session's ID>' --knob <drills|step_size|check_density> --value <the proposed value> --signal <hints_heavy|drills_skipped|no_learner_lines|impatience|floor> --answer <yes|no> --observation '<your one-line observation>'";

async function readNextLesson() {
  return readFile(join(repoRoot, "skills/next-lesson/SKILL.md"), "utf8");
}

async function readPaidMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/paid-mode.md"), "utf8");
}

async function readFreeMode() {
  return readFile(join(repoRoot, "skills/next-lesson/references/free-mode.md"), "utf8");
}

async function readPrompts() {
  return readFile(join(repoRoot, "PROMPTS.md"), "utf8");
}

async function readReadme() {
  return readFile(join(repoRoot, "README.md"), "utf8");
}

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading);
  assert.ok(start !== -1 && end > start, `the "${startHeading}" … "${endHeading}" span moved or vanished`);
  return contents.slice(start, end);
}

/** Step 3 up to the prior-knowledge move: the teaching arc, step size, predictions, vocabulary. */
function teachingSection(skill) {
  return sliceBetween(skill, "## Step 3 — Execute the task, teaching as you go", "### When prior knowledge surfaces");
}

function closeSection(skill) {
  return sliceBetween(skill, "## Step 4 — Close the loop", "## When they broke something");
}

// ------------------------------------------------------------------ A

test("A: at hands-on every line that exercises a teach concept is typed by the learner", async () => {
  const section = teachingSection(await readNextLesson());

  assert.match(section, /### The learner writes the `teach` lines/, "the rule needs its own heading");
  assert.match(
    section,
    /\*\*At hands-on, every line that exercises a `teach` concept is typed by the learner\.\*\*/,
    "the rule must be one emphasized instruction",
  );
  // The tutor may write untaught structure, but it names it and parks it.
  assert.match(section, /structure the task does not teach/, "untaught structure must be the named exception");
  assert.match(section, /name what you wrote and why in one line each/, "everything the tutor writes is named");
  assert.match(section, /park each such file or block in `learning\/file-map\.md`/, "and parked in the file map");
  // The two sanctioned paths into a teach gap are the ones that already exist.
  assert.match(section, /\*\*You never fill a `teach` gap yourself\.\*\*/, "the no-fill rule must be emphasized");
  assert.match(section, /exactly two ways/, "the sanctioned paths must be counted");
  assert.match(section, /hint ladder's third rung/, "rung 3 is one sanctioned path");
  assert.match(section, /impatience rule/, "the impatience rule is the other");
  assert.match(section, /not a small gap, not a stuck learner, not the clock/, "the tempting exceptions must be named and refused");
  // The named miss: 95% tutor-written, gaps that teach nothing.
  assert.match(section, /95% of every file was tutor-written/, "the 95% measurement must be quoted as the miss");
  assert.match(section, /a return statement, a catch block, and a `console\.log`/, "the trivial gaps must be named");
});

test("A: the skeleton-with-1-to-3-gaps model is gone from the skill", async () => {
  const skill = await readNextLesson();

  assert.doesNotMatch(skill, /Leave 1–3 deliberate gaps/, "the old fill-in count is still there");
  assert.doesNotMatch(skill, /sized to their demonstrated level/, "gap sizing by level is the old model");
  assert.doesNotMatch(skill, /Write the skeleton with its `\/\/ TODO\(you\)` blanks/, "the handover still writes a skeleton with blanks");
  // The marker mechanics survive, because the watch and the ladder ride on them.
  assert.match(skill, /\*\*replace each `TODO\(you\)` line with your code\*\*/);
});

// ------------------------------------------------------------------ B

test("B: a new teach concept is introduced, drilled in a scratch file, then applied", async () => {
  const section = teachingSection(await readNextLesson());

  assert.match(section, /### Introduce, drill, apply/, "the arc needs its own heading");
  assert.match(
    section,
    /\*\*A `teach` concept that is new to the learner is drilled in a scratch file before it touches the project\.\*\*/,
    "the arc must be one emphasized instruction",
  );
  // What "new" means, in terms the tutor can read off the envelope or graph.
  assert.match(section, /no completed task in `journey\.sections\[\]\.tasks\[\]` carries/, "paid mode's definition of new");
  assert.match(section, /graph status is `seed` or missing/, "free mode's definition of new");
  // The three moves, in order.
  const intro = section.indexOf("1. **Introduce**");
  const drill = section.indexOf("2. **Drill**");
  const apply = section.indexOf("3. **Apply**");
  assert.ok(intro !== -1, "the introduce move is missing");
  assert.ok(drill > intro, "drill must follow introduce");
  assert.ok(apply > drill, "apply must follow drill");
  const introText = section.slice(intro, drill);
  const drillText = section.slice(drill, apply);
  assert.match(introText, /minimal example/, "introduce = a minimal example in chat");
  assert.match(introText, /in no project file/, "the example never lands in the project");
  assert.match(drillText, /learning\/scratch\/<concept>\.<ext>/, "the scratch path must be spelled out");
  assert.match(drillText, /predict the output in one line before they run it/, "each drill predicts before running");
  assert.match(drillText, /run it in their own terminal/, "the learner runs the drill");
  assert.match(drillText, /You never write into the scratch file/, "the scratch file is the learner's");
  assert.match(drillText, /the count comes from `drills`/, "the drill count is the knob");
  assert.ok(drillText.includes(DRILL_ASK), "the ask after the drills must be spelled out");
  assert.match(drillText, /`drills` of 0 means skip the drill entirely/, "zero drills means straight to the project");
});

test("B: exercise concepts and previously-taught concepts never get a drill; scratch writes are evidence", async () => {
  const section = teachingSection(await readNextLesson());

  assert.match(section, /\*\*`exercise` concepts never get a drill\*\*/, "the exercise exclusion must be emphasized");
  assert.match(section, /a completed task already carried gets no drill either/, "re-taught concepts skip the drill");
  assert.match(section, /Scratch files are real evidence/, "scratch writes must count");
  assert.match(section, /emit the drill's prediction as a quiz moment tagged with the concept/, "paid mode records the drill");
  assert.match(section, /a correct drill is a correct fill-in/, "free mode records the drill");
  // Jon's sentence, verbatim, as the named miss.
  assert.ok(section.includes(JON), "Jon's sentence must be quoted verbatim");
  assert.match(section, /is the demonstration loop this section replaces/, "the quoted lesson shape must be labelled as the miss");
});

test("B: the three knobs have defaults, and free mode always uses them", async () => {
  const section = teachingSection(await readNextLesson());

  assert.match(section, /`drills`, `step_size`, and `check_density`/, "the three knobs must be named together");
  assert.match(section, /Read them from `teaching_knobs`/, "the envelope field must be named");
  assert.match(
    section,
    /\*\*when the field is absent, and always in free mode, use the defaults: `drills` 2, `step_size` `function`, `check_density` `teach_runs`\.\*\*/,
    "the defaults must be one emphasized sentence covering absence and free mode",
  );
  assert.match(section, /`decide_inspect_verify` only `check_density` applies/, "Intermediate ignores drills and step size");
  assert.match(section, /never change the level/, "knobs never touch the level");
});

// ------------------------------------------------------------------ C

test("C: step size says how much the tutor specifies, never who writes", async () => {
  const section = teachingSection(await readNextLesson());

  assert.match(section, /### Step size/, "step size needs its own heading");
  assert.match(
    section,
    /\*\*`step_size` says how much you specify before the learner writes; it never says who writes\.\*\*/,
    "the rule must be one emphasized instruction",
  );
  const line = section.indexOf("- `line` —");
  const fn = section.indexOf("- `function` (default) —");
  const feature = section.indexOf("- `feature` —");
  assert.ok(line !== -1 && fn > line && feature > fn, "the three grains must be listed in order, function marked default");
  const lineText = section.slice(line, fn);
  const fnText = section.slice(fn, feature);
  const featureText = section.slice(feature, section.indexOf("### Predictions"));
  assert.match(lineText, /what the next line must do/, "line = what the next line must do");
  assert.match(lineText, /the learner writes that one line/, "line = the learner writes it");
  assert.match(fnText, /its inputs, its output, and where it is called/, "function = name, inputs, output, call site");
  assert.match(fnText, /the learner writes the body/, "function = the learner writes the body");
  assert.match(featureText, /observable outcome and the constraints/, "feature = outcome and constraints");
  assert.match(featureText, /the learner designs and writes the whole change/, "feature = the learner designs and writes it");
  // Every grain still hands over through the marker so the watch and ladder apply.
  assert.match(featureText, /single `TODO\(you\)` marker/, "feature must still hand over through a marker");
});

// ------------------------------------------------------------------ D

test("D: a prediction is asked only before a teach run whose outcome the tutor has not stated", async () => {
  const section = teachingSection(await readNextLesson());

  assert.match(section, /### Predictions/, "predictions need their own heading");
  assert.match(
    section,
    /\*\*Ask a prediction only before a run that exercises a `teach` concept and whose outcome you have not already stated in the same message\.\*\*/,
    "the rule must be one emphasized instruction with both conditions",
  );
  assert.match(section, /`every_run`/, "the density knob must be named");
  assert.match(section, /a read-back, not a prediction/, "a stated outcome makes the question a read-back");
  assert.match(section, /One line to answer/, "one line to answer");
  assert.match(section, /\*\*"Not sure" is a valid answer\*\*/, "not sure must be an emphasized valid answer");
  assert.match(section, /move on to the actual result/, "not sure moves on to the real result");
  assert.match(section, /no re-ask, no hint, no lecture/, "not sure earns none of the three");
  assert.match(section, /\*\*Never open a second prediction while one is unanswered\*\*/, "one open prediction at a time");
  assert.match(section, /\*\*never answer a prediction you asked\*\*/, "the tutor never answers its own prediction");
});

test("D: break-it-on-purpose is where the tutor asks a prediction the learner is genuinely unsure of", async () => {
  const section = teachingSection(await readNextLesson());
  const start = section.indexOf("**Break it on purpose**");
  assert.ok(start !== -1, "break it on purpose is missing");
  const para = section.slice(start, section.indexOf("\n", start));

  assert.match(para, /genuinely unsure/, "the break must target genuine uncertainty");
  assert.match(para, /cannot read off your message/, "the break's outcome must not be in the message");
  assert.match(para, /Never make an `exercise` concept the target of this check/, "exercise concepts stay off limits");
});

// ------------------------------------------------------------------ E

test("E: every non-everyday term is glossed on first use; untaught catalog concepts are never built on", async () => {
  const section = teachingSection(await readNextLesson());

  assert.match(section, /### Vocabulary/, "vocabulary needs its own heading");
  assert.match(
    section,
    /\*\*Any term outside everyday English gets a one-clause gloss the first time it appears in the lesson\*\*/,
    "the gloss rule must be one emphasized instruction",
  );
  assert.match(section, /whether or not it is a catalog concept/, "catalog membership does not exempt a term");
  assert.match(section, /the lock file/, "the lock file, Jon's undefined term, must be the example");
  assert.match(section, /never a definitions block/, "a gloss rides in the sentence, not a glossary");
  assert.match(
    section,
    /\*\*A catalog concept that is neither in this task nor in its `exercise` set is never built on\*\*/,
    "the no-build rule must be one emphasized instruction",
  );
  assert.match(section, /say it comes later in the journey, and move on/, "gloss, defer, move on");
  assert.match(section, /dictate the minimum with its gloss/, "the escape hatch dictates the minimum");
  assert.match(section, /park it in the file map/, "and parks the concept");
});

// ------------------------------------------------------------------ F

test("F: the review question comes only from due_review in paid mode; nothing due means no question", async () => {
  const skill = await readNextLesson();
  const step2 = sliceBetween(skill, "## Step 2 — Review one due concept", "## Step 3 — Execute the task, teaching as you go");

  assert.match(
    step2,
    /\*\*The review question comes only from what the learner has already learned, never from this task's own concepts\.\*\*/,
    "the source rule must be one emphasized instruction",
  );
  assert.match(step2, /`current_task\.due_review`/, "the envelope field must be named");
  assert.match(step2, /`evidence_reminder`/, "the reminder is what the situated question is written from");
  assert.match(step2, /\*\*No `due_review` means no review question\*\*/, "absence must be emphasized as no question");
  assert.match(step2, /not an invitation to pick a concept from the current task/, "absence must not fall back to the task");
  assert.match(step2, /union types/, "the untaught-review miss must be named");
  // The old paid path is gone.
  assert.doesNotMatch(skill, /paid mode asks against the server journey's `teach` concepts/, "the old Step 2 still draws from the task");

  const paid = await readPaidMode();
  assert.match(paid, /\*\*The review question comes only from `current_task\.due_review`\.\*\*/, "paid mode must state the sole source");
  assert.match(paid, /--concepts <due_review\.concept_id>/, "the quiz moment must be tagged with the due concept only");
  assert.match(paid, /\*\*When `due_review` is absent, ask no review question at all\*\*/, "absence must be emphasized in paid mode too");
  assert.match(paid, /never pick one from the current task's `concepts`/, "the task's own concepts are off limits");
  assert.doesNotMatch(
    paid,
    /A review question may target only a `teach` concept/,
    "the PR #20 line that restricted the review to the task's teach concepts must be gone",
  );
  assert.doesNotMatch(
    paid,
    /ask at most one relevant review question before starting when the task supplies enough context/,
    "the old task-context review path must be gone",
  );

  // Free mode keeps its graph scan, and says the task's own concepts are not review material.
  const free = await readFreeMode();
  assert.match(free, /Never pick a review concept from today's task's own concepts/, "free mode must exclude the task's concepts too");
});

// ------------------------------------------------------------------ G

test("G: the method check-in is asked at the close, after the recap, only when the envelope says so", async () => {
  const close = closeSection(await readNextLesson());

  assert.match(
    close,
    /\*\*The method check-in comes after the recap, only when the envelope says so\.\*\*/,
    "the check-in rule must be one emphasized instruction",
  );
  assert.match(close, /`current_task\.method_checkin`/, "the envelope field must be named");
  assert.match(close, /`required`, always ask/, "required means always");
  assert.match(close, /`allowed`, ask only when you observed/, "allowed means only on an observed signal");
  assert.match(close, /three or more hint rungs/, "signal: hints heavy");
  assert.match(close, /drills declined twice/, "signal: drills skipped");
  assert.match(close, /zero learner-written lines/, "signal: no learner lines");
  assert.match(close, /the impatience rule invoked/, "signal: impatience");
  assert.match(close, /\*\*When the field is absent, never ask\*\*/, "absence must be emphasized as never");
  assert.match(close, /\*\*One check-in per session, full stop\*\*/, "the session ceiling must be emphasized");
  assert.match(close, /skip every later one in the same conversation/, "the ceiling holds across lessons in one conversation");
  // The form.
  assert.match(close, /one concrete observation from this lesson/, "one observation");
  assert.ok(close.includes(CHECKIN_OBSERVATION), "the example observation must be spelled out");
  assert.match(close, /ONE proposed knob change with its new value/, "one proposal with a value");
  assert.match(close, /yes or no is what gets recorded, never free text/, "the answer is yes/no");
  assert.match(close, /`--answer yes` or `--answer no`/, "the answer flag must be spelled out");
  assert.match(close, /`floor` when a `required` check-in had no observed signal/, "the floor signal must be explained");
  assert.match(close, /\*\*Never write the knob yourself from a check-in\*\*/, "the server applies accepted proposals");
  assert.match(close, /\*\*Never propose a level change\*\*/, "level changes are off limits");
  // The check-in is a real question, so it waits, and it precedes the update lines.
  assert.match(close, /Then wait\./, "the tutor waits for the answer");
  assert.match(close, /before any update line/, "the check-in precedes the update relay");
});

test("G: paid mode carries the exact check-in emit; free mode has no check-in", async () => {
  const paid = await readPaidMode();
  assert.match(paid, /### Method check-in \(paid\)/, "paid mode needs the check-in section");
  assert.ok(paid.includes(CHECKIN_EMIT), "the teaching-checkin emit must be spelled out exactly");
  assert.match(paid, /never run `altitude teaching set` from a check-in/, "the knob is never written from a check-in");
  assert.match(paid, /never claim the setting changed/, "the tutor never claims the knob changed");
  assert.match(paid, /never call a rejected emit recorded/, "a failed emit is not recorded");

  const free = await readFreeMode();
  assert.match(free, /There is no method check-in in free mode/, "free mode must say it has no check-in");
  assert.doesNotMatch(free, /teaching-checkin|method_checkin/, "free mode must not carry the check-in mechanics");
});

// ------------------------------------------------------------------ H

test("H: a plain-words request to change how they are taught maps to one knob and is set the same turn", async () => {
  const skill = await readNextLesson();
  const section = sliceBetween(skill, "## Direct knob changes", "## Handling impatience");

  assert.match(
    section,
    /\*\*A plain-words request to change how they are taught, made outside a check-in, maps to exactly one knob and is applied the same turn\.\*\*/,
    "the rule must be one emphasized instruction",
  );
  // The mapping, with the two example requests from the lane card.
  assert.match(section, /"stop the drills"/, "stop the drills must be mapped");
  assert.match(section, /`drills=0`/, "to drills=0");
  assert.match(section, /"just tell me what each line should do"/, "line-by-line must be mapped");
  assert.match(section, /`step_size=line`/, "to step_size=line");
  assert.match(section, /`check_density=every_run`/, "every_run must be reachable");
  // The exact command, then a one-line confirmation.
  assert.ok(section.includes(TEACHING_SET), "the teaching set command must be spelled out exactly");
  assert.match(section, /confirm in one line/, "the change is confirmed in one line");
  assert.match(section, /In free mode there is nothing to write/, "free mode applies it for the session only");
  // What is not a knob.
  assert.match(section, /"just write the whole thing" stays under \*\*Handling impatience\*\*/, "impatience stays impatience");
  assert.match(section, /goes through the web settings/, "level changes go through the web");
  assert.match(section, /change no knob for it/, "a level request changes no knob");
});

// ------------------------------------------------------------------ mirrors

test("the copy-paste prompt mirrors the arc in the learner's own voice", async () => {
  const prompts = await readPrompts();

  assert.match(prompts, /learning\/scratch\//, "the prompt must ask for scratch drills");
  assert.match(prompts, /two small exercises/, "two drills, then the ask");
  assert.match(prompts, /I\s+type every line that uses a concept you're teaching me/, "the learner writes the teach lines");
  assert.match(prompts, /never build on a concept you haven't taught me yet/, "the no-build rule");
  assert.match(prompts, /"not\s+sure" is a fine answer/, "not sure is valid");
  assert.match(prompts, /never answer your own prediction question/, "the tutor never answers its own prediction");
  assert.match(prompts, /never about something this\s+task is about to teach/, "review comes from learned material");
  assert.doesNotMatch(prompts, /Leave 1–3 blanks marked "TODO\(you\)"/, "the old 1-3 blanks line is gone");
  // The ladder pins from PR #21 survive.
  assert.match(prompts, /never fill a blank in for me/);
});

test("the README describes the arc and the teaching settings where it describes typing", async () => {
  const readme = await readReadme();

  assert.match(readme, /learning\/scratch\//, "the README must name the scratch folder");
  assert.match(readme, /you write every line of what it's teaching/, "the README must say the learner writes the teach lines");
  assert.match(readme, /check-in/, "the README must mention the check-in");
  assert.match(readme, /drills/, "the README must name the drills setting");
  // The PR #21 fast-forward pins survive.
  assert.match(readme, /a task built entirely from concepts you've marked known opens with an offer/);
  assert.match(readme, /it never just does it/);
});
