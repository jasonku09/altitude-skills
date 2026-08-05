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
3. Relay the verification URL and one-time code from its output to the user immediately.
4. Wait for the user to confirm in the browser, then report whether the command completed successfully.
5. Run `altitude status` and summarize the connection, binding, and journey state.

Do not alter the device flow or send credentials anywhere except through the `altitude` CLI.
