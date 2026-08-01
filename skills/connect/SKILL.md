---
description: Connect this Claude Code installation to the user's Altitude account.
disable-model-invocation: true
allowed-tools: Bash(claude --version) Bash(altitude connect *) Bash(altitude status)
---

Connect the current Claude Code installation to Altitude:

1. Run `claude --version` and take the leading semantic version number.
2. Start `altitude connect --agent claude-code --agent-version <version> --next-hint "Open your coding agent in your project folder and run /altitude:begin to start your first lesson."` in the background.
3. Relay the verification URL and one-time code from its output to the user immediately.
4. Wait for the user to confirm in the browser, then report whether the command completed successfully.
5. Run `altitude status` and summarize the connection, binding, and journey state.

Do not alter the device flow or send credentials anywhere except through the `altitude` CLI.
