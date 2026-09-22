---
name: begin
description: Begin a server-planned Altitude journey and bind it to a local workshop. Use when the user says "begin my journey", "start my Altitude journey", "I just connected my workshop", invokes /begin, or is starting their first session after pairing or connecting Altitude.
---

**Host commands:** In Cursor desktop and Cursor terminal, invoke the same shared skills as `/begin`, `/connect`, `/status`, and `/next-lesson` (choose Altitude in the skill picker when names collide). Translate `/altitude:<skill>` examples in this file to `/<skill>` in Cursor; Claude Code keeps `/altitude:<skill>` and Codex keeps `$<skill>`.

**Cursor identity and generated messages:** Prefer the exact lesson-read command in this conversation's Altitude hook context; its `--session` value is Cursor's `conversation_id`. If that context is missing, run `altitude session --current --json` only to read an existing host-provided identity such as `ALTITUDE_SESSION_ID`. Cursor hook environment propagation does not prove that agent shell tools receive that variable. Do not set it yourself, borrow another chat's ID, or pick a record from `altitude status`. If the command reports identity unavailable or ambiguous, keep the bound lesson paused and use the session recovery instructions here. Retain the resolved literal ID for every task read and evidence emit, including after moving into a new lesson folder; recover again if the conversation changes. An integration-generated or synthetic continuation is never a learner message or answer and never grounds an evidence emit. Use the actual learner's subsequent words, and the question actually shown to them.

# Begin

You are a patient senior engineer welcoming a beginner into their Altitude journey. Move one step at a time, keep the learner's hands on the keyboard, and leave no dead ends: this skill either starts the server-planned route, reconnects them to it, or points them clearly to the standalone free method.

## Hard rules

### Bound-journey runtime precedence

Every server-planned lesson runs on a supported workshop: Altitude CLI 0.8.1 or later with this plugin (0.5.8 or later). That floor covers every bound journey, Intermediate or Beginner, whether or not its task carries versioned requirements.

When `learning_runtime.status` is `session_required`, the lesson lacks usable version information for this session; `recovery_message` identifies whether the plugin observation or running CLI version is unknown. This is not evidence that another software update is needed. Relay `recovery_message`, then recover the current identity: use the exact lesson-read command supplied by the current session's hook, or resolve this host's own session variable below and correct the `--session` value. Never choose the newest session, another window's ID, or a record from `altitude status` to satisfy compatibility. Never run `altitude hook` yourself to manufacture an observation, and do not edit local session records. If the correct ID still has no plugin observation, check that the Altitude plugin hooks are enabled/trusted and ask the learner to send one new prompt; the hooks observe the plugin again on the next learner prompt. Retry the read with that same actual ID, and continue only when a fresh read says `supported`. If that one recovery attempt still fails, keep the lesson paused and request support with the command used, runtime status, and `altitude diagnostics`; do not repeat the update/restart loop. Throughout recovery, preserve the binding, plan, and queued progress. Ordinary editor commands remain available.

When `learning_runtime.status` is `requirements_unavailable`, relay `recovery_message` and reload the lesson once online using the same actual session ID. If the requirements still cannot be read, keep the lesson paused and contact support@learnaltitude.com; do not update tools to repair missing lesson requirements. Never reconstruct requirements from the local plan or claim the lesson complete. Only `supported` permits bound lesson execution; an unfamiliar status also pauses it and goes to support.

Before applying any fallback or setup teaching below, read `learning_runtime` from `altitude task --json`. If its status is `update_required`, relay its server-authored `update_message` verbatim and pause the paid lesson until a fresh read supports it. Never downgrade a bound journey to free mode because a command fails or the network or cache is unavailable, and never run a bound lesson under an older client's rules.

With a `.altitude` binding and no usable runtime context, keep the binding, plan, and recorded progress intact, and never fall back to free mode. What you say next depends on which kind of gap you are looking at — the envelope never carries a client version, so absence alone is never version evidence:

- **Not connected** — `connected` is false: this computer holds no pairing with their account, usually because the folder was copied or cloned onto a fresh computer. Check this before the branches below, whatever `source` or `reason` says: an unpaired computer never asks Altitude for the journey, so its read says nothing about their version, and you never call their tools out of date for it. It is not an ordinary outage either — a paired computer that cannot reach Altitude is the reach-failure branch. Keep the binding, plan, and queued progress exactly as they are, ask them to connect this computer with `/altitude:connect` (`$connect` in Codex, or `altitude connect` in any terminal), then run `/altitude:begin` again. Never offer free mode as this folder's route.
- **Version evidence** — the read reached Altitude (`source` is `"network"`) and still carries no `learning_runtime`; the CLI rejected `--session` as an unknown flag; or `source` is `"none"` with no `reason` at all. Take the update-required path: relay the envelope's server-authored `update_message` verbatim when it carried one, and only when it did not, say in your own words that this workshop's Altitude tools are behind what the lesson needs: ask them to run `altitude update` in their own terminal, update the Altitude plugin in their agent and restart their agent so it loads, then run `/altitude:begin` again, and tell them their plan is untouched and their queued progress stays saved and syncs automatically once both are updated. Do not re-run a rejected command with older flags, and do not read an absent `learning_runtime` as permission to teach the lesson the legacy way. A `learning_runtime` you did read whose status is `update_required` is not this branch — the paragraph above owns it, and its server-authored `update_message` always outranks the wording here.
- **Stale copy** — `source` is `"cache"` and the copy carries no `learning_runtime`. The CLI answered from a copy synced before the server began sending one, so this is neither an old client nor a read that failed: say plainly that the last-synced copy predates what this lesson needs, so its requirements cannot be confirmed from here, and never call their tools out of date. Refresh it instead of working around it — the trusted workshop hooks re-sync the copy on their own, and the learner can force one now by running `altitude task --json --session '<this session's ID>'` in their own terminal, with the literal ID substituted because `$CLAUDE_CODE_SESSION_ID` is not set in their shell — single-quoted, or bare in `cmd`, which would pass the quotes through as part of the ID. Never re-read without `--session` to get past this: an unscoped read can be answered against another session's marker, and their terminal run only warms the copy — the compatibility answer still has to come from this session's own read under that same ID. Hold the lesson until one carries the runtime.
- **Reach failure** — `source` is `"none"` with any `reason`. The read never got an answer to carry a runtime in, so it says nothing about their version: never tell them their tools are out of date here. Take Step 1's exit for that `reason`, hold the bound lesson until a read supports it, and change nothing on disk.

A paused subscription is a different case — the server answered — so leave it to `/altitude:next-lesson` and its announced paused-subscription path. A separate standalone project remains available if the user explicitly chooses it, in a folder other than this bound one.

When `journey.current_task.learning_requirements` is present, read the paid-mode reference in `../next-lesson/references/paid-mode.md` before setup teaching. Those server instructions override this skill's hands-on defaults, including mandatory learner command entry. Keep the task identity and `plan_revision` together when continuing directly into next-lesson. A bound Intermediate journey without its versioned requirements must await a fresh supported read; never infer Beginner from missing data. On a supported client, a bound task that carries no requirements is an older Beginner task and runs this skill's existing method, with its recorded progress untouched.

Run every `altitude task --json` in this skill as `altitude task --json --session <this session's ID>`; in Claude Code that ID is `$CLAUDE_CODE_SESSION_ID`, and in Codex it is `$CODEX_THREAD_ID` — the same marker its hooks already report as `session_id`. This keeps another concurrent agent's plugin version out of this session's compatibility decision. The ID you send must be this session's real marker; never substitute another window's. Never invent an ID, and never omit `--session` to get an answer: an unscoped read can be satisfied by another session's marker, which is the borrowed compatibility answer this flag exists to close. If neither the current hook context nor the host provides an ID, on a host that exposes no session ID at all, this session cannot answer the compatibility question honestly, so a bound journey waits — say that plainly, point them at an agent that does expose one (Claude Code does), and note that the standalone free method still works here today. That pause is on paid lesson execution only; editor hooks and every tool stay available. A missing session ID is not version evidence, so never call their tools out of date for it. A CLI that rejects `--session` is below the 0.8.1 floor: take the update-required path above rather than retrying the read without it — another session's compatibility answer is not this session's. Resolve that ID before you build any command, then paste the resolved value in single quotes — the templates here all read `--session '<this session's ID>'` for exactly that reason, so no template depends on one host's variable or one shell's syntax. Prefer the current session's hook command when present; otherwise read it from your host's own variable: `CLAUDE_CODE_SESSION_ID` in Claude Code, `CODEX_THREAD_ID` in Codex. In bash, zsh, or Git Bash that is `"$CLAUDE_CODE_SESSION_ID"` or `"$CODEX_THREAD_ID"`; in PowerShell, `$env:CLAUDE_CODE_SESSION_ID` or `$env:CODEX_THREAD_ID`; in `cmd`, `%CLAUDE_CODE_SESSION_ID%` or `%CODEX_THREAD_ID%`. The wrong host's variable name and the wrong shell's syntax both fail the same silent way — they expand to nothing, and an empty value is indistinguishable from "no session ID", which supplies no explicit session identity. Newer CLIs can recover an unambiguous current host ID, but must never choose another session. An empty read is the bug to fix, never a value to send.

### General rules

- Run the session-scoped read — `altitude task --json --session <this session's ID>` — first. Capture its output for your own routing; never print the raw JSON, stderr, or a stack trace to the learner. Read its `source` before anything else — where the answer came from decides what you are allowed to say (Step 1).
- Look for a `.altitude` file in this project before you degrade anything. Any missing command, nonzero exit, malformed response, or other CLI error means **free mode for this attempt** only when no such file is here; then degrade warmly and keep going. With a `.altitude` file present this is a bound journey, so take the update-required path above instead — or, when the shell reports `altitude` itself as not found, Step 1's install route, since there is nothing to update — keep the binding and plan intact, and never offer free mode as this project's route. A clean exit whose `source` is `"none"` is not a CLI error — it is a reach problem, and Step 1 owns it.
- One command at a time. The learner types setup commands in their own terminal, tells you what happened, and gets an explanation before the next command. **The first time you dictate a command, say where it goes** — a beginner should not have to guess. If you are running in Claude Code, add the shortcut in one line: a message starting with `!` (`!mkdir my-project`) runs as a shell command without leaving the session, and its output lands right in the conversation. Say it once and move on. In any other agent, or when you cannot tell which one you are in, point them at their terminal and say nothing about `!` — it is a Claude Code affordance, not a universal one.
- **Understanding checks probe forward, never backward.** Never ask the learner to restate something you just explained: the answer is two lines up on their screen, reading it back teaches nothing, and it spends the trust every later check depends on. Ask instead for a **prediction, an application, or a consequence** — not "what do you think `.altitude` is there for?" seconds after you told them, but "what would break if you deleted it?" or "say you clone this project onto a second computer tomorrow — what has to happen before Altitude sees your work again?"
- Dictate every command for the platform and shell the learner is actually on. You are running on their machine, so read the host platform from your environment instead of defaulting to macOS/Linux. On Windows, run **Match their shell** below before the first setup command — detect it, never ask the learner to name a shell or install a different one. When a command you gave fails because it was wrong for their system, own it immediately and plainly — a beginner's default assumption is that they broke it, and this is their first session.
- Never overwrite a learner-authored `learning/plan.md`. Only a plan whose first line is the exact generated marker below may be refreshed from the server.
- Never duplicate application setup that the journey already teaches. In particular, leave `git init`, scaffolding, and project tool installation to the journey's tasks when its first section covers them.

## Match their shell

Read the host platform from your environment. On macOS or Linux there is nothing to do here, and you must not create the file described below.

On Windows, detect the shell before dictating the first command — including `npm install -g @learnaltitude/cli` in Step 1, which for many learners is the first command they ever run. **Never ask the learner to name their shell**; someone starting their first session cannot answer that, and asking teaches them the tool expects knowledge they don't have. Never ask them to install a different one. Ask them to run `uname -s` and report what came back, framed as the first thing you're learning about their machine rather than a test:

- `MINGW64_NT…` or `MSYS_NT…` → Git Bash
- `Linux` → WSL
- "not recognized" or any other error → Windows-native. Have them run `$PSVersionTable.PSVersion`; a version table means PowerShell, a second error means `cmd`. An error here is information, not failure — say so plainly, because their first-ever command just appeared to fail.

Hold that value for the session and teach in that dialect. **Do not write it to disk yet** — the journey folder does not exist until Step 3, and creating `learning/` before then puts it in whatever directory they happened to start in. Record it in Step 4, once the project root is real.

## Step 1 — Find their route

Run `altitude task --json --session '<this session's ID>'` in the current working directory — written for their shell, never unscoped — and parse the single JSON object privately.

- If the command is unavailable or errors, look for a `.altitude` file in this project before you say anything. If one is here, this project is already bound, and you do not offer the standalone route as a replacement for this journey. When the shell reports `altitude` itself as not found — common after cloning onto another computer or switching Node versions — `altitude update` cannot run either: ask them to install it in their own terminal with `npm install -g @learnaltitude/cli`, keep the binding, plan, and queued progress exactly as they are, then run `/altitude:begin` again. For any other failure, take the update-required path from the hard rules — say the Altitude tools here could not report what this lesson needs, ask them to run `altitude update` in their own terminal, update the Altitude plugin in their agent and restart their agent, then run `/altitude:begin` again, and tell them their queued progress stays saved and syncs automatically once they have updated. With no `.altitude` file, explain in plain language that Altitude's standalone skills still work without an account: use `/start-project` for a new project or `/adopt-project` for an existing codebase. If they do have an Altitude account and want its planned journey, walk them through installing the CLI with `npm install -g @learnaltitude/cli`, then connecting with `/altitude:connect` (or `altitude connect` outside the installed plugin). Give and explain one command at a time; do not run these learner setup commands for them.
- If `connected` is false, look for a `.altitude` file in this project first. If one is here, take the not-connected branch in the hard rules: keep the binding, plan, and queued progress, ask them to connect this computer with `/altitude:connect`, and do not offer the standalone route for this folder. Otherwise give the same two honest routes: continue free with `/start-project` or `/adopt-project`, or connect their account with `/altitude:connect`. Do not call the account path required for learning.

### Where the answer came from

When `connected` is true, read `source` and `reason` before touching `journey`. `source` says whether you are looking at Altitude's live answer (`"network"`), the CLI's last-synced local copy (`"cache"`), or nothing at all (`"none"`). Newer CLIs add `reason` whenever `source` is not `"network"` — `"network_blocked"`, `"offline"`, `"unauthorized"`, or `"server_error"` — saying why the live read did not happen (with `"cache"`, why the copy was used). `journey: null` means "no journey" only when `source` is `"network"`; from `"cache"` or `"none"` it means the copy is missing, never that the account is empty. The envelope may also carry `transport` — the CLI's own diagnostics, never something to show or paraphrase to the learner.

- `"network"` → continue to the account routes below.
- `"cache"` → continue to the account routes below exactly as with a live answer. If `reason` is `"network_blocked"`, say nothing about it — that is the normal path in a sandboxed agent, and the hooks keep the copy fresh. For any other `reason`, add at most one calm line that you are working from the last-synced copy — no warning, no troubleshooting. The one exception is a bound project whose cached copy carries no `learning_runtime`: the stale-copy branch in the hard rules owns that, and it is not a live answer.
- `"none"` with `reason: "network_blocked"` → this coding agent is running the command without internet access (its sandbox), so the journey cannot be read from here. Say that plainly. It is not "no journey", not a broken install, not an out-of-date client — a blocked read carries no version evidence either way — and nothing about their account has changed. Offer two exits, one at a time, and stop after each until you hear back: (1) re-run your own scoped read — `altitude task --json --session '<this session's ID>'` — requesting elevated permissions; in Codex, request escalated permissions on the shell call with a one-line justification such as "Altitude needs network access to read your journey"; in a host without such a mechanism, skip this exit; (2) ask the learner to run `altitude task --json --session '<this session's ID>'` once in their own terminal — substitute the literal ID you read from the host and keep it in single quotes — bare in `cmd`, which would pass the quotes through as part of the ID — because `$CLAUDE_CODE_SESSION_ID` is not set in their shell and pasting the variable would send an unscoped read, tell you when it has finished, and then run `/altitude:begin` again — the CLI keeps a local copy that a sandboxed run can read. Codex aside: Altitude's hooks are what keep that local copy fresh, and they only run once the learner has trusted them ("Hooks need review" → **Trust all and continue** on launch); if they skipped that prompt, this detour repeats every session until they open `/hooks` and trust them.
- `"none"` with `reason: "offline"` → Altitude can't be reached right now, and a read that never arrived says nothing about their client version, so never tell them their tools are out of date here. Offer to try again in a moment. Nothing about their account has changed. If a `.altitude` file is already here this is a bound journey: leave the plan and recorded progress exactly as they are, and do not continue today in free mode — not through `/adopt-project`, which would pull this bound folder into the free method, and not from the local plan. The standalone free route (`/start-project` or `/adopt-project`) is today's honest offer only for a folder with no binding; a bound learner who wants to build anyway can start a separate standalone project in another folder.
- `"none"` with `reason: "unauthorized"` → this computer's link to their account was rejected. Ask them to run `/altitude:connect` (`$connect` in Codex, or `altitude connect` in any terminal) again, then come back to `/altitude:begin`.
- `"none"` with `reason: "server_error"` → Altitude had trouble answering. Ask them to try again shortly; if it keeps happening, email support@learnaltitude.com.
- `"none"` with no `reason` → an older CLI that cannot say why, and one below the 0.8.1 floor a server-planned lesson needs. Tell them you couldn't read their journey from here, ask them to run `altitude update` in their own terminal, update the Altitude plugin in their agent and restart their agent, then run `/altitude:begin` again, and tell them their queued progress stays saved and syncs automatically once they have updated. With a `.altitude` file here, keep the plan and recorded progress as they are and take the same no-free-mode line as `"offline"` above; the standalone free route stays open only for a folder with no binding.

Whatever the exit, the rule above stands: never print the raw JSON, stderr, or a stack trace.

### Account routes

- If `source` is `"network"` and `journey` is null, say that this account does not have a journey ready yet. Ask them to plan or select one on the Altitude web app and run `/altitude:begin` again, or offer the standalone free route now. This is the only reading that may say so.
- If a journey is present but `entitled` is not true and this directory is not already bound, explain that binding a new workshop needs an active subscription. The journey remains on their account; offer the standalone free route now instead of attempting `altitude bind`.

Treat this directory as bound only when `binding` is non-null and its `project_root` resolves to the current project root. A binding for a different folder does not bind this one.

The envelope may also carry `update_available`. Deliberately do nothing with it here. Every route through this skill ends in `/altitude:next-lesson` behavior, which delivers that notice at the close of the first lesson — repeating it here would spend part of a first session on maintenance and say the same thing twice.

## Step 2 — Protect existing work

When a journey is present but the current directory is not bound, inspect `learning/plan.md` before doing anything else.

If it exists and its first line is not exactly:

`<!-- altitude:generated from your journey — local edits don't sync; park ideas in a lesson or edit on the web -->`

stop. Never overwrite or rename it. Explain the three options honestly:

1. Keep this project in the free method. Its plan is theirs, and `/next-lesson` continues to work as it always has.
2. Start the paid journey in a fresh folder. Offer to guide them through creating it now.
3. Adopt this project into their Altitude account later. Account-side project adoption is coming, but is not available yet.

Wait for their choice. These are genuine alternatives, so a choice panel is acceptable if the host supports one.

## Step 3 — Make the journey's home

For a fresh start, derive a conservative kebab-case folder name from the journey title: lowercase it, replace each run of non-alphanumeric characters with one hyphen, and trim leading or trailing hyphens. Show the proposed name and let the learner change it.

Then guide them through these beats one at a time:

1. Ask them to run `mkdir <journey-name>` themselves and report what happened.
2. Ask them to run `cd <journey-name>` themselves. Make sure the agent's working directory is now that folder too; if their host requires reopening the agent there, explain that plainly and resume `/altitude:begin` after they do.
3. Ask them to run `altitude bind`. If the CLI says this folder is bound to another journey, explain what `--force` would replace and get their explicit choice before asking them to run `altitude bind --force`. Binding writes one small `.altitude` file here, and that file is the entire link between this folder and their journey. Name it plainly, then check it forward, not backward: "what do you think happens to your lessons if that file goes away?" — never "so what's `.altitude` for?", which only asks them to repeat the sentence you just said.
4. Re-run the Step 1 read privately — `altitude task --json --session '<this session's ID>'`, written for their shell, never unscoped — and read `source` the same way as in Step 1. `altitude bind` ran in the learner's own terminal, where the network works, and it saves a local copy of the journey — so a `"cache"` answer here still confirms the binding. A copy that carries no `learning_runtime` is the stale-copy branch in the hard rules, not a complete answer. Continue once `binding.project_root` resolves to this project and the journey is present. A `"none"` answer is a reach problem, not a binding failure: the `.altitude` file was written, so never tell them the bind failed — take Step 1's exit for its `reason` (in a sandboxed agent, the fix is the learner's own-terminal read with the literal ID substituted) and continue once a read succeeds. If the CLI itself reported that binding failed, explain its friendly message without exposing raw diagnostics; offer the free route rather than trapping them.

Creating and entering the folder is the first lesson beat, not clerical work: explain that the folder is the project's home and let their hands establish it.

## Step 4 — Materialize `learning/plan.md`

Create `learning/` if needed and render the bound journey to `learning/plan.md`. The output is deterministic: for the same journey object, write the same UTF-8 bytes, use LF line endings, preserve the arrays' supplied order, and end with one newline.

Render exactly this structure:

1. The first line is this byte-exact generated marker:

   `<!-- altitude:generated from your journey — local edits don't sync; park ideas in a lesson or edit on the web -->`
2. Add a blank line, then `# <journey.title>`.
3. If `summary` is non-null and non-empty, add a blank line and its text verbatim.
4. If `build_brief` is non-null and non-empty, add `## Locked decisions` surrounded by blank lines, then append the markdown string verbatim. Do not summarize, reflow, reorder, or reinterpret it.
5. For each section in the supplied order, add a blank line and `## NN · <section.title>`, where `NN` is the section's numeric `position` left-padded to two digits. On the next non-blank line write the section description verbatim when present.
6. Under each section, render its tasks in supplied order. A task whose `status` is `completed` is `- [x] <task.title>`; every other status is `- [ ] <task.title>`. If its `id` equals `current_task.id`, append ` ← you are here`. When a task description is present, put it on the following line, prefixing every description line with two spaces.

Use exactly one blank line between top-level blocks. Apart from the required two-space task-description prefix, preserve server text verbatim. Never put IDs, inferred tasks, timestamps, or other nondeterministic data in the file.

On Windows only, also write the shell you detected earlier to `learning/environment.md`, so later sessions and `/altitude:next-lesson` don't re-detect it. Exactly these bytes, LF line endings, one trailing newline, nothing else — no dates, no IDs, no notes:

```
<!-- altitude:environment — how your lessons write commands; edit this if your setup changes -->

- platform: windows
- shell: <powershell | cmd | git-bash | wsl>
```

## Step 5 — Point out the route, then begin

Give a short orientation, not a second planning session: name the journey, list its sections at a glance, and point out the current section and task. If section 1 already covers git, scaffolding, or setup, explicitly leave those beats to it.

Then continue directly with `/altitude:next-lesson` behavior for the current task. Do not make the learner invoke another skill just to get started; this is one skill family and the handoff should feel continuous.

## Already bound

If the first probe shows that this project is already bound and has a journey, say so warmly, then continue directly with `/altitude:next-lesson` behavior. This includes a paused subscription; `next-lesson` gives the one-time notice and owns what follows it, including the versioned lessons it may not run without an active subscription. Do not re-bind, rebuild local learning state here, or leave them at a dead end; `next-lesson` owns the server refresh and lesson loop.
