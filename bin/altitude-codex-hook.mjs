#!/usr/bin/env node

// Codex hook shim. hooks/codex.json invokes this file through frozen
// `${PLUGIN_ROOT}` one-liners whose raw text Codex's hook-trust hash covers —
// so all logic that may need to change lives here, where edits never
// re-prompt (or silently drop) a user's trust.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mappingPath = join(pluginRoot, "hooks/codex-field-mapping.json");

const hookActions = {
  "session-start": [
    "hook",
    "session-start",
    "--agent",
    "codex",
    "--mapping",
    mappingPath,
    "--print-context",
    "--nudge",
    "Run $next-lesson to continue (or $begin for your first session).",
  ],
  plan: [
    "hook",
    "pre-tool-use",
    "--agent",
    "codex",
    "--mapping",
    mappingPath,
    "--gate",
    "plan",
  ],
  diff: [
    "hook",
    "pre-tool-use",
    "--agent",
    "codex",
    "--mapping",
    mappingPath,
    "--gate",
    "diff",
  ],
  stop: [
    "hook",
    "stop",
    "--agent",
    "codex",
    "--mapping",
    mappingPath,
    "--gate",
    "retro",
  ],
};

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(command, args, options = {}) {
  return spawnSync(executable(command), args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });
}

async function runHook(action) {
  let stdin = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) stdin += chunk;

  const result = run("altitude", hookActions[action], { input: stdin });
  if (result.error) {
    // Gates fail OPEN: a missing or crashed CLI must never block the session.
    process.stderr.write(
      `Altitude could not run the workshop CLI: ${result.error.message}\n`,
    );
    return 0;
  }

  if (result.stderr) process.stderr.write(result.stderr);
  // Plain stdout passthrough for every action: Codex injects non-JSON
  // SessionStart stdout as model context (the Claude Code convention), and
  // gate passes print nothing.
  if (result.stdout) process.stdout.write(result.stdout);
  return result.status ?? 0;
}

const action = process.argv[2];
if (Object.hasOwn(hookActions, action)) {
  process.exitCode = await runHook(action);
} else {
  process.stderr.write("usage: altitude-codex-hook <session-start|plan|diff|stop>\n");
  process.exitCode = 1;
}
