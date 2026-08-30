# Manual live-session test plan: role-aware tutor

This verifies the learner-visible behavior of the `skills/next-lesson` skill (`SKILL.md` plus its `references/` mode files). Run it against a test Altitude account and journey; do not use a learner's real journey because the final steps complete tasks and emit evidence.

## Paid-mode fixture

Prepare a journey whose current task is named **Initialize and automate a repository** and whose description requires these two ordered pieces:

1. Initialize a Git repository and stage `setup.sh`.
2. Write `setup.sh` with one new shell function, then stage it.

The task must carry these concept entries (substitute the fixture's real UUIDs for the labels below):

| Label used below | Concept | Starting role |
|---|---|---|
| `<GIT_ID>` | Git staging | `exercise` |
| `<SHELL_ID>` | Shell functions | `teach` |

Get that state through the product, not by editing an envelope: at `app.learnaltitude.com/map`, mark **Git staging** known, do not take the optional test-out quiz, and leave **Shell functions** unmarked. The task may contain additional concepts only if their role is `exercise`; otherwise they make the delegation checks ambiguous.

In a terminal, create and bind a disposable workshop:

```sh
export SKIP_TUTOR_WORKTREE=<path-to-your-altitude-skills-checkout>
export SKIP_TUTOR_JOURNEY=<test-journey-uuid>
export GIT_ID=<git-staging-concept-uuid>
export SHELL_ID=<shell-functions-concept-uuid>
export SKIP_TUTOR_SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/altitude-skip-tutor.XXXXXX")"
cd "$SKIP_TUTOR_SCRATCH"
altitude bind --journey "$SKIP_TUTOR_JOURNEY"
claude --plugin-dir "$SKIP_TUTOR_WORKTREE"
```

Before chatting, use a second terminal to verify the fixture without pasting the JSON into the agent conversation:

```sh
cd "$SKIP_TUTOR_SCRATCH"
altitude task --json | jq --arg git "$GIT_ID" --arg shell "$SHELL_ID" '
  .current_task.id as $current
  | .journey.sections[].tasks[]
  | select(.id == $current)
  | {title, concepts}
  | select(
      any(.concepts[]; .concept_id == $git and .role == "exercise")
      and any(.concepts[]; .concept_id == $shell and .role == "teach")
      and all(.concepts[]; .concept_id == $shell or .role == "exercise")
    )
'
```

The command must print one task. If it prints nothing, fix the journey/map state before testing.

## 1. Partition by role at lesson start

Send exactly:

> `/altitude:next-lesson`

Expected:

- The tutor privately treats Git staging as `exercise` and Shell functions as `teach` from the first response onward.
- It does not announce either role, guess that Git was skipped rather than mastered, or expose the raw envelope.
- When Shell functions first becomes relevant, it uses the normal small-step teaching method.

Failure examples: an explanation of what Git is before using it; “because you marked Git known”; treating both concepts as already known.

## 2. Exercise-only and mixed steps

When the tutor reaches repository initialization, send:

> `Ready. Let's initialize it.`

Expected for the Git-only step: no conceptual introduction, no `TODO(you)` fill-in, no prediction request, and no quiz. The learner may still be asked to type a command under the hands-on rule.

When it reaches the script function, send:

> `Ready for the function and then staging the file.`

Expected for this mixed step: it explains and scaffolds the Shell function, while using Git staging without explaining or checking Git. One `teach` concept keeps the chunk in the normal method; the tutor must not write the entire mixed chunk itself.

## 3. Quiz guard

After the script works, send:

> `That worked. Keep going.`

Expected: any opportunistic question targets Shell functions only. The tutor never asks a recall, prediction, breakage, or “quick check” question about Git staging and never emits a `quiz-moment` tagged with `<GIT_ID>` merely because Git is convenient to ask about.

Also run a fresh copy of the fixture with every task concept marked known. On `/altitude:next-lesson`, expected: Step 2's opening review is omitted entirely because there is no `teach` target.

## 4. Questions still receive full answers

Send exactly:

> `What exactly does Git's staging area do, and why is it separate from a commit? I want the full explanation.`

Expected: a direct, complete explanation. It must not refuse, shorten the answer because of the role, quiz the learner in return, or use status framing such as “since you skipped this,” “you marked this known,” or “you said you know this.” After answering, it returns to the task without changing durable state.

## 5. Prior-knowledge prompt move and session-only grace period

Reset the fixture so Shell functions is still `teach`, start a new agent session, and send:

> `/altitude:next-lesson`

When Shell functions first comes up, send exactly:

> `I already know shell functions. I've written Bash scripts at work.`

Expected immediately:

- The tutor suggests marking Shell functions known at `app.learnaltitude.com/map`.
- It mentions the optional short verification quiz there and asks the learner to say when the map action is done.
- It treats Shell functions as `exercise` for the rest of this session without waiting for confirmation.
- It does not run an Altitude mutation, emit a skip/mastery claim, say the account changed, or keep advertising the feature.

Do not change the map. Continue with:

> `I haven't opened the map. Let's keep building.`

Expected: the tutor still uses Shell functions without teaching or quizzing for the rest of this session.

End the agent session without completing the task, start `claude --plugin-dir "$SKIP_TUTOR_WORKTREE"` again in the same directory, and send:

> `/altitude:next-lesson`

Expected: the fresh envelope still says `teach`, so normal Shell-function teaching resumes. The previous conversation did not persist a skip.

Repeat once from a reset session using only this unprompted-fluency signal:

> `The function should start with local input="$1", quote every expansion, and return nonzero when the input is empty.`

Expected: the tutor recognizes the fluency signal and makes the same one-time map suggestion and immediate session accommodation. It must not require the exact phrase “I already know this.”

## 6. Struggle fallback, once

Start from the original fixture where Git staging is `exercise`. At the first Git use, send:

> `I'm stuck: I don't understand why git add didn't create a commit, and I can't tell what to do next.`

Expected: once, gently, the tutor offers both applicable doors: a two-minute refresher that changes no state, or un-marking Git staging on the map for durable teaching in a future lesson.

Decline both:

> `Neither. Just tell me exactly what gets us unstuck.`

Expected: it answers and helps normally, without status commentary.

Signal trouble a second time:

> `I'm still confused about staging, but please just help me finish.`

Expected: it helps normally and does not repeat either refresher/un-mark offer during this session.

## 7. Bounded delegation, diff review, and evidence tags

For the all-exercise half of the fixture, send:

> `Please write the Git setup chunk for me.`

Expected: the tutor may offer and, after acceptance, write a bounded chunk because every concept it exercises is `exercise`. Before commit it puts the learner in the reviewer's chair and says the equivalent of: “you review the diff before we commit, like a teammate's PR.” It asks for a diff review, not a recall quiz.

Give a substantive review:

> `I reviewed the diff carefully. Change git add . to git add -- setup.sh so unrelated files are not staged; the rest is correct.`

Expected: the tutor applies or guides the requested correction. If it emits `quiz-moment` credit for this substantive code review, the command includes `--concepts <GIT_ID>`; the `exercise` tag is not dropped or replaced. This event is evidence bookkeeping, not a follow-up quiz.

For the mixed Shell-function-plus-Git chunk, send:

> `Now please write the whole shell function and its Git staging commands for me too.`

Expected: it does not delegate the whole chunk because Shell functions is `teach`. It returns the entire chunk to the normal method, teaches/scaffolds Shell functions, and uses Git without comment.

Repeat the all-exercise write in a reset session, but wave the review through:

> `Looks fine. Commit it.`

Expected: no quiz credit is required, and the tutor does not force a quiz. The normal diff gate still sees the change; any captured/emitted concept tags continue to include `<GIT_ID>`. The tutor keeps the existing rule that the learner writes the commit message and performs learner-owned commands.

## Free-mode analog

Create a second disposable directory with no `.altitude` binding. Add the normal `learning/plan.md`, `learning/file-map.md`, and `learning/knowledge-graph.md`; seed a **Shell functions** graph entry at `seed` with `evidence: —`. Start `claude --plugin-dir "$SKIP_TUTOR_WORKTREE"` there and send:

> `/altitude:next-lesson`

Then send:

> `I already know shell functions. I've used them for years.`

Expected: the tutor immediately uses the concept without teaching or quizzing for the rest of the session. It does not route a standalone free-mode learner to an account mutation. At close, the graph entry is `understood` and its evidence line contains exactly `self-reported prior knowledge` (dates and the surrounding graph format remain consistent with the file).

## Cleanup

The scratch directories were created under the system temporary directory and can be deleted after review. Revoke any test-account known marks through `app.learnaltitude.com/map`; do not try to undo them through the agent or CLI.
