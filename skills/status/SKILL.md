---
name: status
description: Show local Altitude connection, binding, journey, queue, session, and flusher status.
allowed-tools: Bash(altitude status)
---

Run `altitude status` and summarize its output. If it reports that the device is disconnected,
tell the user to run the connect skill (`/altitude:connect` in Claude Code, `$connect` in Codex).
