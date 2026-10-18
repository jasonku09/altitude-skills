// Fast Windows check that needs no Codex: launches every hook in this
// checkout's hooks/codex.json the way Codex's hooks engine does, across
// shells x user-profile paths, and fails unless every case exits 0 cleanly.
//
// The plugin is laid out at Codex's plugin-store path
// (<CODEX_HOME>\plugins\cache\altitude\altitude\<version>) and each hook is
// started by codex-launcher.exe (a Rust replica of Codex's Windows spawn:
// `<shell> -NoProfile -Command <commandWindows>` for pwsh / Windows
// PowerShell 5.1, `%COMSPEC% /C "<commandWindows>"` for the no-shell
// fallback; env_clear + Codex's env snapshot + PLUGIN_ROOT/PLUGIN_DATA,
// CREATE_NO_WINDOW, hook JSON on stdin, cwd = the project).
//
// Usage: node emulate.mjs --repo <dir> --launcher <exe> --normal-npm <dir>
//          --space-npm <dir> --space-profile <dir> --tricky-profile <dir>
//          --pwsh <exe> --powershell <exe> --out <results.json>
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEmulation } from "./checks.mjs";

const opts = {};
for (let i = 2; i < process.argv.length; i += 2) opts[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
for (const k of ["repo", "launcher", "normal-npm", "space-npm", "space-profile", "tricky-profile", "pwsh", "powershell", "out"]) {
  if (!opts[k]) throw new Error(`missing --${k}`);
}

const pluginVersion = JSON.parse(readFileSync(join(opts.repo, ".codex-plugin", "plugin.json"), "utf8")).version;
const realProfile = process.env.USERPROFILE;
const same = (a, b) => a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();
const npmDirs = () => [opts["normal-npm"], opts["space-npm"], trickyNpm];
function pathWith(npmDir) {
  const parts = (process.env.PATH ?? "").split(delimiter).filter((p) => p && !npmDirs().some((d) => same(p, d)));
  return (npmDir ? [npmDir, ...parts] : parts).join(delimiter);
}

// The tricky profile holds characters PowerShell (`$HOME`, `'`) and cmd
// (`%OS%`) expand or split on. Its npm prefix is a copy of the normal one (an
// npm global prefix is relocatable: the .cmd wrapper uses %~dp0).
const trickyProfile = opts["tricky-profile"];
const trickyNpm = join(trickyProfile, "AppData", "Roaming", "npm");
cpSync(opts["normal-npm"], trickyNpm, { recursive: true });
const profileOverrides = (p) => ({
  USERPROFILE: p,
  HOMEDRIVE: p.slice(0, 2),
  HOMEPATH: p.slice(2),
  APPDATA: join(p, "AppData", "Roaming"),
  LOCALAPPDATA: join(p, "AppData", "Local"),
  TEMP: join(p, "AppData", "Local", "Temp"),
  TMP: join(p, "AppData", "Local", "Temp"),
});
const profiles = {
  plain: { codexHome: join(realProfile, ".codex"), npm: opts["normal-npm"], overrides: {} },
  "space-plugin-root": { codexHome: join(opts["space-profile"], ".codex"), npm: opts["normal-npm"], overrides: {} },
  "space-npm-prefix": { codexHome: join(realProfile, ".codex"), npm: opts["space-npm"], overrides: {} },
  "space-profile": { codexHome: join(opts["space-profile"], ".codex"), npm: opts["space-npm"], overrides: profileOverrides(opts["space-profile"]) },
  "tricky-profile": { codexHome: join(trickyProfile, ".codex"), npm: trickyNpm, overrides: profileOverrides(trickyProfile) },
};
// cmd = Codex's fallback when it has no session shell.
const shells = { pwsh: opts.pwsh, "powershell-5.1": opts.powershell, cmd: "-" };
// "codex-snapshot" = the hook env is Codex's whole process env
// (hooks/src/registry.rs), CLI on PATH. "path-without-npm" = a Codex started
// with no altitude CLI on PATH: the hook must fail open. One action is enough
// for that (it is the same shim path for all of them).
const actions = ["session-start", "user-prompt-submit", "plan", "diff", "stop", "session-end"];
const cases = [
  ...actions.map((action) => ({ env: "codex-snapshot", action })),
  { env: "path-without-npm", action: "stop" },
];
const hookOf = { "session-start": ["SessionStart", 0], "user-prompt-submit": ["UserPromptSubmit", 0], plan: ["PreToolUse", 0], diff: ["PreToolUse", 1], stop: ["Stop", 0], "session-end": ["SessionEnd", 0] };

function layoutPlugin(profileName) {
  const profile = profiles[profileName];
  // <CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/<version> (core-plugins/src/store.rs)
  const root = join(profile.codexHome, "plugins", "cache", "altitude", "altitude", pluginVersion);
  cpSync(opts.repo, root, { recursive: true, filter: (src) => !/[\\/](\.git|\.github|ci|test|node_modules)([\\/]|$)/.test(src.slice(opts.repo.length)) });
  const data = join(profile.codexHome, "plugins", "data", "altitude-altitude");
  mkdirSync(data, { recursive: true });
  return { root, data };
}

function buildEnv(profileName, envMode, plugin, tapLog) {
  const profile = profiles[profileName];
  // Windows env names are case-insensitive ("Path" vs "PATH"): replace, never duplicate.
  const set = (env, key, value) => {
    const existing = Object.keys(env).filter((k) => k.toLowerCase() === key.toLowerCase());
    for (const k of existing) delete env[k];
    env[existing[0] ?? key] = value;
  };
  const env = { ...process.env };
  for (const [k, v] of Object.entries(profile.overrides)) set(env, k, v);
  set(env, "PATH", pathWith(envMode === "path-without-npm" ? null : profile.npm));
  // Drop this harness's own Node-isms so the child sees a user-like env.
  for (const k of Object.keys(env)) if (/^(npm_|NODE_OPTIONS$|INIT_CWD$)/i.test(k)) delete env[k];
  set(env, "NODE_OPTIONS", `--require ${JSON.stringify(fileURLToPath(new URL("./hook-tap.cjs", import.meta.url)).replaceAll("\\", "/"))}`);
  set(env, "ALTITUDE_HOOK_TAP_LOG", tapLog);
  for (const [k, v] of Object.entries({ PLUGIN_ROOT: plugin.root, CLAUDE_PLUGIN_ROOT: plugin.root, PLUGIN_DATA: plugin.data, CLAUDE_PLUGIN_DATA: plugin.data })) set(env, k, v);
  return env;
}

function payload(action, profileName, project, n) {
  const codexHome = profiles[profileName].codexHome;
  const sessionId = `019a${String(n).padStart(4, "0")}-0000-7000-8000-00000000c0de`;
  const dir = join(codexHome, "sessions", "2026", "10", "17");
  mkdirSync(dir, { recursive: true });
  const transcript = join(dir, `rollout-2026-10-17T12-00-00-${sessionId}.jsonl`);
  writeFileSync(transcript, [
    { timestamp: "2026-10-17T12:00:00.000Z", type: "session_meta", payload: { id: sessionId, cwd: project, originator: "codex_cli_rs", cli_version: "0.163.0" } },
    { timestamp: "2026-10-17T12:00:01.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Let's continue with the next lesson" }] } },
    { timestamp: "2026-10-17T12:00:02.000Z", type: "event_msg", payload: { type: "agent_message", message: "Sure, here is the next step." } },
  ].map((l) => JSON.stringify(l)).join("\n") + "\n");
  const base = { session_id: sessionId, transcript_path: transcript, cwd: project, model: "gpt-5.5", permission_mode: "default" };
  const turn = { turn_id: `turn-${n}` };
  switch (action) {
    case "session-start": return { ...base, hook_event_name: "SessionStart", source: "startup" };
    case "user-prompt-submit": return { ...base, ...turn, hook_event_name: "UserPromptSubmit", prompt: "Let's continue with the next lesson" };
    case "plan": return { ...base, ...turn, hook_event_name: "PreToolUse", tool_name: "update_plan", tool_use_id: `call_${n}`, tool_input: { plan: [{ step: "Add the route", status: "in_progress" }] } };
    case "diff": return { ...base, ...turn, hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_use_id: `call_${n}`, tool_input: { command: "*** Begin Patch\n*** Add File: hello.txt\n+hi\n*** End Patch\n" } };
    case "stop": return { ...base, ...turn, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Sure, here is the next step." };
    default: return { ...base, hook_event_name: "SessionEnd", reason: "other" };
  }
}

// The CLI fails open (exit 0) on internal errors but appends a record to
// <home>\.altitude\diagnostics.ndjson: any new record is a failure.
function diagnostics(profileName) {
  const home = profiles[profileName].overrides.USERPROFILE ?? realProfile;
  try { return readFileSync(join(home, ".altitude", "diagnostics.ndjson"), "utf8").split("\n").filter(Boolean); } catch { return []; }
}

// Codex substitutes ${PLUGIN_ROOT}-style placeholders in the command text
// itself (hooks/src/engine/discovery.rs) before any shell sees it.
const substitute = (command, plugin) => Object.entries({ PLUGIN_ROOT: plugin.root, CLAUDE_PLUGIN_ROOT: plugin.root, PLUGIN_DATA: plugin.data, CLAUDE_PLUGIN_DATA: plugin.data })
  .reduce((c, [k, v]) => c.replaceAll(`\${${k}}`, v), command);

const scratch = join(tmpdir(), "codex-launch");
mkdirSync(scratch, { recursive: true });
const results = [];
let n = 0;
for (const profileName of Object.keys(profiles)) {
  const plugin = layoutPlugin(profileName);
  const hooks = JSON.parse(readFileSync(join(plugin.root, "hooks", "codex.json"), "utf8")).hooks;
  const project = join(profiles[profileName].overrides.USERPROFILE ?? realProfile, "projects", "my-app");
  mkdirSync(project, { recursive: true });
  for (const [shellName, shellPath] of Object.entries(shells)) {
    for (const { env: envMode, action } of cases) {
      n += 1;
      const [event, index] = hookOf[action];
      const raw = hooks[event][index].hooks[0].commandWindows;
      const command = substitute(raw, plugin);
      const envFile = join(scratch, `env-${n}`);
      const cmdFile = join(scratch, `cmd-${n}`);
      const tapLog = join(scratch, `tap-${n}.jsonl`);
      writeFileSync(tapLog, "");
      writeFileSync(envFile, Object.entries(buildEnv(profileName, envMode, plugin, tapLog)).map(([k, v]) => `${k}=${v}`).join("\0"));
      writeFileSync(cmdFile, command);
      const before = diagnostics(profileName).length;
      const started = Date.now();
      const r = spawnSync(opts.launcher, [shellPath, project, envFile, cmdFile], { input: JSON.stringify(payload(action, profileName, project, n)), encoding: "utf8", timeout: 30000, windowsHide: true });
      const newDiagnostics = diagnostics(profileName).slice(before).map((l) => { try { const d = JSON.parse(l); return `${d.code}: ${d.detail?.message ?? JSON.stringify(d.detail ?? {})}`; } catch { return l; } });
      const tap = readFileSync(tapLog, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      const row = { profile: profileName, shell: shellName, env: envMode, action, exit: r.status, ms: Date.now() - started, stdout: r.stdout ?? "", stderr: r.stderr ?? "", diagnostics: newDiagnostics, tap, error: r.error?.message };
      results.push(row);
      const tag = `shell=${row.shell} profile=${row.profile} env=${row.env} action=${row.action} exit=${row.exit}`;
      console.log(`::group::${tag} (${row.ms}ms)`);
      console.log(`PLUGIN_ROOT=${plugin.root}\nproject=${project}\ncommandWindows=${raw}`);
      if (row.error) console.log(`launcher error: ${row.error}`);
      console.log(`--- stderr ---\n${row.stderr}\n--- stdout (first 1500 chars) ---\n${row.stdout.slice(0, 1500)}\n--- new CLI diagnostics ---\n${newDiagnostics.join("\n")}`);
      console.log("::endgroup::");
    }
  }
}
writeFileSync(opts.out, JSON.stringify(results, null, 2));

const failures = checkEmulation(results);
const escape = (s) => s.replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
for (const f of failures.slice(0, 20)) console.log(`::error title=Codex hook launch emulation::${escape(f)}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(failures.length ? `FAIL: ${failures.length} of ${results.length} emulated hook launches broke` : `PASS: all ${results.length} emulated hook launches exited 0 cleanly`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const groups = new Map();
  for (const r of results) {
    const ok = checkEmulation([r]).length === 0;
    const key = `${r.shell} | ${r.env} | ${ok ? "pass" : `**FAIL** (exit ${r.exit})`}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### ${failures.length ? "FAIL" : "PASS"}: Codex hook launch emulation (${results.length} cases, node ${process.version})\n\n| cases | shell | env | result |\n|---|---|---|---|\n` +
    [...groups].map(([k, count]) => `| ${count} | ${k} |`).join("\n") + "\n");
}
process.exitCode = failures.length ? 1 : 0;
