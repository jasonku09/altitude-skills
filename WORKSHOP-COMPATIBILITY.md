# Versioned paid lesson support

Plugin 0.5.7 executes version-1 server-authored task requirements with CLI 0.8.1
or later. These are compatible artifact versions, not a publication announcement.
Publish both clients and complete integrated acceptance checks before enabling
Intermediate journey creation or switching. This PR does not publish either client.

The paid task's requirements override legacy hands-on instructions. The free
standalone method keeps its existing behavior. Server-only planning, pedagogy,
capability judgment, and entitlement remain in the Altitude application.

An update-required response pauses the paid lesson and relays server-authored
update instructions. A bound project without usable requirements waits for a fresh
read; it never silently becomes a free Beginner lesson. Hooks remain fail open.
An old plugin with an old cached plan cannot learn these new rules retroactively;
server completion/evidence validation and rollout sequencing remain required.

Every server-planned lesson requires CLI 0.8.1 or later and plugin 0.5.7 or later,
including historical Beginner tasks whose requirements are null. Those lessons still
execute their existing hands-on method once the client is supported, and their data
and recorded progress are preserved untouched. An unsupported or unreportable client
gets explicit update-required copy naming `altitude update` and the plugin update in
the learner's agent — never an old-client retry without the new flags, a legacy-client
exemption, a silent free or Beginner substitute, or a compatibility answer borrowed
from another concurrent session.

Publication is staged, and none of it happens in this PR. The order is: publish CLI
0.8.1, publish plugin 0.5.7, let existing installs pick both up, send in-product
advance notices over the existing `update_notices` channel while the server still
accepts older clients, and only then enable server-side enforcement of the version
floor. Enforcing before that notice window strands learners who have not updated,
which is the failure this sequence exists to prevent.

Progress already captured survives the whole window. Queued events spool locally and
sync the next time Altitude is reached; a rejected emit is reported as unrecorded
rather than queued or synced, and no lesson claims a completion the server did not
accept. A bound project whose client is too old keeps its binding, its generated
plan, and its queued events while it waits for the update.

Rollback is per artifact and needs no data migration. Reverting the plugin to 0.5.6
restores the previous instructions with the binding and plan intact; reverting the
CLI to the last published build restores the previous envelope, and the server keeps
accepting version-less claims until enforcement is enabled. Roll enforcement back
first, then the clients. Nothing in this change publishes a client, deploys a server,
or enables enforcement.

Before release, exercise current/old CLI and plugin combinations, offline warm and
cold caches, an active lesson whose journey revision changes, and a real agent
session using server-authored fixture requirements. Automated markdown checks
alone do not establish that an agent follows the lesson correctly.

September 7 verification: 68 repository tests passed. Two real Claude Code 2.1.263
sessions used the built CLI 0.8.1 and this plugin with an isolated loopback fixture
backend. Both elicited a decision, let AI implement the entire small module, asked
for an actual-code trace and prediction, and ran a Node behavioral check. The final
session delivered two quizzes and one completion with the original task/revision,
no automatic gate credit, and verbatim scripted learner answers. Tutor question
strings still normalized formatting/contractions; do not mistake model-authored
claims for exact transcript capture or server-validated mastery. No production
Altitude account, provider API key, deployment, or client publication was involved.
