#!/usr/bin/env node

// Transport only. All session, evidence and question state belongs to the CLI.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCli } from "./altitude-cli.mjs";

// Re-exported: the Copilot adapter and existing callers import it from here.
export { resolveCli };

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mapping = join(pluginRoot, "hooks/cursor-field-mapping.json");
const actions = {
  "session-start": ["session-start", "--print-context", "--nudge", "Run /next-lesson to continue (or /begin for your first session)."],
  diff: ["pre-tool-use", "--gate", "diff"],
  stop: ["stop", "--gate", "retro"],
  "session-end": ["session-end"],
  "user-prompt-submit": ["user-prompt-submit"],
  "after-assistant-response": ["after-assistant-response"],
};

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function contains(path, root, child) {
  const rel = path.relative(root, child);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

/**
 * Native Windows Cursor sends project paths in URI-path form — a slash before
 * a drive letter, often lowercase, with forward slashes ("/c:/Users/x",
 * "/d:/code/"). Node treats that as a rootless path and resolves it to
 * "C:\c:\Users\x", so the CLI would never find the project's binding.
 * Convert those (and file: URIs) to native drive paths, uppercasing the drive
 * letter the way Windows' own working directories report it. Everything else
 * is returned unchanged for the absolute-path checks to judge. A no-op off
 * Windows, where "/c:/x" is a legal path.
 * @param {unknown} value @param {string} [platform]
 */
export function cursorHostPath(value, platform = process.platform) {
  if (platform !== "win32" || typeof value !== "string") return value;
  let path;
  if (/^file:/i.test(value)) {
    // Decodes percent-escapes; a URI host becomes a \\server\share UNC path.
    try { path = fileURLToPath(value, { windows: true }); } catch { return value; }
  } else path = value.replace(/^[\\/](?=[A-Za-z]:(?:[\\/]|$))/, "");
  if (/^\/[A-Za-z]:$/.test(value)) path += "\\";
  if (/^[A-Za-z]:[\\/]/.test(path)) return win32.normalize(`${path[0].toUpperCase()}${path.slice(1)}`);
  return path;
}

/**
 * Select the one project folder this callback belongs to and copy only the
 * documented transport fields. `platform` picks the path rules (tests run the
 * win32 rules on any OS); it defaults to the running host.
 */
export function normalizeCursorInput(input, action, { platform = process.platform } = {}) {
  const path = platform === "win32" ? win32 : posix;
  if (!record(input) || !nonempty(input.conversation_id)) throw new Error("Cursor did not provide an exact conversation ID.");
  if (input.session_id !== undefined && input.session_id !== input.conversation_id) throw new Error("Cursor session identities disagree.");
  if (input.is_background_agent === true) throw new Error("Altitude workshops require an interactive Cursor session.");
  const sentRoots = Array.isArray(input.workspace_roots) ? input.workspace_roots.map((root) => cursorHostPath(root, platform)) : [];
  if (sentRoots.length === 0 || !sentRoots.every((root) => nonempty(root) && path.isAbsolute(root))) throw new Error("Cursor did not provide an unambiguous project.");
  const roots = [...new Set(sentRoots.map((root) => path.resolve(root)))];
  let selected;
  // The terminal currently sends cwd:"" for generic tools. An empty value
  // contributes no project evidence; only a sole workspace root can replace it.
  if (input.cwd !== undefined && input.cwd !== "") {
    const cwd = cursorHostPath(input.cwd, platform);
    if (!nonempty(cwd) || !path.isAbsolute(cwd)) throw new Error("Cursor cwd is not an absolute project path.");
    const matches = roots.filter((root) => contains(path, root, path.resolve(cwd)));
    if (matches.length === 1) selected = path.resolve(cwd);
  } else if (roots.length === 1) selected = roots[0];
  if (!selected) throw new Error("Cursor workspace is ambiguous; open the bound lesson folder in its own workspace.");
  // Copy only documented transport fields. Do not forward email, arbitrary
  // prompt_origin, or an invented continuation association.
  const normalized = { conversation_id: input.conversation_id, cwd: selected };
  for (const key of ["generation_id", "tool_name"]) if (typeof input[key] === "string") normalized[key] = input[key];
  if (nonempty(input.transcript_path)) normalized.transcript_path = cursorHostPath(input.transcript_path, platform);
  if (record(input.tool_input)) normalized.tool_input = input.tool_input;
  if (nonempty(input.cursor_version)) normalized.agent_version = input.cursor_version;
  // The model the learner picked, for the tutor's recommended-model line.
  // Prefer the structured `model_id` ("claude-opus-4-7"); `model` is Cursor's
  // legacy composer slug with variant knobs baked in ("…-thinking-max") and is
  // only the fallback when no structured ID is available. model_params stays out.
  const model = [input.model_id, input.model].find(nonempty);
  if (model) normalized.model = model.trim();
  if (action === "session-end" && typeof input.reason === "string") normalized.reason = input.reason;
  if (action === "user-prompt-submit") {
    normalized.prompt = typeof input.prompt === "string" ? input.prompt : "";
    normalized.prompt_origin = "unknown";
  }
  if (action === "after-assistant-response" && typeof input.text === "string") normalized.last_assistant_message = input.text;
  if (action === "stop") {
    if (["completed", "aborted", "error"].includes(input.status)) normalized.stop_status = input.status;
    if (Number.isSafeInteger(input.loop_count) && input.loop_count >= 0) normalized.continuation_count = String(input.loop_count);
  }
  return normalized;
}

function parseResult(raw, status, sessionId) {
  const result = JSON.parse(raw);
  if (!record(result) || result.version !== 1 || ![0, 2].includes(status) || result.exitCode !== status || result.action !== (status === 2 ? "block" : "allow") || !Array.isArray(result.context) || !result.context.every((item) => typeof item === "string")) throw new Error("Altitude CLI returned an invalid hook result.");
  if (result.reason !== undefined && typeof result.reason !== "string") throw new Error("Altitude CLI returned an invalid reason.");
  if (result.session !== undefined && (!record(result.session) || result.session.id !== sessionId)) throw new Error("Altitude CLI returned a different session.");
  if (result.followup !== undefined && (!record(result.followup) || !nonempty(result.followup.id) || !nonempty(result.followup.prompt))) throw new Error("Altitude CLI returned an invalid continuation.");
  return result;
}

function contextForSession(result) {
  // Cursor shell tools do not reliably inherit sessionStart.env. Relay only
  // core-confirmed identity as JSON data, including before a project is bound.
  const identity = result.session ? [
    "Altitude current Cursor session metadata (JSON):",
    JSON.stringify({ session_id: result.session.id }),
    "Use this exact session_id for Altitude --session arguments in this conversation; it identifies the chat, not whether a lesson is bound.",
  ].join("\n") : undefined;
  return [...(identity ? [identity] : []), ...result.context].join("\n\n");
}

function openResponse(action) {
  if (["diff"].includes(action)) return { permission: "allow" };
  if (action === "user-prompt-submit") return { continue: true };
  return {};
}

export async function main(action = process.argv[2]) {
  /** @type {{ permission?: string, continue?: boolean, user_message?: string, agent_message?: string, additional_context?: string, env?: { ALTITUDE_SESSION_ID: string } }} */
  let response = openResponse(action);
  let exitCode = 0;
  try {
    if (!Object.hasOwn(actions, action)) throw new Error("Unknown Cursor hook action.");
    let stdin = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      stdin += chunk;
      if (stdin.length > 1024 * 1024) throw new Error("Cursor hook input is too large.");
    }
    const input = normalizeCursorInput(JSON.parse(stdin), action);
    const command = resolveCli();
    const [lifecycle, ...extra] = actions[action];
    const args = [...command.args, "hook", lifecycle, "--agent", "cursor", "--mapping", mapping, "--transcript-mapping", join(pluginRoot, "hooks/cursor-transcript-mapping.json"), "--output", "json", "--delivery", "prompt-context", "--stop-policy", "defer-to-prompt", ...extra];
    const child = spawnSync(command.file, args, { shell: false, input: JSON.stringify(input), encoding: "utf8", timeout: 25000, maxBuffer: 1024 * 1024, windowsHide: true });
    // Relay the CLI's own stderr first: when it crashed, that is the real
    // error a human running the hook by hand needs to see.
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.error || child.signal) throw new Error("Altitude CLI could not finish this hook.");
    const result = parseResult(child.stdout, child.status, input.conversation_id);
    if (result.action === "block" && ["diff", "user-prompt-submit"].includes(action)) {
      const reason = result.reason || "Altitude requested a workshop check before continuing.";
      response = action === "user-prompt-submit" ? { continue: false, user_message: reason } : { permission: "deny", user_message: reason, agent_message: reason };
      exitCode = 2;
    } else if (action === "session-start" || action === "user-prompt-submit") {
      const context = contextForSession(result);
      response = {
        ...(action === "session-start" && result.session ? { env: { ALTITUDE_SESSION_ID: result.session.id } } : {}),
        ...(action === "user-prompt-submit" ? { continue: true } : {}),
        ...(context ? { additional_context: context } : {}),
      };
    }
    // Intentionally do not return followup_message: no verified Cursor origin
    // or callback association exists yet. Core keeps delivery unacknowledged.
  } catch (error) {
    process.stderr.write(`Altitude Cursor hook skipped: ${error instanceof Error ? error.message : "unexpected failure"}\n`);
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
  process.exitCode = exitCode;
}

function isEntrypoint() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isEntrypoint()) await main();
