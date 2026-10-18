#!/usr/bin/env node

// Codex hook shim. hooks/codex.json invokes this file through frozen
// one-liners whose raw text Codex's hook-trust hash covers — so all logic
// that may need to change lives here, where edits never re-prompt (or
// silently drop) a user's trust.
//
// POSIX runs `node "$PLUGIN_ROOT/bin/altitude-codex-hook.mjs" <action>`.
// Windows runs a `node -e` bootstrap that imports this module from the
// PLUGIN_ROOT environment variable and calls main(<action>): Codex launches
// Windows hooks through the session's PowerShell (cmd when it has none), and
// a path written into the command text would be re-parsed by whichever shell
// that is — `$` and backticks by PowerShell, `%VAR%` by cmd.

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCli } from "./altitude-cli.mjs";

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
  // Stop is end of TURN. Only this lifecycle ends the session, so without it
  // the session marker is never retired and no `session_ended` is ever sent.
  "session-end": ["hook", "session-end", "--agent", "codex", "--mapping", mappingPath],
  // Turn start: stamps what this turn's gates credit, and carries the
  // learner's answer to a retro question parked at the end of the last turn.
  "user-prompt-submit": [
    "hook",
    "user-prompt-submit",
    "--agent",
    "codex",
    "--mapping",
    mappingPath,
  ],
};

// Never through a shell: on Windows that meant running `altitude.cmd` via
// cmd, which split argument paths on spaces, turned a missing CLI into cmd's
// exit 1, and drew Node's DEP0190 warning on every hook. resolveCli runs
// npm's installed JavaScript entry point with this Node instead.
function runCli(args, input) {
  let cli;
  try {
    cli = resolveCli();
  } catch (error) {
    return { error };
  }
  return spawnSync(cli.file, [...cli.args, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    input,
  });
}

async function runHook(action) {
  let stdin = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) stdin += chunk;

  const result = runCli(
    [...hookActions[action], "--transcript-mapping", join(pluginRoot, "hooks/codex-transcript-mapping.json")],
    stdin,
  );
  if (result.error) {
    // Gates fail OPEN: a missing or crashed CLI must never block the session.
    process.stderr.write(
      `Altitude could not run the workshop CLI: ${result.error.message}\n`,
    );
    return 0;
  }

  if (result.stderr) process.stderr.write(result.stderr);
  const status = result.status ?? 0; // null = killed by a signal: fail open
  if (status !== 0 && status !== 2) {
    // Gates fail OPEN: only 0 (allow) and 2 (an explicit gate block) may
    // reach Codex. Anything else is a crash (old CLI, broken install, a
    // Windows shell's 1/9009) — Codex would show it as "hook failed" on every
    // turn. The CLI's own stderr above is the real error; its stdout is not
    // trusted as model context.
    process.stderr.write(
      `Altitude hook skipped: the workshop CLI exited with code ${status}; continuing without blocking.\n`,
    );
    return 0;
  }
  // Plain stdout passthrough for every action: Codex injects non-JSON
  // SessionStart stdout as model context (the Claude Code convention), and
  // gate passes print nothing.
  if (result.stdout) process.stdout.write(result.stdout);
  return status;
}

// Every path out of this shim is a hook result, so it exits only 0 or 2 —
// including an unknown action and a throw in the shim itself (which would
// otherwise be an unhandled top-level-await rejection: exit 1).
export async function main(action) {
  try {
    if (Object.hasOwn(hookActions, action)) {
      process.exitCode = await runHook(action);
    } else {
      process.stderr.write(
        "usage: altitude-codex-hook " +
          "<session-start|plan|diff|stop|session-end|user-prompt-submit>\n",
      );
      process.exitCode = 0;
    }
  } catch (error) {
    process.stderr.write(
      `Altitude hook skipped: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 0;
  }
}

function isEntrypoint() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntrypoint()) await main(process.argv[2]);
