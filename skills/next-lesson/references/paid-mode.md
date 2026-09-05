# next-lesson — paid mode

Binding rules for sessions where Step 1 chose **paid mode**. Read this file in full right after choosing the mode, before orienting further. Nothing here repeats SKILL.md — both apply, and the step headings below name where each rule slots into SKILL.md's flow.

## Step 1 — Orient (paid)

Materialize `learning/plan.md` from the bound journey before orienting (the "Paid plan materialization" section below is the rendering spec). Overwriting a previously generated plan is correct and expected. Say nothing about the refresh unless the prior generated file's `← you are here` task differs from the refreshed journey's current task; if it changed underfoot, re-orient plainly before continuing.

While reconciling the file map, keep concept-level depth in the server map and do not create local graph nodes for file-map links. If the current section has no task breakdown yet, never invent or append tasks; the server journey is the plan.

### Partition the task's concepts

Do this privately at the start of every paid-mode lesson. Find the current task in `journey.sections[].tasks[]` by `current_task.id`. Its `concepts` array carries entries shaped `{concept_id, role}`; join those entries to the task's `concept_ids` by ID and partition them into `teach` and `exercise`. Treat a missing entry, missing role, or unknown role as `teach` — an old or malformed envelope must never silently smuggle untaught material past the method.

- **`teach` concepts are lesson content.** Give them the full teaching method in Step 3.
- **`exercise` concepts are load-bearing, but not lesson content.** Use them to complete the task without introducing, scaffolding, predicting, or quizzing them. The role deliberately does not say whether it came from demonstrated mastery or a self-report; never infer or announce which one it was.

Keep this partition for the whole session, including the concept IDs attached to events. A prior-knowledge signal can move a `teach` concept into the session's `exercise` set under the rule in Step 3; only a fresh task envelope can make that accommodation durable in paid mode. Free mode has no envelope roles; Step 3 gives a prior-knowledge signal the same immediate behavior and records the local graph analog.

### Paid plan materialization

Create `learning/` if needed and render the journey to `learning/plan.md`. The output is deterministic: for the same journey object, write the same UTF-8 bytes, use LF line endings, preserve the arrays' supplied order, and end with one newline.

Render exactly this structure:

1. The first line is this byte-exact generated marker:

   `<!-- altitude:generated from your journey — local edits don't sync; park ideas in a lesson or edit on the web -->`
2. Add a blank line, then `# <journey.title>`.
3. If `summary` is non-null and non-empty, add a blank line and its text verbatim.
4. If `build_brief` is non-null and non-empty, add `## Locked decisions` surrounded by blank lines, then append the markdown string verbatim. Do not summarize, reflow, reorder, or reinterpret it.
5. For each section in the supplied order, add a blank line and `## NN · <section.title>`, where `NN` is the section's numeric `position` left-padded to two digits. On the next non-blank line write the section description verbatim when present.
6. Under each section, render its tasks in supplied order. A task whose `status` is `completed` is `- [x] <task.title>`; every other status is `- [ ] <task.title>`. If its `id` equals `current_task.id`, append ` ← you are here`. When a task description is present, put it on the following line, prefixing every description line with two spaces.

Use exactly one blank line between top-level blocks. Apart from the required two-space task-description prefix, preserve server text verbatim. Never put IDs, inferred tasks, timestamps, or other nondeterministic data in the file.

## Step 2 — Review one stale leaf (paid)

In paid mode, do not read, create, or update `learning/knowledge-graph.md`; mastery lives server-side. Keep checks as free recall, use the journey's current task and concept IDs as context, and ask at most one relevant review question before starting when the task supplies enough context to do so honestly. **A review question may target only a `teach` concept — never an `exercise` concept, including one moved into that set for this session.** If there is no honest `teach` target, skip the review. For a quiz outcome that fits the CLI's existing event vocabulary, best-effort run `altitude emit quiz-moment --session "$CLAUDE_CODE_SESSION_ID" --question "<what you asked>" --answer "<what they said>" --verdict <correct|partial|incorrect> --concepts <the current task's concept IDs, comma-separated>` — dropping `--session` only if that variable is empty, and `--concepts` only if the task carried no concept IDs. The concept IDs are the ones `altitude task --json` returned for the current task; pass only the ones the question actually exercised, and never invent an ID. Without them the answer cannot be credited to anything, so a graded quiz with no concepts is a wasted question. Your verdict is an input to server-side grading, not the grade itself. If it errors or needs information you do not have, mention the missed sync briefly and continue. Session capture already records the rest.

## Step 3 — When prior knowledge surfaces (paid)

In paid mode the signal earns one reply carrying both halves, accommodation and routing, together. Accommodation: immediately put the concept in this session's `exercise` set on their word alone — do not wait for the map action, call a mutation endpoint, emit a skip, or claim that their account changed. Routing: in that same reply, suggest they mark the concept known on `app.learnaltitude.com/map`, mention that an optional short quiz there can verify it, and ask them to tell you when they have done it. The halves never travel separately, and the insidious miss is absorbing the signal as a mere style preference: if you catch yourself implementing conventions the learner dictated for material you were about to teach — or closing the session with "you told me you already knew this" — the signal fired, and the reply that honors their conventions had to carry the map suggestion too. At the next lesson, `altitude task --json` is the authority again: if they marked it, the server returns `exercise`; if they did not, it returns `teach` and teaching resumes. The conversation is a grace period, not stored state.

## Step 4 — Close the loop (paid)

Do not create or update the local graph; emit a fitting quiz outcome as described above when possible, and otherwise proceed because session capture is the evidence path.

Leave the generated plan untouched and best-effort run `altitude emit task-completed --session "$CLAUDE_CODE_SESSION_ID" --task <current task id>`. The flags are `--session` and `--task` — not `--session-id`/`--task-id`, which do not exist and fail. Pass the session explicitly so the event attributes to *this* session even when the learner has another agent open; `$CLAUDE_CODE_SESSION_ID` is the id the workshop hooks already report, so the two always agree. If that variable is empty, drop the flag and let the CLI resolve the session itself. Never block the lesson on an emit failure: mention that progress could not sync and move on. Then re-run `altitude task --json` and read its `source` first: only a `"network"` read can show the pointer moved. If it is `"network"` and the response still has a bound, entitled journey, confirm that its `current_task.id` differs from the task just completed (or is null because the journey finished) and re-materialize the plan. If it is `"cache"`, or `"none"` with `reason: "network_blocked"`, this run could not reach Altitude — in a sandboxed agent the emit is queued locally and the read comes from the local copy — so the pointer will still show the task just finished: say in one line that the completion is queued and will sync the next time Altitude is reached, leave the plan as it is, and continue. Never re-run the emit for that, never call it a failure, and never restart the task. If the refresh fails for any other reason, or the pointer has not advanced on a live read, mention that briefly and continue anyway.

## Plan changes (paid)

Never edit the generated plan: explain that local edits do not sync, help them change or reorder the journey on the web, then refresh it next session. If they choose to treat the idea as today's one-task side quest instead, teach and close it like any other unplanned lesson without pretending the server backlog changed.
