// Pass/fail rules of the Windows Codex hooks CI check
// (.github/workflows/windows-codex-hooks.yml). The workflow only runs on
// Windows; these pin the verdicts locally so a rule never silently loosens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkEmulation, checkRealCodexRun } from "../ci/windows-codex-hooks/checks.mjs";

const cliJs = "C:\\Users\\runneradmin\\AppData\\Roaming\\npm\\node_modules\\@learnaltitude\\cli\\bin\\altitude.js";
const node = "C:\\hostedtoolcache\\windows\\node\\24.0.0\\x64\\node.exe";

const greenOutput = [
  "hook: SessionStart",
  "hook: SessionStart Completed",
  "hook: UserPromptSubmit",
  "hook: UserPromptSubmit Completed",
  "hook: PreToolUse",
  "hook: PreToolUse Completed",
  "codex",
  "hi from the mock model",
  "hook: Stop",
  "hook: Stop Completed",
].join("\r\n");

const cliEvent = { "session-start": ["session-start"], "user-prompt-submit": ["user-prompt-submit"], diff: ["pre-tool-use", "--gate", "diff"], stop: ["stop", "--gate", "retro"], "session-end": ["session-end"] };

function greenTap(shell = "pwsh.exe") {
  const records = [];
  for (const [action, args] of Object.entries(cliEvent)) {
    records.push({ bootstrap: true, action, parentImage: action === "session-end" ? null : shell, argv: [node], exitCode: 0, stderr: "" });
    records.push({ bootstrap: false, action: null, parentImage: null, argv: [node, cliJs, "hook", ...args, "--agent", "codex"], exitCode: 0, stderr: "" });
  }
  return records;
}

const green = (overrides = {}) => ({ codexExit: 0, codexOutput: greenOutput, tap: greenTap(), diagnostics: [], expectedShell: "pwsh.exe", ...overrides });

test("a run where every hook completed, exited 0 and reached the CLI passes", () => {
  assert.deepEqual(checkRealCodexRun(green()), []);
});

test("Codex reporting a hook as Failed fails the run and quotes the line", () => {
  const failures = checkRealCodexRun(green({ codexOutput: greenOutput.replace("hook: Stop Completed", "hook: Stop Failed") }));
  assert.ok(failures.some((f) => f.includes("hook: Stop Failed")), failures.join("\n"));
});

test("an expected hook Codex never ran fails the run", () => {
  const failures = checkRealCodexRun(green({ codexOutput: greenOutput.replace(/hook: PreToolUse[^\r\n]*\r\n/g, "") }));
  assert.ok(failures.some((f) => /PreToolUse/.test(f) && /never/.test(f)), failures.join("\n"));
});

test("a nonzero codex exec exit fails the run", () => {
  assert.ok(checkRealCodexRun(green({ codexExit: 1 })).some((f) => /codex exec exited 1/.test(f)));
});

test("the 0.10.2 %PLUGIN_ROOT% regression fails with the hook's own error", () => {
  // What run 39090799387 recorded: PowerShell leaves %PLUGIN_ROOT% literal.
  const tap = ["session-start", "user-prompt-submit", "stop", "session-end"].map((action) => ({
    bootstrap: false,
    action: null,
    parentImage: null,
    argv: [node, `C:\\Users\\runneradmin\\projects\\my-app\\%PLUGIN_ROOT%\\bin\\altitude-codex-hook.mjs`, action],
    exitCode: 1,
    stderr: "Error: Cannot find module 'C:\\Users\\runneradmin\\projects\\my-app\\%PLUGIN_ROOT%\\bin\\altitude-codex-hook.mjs'",
  }));
  const failures = checkRealCodexRun(green({ codexOutput: greenOutput.replaceAll("Completed", "Failed"), tap }));
  assert.ok(failures.some((f) => /exited 1/.test(f) && /Cannot find module/.test(f)), failures.join("\n"));
  assert.ok(failures.some((f) => /session-start/.test(f) && /never reached the altitude CLI/.test(f)), failures.join("\n"));
});

test("a CLI crash hidden by the shim's fail-open clamp still fails the run", () => {
  const tap = greenTap();
  const cli = tap.find((r) => r.argv.includes("user-prompt-submit"));
  cli.exitCode = 1;
  const shim = tap.find((r) => r.action === "user-prompt-submit");
  shim.stderr = "Altitude hook skipped: the workshop CLI exited with code 1; continuing without blocking.\n";
  const failures = checkRealCodexRun(green({ tap }));
  assert.ok(failures.some((f) => /Altitude hook skipped/.test(f)), failures.join("\n"));
  assert.ok(failures.some((f) => /exited 1/.test(f)), failures.join("\n"));
});

test("a shim that could not find the CLI fails the run even though it exits 0", () => {
  const tap = greenTap().filter((r) => !r.argv.includes("stop"));
  tap.find((r) => r.action === "stop").stderr = "Altitude could not run the workshop CLI: Altitude CLI was not found\n";
  const failures = checkRealCodexRun(green({ tap }));
  assert.ok(failures.some((f) => /could not run the workshop CLI/.test(f)), failures.join("\n"));
  assert.ok(failures.some((f) => /stop/.test(f) && /never reached the altitude CLI/.test(f)), failures.join("\n"));
});

test("an unexpected gate block (exit 2) fails the run: the unpaired CLI never blocks", () => {
  const tap = greenTap();
  tap.find((r) => r.argv.includes("pre-tool-use")).exitCode = 2;
  assert.ok(checkRealCodexRun(green({ tap })).some((f) => /exited 2/.test(f)));
});

test("new altitude CLI diagnostics records fail the run", () => {
  const failures = checkRealCodexRun(green({ diagnostics: ['{"code":"hook_internal_error","detail":{"message":"boom"}}'] }));
  assert.ok(failures.some((f) => /diagnostics/.test(f) && /boom/.test(f)), failures.join("\n"));
});

test("hooks launched by a different shell than the job targets fail the run", () => {
  const failures = checkRealCodexRun(green({ expectedShell: "powershell.exe" }));
  assert.ok(failures.some((f) => /pwsh\.exe/.test(f) && /powershell\.exe/.test(f)), failures.join("\n"));
});

test("the shell check is not vacuous: no recorded launching shell fails it", () => {
  const tap = greenTap().map((r) => ({ ...r, parentImage: null }));
  assert.ok(checkRealCodexRun(green({ tap })).some((f) => /launching shell/.test(f)));
});

test("an empty hook tap fails the run (NODE_OPTIONS preload never loaded)", () => {
  assert.ok(checkRealCodexRun(green({ tap: [] })).some((f) => /no hook processes/.test(f)));
});

// --- Codex launch emulation (no Codex) ---

const emulatedCliEvent = { ...cliEvent, plan: ["pre-tool-use", "--gate", "plan"] };
const cliTap = (action) => [{ argv: [node, cliJs, "hook", ...emulatedCliEvent[action]], exitCode: 0, stderr: "" }];
const row = (o = {}) => ({ profile: "plain", shell: "pwsh", env: "codex-snapshot", action: "stop", exit: 0, stdout: "", stderr: "", diagnostics: [], tap: cliTap("stop"), ...o });

test("emulation: clean exits pass", () => {
  assert.deepEqual(checkEmulation([row(), row({ shell: "cmd" }), row({ env: "path-without-npm", tap: [], stderr: "Altitude could not run the workshop CLI: not found\n" })]), []);
});

test("emulation: every action requires its own successful CLI event and gate", () => {
  for (const action of Object.keys(emulatedCliEvent)) {
    assert.deepEqual(checkEmulation([row({ action, tap: cliTap(action) })]), []);
    for (const tap of [undefined, [], [{ argv: [node], action, exitCode: 0 }]]) {
      assert.match(checkEmulation([row({ action, tap })])[0], /never recorded a successful altitude CLI invocation/);
    }
    for (const other of Object.keys(emulatedCliEvent).filter((name) => name !== action)) {
      assert.equal(checkEmulation([row({ action, tap: cliTap(other) })]).length, 1);
    }
  }
});

test("emulation: missing or unexpected gates fail even with the correct event", () => {
  for (const action of Object.keys(emulatedCliEvent)) {
    const args = emulatedCliEvent[action];
    const tap = [{ argv: [node, cliJs, "hook", args[0], ...(args.length > 1 ? [] : ["--gate", "plan"])], exitCode: 0 }];
    assert.equal(checkEmulation([row({ action, tap })]).length, 1);
  }
});

test("emulation: unsuccessful CLI exits fail even when the shim exits zero", () => {
  for (const exitCode of [1, 2, null, undefined]) {
    const tap = cliTap("plan").map((record) => ({ ...record, exitCode }));
    assert.match(checkEmulation([row({ action: "plan", tap })])[0], /never recorded a successful altitude CLI invocation/);
    assert.match(checkEmulation([row({ action: "plan", tap: [...tap, ...cliTap("plan")] })])[0], /expected 0/);
  }
});

test("emulation: an unknown shim action exits zero but cannot pass as plan", (t) => {
  const scratch = mkdtempSync(fileURLToPath(new URL("../.hook-tap-test-", import.meta.url)));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const tapLog = join(scratch, "tap.jsonl");
  const preload = fileURLToPath(new URL("../ci/windows-codex-hooks/hook-tap.cjs", import.meta.url));
  const shim = fileURLToPath(new URL("../bin/altitude-codex-hook.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [shim, "unknown-action"], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(preload.replaceAll("\\", "/"))}`, ALTITUDE_HOOK_TAP_LOG: tapLog },
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /usage: altitude-codex-hook/);
  const tap = readFileSync(tapLog, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(tap.length, 1);
  assert.match(checkEmulation([row({ action: "plan", exit: result.status, stderr: result.stderr, tap })])[0], /never recorded a successful altitude CLI invocation/);
  assert.match(checkEmulation([row({ action: "unknown-action", tap })])[0], /unknown hook action/);
});

test("emulation: the missing-CLI case rejects recorded CLI invocations", () => {
  assert.match(checkEmulation([row({ env: "path-without-npm", stderr: "Altitude could not run the workshop CLI" })])[0], /unexpectedly reached the altitude CLI/);
});

test("emulation: a nonzero exit fails and names the case", () => {
  const failures = checkEmulation([row({ shell: "powershell-5.1", profile: "space-profile", exit: 1, stderr: "Cannot find module" })]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /powershell-5\.1/);
  assert.match(failures[0], /space-profile/);
  assert.match(failures[0], /Cannot find module/);
});

test("emulation: with the CLI on PATH, a fail-open notice or diagnostic fails the case", () => {
  assert.equal(checkEmulation([row({ stderr: "Altitude hook skipped: x\n" })]).length, 1);
  assert.equal(checkEmulation([row({ stderr: "Altitude could not run the workshop CLI: x\n" })]).length, 1);
  assert.equal(checkEmulation([row({ diagnostics: ["hook_internal_error: x"] })]).length, 1);
});

test("emulation: with no CLI on PATH, the hook must fail open (exit 0) and say so", () => {
  assert.equal(checkEmulation([row({ env: "path-without-npm", exit: 1 })]).length, 1);
  assert.equal(checkEmulation([row({ env: "path-without-npm", stderr: "" })]).length, 1);
});

test("emulation: a launcher error or an empty matrix fails", () => {
  assert.equal(checkEmulation([row({ exit: null, error: "spawnSync ETIMEDOUT" })]).length, 1);
  assert.equal(checkEmulation([]).length, 1);
});
