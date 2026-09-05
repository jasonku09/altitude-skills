---
name: connect
description: Connect this coding agent installation to the user's Altitude account via the device pairing flow.
allowed-tools: Bash(claude --version) Bash(codex --version) Bash(altitude connect *) Bash(altitude status)
---

Connect the current coding agent installation to Altitude:

1. Identify which agent you are running in, then capture its version:
   - **Claude Code:** run `claude --version` and take the leading semantic version number.
   - **Codex:** run `codex --version` and take the version from its `codex-cli x.y.z` output.
     If it is older than 0.131.0, warn the user that Altitude's session hooks need Codex
     CLI >= 0.131.0 and suggest updating first — the server makes the final call during
     pairing.
2. Start the pairing command for your agent in the background:
   - **Claude Code:** `altitude connect --agent claude-code --agent-version <version> --next-hint "Open your coding agent in your project folder and run /altitude:begin to start your first lesson."`
   - **Codex:** `altitude connect --agent codex --agent-version <version> --next-hint "Open your coding agent in your project folder and run $begin to start your first lesson."`

   **Codex aside — the sandbox:** in Codex's default modes the shell has no internet access, so a plain background `altitude connect` fails before it can print a code. Request escalated permissions for that one command with a one-line justification ("Altitude needs network access to pair this computer with your account"). If that is declined, or the host has no such mechanism, do not retry blindly and do not call the install broken: give the learner the exact `altitude connect` line above to run in their own terminal, ask them to paste back the URL and code it prints, and continue from step 3 with those.
3. Relay the verification URL and one-time code from its output to the user immediately.
4. Wait for the user to confirm in the browser, then report whether the command completed successfully. If the learner ran the command in their own terminal, ask them to tell you when it reports success instead.
5. Run `altitude status` and summarize the connection, binding, and journey state.
6. **Codex aside — the one-time trust prompt:** Codex asks "Hooks need review" the first time it launches with Altitude installed, and again after a plugin update changes a hook. Tell the learner to choose **Trust all and continue** whenever it appears; if they dismissed it earlier, ask them to open `/hooks` now and trust Altitude's hooks. Those hooks run outside the sandbox and keep a local copy of the journey fresh, which is what lets `$begin` and `$next-lesson` read it from inside the sandbox; untrusted, every lesson starts by asking them to run a command in their own terminal.

Do not alter the device flow or send credentials anywhere except through the `altitude` CLI.
