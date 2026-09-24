---
name: connect
description: Connect this coding agent installation to the user's Altitude account via the device pairing flow.
allowed-tools: Bash(claude --version) Bash(codex --version) Bash(cursor --version) Bash(cursor-agent --version) Bash(agent --version) Bash(altitude connect *) Bash(altitude status) Bash(altitude --version) Bash(altitude update) Bash(node *)
---

**Host commands:** In Cursor desktop and Cursor terminal, invoke the same shared skills as `/begin`, `/connect`, `/status`, and `/next-lesson` (choose Altitude in the skill picker when names collide). Translate `/altitude:<skill>` examples in this file to `/<skill>` in Cursor; Claude Code keeps `/altitude:<skill>` and Codex keeps `$<skill>`.

Connect the current coding agent installation to Altitude:

**Cursor preparation, including already-paired installations:** before plugin setup or pairing, have the learner run `altitude update` in their own terminal and wait for it to finish. If `altitude` is missing, use `npm install -g @learnaltitude/cli` instead. Then read `altitude --version` from the same environment that will run pairing. Older CLIs do not recognize `--agent cursor`; a plugin update alone cannot add that identity. If the installed CLI still rejects Cursor after updating, keep the existing pairing/binding/progress and report that this CLI does not support Cursor yet; never re-run pairing without `--agent` or with another agent's identity. A successful update is not proof that a lesson passed acceptance.

1. Identify which agent you are running in, then capture its version:
   - **Claude Code:** run `claude --version` and take the leading semantic version number.
   - **Codex:** run `codex --version` and take the version from its `codex-cli x.y.z` output.
     If it is older than 0.131.0, warn the user that Altitude's session hooks need Codex
     CLI >= 0.131.0 and suggest updating first — the server makes the final call during
     pairing.
   - **Cursor desktop:** read the desktop version from `cursor --version` (first line) or Cursor About. Do not substitute the terminal agent version.
   - **Cursor terminal:** run `cursor-agent --version` (or `agent --version` if that is its installed command). Preserve its full date-and-build version string; do not invent a semantic version.
   - **Cursor compatibility setup:** resolve `../../bin/altitude-cursor-setup.mjs` relative to this installed `skills/connect/SKILL.md` using the source path attached to this invocation or the file you actually read. Do not assume plugin hook environment variables exist in your shell. If the source path is unavailable, recover the active installation location from Cursor's plugin manager; never choose the newest cache directory or another checkout. Then run `node '<that actual absolute file path>' install` (quote for the current shell). This also records this exact installed plugin root as JSON data in `~/.cursor/altitude/plugin.json`; native hooks read that registration because Cursor can supply another plugin's root environment. Run `/connect` again after every plugin update to refresh the registration from the newly active skill source. Missing or stale registrations fail open with a `/connect` diagnostic. The setup idempotently adds three owned, inert user-hook entries that let the terminal agent dispatch the native plugin's turn hooks; existing hooks are preserved. Run the shipped script, never recreate its config by hand. If setup fails, relay its short error and leave the config intact. A copied skill without that script is not the full plugin: use Cursor's plugin manager to install the complete plugin. Start a new Cursor session after a changed setup before beginning a lesson. Removal uses the same installed script with `uninstall`; it removes only Altitude's compatibility entries and its matching registration; an older plugin cannot erase a newer registration.
   **Cursor pairing decision:** after compatibility setup, run `altitude status` before starting a new device flow. This command is local and cache-only: `connected` reports whether a readable, correctly shaped saved token exists. It does not identify the account or verify that the server accepts the token; never call it proof of the intended account or healthy online authentication.

   - For ordinary initial setup or plugin-update maintenance with `connected: true`, preserve the existing pairing and skip steps 2–4. Say the existing local pairing was kept and the plugin registration is ready; continue with the status summary and installation check below. A changed setup still needs a new Cursor session before `/begin` or `/next-lesson`.
   - If the learner explicitly asks to reconnect or change accounts, continue with pairing even when a local token exists. If a fresh CLI request has already returned `unauthorized`, explain that the server rejected the saved credential and continue with pairing to repair it. Do not expose the credential or delete the binding, plan, or queued progress.
   - With `connected: false`, the saved token is missing or malformed; continue with pairing. Offline or network-blocked reads, absent cached journey data, and an idle flusher do not imply an invalid token and never trigger automatic re-pairing.
   - If the status command fails or its output cannot be read, relay the short diagnostic and stop the pairing decision here; do not infer disconnection or start pairing merely because status failed. Preserve the existing local state and the registration just refreshed.

2. Start the pairing command for your agent in the background:
   - **Claude Code:** `altitude connect --agent claude-code --agent-version <version> --next-hint "Open your coding agent in your project folder and run /altitude:begin to start your first lesson."`
   - **Codex:** `altitude connect --agent codex --agent-version <version> --next-hint "Open your coding agent in your project folder and run $begin to start your first lesson."`
   - **Cursor desktop or terminal:** `altitude connect --agent cursor --agent-version <observed version> --next-hint "Open your coding agent in your project folder and run /begin to start your first lesson."`

   **Codex aside — the sandbox:** in Codex's default modes the shell has no internet access, so a plain background `altitude connect` fails before it can print a code. Request escalated permissions for that one command with a one-line justification ("Altitude needs network access to pair this computer with your account"). If that is declined, or the host has no such mechanism, do not retry blindly and do not call the install broken: give the learner the exact `altitude connect` line above to run in their own terminal, ask them to paste back the URL and code it prints, and continue from step 3 with those.
3. Relay the verification URL and one-time code from its output to the user immediately.
4. Wait for the user to confirm in the browser, then report whether the command completed successfully. If the learner ran the command in their own terminal, ask them to tell you when it reports success instead.
5. Run `altitude status` and summarize the connection, binding, and journey state.
6. **Codex aside — the one-time trust prompt:** Codex asks "Hooks need review" the first time it launches with Altitude installed, and again after a plugin update changes a hook. Tell the learner to choose **Trust all and continue** whenever it appears; if they dismissed it earlier, ask them to open `/hooks` now and trust Altitude's hooks. Those hooks run outside the sandbox and keep a local copy of the journey fresh, which is what lets `$begin` and `$next-lesson` read it from inside the sandbox; untrusted, every lesson starts by asking them to run a command in their own terminal.

7. **Cursor installation check:** the full native Altitude plugin must be loaded, including hooks; a copied `skills/` folder serves only the standalone free method. Use Cursor Customize and its Hooks output to confirm loading, then start a new conversation. Preserve existing user and project hooks. This integration is awaiting full desktop/terminal lesson acceptance; do not claim a successful pairing proves the lesson works, or bypass a server compatibility pause.

Do not alter the device flow or send credentials anywhere except through the `altitude` CLI.
