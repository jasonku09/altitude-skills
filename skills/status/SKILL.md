---
name: status
description: Show local Altitude connection, binding, journey, queue, session, and flusher status.
allowed-tools: Bash(altitude status)
---

**Host commands:** In Cursor desktop and Cursor terminal, invoke the same shared skills as `/begin`, `/connect`, `/status`, and `/next-lesson` (choose Altitude in the skill picker when names collide). Translate `/altitude:<skill>` examples in this file to `/<skill>` in Cursor; Claude Code keeps `/altitude:<skill>` and Codex keeps `$<skill>`.

Run `altitude status` and summarize its output. If it reports that the device is disconnected,
tell the user to run the connect skill (`/altitude:connect` in Claude Code, `$connect` in Codex, `/connect` in Cursor).
