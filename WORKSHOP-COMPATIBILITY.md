# Versioned paid lesson support

Plugin 0.5.8 executes version-1 server-authored task requirements with CLI 0.8.1
or later. These are compatible artifact versions, not a publication announcement.
Publish both clients and complete integrated acceptance checks before enabling
Intermediate journey creation or switching. This PR does not publish either client.
Plugin 0.5.7 is the already-released hint-ladder version; it does not contain this
lesson support. Keep released-version announcements at verified published versions
until 0.5.8 is actually available.

The paid task's requirements override legacy hands-on instructions. The free
standalone method keeps its existing behavior. Server-only planning, pedagogy,
capability judgment, and entitlement remain in the Altitude application.

An update-required response pauses the paid lesson and relays server-authored
update instructions. A bound project without usable requirements waits for a fresh
read; it never silently becomes a free Beginner lesson. Hooks remain fail open.
An old plugin with an old cached plan cannot learn these new rules retroactively;
server completion/evidence validation and rollout sequencing remain required.

Every server-planned lesson requires CLI 0.8.1 or later and plugin 0.5.8 or later,
including historical Beginner tasks whose requirements are null. Those lessons still
execute their existing hands-on method once the client is supported, and their data
and recorded progress are preserved untouched. An unsupported or unreportable client
gets explicit update-required copy naming `altitude update`, the plugin update and a
restart of the learner's agent, and that queued progress stays saved and syncs
automatically once both are updated — never an old-client retry without the new
flags, a legacy-client exemption, a silent free or Beginner substitute, or a
compatibility answer borrowed from another concurrent session.

Session affinity is what makes the "no borrowed answer" half of that hold, and it
rests on the host exposing a real session ID. Both supported hosts do: Claude Code
through `CLAUDE_CODE_SESSION_ID`, and Codex through `CODEX_THREAD_ID`. The
constraint therefore does not drop Codex from the supported set.

The Codex half of that was observed directly, on installed codex-cli 0.153.4 under
a ChatGPT subscription. A fresh `codex exec --ephemeral --ignore-user-config
--disable plugins` run with vetted inline SessionStart and PreToolUse recorder
hooks answered `printenv CODEX_THREAD_ID` with `01a07a1b-f65d-70b2-8f96-abe983b7bdfe`
in the root probe, and in the recorder run both hook payload `session_id` values
matched the command environment's ID `01a07eab-7516-7d70-aeb6-24f7e41c0ae2` exactly
— asserted by `node /tmp/altitude-codex-session-check.teTdfm/check.mjs`, which
passed `{verified:true, command_id_equals_all_hook_ids:true, hook_count:2}`. Read
that for what it is: one build on one platform, not a claim about every Codex
version or OS. `hooks/codex-field-mapping.json` is not the evidence — it maps a
stdin payload field and never names an environment variable. A host that exposes
none does not get an unscoped read, which would let another concurrent session's
marker answer the compatibility question — bound lesson execution pauses there
instead, with the standalone free method, the editor hooks, and every tool
unaffected. Closing that gap needs a session-neutral way for the CLI to identify
its caller, which is CLI work in the separate monorepo and cannot be added from
this repo; until it ships, treat "bound journeys require a session-ID-exposing
host" as a documented constraint.
That probe covered session identity and nothing else: no Codex Altitude paid lesson
has been run, so full Codex paid-lesson acceptance stays a release prerequisite. A
session whose identity cannot be read, or does not match the one the hooks report,
pauses the bound lesson rather than borrowing another session's context.

Two expectations land on the CLI in the separate monorepo, because this repo cannot
enforce either. First, `altitude task --json --session <actual ID>` reads the marker
already recorded for that session. Second, running it from a learner's own terminal
— a shell with no plugin and no hooks in it, which is how the stale-copy branch
refreshes a cold copy — must not create, replace, or clear that session's plugin
identity, and must never stand a missing marker in for a present one. The agent must
re-read under the same session afterwards, so a refresh that registered the session
as marker-less would turn that next read into false version evidence.

Publication is staged, and none of it happens in this PR. The version floor is
enforced by the plugin as well as the server: it lives in the skill markdown, and
agents pull plugin updates from the marketplace automatically while the CLI is a
global npm package the learner updates by hand. So publishing the plugin is itself
an enforcement step, and it is sequenced like one — a learner whose plugin
auto-advances to 0.5.8 while their CLI is still 0.8.0 will be prompted to update
before continuing any bound lesson, Beginner included. The required CLI download
must already be available when that happens.

The order is: publish CLI 0.8.1 and verify it against the server, which starts
sending `learning_runtime` while still accepting older clients; verify plugin 0.5.8
as a release candidate, then publish and verify plugin 0.5.8 in both marketplaces,
which turns on its local minimum when installed. Verify both downloads and
actionable update-required notice delivery before server-side enforcement of the
floor. Advance released-version metadata only after publication is verified.
The agent's update-required notice is sufficient when outdated tools request a
lesson: name `altitude update`, the plugin update and agent restart, and preservation
and automatic retry of queued progress. Separate advance emails or in-app
announcements are not required; neither is a waiting period or user acknowledgment.
Raise compatibility minima only when lesson compatibility needs them, not for every
release. Roll back in the reverse order. Softening the client rules
to shorten the sequence is not an option — restoring an old-client teaching fallback
would reintroduce exactly the silent Beginner downgrade this change removes, so
sequencing is the mitigation, not a weaker refusal.

Progress already captured survives the whole window. Queued events spool locally and
sync the next time Altitude is reached; a rejected emit is reported as unrecorded
rather than queued or synced, and no lesson claims a completion the server did not
accept. A bound project whose client is too old keeps its binding, its generated
plan, and its queued events while it waits for the update.

Rollback is per artifact and needs no data migration. Reverting the plugin to 0.5.7
restores the previous instructions with the binding and plan intact; reverting the
CLI to the last published build restores the previous envelope, and the server keeps
accepting version-less claims until enforcement is enabled. Roll enforcement back
first, then the clients. Nothing in this change publishes a client, deploys a server,
or enables enforcement.

Before release, exercise current/old CLI and plugin combinations, offline warm and
cold caches, an active lesson whose journey revision changes, and a real agent
session using server-authored fixture requirements. Automated markdown checks
alone do not establish that an agent follows the lesson correctly.

September 7 verification, against the instructions as they stood at 70d6d6a — the
pre-rebase commit on the old 0.5.6 base, which this branch does not contain; its
rebased counterpart here is ceafe02. 68 repository tests passed. Two real Claude Code 2.1.263
sessions used the built CLI 0.8.1 and this plugin with an isolated loopback fixture
backend. Both elicited a decision, let AI implement the entire small module, asked
for an actual-code trace and prediction, and ran a Node behavioral check. The final
session delivered two quizzes and one completion with the original task/revision,
no automatic gate credit, and verbatim scripted learner answers. Tutor question
strings still normalized formatting/contractions; do not mistake model-authored
claims for exact transcript capture or server-validated mastery. No production
Altitude account, provider API key, deployment, or client publication was involved.

Review commits after 70d6d6a changed behavior those sessions cannot speak for, and
each of the following remains unexercised by a real agent session: the rebase onto
the released 0.5.7 main, so the merged tree — whose hint-ladder, fast-forward offer,
and watch text now share next-lesson's SKILL.md and paid-mode.md with these rules —
has never run as a whole; both emit templates now carrying `--task` and
`--plan-revision`; learner text moved into single quotes; the supported-client
floor, now plugin 0.5.8, and its update-required routing replacing the previous
free-mode fallback; the version-evidence versus reach-failure split that decides
which of those a learner is told; the per-shell session reference; and the later
review fixes — the not-connected branch for a bound folder on an unpaired computer,
the install command for a missing `altitude`, the restart and queued-progress lines
in the agent's own update-required wording, and session IDs dictated bare in `cmd`.
Repository tests pin those sentences, but a markdown assertion is not an agent
following them; rerun the live scratch sessions before release and treat the
September 7 results as evidence about the older text only.
