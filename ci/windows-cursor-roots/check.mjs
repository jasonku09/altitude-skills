// Windows check for the Cursor adapter's project selection: pipes Cursor-shaped
// hook JSON into bin/altitude-cursor-hook.mjs of the plugin under test and of
// the pre-fix release, against the real altitude CLI, and judges where each
// chat landed with checks.mjs. No Cursor, no network, no secrets.
//
// Each scenario gets its own CLI data dir (ALTITUDE_DATA_DIR) and conversation.
// The data dir is unpaired and holds one cached down-sync answer for the bound
// journey: an explicit journey miss (no lesson content is faked) carrying the
// server-authored learning_runtime descriptor, which is all `altitude task`
// needs to classify the session. What is observed, per scenario:
//   - the hook's exit code, stdout and stderr;
//   - whether the CLI wrote a live session marker (<data>/sessions) or an
//     unbound-runtime observation (<data>/unbound-runtime) for the exact
//     conversation, read by the session_id inside each record;
//   - `altitude task --json --session <id>` run from the project folder.
// Then a session-end hook ends the chat so the CLI's flusher idles out.
//
// Usage: node check.mjs --plugin <root> --pre-fix-plugin <root> --project <dir>
//          --work <dir> --out <results.json> [--cli <@learnaltitude/cli bin/altitude.js>]
// Without --cli the hook and the task read find the CLI on PATH, the way an
// npm-installed learner's hooks do.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { checkRun, scenarioMatrix, workspaceRootFor } from "./checks.mjs";

const JOURNEY_ID = "4f1c2b7e-8d3a-4c5e-9b6f-0a1d2e3f4a5b";

/** A user-like environment: no session identity or Altitude config leaks in. */
function cleanEnv(extra) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(ALTITUDE_|CLAUDE_CODE_SESSION_ID$|CODEX_THREAD_ID$|CODEX_SANDBOX|npm_|NODE_OPTIONS$|INIT_CWD$)/i.test(k)) delete env[k];
  }
  return { ...env, ...extra };
}

function writeFixture(dataDir, now) {
  const dir = join(dataDir, "downsync");
  mkdirSync(dir, { recursive: true });
  const data = {
    schema_version: 1,
    entitled: true,
    settings: { gate_strictness: "standard", coding_depth: null, ai_depth: null, review_digest_opt_in: false },
    journey: null,
    journey_miss: { requested_journey_id: JOURNEY_ID, reason: "not_found", message: "Windows Cursor roots CI fixture: no journey content is served offline." },
    gate_content: null,
    learning_runtime: { schema_version: 1, minimum_cli_version: "0.1.0", minimum_plugin_version: "0.1.0", update_message: "Windows Cursor roots CI fixture.", status: "supported" },
  };
  writeFileSync(join(dir, `${JOURNEY_ID}.json`), JSON.stringify({ fetched_at: now, data }));
}

function payload(action, conversationId, root) {
  const base = { conversation_id: conversationId, generation_id: randomUUID(), cursor_version: "3.24.12", model: "claude-opus-4-7", is_background_agent: false, workspace_roots: [root] };
  if (action === "session-start") return { ...base, hook_event_name: "sessionStart", composer_mode: "agent" };
  if (action === "user-prompt-submit") return { ...base, hook_event_name: "beforeSubmitPrompt", prompt: "Let's continue with the next lesson", attachments: [] };
  return { ...base, hook_event_name: "sessionEnd", reason: "user_close" };
}

/** Records in <dir> whose session_id is exactly this conversation's. */
function hasRecord(dir, conversationId) {
  let names = [];
  try { names = readdirSync(dir); } catch { return false; }
  return names.some((name) => {
    try { return JSON.parse(readFileSync(join(dir, name), "utf8")).session_id === conversationId; } catch { return false; }
  });
}

const spawnResult = (r) => ({ exit: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ...(r.error ? { error: r.error.message } : {}) });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Wait (bounded) for the CLI's flusher to release this data dir. */
function waitForFlusher(dataDir) {
  const lock = join(dataDir, "flusher.lock");
  for (let i = 0; i < 60 && existsSync(lock); i++) sleep(250);
  return !existsSync(lock);
}

export async function runMatrix({ plugin, preFixPlugin, project, work, cli, platform = process.platform, log = () => {} }) {
  mkdirSync(project, { recursive: true });
  // The CLI's binding marker schema: { journey_id: uuid, bound_at: ISO datetime }.
  writeFileSync(join(project, ".altitude"), `${JSON.stringify({ journey_id: JOURNEY_ID, bound_at: new Date().toISOString() }, null, 2)}\n`);
  // A neutral hook working directory: selection must come from the payload.
  const hookCwd = join(work, "hook-cwd");
  mkdirSync(hookCwd, { recursive: true });
  const roots = { current: plugin, "pre-fix": preFixPlugin };
  const rows = [];
  let n = 0;
  for (const scenario of scenarioMatrix(platform)) {
    n += 1;
    const root = roots[scenario.plugin];
    const dataDir = join(work, "data", `${n}-${scenario.plugin}-${scenario.form}-${scenario.action}`);
    writeFixture(dataDir, new Date().toISOString());
    const conversationId = randomUUID();
    const workspaceRoot = workspaceRootFor(scenario.form, project, platform);
    const env = cleanEnv({
      ALTITUDE_DATA_DIR: dataDir,
      // Unreachable on purpose; an unpaired CLI should not call it anyway.
      ALTITUDE_API_URL: "http://127.0.0.1:9",
      ALTITUDE_FLUSH_INTERVAL_MS: "250",
      ...(cli ? { ALTITUDE_CLI_PATH: cli } : {}),
    });
    const hookEntry = join(root, "bin", "altitude-cursor-hook.mjs");
    const runHook = (action) => spawnResult(spawnSync(process.execPath, [hookEntry, action], { input: JSON.stringify(payload(action, conversationId, workspaceRoot)), cwd: hookCwd, env, encoding: "utf8", timeout: 60000, windowsHide: true }));
    const hook = runHook(scenario.action);
    const marker = hasRecord(join(dataDir, "sessions"), conversationId);
    const unbound = hasRecord(join(dataDir, "unbound-runtime"), conversationId);
    // The task read finds the CLI exactly as this plugin's hooks do.
    const { resolveCli } = await import(pathToFileURL(join(root, "bin", "altitude-cli.mjs")).href);
    let task;
    try {
      const command = resolveCli({ cliPath: cli });
      task = spawnResult(spawnSync(command.file, [...command.args, "task", "--json", "--session", conversationId], { cwd: project, env, encoding: "utf8", timeout: 60000, windowsHide: true }));
    } catch (error) {
      task = { exit: null, stdout: "", stderr: "", error: error instanceof Error ? error.message : String(error) };
    }
    const end = runHook("session-end");
    const flusherExited = waitForFlusher(dataDir);
    const row = { ...scenario, pluginRoot: root, workspaceRoot, conversationId, dataDir, hook, marker, unbound, task, sessionEnd: { exit: end.exit }, flusherExited };
    rows.push(row);
    log(row);
  }
  return rows;
}

function isEntrypoint() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isEntrypoint()) {
  const opts = {};
  for (let i = 2; i < process.argv.length; i += 2) opts[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  for (const k of ["plugin", "pre-fix-plugin", "project", "work", "out"]) if (!opts[k]) throw new Error(`missing --${k}`);
  const escape = (s) => s.replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
  // The CLI reports the folder the task read ran in, canonicalised: compare
  // against the same canonical path (e.g. macOS /tmp is /private/tmp).
  mkdirSync(opts.project, { recursive: true });
  opts.project = realpathSync(opts.project);
  const rows = await runMatrix({
    plugin: opts.plugin, preFixPlugin: opts["pre-fix-plugin"], project: opts.project, work: opts.work, cli: opts.cli,
    log: (row) => {
      const status = (() => { try { return JSON.parse(row.task.stdout).learning_runtime?.status ?? null; } catch { return null; } })();
      console.log(`::group::${row.plugin} plugin / ${row.form} / ${row.action}: expect ${row.expect}; marker=${row.marker} unbound=${row.unbound} task status=${status}`);
      console.log(`workspace_roots[0]=${row.workspaceRoot}\nplugin=${row.pluginRoot}\nconversation=${row.conversationId}\ndata dir=${row.dataDir}`);
      console.log(`--- hook exit ${row.hook.exit}${row.hook.error ? ` (${row.hook.error})` : ""} ---\nstdout: ${row.hook.stdout.slice(0, 1500)}\nstderr: ${row.hook.stderr}`);
      console.log(`--- altitude task exit ${row.task.exit}${row.task.error ? ` (${row.task.error})` : ""} ---\nstdout: ${row.task.stdout.slice(0, 3000)}\nstderr: ${row.task.stderr}`);
      console.log(`session-end exit ${row.sessionEnd.exit}; flusher released the data dir: ${row.flusherExited}`);
      console.log("::endgroup::");
    },
  });
  writeFileSync(opts.out, JSON.stringify(rows, null, 2));
  const failures = checkRun(rows, { project: opts.project, platform: process.platform });
  for (const f of failures.slice(0, 20)) console.log(`::error title=Cursor Windows workspace roots::${escape(f)}`);
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(failures.length ? `FAIL: ${failures.length} problem(s) across ${rows.length} scenarios` : `PASS: all ${rows.length} scenarios landed where expected (pre-fix plugin + Cursor URI form reproduced outside_project)`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const ok = (row) => checkRun([row], { project: opts.project, platform: process.platform }).filter((f) => !f.startsWith("missing scenario")).length === 0;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### ${failures.length ? "FAIL" : "PASS"}: Cursor workspace roots on native Windows (${rows.length} scenarios, node ${process.version})\n\n| plugin | workspace root form | hook | expected | marker | unbound | task status | result |\n|---|---|---|---|---|---|---|---|\n` +
      rows.map((row) => {
        let status = null;
        try { status = JSON.parse(row.task.stdout).learning_runtime?.status ?? null; } catch { /* reported as null */ }
        return `| ${row.plugin} | ${row.form} | ${row.action} | ${row.expect} | ${row.marker} | ${row.unbound} | ${status} | ${ok(row) ? "pass" : "**FAIL**"} |`;
      }).join("\n") + "\n");
  }
  process.exitCode = failures.length ? 1 : 0;
}
