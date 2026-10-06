# Copilot support (unreleased)

This branch adds a transport adapter for GitHub Copilot CLI and VS Code's Local
Copilot agent. It uses the existing seven shared skills and the same Altitude
CLI/server lesson policy. It does not add a standalone VS Code extension, duplicate
pedagogy, or ship server lesson logic in the public plugin.

The manifest version is 0.9.0, the first plugin release that includes Copilot, in
step with the other host manifests. It requires Altitude CLI 0.12.0 or later and the
Copilot-capable server; publish and deploy both before the plugin.

## Installation and identity

The native plugin is `.plugin/plugin.json`, with its hook configuration inline;
the Copilot marketplace lives in
`.github/plugin/marketplace.json`. The intended released terminal install is:

```text
copilot plugin marketplace add jasonku09/altitude-skills
copilot plugin install altitude@altitude
```

Until publication, use the development checkout with the native plugin manager.
In VS Code, enable the complete Altitude plugin for the Local agent and trust the
project for hooks. A copied `skills/` folder provides the free standalone method,
not subscribed lesson support. Existing Claude, Codex and Cursor manifests remain
separate and retain their own hook files.

Choose Altitude's `connect` skill, then `begin` or `next-lesson`, using the exact
invocation shown by the host. Connect identifies both Copilot surfaces as
`--agent copilot`, with the observed Copilot CLI or extension version. The VS Code
editor version is separate. Every teaching command and evidence emit receives the
exact session ID supplied in this conversation's hook context. Missing identity
pauses the bound lesson; there is no newest-chat fallback.

Open the journey folder as the host's actual workspace. A shell `cd` inside chat
is insufficient for editor hooks. Reopen the folder/new conversation and resolve
its identity again before binding.

When you finish a code exercise, replace the `TODO(you)` markers with your code
and save the file. If Copilot does not respond to the save, send **check** in the
same chat. It can then read your saved work and continue; you do not need to paste
the code into chat. Automatic continuation on save has not been established in
the Copilot acceptance trials.

Updates have two parts: `altitude update` updates the CLI, while
`copilot plugin update altitude@altitude` updates a terminal marketplace install.
For VS Code, update the complete Altitude plugin through the editor's plugin
manager and reopen the chat. Keep the existing journey folder and pairing; do
not delete `.altitude`, reconnect under another account, or start a new journey
to update. A plugin loaded from a local development directory reads that
directory directly and has no downloaded copy to update.

## Hook transport

The manifest embeds one PascalCase event dictionary directly under `hooks`
(`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Stop`, `SessionEnd`). Do not
wrap that dictionary in `{version, hooks}`: the installed CLI then silently
loads no hooks. Native callback audit, not the model repeating an identity or
marker it could infer independently, establishes hook dispatch. An external hook-file path is not
sufficient isolation in VS Code: discovery also loads the existing Claude
`hooks/hooks.json` before that path. Inline hooks avoid that collision while
preserving the other host manifests.

Use one active Altitude installation per test. A development `--plugin-dir`
alongside an installed same-name plugin can dispatch both sets; that is not proof
that a single installed plugin dispatches twice.

A single PascalCase hook set works in both verified runtimes. Do not add a second
lowercase hook set: Copilot CLI dispatches both sets and would send duplicate
callbacks. Each hook explicitly declares `env: {PLUGIN_ROOT: "${PLUGIN_ROOT}"}`. VS Code
expands that token in environment data; its flat-inline discovery does not
otherwise inject `PLUGIN_ROOT`. The shell wrappers read the environment variable
as data rather than interpolating the install path into shell code. Copilot CLI
also supplies its native plugin root. Native tests must verify the resulting
root in both hosts; a shell fixture supplying it manually does not establish
plugin discovery.

CLI context uses top-level `additionalContext`; VS Code Local uses
`hookSpecificOutput.additionalContext`. The adapter returns both shapes with the
same content. Intentional mutation denial similarly returns both host shapes,
with a successful wrapper exit. Open/error paths return `{}` and never explicitly
approve a tool. The outer shell wrapper succeeds even if Node or the adapter is
missing. Windows has a PowerShell wrapper; native Windows acceptance is separate.

Only known native file-mutation tools run the diff gate. Copilot CLI converts
its file tools into `Write`/`Edit` names in PascalCase compatibility-hook stdin;
the adapter recognizes those exact aliases. The native transcript
`preToolUse` audit may describe an upstream `toolCalls` batch, which is not the
same shape as the individual compatibility callback delivered to the adapter. Shell commands, reads,
and arbitrary MCP tool names do not get inferred as file edits. Native patch text
is carried as JSON data, including the compatibility `Edit` alias whose input
remains a raw `*** Begin Patch` / `*** End Patch` string rather than JSON.
Ordinary `Edit` arguments remain structured objects. Other tool permissions remain owned by Copilot.

Recall delivery uses prompt context with `--stop-policy defer-to-prompt`. The
adapter emits no synthetic learner turns. A successful pairing or marker probe
is not proof that a graded lesson works.

## Confirming the question the learner saw

Before a prompt reaches core, the adapter records a random generation token and a
transport receipt scoped to the exact host, session ID and canonical workspace.
The receipt contains a prompt hash, native callback timestamp, and (in VS Code)
the already-durable user event ID, hash and transcript path. It contains no lesson
policy or raw learner text. State is under `~/.altitude/adapters/copilot/v1/` and
is consumed after a handled stop. `ALTITUDE_COPILOT_STATE_DIR` can isolate tests.

CLI prompt hooks precede the persisted user message. At stop, its transcript must
contain exactly one user event between the receipt timestamp and the stop
timestamp, with the exact prompt hash and unique native user-message identity.
VS Code pins the existing user event at prompt time. After reopening a persisted
VS Code chat, the host can begin a new segment with a `user.message` whose
`parentId` is null. Only that Local user boundary is allowed as a new root; the
completed assistant chain must still reach the exact user event pinned by this
prompt receipt. CLI user roots and disconnected assistant roots remain invalid.
Both paths verify the
transcript's session, supported producer/schema, path, current user boundary and
complete parent chain through the final assistant response and turn completion.
The CLI additionally requires `originatingMessageId` to match that user message.
Ancillary `model.*` telemetry may have null or external parent IDs; those records
do not form the canonical chat ancestry and cannot supply assistant evidence or
bridge a broken user/assistant chain. Their event IDs remain subject to uniqueness
checks, and error or abort events still prevent completion capture. Numeric
`turnId` alone is never identity: it repeats across CLI resumes.

The CLI can write its final transcript events after entering the stop hook. The
adapter retries for at most 800 milliseconds. Missing, interrupted, tool-only,
malformed, mismatched or late completion supplies no assistant evidence. Any
forwarded incomplete stop retains its generation token and non-completed status;
it cannot enter the legacy unverified question-capture path. Receipts without a
matching stop are harmless transport leftovers, not queued lesson evidence.

## Validation status

Native transport acceptance passed on macOS with Copilot CLI 1.0.88 and VS Code
1.138.0 Local agent, using the complete plugin, the Copilot-capable Altitude CLI,
and an isolated local mock backend. Both hosts delivered lesson context, captured
the question from its matching completed assistant turn, and recorded the actual
learner answer once under the exact chat identity. Each recorded one session
start and one question/answer event, with no duplicate ingests and no client
assessment verdict.

Both native hosts also enforced the mock backend's required diff check. The final
Copilot CLI trial denied a real `apply_patch` call that attempted both a new file
and an edit to an existing file: the new file remained absent and the existing
file remained unchanged. This validates the complete adapter/core denial path,
including the native compatibility `Edit` callback carrying raw patch text.
Native callback and file-state audits establish these results; model narration or
cancelling a permission prompt does not.

Additional Auto lesson trials on September 26 completed the first task in both
native hosts and verified same-chat resume with the second task active. Neither
host started the next lesson or emitted a quiz for that task. The audited CLI
session contained two automatically captured
question/answer pairs whose question and next learner answer matched the native
transcript exactly. Three separate manual emissions matched the tutor's actual
commands; those remain client-authored claims, including paraphrased questions
and one answer typo. All five pairs were distinct and belonged to the same
intended chat and task. Manual claims are not represented as exact automatic
capture.

The VS Code lesson exposed a persisted-chat resume case: its first resumed user
message had a null parent, which the original parser rejected. After the Local
user-root fix, native prompt callbacks resumed updating the session, the actual
question was marked completed, and subsequent learner answers produced two automatic
question/answer events. Each question and its next learner answer matched the native
transcript exactly under the original resumed chat ID. Five additional manual
emissions remained client-authored claims. This recovery was verified through
native callbacks and ingested evidence, in addition to the parser regression tests.

The final local database audit contained 37 CLI events with five quiz pairs and
23 VS Code events with seven quiz pairs. Every quiz belonged to its intended
chat and first task; event IDs and question/answer pairs were unique. Neither
host recorded a quiz after task completion. The CLI recorded three distinct
session starts across initial connection and task-bound resumes; this audit does
not claim that all lifecycle callbacks occur only once.

The completed lessons were also followed by real browser review flows: four
independent answers per host, eight successful metered Sonnet 5 grading calls in
total, with no requested help or browser errors. Each learner demonstrated
explain, trace, implement and verify once. Workshop claims remained practice
evidence (112 CLI and 84 VS Code capability records); the browser reviews supplied
four independently demonstrated capability records per learner. The displayed
state remained practicing, with no mastery claim. These were scripted synthetic
learners on an isolated local backend, not production accounts.

The small fixture bank contained only the first difficulty band, so subsequent
preparation reported missing second-band items. Review item counters displayed
out of order, and workshop reports displayed an unknown model; native host
records, rather than that report field, establish tutor model provenance.

These checks establish native transport, task completion/resume and the narrow
browser grading flow. They do not establish lesson quality across learners or
support for every model and platform. Windows/PowerShell, additional platforms,
other VS Code agent hosts, and Copilot's cloud agent are not covered by this
acceptance. Client upgrade and release compatibility remain separate release
checks. No production account was paired for this acceptance.

`npm test` covers isolated core calls, exact session association, repeated turn
IDs, delayed transcript writes, malformed results, missing CLI/Node, completion
failures, native mutation aliases and raw patch input, plus regression checks for
existing agents. Source tests alone do not establish native acceptance. No release
version is bumped here.

## Pinned Pro follow-up — September 26

Fresh terminal and VS Code Local lessons used Claude Sonnet 5 throughout, verified in native model records. Both completed the learner-written program, advanced the task, survived same-chat restart, and passed four independent real browser reviews each. Eight metered Sonnet 5 grades were persisted; capability state remained practicing rather than mastered. No client runtime changed after the 382 passing tests.

The September 26 trial identified a shared-core evidence-quality finding (resolved in the September 28 follow-up below): VS Code deferred a queued recall check and delivered a scratch-writing handoff. The next learner message, “Saved the scratch file; I have not run it yet,” was still captured as a quiz answer against the bounded completed response. Session and turn identity were correct, but no recall question had been asked. It produced practice evidence only. The transport cannot treat completed response provenance as proof of pedagogical intent; the September 28 verification protocol addresses that distinction.

CLI produced two exact automatic pairs. VS Code produced two automatic claims (one being that non-question) and three manual claims matching actual native emissions and verbatim learner answers. All quiz IDs/pairs were unique, belonged to the correct first task and chat, and preceded task completion. Neither host generated a quiz for the next task.

Terminal watcher use was absent; editor markers and watch commands worked with explicit “check” follow-ups, while automatic continuation on save was not established. Pro tutor quality also varied: editor opened with an untaught Git question, and terminal initially praised an incorrect claim before testing it. These are small scripted lessons, not model-wide qualification. The monorepo spike report and private `/tmp/altitude-copilot-lesson-audit-20260925/PRO-RESULTS.md` contain full results and provenance.

## Packaging and upgrade checks — September 26

Fresh npm tarball installation and the actual `altitude update` command passed
on macOS using isolated install prefixes and a loopback registry serving the
candidate tarball. The update replaced the published 0.10.0 bundle with the
Copilot candidate, with all eight files in a copy of the completed learner's
state preserved byte for byte. The installed bundle matched the built artifact;
the tarball contained only the CLI, shim, metadata, README and license. No
registry publication occurred and release version numbers remain pending.

The real Copilot CLI plugin manager also installed all seven skills from a
cloned HTTP Git marketplace, then fetched and installed a second fixture commit.
The updated installed tree contained that commit's marker; a separate local
marketplace correctly reported that live source installations need no update.
The HTTP server was loopback-only, not the public GitHub marketplace.

Both existing Pro chats reopened with the packaged CLI and the current server
branch rebased onto main (4bc042e4). Native commands returned the original second
task and `learning_runtime.status: supported`. The editor used a complete plugin
artifact in an isolated profile. This checks source-plugin replacement and
resume; the VS Code marketplace update UI and native Windows/Linux remain
unverified. The explicit **check** fallback is documented for saves that do not
resume Copilot. The shared false-quiz-capture finding is addressed by the September 28 follow-up below.

Before rebasing, all workspace unit suites passed: 934 CLI, 236 shared, 3,058 web,
436 content and 160 nightly tests, plus workspace typechecking. The client suite
passed 382 tests. Final gate validation against the rebased branch is separate.

## Evidence verification and degraded context — September 28

The coordinated core now requires a declared question and an exact match in the
completed native reply before the next learner answer becomes automatic quiz
evidence. Real isolated Sonnet 5 chats passed both cases in CLI and VS Code Local:
a writing handoff followed by “Saved” produced zero quizzes; a declared, displayed
question and the next exact answer produced one correctly attributed quiz. These
checks used a local mock backend and fake credentials; they are separate from the
earlier real browser grading trials.

A receipt storage or transcript verification failure must not discard teaching
context. If a prompt receipt cannot be created, the adapter calls the explicit
`altitude hook-context user-prompt-submit` boundary with the exact chat identity
and prompt. Missing Stop receipts use `altitude hook-context stop --gate retro`.
These context-only commands never claim a generation or completed response. Core
supplies lesson guidance and retains server retro instructions for the next prompt
without recording unverified quiz evidence. A valid receipt whose completed reply
cannot be verified still sends the ordinary aborted Stop for that exact generation.
Failures remain diagnostic on stderr; tool permission failures remain open.

The fallback requires the coordinated core release. Older CLIs reject the distinct
`hook-context` command; the adapter then returns an empty hook result. It never
retries a legacy evidence hook without a generation and never invents SessionStart.
Proven duplicate or out-of-order callbacks skip all core calls. Live lock
contention uses `--uncertain-order`: core delivers context and preserves the
current pending question and credit data while marking automatic evidence
unavailable. The next verified learner prompt closes the retained answer window
without recording a quiz, then resumes normal capture. This can conservatively
lose one valid quiz, but cannot pair an old question with a later wrong answer.
The adapter leaves the live writer and newer receipt untouched.

Receipt writers now publish unique immutable ownership claims before scanning for
competitors. Every claimant either sees the active owner or withdraws alongside
another contender. They never rename or restore another owner's lock. Dead owners
and confirmed PID reuse can be cleaned up; a live owner's process birth identity is
queried through POSIX `ps` or Windows PowerShell. If that query is unavailable,
ownership remains exclusive. A paused live writer never loses exclusivity merely
because time has elapsed. Legacy locks are left in place and bypassed only when the
owner is dead or its process birth proves PID reuse. An ambiguous live owner can
therefore suppress evidence until it exits; context still reaches the lesson through
the explicit fallback with uncertain ordering.

Regression tests exercise the literal manifest shell commands with native Pascal
payloads from both hosts, including unavailable receipt storage, missing Stop
receipts, old-CLI rejection, and preserving newer receipts. A child-process barrier
reproduced overlapping live writers under the old lease implementation and confirms
exclusion under immutable claims. Native Windows/PowerShell and Linux acceptance
remain unverified; source-level coverage is not a platform qualification.

Final client validation: all 402 tests passed, both adapter modules passed Node
syntax checks, and literal manifest prompt/Stop commands against the actual
published CLI 0.10.0 returned empty hook results with isolated core state unchanged
on both native payload shapes. Live native acceptance of this new fallback is a
separate coordinated check; these shell tests do not establish host discovery.
