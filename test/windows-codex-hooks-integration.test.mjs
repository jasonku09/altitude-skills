import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkEmulation } from "../ci/windows-codex-hooks/checks.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const harness = join(repo, "ci/windows-codex-hooks");
const scratchFor = (t) => {
  const dir = mkdtempSync(join(repo, ".windows-hooks-integration-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
// Optional durable evidence for a local test-phase run; normal tests clean up.
function evidence(name, text) {
  const dir = process.env.WINDOWS_HOOKS_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), text);
}

test("checker CLI reproduces downloaded evidence, required failures and informational warnings", (t) => {
  const dir = scratchFor(t);
  const events = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Stop"];
  const actions = {
    "session-start": ["session-start"], "user-prompt-submit": ["user-prompt-submit"],
    diff: ["pre-tool-use", "--gate", "diff"], stop: ["stop", "--gate", "retro"],
    "session-end": ["session-end"],
  };
  const tap = Object.entries(actions).flatMap(([action, args]) => [
    { bootstrap: true, action, parentImage: action === "session-end" ? null : "powershell.exe", argv: ["node.exe"], exitCode: 0 },
    { argv: ["node.exe", "altitude.js", "hook", ...args], exitCode: 0 },
  ]);
  // PowerShell's UTF-8 BOM and CRLF must survive the download/replay path.
  writeFileSync(join(dir, "codex-exit.txt"), "\uFEFF0\r\n");
  writeFileSync(join(dir, "codex-output.txt"), "\uFEFF" + events.map((event) => `hook: ${event} Completed`).join("\r\n"));
  writeFileSync(join(dir, "hook-tap.jsonl"), "\uFEFF" + tap.map((record) => JSON.stringify(record)).join("\r\n"));
  writeFileSync(join(dir, "diagnostics-new.ndjson"), "\uFEFF\r\n");
  const summary = join(dir, "summary.md");
  const transcript = ["Checker CLI replay using synthetic Windows evidence (not a native Windows run)."];
  const run = (label, extra = []) => {
    const args = [join(harness, "check-real-codex.mjs"), "--dir", dir, "--label", label, "--shell", "powershell.exe", ...extra];
    const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 10000, env: { ...process.env, GITHUB_STEP_SUMMARY: summary } });
    assert.ifError(result.error);
    transcript.push(`\n$ node check-real-codex.mjs --dir <fixture> --label ${label} --shell powershell.exe ${extra.join(" ")}\n${result.stdout}${result.stderr}exit=${result.status}`);
    return result;
  };
  assert.equal(run("clean-fixture").status, 0);
  writeFileSync(join(dir, "diagnostics-new.ndjson"), '{"code":"hook_internal_error","detail":{"message":"injected crash"}}\r\n');
  const required = run("required-failure-fixture");
  assert.equal(required.status, 1);
  assert.match(required.stdout, /::error title=required-failure-fixture::New altitude CLI diagnostics record/);
  const informational = run("latest-failure-fixture", ["--informational"]);
  assert.equal(informational.status, 1);
  assert.match(informational.stdout, /::warning title=latest-failure-fixture::/);
  assert.doesNotMatch(informational.stdout, /::error /);
  rmSync(join(dir, "hook-tap.jsonl"));
  assert.match(run("missing-tap-fixture").stdout, /recorded no hook processes/);
  const markdown = readFileSync(summary, "utf8");
  assert.match(markdown, /### PASS: clean-fixture/);
  assert.match(markdown, /### FAIL: required-failure-fixture/);
  assert.match(markdown, /### WARN: latest-failure-fixture \(informational, does not block\)/);
  evidence("checker-cli-transcript.txt", transcript.join("\n"));
  evidence("checker-job-summary.md", markdown);
});

test("the real bootstrap and tap expose a CLI crash even when the shim exits zero", (t) => {
  const dir = scratchFor(t);
  const cli = join(dir, "fixture-cli.cjs");
  writeFileSync(cli, "process.stdin.resume(); process.stdin.on('end', () => { if (process.env.INJECT_CLI_CRASH === '1') { console.error('injected workshop CLI crash'); process.exitCode = 7; } });\n");
  const hooks = JSON.parse(readFileSync(join(repo, "hooks/codex.json"), "utf8")).hooks;
  const transcript = ["Actual hook bootstrap, shim and NODE_OPTIONS recorder; fixture CLI; no Windows shell emulation."];
  for (const entry of Object.values(hooks).flat()) {
    const command = entry.hooks[0].commandWindows;
    const code = /^node -e "(.*)"$/.exec(command)?.[1];
    assert.ok(code, "expected node bootstrap");
    const action = /main\('([a-z-]+)'\)/.exec(code)[1];
    for (const crash of [false, true]) {
      const tapFile = join(dir, "tap.jsonl");
      writeFileSync(tapFile, "");
      const result = spawnSync(process.execPath, ["-e", code], {
        encoding: "utf8", input: "{}", timeout: 10000,
        env: { ...process.env, PLUGIN_ROOT: repo, ALTITUDE_CLI_PATH: cli, INJECT_CLI_CRASH: crash ? "1" : "0",
          NODE_OPTIONS: `--require ${JSON.stringify(join(harness, "hook-tap.cjs").replaceAll("\\", "/"))}`, ALTITUDE_HOOK_TAP_LOG: tapFile },
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0);
      const tap = readFileSync(tapFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
      assert.equal(tap.length, 2);
      assert.ok(tap.some((record) => record.bootstrap && record.action === action && record.exitCode === 0));
      const failures = checkEmulation([{ action, shell: "direct-node", profile: "fixture", env: "codex-snapshot", exit: result.status, stderr: result.stderr, tap }]);
      if (crash) {
        assert.ok(tap.some((record) => record.argv[2] === "hook" && record.exitCode === 7));
        assert.match(failures.join("\n"), /exited 7/);
      } else assert.deepEqual(failures, []);
      transcript.push(`\n${action}, injected crash=${crash}, hook exit=${result.status}\n${JSON.stringify(tap, null, 2)}\nChecker: ${failures.join("\n") || "accepted successful CLI invocation"}`);
    }
  }
  evidence("hook-recorder-transcript.txt", transcript.join("\n"));
});

test("stand-in model server drives apply_patch followed by the final message over HTTP", { timeout: 10000 }, async (t) => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const server = spawn(process.execPath, [join(harness, "mock-responses-server.mjs"), String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(server, "exit");
  t.after(async () => { if (server.exitCode === null) server.kill(); await exited; });
  const ready = await Promise.race([
    once(server.stdout, "data").then(([data]) => data.toString()),
    exited.then(([code]) => { throw new Error(`mock server exited before startup: ${code}`); }),
  ]);
  assert.match(ready, /mock responses server on/);
  const base = `http://127.0.0.1:${port}/v1`;
  const transcript = ["Actual HTTP responses from the stand-in server; requests sent by this test, not Codex.", ready];
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
  assert.deepEqual(await (await fetch(`${base}/models`)).json(), { models: [], data: [] });
  const post = async (input) => {
    const response = await fetch(`${base}/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, stream: true }) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const body = await response.text();
    transcript.push(`POST /v1/responses\n${JSON.stringify({ input, stream: true })}\nHTTP ${response.status}\n${body}`);
    const events = body.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    assert.deepEqual(events.map((event) => event.type), ["response.created", "response.output_item.done", "response.completed"]);
    return events[1].item;
  };
  const call = await post([{ role: "user", content: "say hi" }]);
  assert.equal(call.type, "custom_tool_call");
  assert.equal(call.name, "apply_patch");
  assert.match(call.input, /\*\*\* Add File: hello.txt\n\+hi/);
  const message = await post([{ type: "custom_tool_call_output", call_id: call.call_id, output: "Success" }]);
  assert.equal(message.type, "message");
  assert.equal(message.role, "assistant");
  assert.equal(message.content[0].text, "hi from the mock model");
  evidence("mock-model-http-transcript.txt", transcript.join("\n"));
});
