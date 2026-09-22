#!/usr/bin/env node

// Transport only. All session, evidence and question state belongs to the CLI.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

// npm's Windows entry point is a .cmd wrapper. Executing it with shell:true
// would interpret path/argument metacharacters. Resolve its installed package
// and launch the JavaScript bin with this Node process instead. Never eval .cmd.
export function resolveCli({ platform = process.platform, path = process.env.PATH ?? "", separator = delimiter, cliPath = process.env.ALTITUDE_CLI_PATH } = {}) {
  if (cliPath) {
    if (!isAbsolute(cliPath) || !existsSync(cliPath) || !statSync(cliPath).isFile()) throw new Error("ALTITUDE_CLI_PATH must name an existing absolute JavaScript entry point.");
    return { file: process.execPath, args: [cliPath] };
  }
  if (platform !== "win32") return { file: "altitude", args: [] };
  for (const directory of path.split(separator).filter(Boolean)) {
    const native = join(directory, "altitude.exe");
    if (existsSync(native)) return { file: native, args: [] };
    if (!existsSync(join(directory, "altitude.cmd"))) continue;
    const packageRoot = join(directory, "node_modules/@learnaltitude/cli");
    try {
      const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.altitude;
      if (pkg.name !== "@learnaltitude/cli" || typeof bin !== "string") continue;
      const entry = resolve(packageRoot, bin);
      if (relative(packageRoot, entry).startsWith(`..${sep}`) || !existsSync(entry)) continue;
      return { file: process.execPath, args: [entry] };
    } catch { /* A broken install is a fail-open diagnostic, never a shell fallback. */ }
  }
  throw new Error("Altitude CLI was not found; install it with npm install -g @learnaltitude/cli.");
}

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function contains(root, path) {
  const child = relative(root, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function normalize(input, action) {
  if (!record(input) || !nonempty(input.conversation_id)) throw new Error("Cursor did not provide an exact conversation ID.");
  if (input.session_id !== undefined && input.session_id !== input.conversation_id) throw new Error("Cursor session identities disagree.");
  if (input.is_background_agent === true) throw new Error("Altitude workshops require an interactive Cursor session.");
  if (!Array.isArray(input.workspace_roots) || input.workspace_roots.length === 0 || !input.workspace_roots.every((root) => nonempty(root) && isAbsolute(root))) throw new Error("Cursor did not provide an unambiguous project.");
  const roots = [...new Set(input.workspace_roots.map((root) => resolve(root)))];
  let selected;
  // The terminal currently sends cwd:"" for generic tools. An empty value
  // contributes no project evidence; only a sole workspace root can replace it.
  if (input.cwd !== undefined && input.cwd !== "") {
    if (!nonempty(input.cwd) || !isAbsolute(input.cwd)) throw new Error("Cursor cwd is not an absolute project path.");
    const matches = roots.filter((root) => contains(root, resolve(input.cwd)));
    if (matches.length === 1) selected = resolve(input.cwd);
  } else if (roots.length === 1) selected = roots[0];
  if (!selected) throw new Error("Cursor workspace is ambiguous; open the bound lesson folder in its own workspace.");
  // Copy only documented transport fields. Do not forward email, transcript
  // paths, arbitrary prompt_origin, or an invented continuation association.
  const normalized = { conversation_id: input.conversation_id, cwd: selected };
  for (const key of ["generation_id", "tool_name"]) if (typeof input[key] === "string") normalized[key] = input[key];
  if (record(input.tool_input)) normalized.tool_input = input.tool_input;
  if (nonempty(input.cursor_version)) normalized.agent_version = input.cursor_version;
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

function openResponse(action) {
  if (["diff"].includes(action)) return { permission: "allow" };
  if (action === "user-prompt-submit") return { continue: true };
  return {};
}

export async function main(action = process.argv[2]) {
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
    const input = normalize(JSON.parse(stdin), action);
    const command = resolveCli();
    const [lifecycle, ...extra] = actions[action];
    const args = [...command.args, "hook", lifecycle, "--agent", "cursor", "--mapping", mapping, "--output", "json", "--delivery", "prompt-context", "--stop-policy", "defer-to-prompt", ...extra];
    const child = spawnSync(command.file, args, { shell: false, input: JSON.stringify(input), encoding: "utf8", timeout: 25000, maxBuffer: 1024 * 1024, windowsHide: true });
    if (child.error || child.signal) throw new Error("Altitude CLI could not finish this hook.");
    const result = parseResult(child.stdout, child.status, input.conversation_id);
    if (child.stderr) process.stderr.write(child.stderr);
    if (result.action === "block" && ["diff", "user-prompt-submit"].includes(action)) {
      const reason = result.reason || "Altitude requested a workshop check before continuing.";
      response = action === "user-prompt-submit" ? { continue: false, user_message: reason } : { permission: "deny", user_message: reason, agent_message: reason };
      exitCode = 2;
    } else if (action === "session-start") {
      response = { ...(result.session ? { env: { ALTITUDE_SESSION_ID: result.session.id } } : {}), ...(result.context.length ? { additional_context: result.context.join("\n\n") } : {}) };
    }
    else if (action === "user-prompt-submit" && result.context.length) {
      response = { continue: true, additional_context: result.context.join("\n\n") };
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
