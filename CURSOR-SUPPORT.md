# Cursor integration development and acceptance

The native `.cursor-plugin/plugin.json` loads `skills/` and the separate
`hooks/cursor.json`. Claude Code retains `hooks/hooks.json`; Codex retains its
existing hook command strings and trust hashes. Both Cursor interactive surfaces
share one transport shim and the existing skills. Server-owned learning policy,
entitlement, review selection, grading, and mastery remain outside this repository.

This is an unreleased implementation, not a supported-platform announcement.
Manifest versions remain aligned with the existing release until a coordinated
release bumps them. The corresponding CLI/server implementation must ship first;
older CLIs reject the new flags and this shim fails open with a diagnostic.

## Managed installation and local plugin loading

The repository includes `.cursor-plugin/marketplace.json` and can be registered
as a custom marketplace once the Cursor release is published. Use Cursor's
marketplace manager to add `https://github.com/jasonku09/altitude-skills.git`, then
select the native Altitude plugin. In the current terminal runtime,
`agent plugin marketplace add <git-url>` registers a marketplace; it does not
install an individual plugin. The actual manager's install/reload/update flow
still needs end-to-end verification for this unpublished release. The terminal
marketplace-add command directs users to `/plugins` in interactive mode to install. Prefer its
managed versioned install over maintaining a permanent manual clone.

Use a **user-scoped** install so the plugin follows the new folder created by a
first lesson. Cursor's documented development location is
`~/.cursor/plugins/local/altitude` (the current user's home directory on Windows
as well). Copy this entire repository, including hidden manifest directories,
into that directory. Do not copy only `skills/`, and do not overwrite an existing
local install that contains your work. Cursor skips symlinks whose targets are
outside its local plugin directory. Reload the desktop window and confirm the
components in Customize. Enterprise policy may require local plugin imports to
be enabled by an administrator.

The terminal agent can load a development checkout with
`cursor-agent --plugin-dir <absolute-checkout-path>` (or `agent` if installed under
that name). This flag is for local verification; it is not proof of user-scoped
marketplace installation or persistence. Do not invent an `agent plugin install`
command: inspect the installed runtime's help. No marketplace listing or public
Cursor release has been published by this work.

Both surfaces need Node.js and the matching globally installed `@learnaltitude/cli`
on the hook process's PATH. Native Windows npm `.cmd` wrappers are resolved to the
installed package's JavaScript entry point and launched using Node with no shell.
Unsupported wrapper layouts fail open and report a missing install; the adapter
never evaluates a `.cmd` file or places lesson text into a shell command.

## Terminal callback compatibility

Cursor terminal 2026.09.18-9a7762b dispatches session lifecycle hooks from a native
plugin, but its prompt/response/stop dispatch guards inspect only the original
user/project hook config. Source inspection and a live plugin-only probe found
that native-plugin-only turn callbacks were skipped. A second live terminal probe
with inert project entries observed each native prompt/response/stop callback
exactly once and prompt context reaching the model. The user-config setup uses
the same source-level guard branch. Subsequent live checks on September 22 passed
with the user-global compatibility setup and exact-root registration: the ordinary
terminal launch and desktop user-local plugin both dispatched the native hooks.
These checks establish the install/dispatch path, not every lesson acceptance case.
The shared connect skill
runs the bundled setup script explicitly:

```
node <actual-plugin-root>/bin/altitude-cursor-setup.mjs install
```

Quote the path for your shell. This merges uniquely owned **inert** entries for
`beforeSubmitPrompt`, `afterAgentResponse`, and `stop` into `~/.cursor/hooks.json`.
Their presence enables the terminal dispatch guard; they only print an allow/empty
JSON response. The installed native plugin runs the real shim exactly once.
Setup also records the exact installed plugin root in
`~/.cursor/altitude/plugin.json` as `{version:1, owner:"altitude-cursor", pluginRoot}`.
A live user-local CLI probe found `CURSOR_PLUGIN_ROOT` containing another plugin's
path even though native discovery and dispatch were correct. The bootstrap reads
our owned registration rather than that host environment. Paths remain JSON data
passed to `pathToFileURL`; no path is embedded into shell code or substituted via
Cursor's unescaped `${CURSOR_PLUGIN_ROOT}` token. No adapter code is copied.
Run `/connect` again after every plugin update to register its exact active source.
The connect skill then checks local `altitude status` and preserves an existing
pairing for ordinary maintenance. Status reports saved-token presence, not account
identity or server authentication. Explicit reconnection/account changes, missing
or malformed saved tokens, or a fresh server `unauthorized` response take the
pairing path. Offline reads and missing cache do not.
Missing/stale registrations fail open with a `/connect` diagnostic; setup never
chooses the newest cache directory or another checkout.
Restart the conversation after a changed setup so the runtime reloads the config.
The script preserves unrelated hooks and config, deduplicates its own commands,
rejects malformed/unsupported files and symlinks, and uses a lock and atomic write.
It does not silently replace an unfamiliar config.

Run the same script with `uninstall` before removing the plugin to remove only its
exact owned entries and its matching registration. An older version cannot remove
a newer registration or its compatibility entries. Forgotten entries are harmless no-ops even after the plugin
is removed. No hook modifies user configuration as a side effect of a lesson.

## Transport contract

| Cursor callback | Core lifecycle | Role |
| --- | --- | --- |
| `sessionStart` | `session-start` | Current session context and plugin observation |
| `preToolUse` | `pre-tool-use` | Edit gate using exact native write/delete matchers |
| `beforeSubmitPrompt` | `user-prompt-submit` | Prompt transport with explicit unknown origin |
| `afterAgentResponse` | `after-assistant-response` | Actual final assistant text |
| `stop` | `stop` | Turn end, completion/abort status, continuation count |
| `sessionEnd` | `session-end` | Session teardown, distinct from turn end |

The adapter calls `altitude hook` with `--agent cursor`, `--mapping`,
`--output json`, `--delivery prompt-context`, and `--stop-policy defer-to-prompt`. Structured result version 1 is
`{ version, exitCode, action, context, reason?, followup?, session? }`.
Only a coherent process exit 2 plus `action: "block"` produces a permission denial.
Missing CLI, timeout, crash, malformed output, inconsistent result, or mismatched
session produce a valid allow response and a stderr diagnostic. The hook launcher
also catches missing/stale registration and module loading failures, reports a
static installation diagnostic on stderr, and returns a valid allow response. Node itself must be installed for any
Node-based plugin command to execute.

`conversation_id` is the exact session identity. A conflicting `session_id` is
rejected. A sole workspace root is unambiguous; in a multi-root workspace an
explicit callback `cwd` must match exactly one root, then its exact resolved
working folder is retained so a nested lesson binding is not replaced by an
ancestor workspace binding. The adapter never selects
`workspace_roots[0]` or substitutes the plugin process's working directory. Open
the bound lesson folder in a separate workspace when attribution is ambiguous.

Session-start and prompt-submit context carry JSON session metadata whenever the
core confirms this callback's exact `session.id`, including in an unbound folder
with no lesson context. This lets `/begin` identify its own chat before binding;
the metadata does not activate a lesson or create learner evidence. Bound-session
context also carries the core's exact lesson-read command. The session-start `env`
response provides `ALTITUDE_SESSION_ID` for subsequent hooks, but this is not proof
that Cursor's shell tools inherit it; the live terminal shell probe did not receive
that variable. Skills use the current context's literal ID as data, safely quote it
for `--session` on every task read and evidence emit, and use
`altitude session --current --json` only to resolve an existing host identity when
context is unavailable. Invalid or mismatched core results never supply metadata.
Neither status output nor the most recently active chat is a valid substitute.

For first-journey setup, `/begin` requires reopening the new journey folder as
Cursor's actual workspace before binding or teaching. A shell `cd` alone does not
move the workspace root reported by hooks. Desktop learners use Open Folder;
terminal learners leave and relaunch Cursor from the new folder, then resume
`/begin` without creating another nested folder. A new chat resolves a new exact
identity. The adapter does not infer descendant bindings from a parent workspace.

The current server retires the plan gate; this adapter therefore registers no
`ExitPlanMode` matcher. Source inspection found native generic `Write`/`Delete`
callbacks, with edit operations delegating through the wrapped write executor.
The anchored edit matcher does not match `WriteShellStdin` or MCP tool names.

Cursor cannot enforce a stop denial without generating a new turn. The neutral
core policy instead retains any future/cached stop requirement as a transport
notice and delivers its server-authored reason on the next real prompt. This is
not a quiz, evidence, or falsely acknowledged enforcement; cancelled/error turns
are not restarted. Current server retro outcomes are observe/ask.

For unpublished plugin acceptance only, an explicit absolute
`ALTITUDE_CURSOR_PLUGIN_ROOT` overrides registration for `--plugin-dir` sessions.
It is a developer override, not an installation discovery mechanism.

For unpublished-build acceptance only, an explicit absolute `ALTITUDE_CLI_PATH`
selects the intended JavaScript CLI entry through Node with no shell. Cursor's
login-shell PATH may otherwise prefer an older globally installed CLI. Missing or
invalid overrides fail open without silently testing a different build. Normal
released installations keep the standard PATH/npm resolution.

## Native recall context and provenance

Live probes on September 21, 2026 observed `beforeSubmitPrompt.additional_context`
reaching the model in both Cursor desktop 3.21.16 and terminal
2026.09.18-9a7762b. This is newer behavior than the public hook reference describes.
The adapter therefore uses native prompt context for recall delivery and returns
no `followup_message`: an extra synthetic user-role turn is unnecessary. The
accepted bounded-continuation alternative is not needed on these tested versions.

The core decides when a question is due and supplies structured context. It records
the actual `afterAgentResponse.text` and a completed stop before accepting a later
answer, supporting either callback order. A stop payload's arbitrary `text` is not
assistant text. The terminal live probe observed stop before afterAgentResponse.

The hook payload supplies no authoritative author-origin field. The shim reports
`prompt_origin: "unknown"`, never trusts arbitrary incoming `prompt_origin` or
`continuation_id` fields, and does not opt into verified continuation provenance.
The core treats native prompt evidence as client claims with its existing filters;
it does not make client claims authoritative. Altitude itself generates no synthetic
prompt. Other plugins' generated traffic cannot be distinguished from real user
text through the documented Cursor callback alone; record that limitation when
validating installations with other turn-generating plugins.

Hook-owned recall questions are not emitted again manually by the shared skill.
The exact current-session result exposes question ownership, and an explicit
`--question-id` lets the CLI reject duplicate manual reporting for that question.
The September 24 trial below exercises actual question/answer capture and server
progress. A context marker alone is not evidence that a question was asked.

## Evidence and remaining checks

The final ordinary terminal and desktop user-local checks passed after setup
registered the exact active plugin root. This resolves the earlier failed
user-local terminal probe caused by another plugin's root environment. Managed
marketplace installation/update, complete learner journeys, and the remaining
lifecycle/platform matrix below still require their own recorded acceptance.

September 22 native Linux checks used Ubuntu 24.04.4 x86_64, Node 24.18.0, and
Cursor terminal 2026.09.18-9a7762b under a dedicated non-root test user. An
ordinary interactive Auto session loaded an exact-session task, captured one
actual recall question/answer, and delivered a native Write callback to the
core diff gate. A disposable combination with watcher PR #292 and plugin PR #26
also detected an atomic save in a workspace path containing a space and reported
the exact saved line without another chat message. These were loopback fixture
trials with scripted operator input, not a full graded lesson or Linux desktop
acceptance. The monorepo's `docs/evidence/cursor-linux-2026-09-22.json` records the
scope. The 41 Cursor shim/setup tests passed natively; the full suite passed
242/242 on rerun after an unchanged Codex stdout test flaked on both this tree
and its original baseline.

September 24 fresh-workshop testing found and fixed three onboarding gaps: exact
chat identity was absent from empty lesson context, core lacked a temporary
unbound plugin-version observation, and a shell directory change left Cursor's
hook workspace in the parent folder. Regression tests failed before each fix.
The plugin suite passed 272 tests locally; Ubuntu passed the 271-test identity
patch plus the new workspace-handoff checks. The companion core passed 768 tests
and typecheck. The full trial used pinned Cursor terminal 2026.09.18-9a7762b with
Sonnet 5, actual isolated Next/PostgreSQL routes, and live browser review grading.
See the companion validation report for the final lesson result and fixture limits.
The scripted operator wrote the learner code and answers. The tutor requested
chat messages after saves instead of arming a background watch, so this trial
does not qualify teaching-model compliance or replace the separate watcher trial.

### Upcoming save-watcher release

[Plugin PR #26](https://github.com/jasonku09/altitude-skills/pull/26) replaces
model-written polling loops with `altitude watch start|wait|stop` (CLI 0.10.0),
while keeping teaching instructions in the shared skill. Its full diff applies
cleanly to these Cursor changes in a read-only `git apply --check`; it has not been
merged into this branch. Adopt that shared watch implementation when integrating
the releases rather than adding Cursor-specific polling. Until a host's automatic
background wake is verified, its existing foreground rule applies: use
`watch wait --slice-seconds` below the shell tool's timeout and handle queued chat
before a watch result. Cancellation of a host tool does not establish a completed
learner submission.

PR #26 bumps the Claude and Codex manifests to 0.7.0. A coordinated release must
also align the new Cursor manifest; its version-parity test intentionally catches
a missed bump. Retain Cursor's exact-session and hook-question ownership
instructions when taking that PR's shared skill changes. The watch command is
file-scoped; it is not a replacement for the conversation ID used by task reads
and evidence emits.

`npm test` includes subprocess tests of the actual shim, launcher/import failure,
explicit denial, malformed results, missing CLI, session isolation, multi-root
resolution, callback field normalization, and refusing unverified continuation
traffic. Setup tests isolate the user home and exercise merge, idempotency,
uninstall, malformed config, and concurrent-writer refusal. The Windows test runs the Windows npm-entry resolver and then invokes its
Node command with paths and arguments containing shell metacharacters. It does
**not** establish a native Windows Cursor session.

Before release, record desktop and terminal versions, OS, model/configuration,
and results for: user-scoped install/reload/update, folder change, pair/begin,
learner edit and watch handoff, actual write/edit/delete tool names and denials, missing
binary/crash/timeout, due recall delivery, real answer capture and server progress,
cancellation, resume, compaction, concurrent chats, and multi-root workspaces.
Test existing hooks alongside Altitude: Cursor merges hook responses and another
hook's stop follow-up can override Altitude's. An offered question must never be
marked asked merely because the adapter printed an instruction.

macOS, native Windows, and Linux are intended targets. No row in that matrix is
certified by these package tests. Recommend a model only after its recorded full
lesson trial; do not imply every model or Auto behaves equivalently.

References checked September 21, 2026:
[Cursor plugins](https://cursor.com/docs/plugins),
[manifest reference](https://cursor.com/docs/reference/plugins),
[hooks](https://cursor.com/docs/hooks), and
[terminal changelog](https://cursor.com/docs/cli/changelog).
