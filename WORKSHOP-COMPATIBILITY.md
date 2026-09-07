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
account, provider API key, deployment, or client publication was involved.
