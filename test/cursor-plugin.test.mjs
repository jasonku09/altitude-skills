import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shim = join(root, "bin/altitude-cursor-hook.mjs");
const allow = { version: 1, exitCode: 0, action: "allow", context: [] };
const payload = { conversation_id: "chat-a", generation_id: "turn-a", workspace_roots: [root] };
async function fixture(t, response = allow, status = 0) {
  const dir = await mkdtemp(join(tmpdir(), "altitude cursor & $ sandbox-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, "altitude");
  const capture = join(dir, "capture.json");
  const source = `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),input:JSON.parse(fs.readFileSync(0,'utf8'))})); process.stdout.write(${JSON.stringify(typeof response === "string" ? response : JSON.stringify(response))}); process.exit(${status});`;
  await writeFile(executable, `#!${process.execPath}\n${source}`);
  await chmod(executable, 0o755);
  return { dir, capture };
}
function run(action, input = payload, path = process.env.PATH) {
  return spawnSync(process.execPath, [shim, action], { input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", env: { ...process.env, PATH: path } });
}
function output(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("native Cursor manifest shares skills and has its own hooks and release version", async () => {
  const manifest = JSON.parse(await readFile(join(root, ".cursor-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.hooks, "./hooks/cursor.json");
  assert.equal(manifest.skills, "./skills");
  assert.equal(manifest.version, JSON.parse(await readFile(join(root, ".claude-plugin/plugin.json"), "utf8")).version);
  const config = JSON.parse(await readFile(join(root, manifest.hooks), "utf8"));
  assert.equal(config.version, 1);
  assert.deepEqual(Object.keys(config.hooks).sort(), ["afterAgentResponse", "beforeSubmitPrompt", "preToolUse", "sessionEnd", "sessionStart", "stop"].sort());
  assert.equal(config.hooks.stop[0].loop_limit, 1);
  for (const entries of Object.values(config.hooks)) for (const entry of entries) {
    assert.doesNotMatch(entry.command, /process\.env\.CURSOR_PLUGIN_ROOT/);
    assert.match(entry.command, /ALTITUDE_CURSOR_PLUGIN_ROOT/);
    assert.doesNotMatch(entry.command, /\$\{CURSOR_PLUGIN_ROOT\}/);
    assert.equal(entry.failClosed, false);
  }
});

test("session-start sends structured core request and scopes context to the exact chat", async (t) => {
  const fake = await fixture(t, { ...allow, context: ["Read this journey."], session: { id: "chat-a" } });
  assert.deepEqual(output(run("session-start", payload, fake.dir)), { env: { ALTITUDE_SESSION_ID: "chat-a" }, additional_context: "Read this journey." });
  const captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.ok(captured.args.includes("--output"));
  assert.ok(captured.args.includes("json"));
  assert.ok(captured.args.includes("cursor"));
  assert.ok(!captured.args.includes("--continuation-provenance"));
  assert.equal(captured.input.conversation_id, "chat-a");
  assert.equal(captured.input.cwd, root);
});

test("only a coherent core exit 2 may deny an edit", async (t) => {
  const fake = await fixture(t, { ...allow, exitCode: 2, action: "block", reason: "Review this change first." }, 2);
  const result = run("diff", { ...payload, tool_name: "Write", tool_input: { path: "a.js" } }, fake.dir);
  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stdout), { permission: "deny", user_message: "Review this change first.", agent_message: "Review this change first." });
});

for (const [label, response, status] of [
  ["malformed stdout", "oops", 2], ["CLI crash", allow, 1], ["bare error exit", "", 2],
  ["incoherent block", { ...allow, action: "block" }, 2], ["unversioned result", { exitCode: 2, action: "block", context: [] }, 2],
  ["bad context", { ...allow, context: [123] }, 0], ["blocked result without exit 2", { ...allow, exitCode: 2, action: "block" }, 0],
]) test(`${label} leaves Cursor tools usable`, async (t) => {
  const fake = await fixture(t, response, status);
  assert.deepEqual(output(run("diff", payload, fake.dir)), { permission: "allow" });
});

test("missing CLI, invalid input and unknown actions fail open", async (t) => {
  const fake = await fixture(t);
  assert.deepEqual(output(run("diff", payload, join(fake.dir, "missing"))), { permission: "allow" });
  assert.deepEqual(output(run("diff", "{", fake.dir)), { permission: "allow" });
  assert.deepEqual(output(run("unknown", payload, fake.dir)), {});
});

test("ambiguous multiroot and conflicting session identity are not attributed", async (t) => {
  const fake = await fixture(t);
  for (const input of [
    { ...payload, workspace_roots: [root, tmpdir()] },
    { ...payload, workspace_roots: [root, join(root, "skills")], cwd: join(root, "skills", "lesson") },
    { ...payload, session_id: "another-chat" },
    { ...payload, cwd: tmpdir() },
    { ...payload, is_background_agent: true },
  ]) assert.deepEqual(output(run("diff", input, fake.dir)), { permission: "allow" });
  await assert.rejects(readFile(fake.capture), { code: "ENOENT" });
});

test("explicit nested cwd retains the exact lesson path rather than a workspace root", async (t) => {
  const fake = await fixture(t);
  const lessonPath = join(root, "skills", "lesson");
  output(run("diff", { ...payload, workspace_roots: [tmpdir(), root], cwd: lessonPath }, fake.dir));
  const captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.input.cwd, lessonPath);
});

test("prompt text has unknown provenance and cannot be forged via unverified payload fields", async (t) => {
  const fake = await fixture(t);
  assert.deepEqual(output(run("user-prompt-submit", { ...payload, prompt: "synthetic instruction", prompt_origin: "learner", continuation_id: "forged" }, fake.dir)), { continue: true });
  const captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.input.prompt_origin, "unknown");
  assert.equal(captured.input.continuation_id, undefined);
});

test("actual assistant callback text reaches core, stop never supplies invented assistant text", async (t) => {
  const fake = await fixture(t);
  output(run("after-assistant-response", { ...payload, text: "What would map return?" }, fake.dir));
  let captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.input.last_assistant_message, "What would map return?");
  output(run("stop", { ...payload, text: "untrusted stop text", status: "aborted", loop_count: 1 }, fake.dir));
  captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.input.last_assistant_message, undefined);
  assert.equal(captured.input.stop_status, "aborted");
  assert.equal(captured.input.continuation_count, "1");
});

test("unverified continuation output cannot trigger synthetic learner turns", async (t) => {
  const fake = await fixture(t, { ...allow, followup: { id: "offer-a", prompt: "Ask a recall question." } });
  assert.deepEqual(output(run("stop", { ...payload, status: "completed", loop_count: 0 }, fake.dir)), {});
});

test("native Windows launcher invokes npm CLI through node without cmd interpretation", async (t) => {
  const { resolveCli } = await import(shim);
  const dir = await mkdtemp(join(tmpdir(), "altitude windows & $(host)-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pkg = join(dir, "node_modules/@learnaltitude/cli");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(dir, "altitude.cmd"), "@echo off\r\nREM not executed\r\n");
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "@learnaltitude/cli", bin: { altitude: "cli.mjs" } }));
  await writeFile(join(pkg, "cli.mjs"), "process.stdout.write(JSON.stringify(process.argv.slice(2)))");
  const command = resolveCli({ platform: "win32", path: dir, separator: delimiter });
  assert.equal(command.file, process.execPath);
  const argumentsToPass = ["quote \" & echo injected", "$(touch nope)"];
  const result = spawnSync(command.file, [...command.args, ...argumentsToPass], { shell: false, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result.stdout), argumentsToPass);
});

test("native bootstrap uses exact registration despite a wrong host root and fails open when unavailable", async (t) => {
  const fake = await fixture(t);
  const config = JSON.parse(await readFile(join(root, "hooks/cursor.json"), "utf8"));
  const command = config.hooks.preToolUse[0].command;
  const registration = join(fake.dir, ".cursor/altitude/plugin.json");
  await mkdir(dirname(registration), { recursive: true });
  const trickyRoot = join(fake.dir, "plugin ' quotes \" & $(touch INJECTED) `whoami`");
  await mkdir(join(trickyRoot, "bin"), { recursive: true });
  await writeFile(join(trickyRoot, "bin/altitude-cursor-hook.mjs"), "export function main(){process.stdout.write(JSON.stringify({permission:'allow',loaded:'registered'}))}");
  const env = { ...process.env, HOME: fake.dir, USERPROFILE: fake.dir, CURSOR_PLUGIN_ROOT: "/wrong/other-plugin", ALTITUDE_CURSOR_PLUGIN_ROOT: "", PATH: `${dirname(process.execPath)}${delimiter}${fake.dir}` };
  const launch = () => spawnSync(command, { shell: true, input: JSON.stringify(payload), encoding: "utf8", env });
  await writeFile(registration, JSON.stringify({ version: 1, owner: "altitude-cursor", pluginRoot: trickyRoot }));
  assert.deepEqual(output(launch()), { permission: "allow", loaded: "registered" });
  for (const value of [undefined, { version: 1, owner: "altitude-cursor", pluginRoot: "/missing/plugin" }, { version: 1, owner: "other", pluginRoot: trickyRoot }]) {
    if (value === undefined) await rm(registration); else await writeFile(registration, JSON.stringify(value));
    const result = launch();
    assert.deepEqual(output(result), { permission: "allow" });
    assert.match(result.stderr, /Altitude Cursor hook bootstrap unavailable.*\/connect/);
  }
  env.ALTITUDE_CURSOR_PLUGIN_ROOT = trickyRoot;
  assert.deepEqual(output(launch()), { permission: "allow", loaded: "registered" });
  env.ALTITUDE_CURSOR_PLUGIN_ROOT = "relative/path";
  assert.deepEqual(output(launch()), { permission: "allow" });
  env.ALTITUDE_CURSOR_PLUGIN_ROOT = root;
  assert.deepEqual(output(launch()), { permission: "allow" });
  assert.equal(JSON.parse(await readFile(fake.capture, "utf8")).input.conversation_id, "chat-a");
});

test("Cursor shared skills identify the host and preserve exact current session attribution", async () => {
  const connect = await readFile(join(root, "skills/connect/SKILL.md"), "utf8");
  assert.match(connect, /--agent cursor/);
  assert.match(connect, /cursor-agent --version/);
  for (const path of ["skills/begin/SKILL.md", "skills/next-lesson/SKILL.md", "skills/next-lesson/references/paid-mode.md"]) {
    const text = await readFile(join(root, path), "utf8");
    assert.match(text, /Cursor/);
    assert.match(text, /altitude session --current --json/);
    assert.match(text, /ALTITUDE_SESSION_ID/);
    assert.match(text, /synthetic/);
  }
  for (const name of ["begin", "next-lesson", "connect", "status", "start-project", "plan-journey", "adopt-project"]) {
    assert.match(await readFile(join(root, "skills", name, "SKILL.md"), "utf8"), /Cursor.*\/next-lesson/);
  }
});

test("native prompt context carries a core recall instruction without an extra user turn", async (t) => {
  const fake = await fixture(t, { ...allow, context: ["Ask the pending question and wait."] });
  assert.deepEqual(output(run("user-prompt-submit", { ...payload, prompt: "It works now" }, fake.dir)), { continue: true, additional_context: "Ask the pending question and wait." });
  const captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.args[captured.args.indexOf("--delivery") + 1], "prompt-context");
});

test("Cursor marketplace points to the same versioned native plugin", async () => {
  const marketplace = JSON.parse(await readFile(join(root, ".cursor-plugin/marketplace.json"), "utf8"));
  assert.equal(marketplace.name, "altitude");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].source, ".");
  assert.equal(marketplace.plugins[0].name, "altitude");
});

test("a hung CLI times out and leaves the edit usable", { timeout: 30000 }, async (t) => {
  const fake = await fixture(t);
  await writeFile(join(fake.dir, "altitude"), `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`);
  const result = run("diff", payload, fake.dir);
  assert.deepEqual(output(result), { permission: "allow" });
  assert.match(result.stderr, /could not finish/);
});

test("product version and session-end reason retain their actual meaning", async (t) => {
  const fake = await fixture(t);
  output(run("session-end", { ...payload, cursor_version: "3.21.16", version: 1, reason: "window_close" }, fake.dir));
  const captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.input.agent_version, "3.21.16");
  assert.equal(captured.input.reason, "window_close");
  const mapping = JSON.parse(await readFile(join(root, "hooks/cursor-field-mapping.json"), "utf8"));
  assert.equal(mapping.fields.agent_version, "agent_version");
  assert.equal(mapping.fields.reason, "reason");
});

test("Cursor's empty cwd falls back only to a unique workspace root", async (t) => {
  const fake = await fixture(t);
  output(run("diff", { ...payload, cwd: "", tool_name: "Write" }, fake.dir));
  const captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.input.cwd, root);
  assert.deepEqual(output(run("diff", { ...payload, cwd: "", workspace_roots: [root, tmpdir()] }, fake.dir)), { permission: "allow" });
  assert.deepEqual(JSON.parse(await readFile(fake.capture, "utf8")), captured);
});

test("edit matchers cover writes/deletes without matching shell stdin and omit the retired plan gate", async () => {
  const config = JSON.parse(await readFile(join(root, "hooks/cursor.json"), "utf8"));
  assert.equal(config.hooks.preToolUse.length, 1);
  const matcher = new RegExp(config.hooks.preToolUse[0].matcher);
  for (const name of ["Write", "Edit", "Delete"]) assert.equal(matcher.test(name), true);
  for (const name of ["WriteShellStdin", "Read", "Shell", "MCP:Write", "ExitPlanMode"]) assert.equal(matcher.test(name), false);
});

test("direct invocation through a symlink still executes the shim", async (t) => {
  const fake = await fixture(t);
  const linked = join(fake.dir, "hook.mjs");
  await symlink(shim, linked);
  const result = spawnSync(process.execPath, [linked, "diff"], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, PATH: fake.dir } });
  assert.deepEqual(output(result), { permission: "allow" });
  const captured = JSON.parse(await readFile(fake.capture, "utf8"));
  assert.equal(captured.args[captured.args.indexOf("--stop-policy") + 1], "defer-to-prompt");
});

test("explicit absolute CLI build override avoids host PATH rewriting and shell interpretation", async (t) => {
  const fake = await fixture(t);
  const override = join(fake.dir, "built cli & $(ignored).mjs");
  await writeFile(override, `process.stdout.write(${JSON.stringify(JSON.stringify({ ...allow, context: ["Development CLI"] }))});`);
  const result = spawnSync(process.execPath, [shim, "user-prompt-submit"], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, PATH: fake.dir, ALTITUDE_CLI_PATH: override } });
  assert.deepEqual(output(result), { continue: true, additional_context: "Development CLI" });
  await assert.rejects(readFile(fake.capture), { code: "ENOENT" });
});

test("a bad explicit CLI build override fails open without using another installed CLI", async (t) => {
  const fake = await fixture(t);
  for (const override of ["relative/cli.js", join(fake.dir, "missing.mjs")]) {
    const result = spawnSync(process.execPath, [shim, "diff"], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, PATH: fake.dir, ALTITUDE_CLI_PATH: override } });
    assert.deepEqual(output(result), { permission: "allow" });
    await assert.rejects(readFile(fake.capture), { code: "ENOENT" });
  }
});

test("Cursor connect updates the installed CLI before setup or pairing", async () => {
  const text = await readFile(join(root, "skills/connect/SKILL.md"), "utf8");
  const body = text.slice(text.indexOf("Connect the current coding agent"));
  const update = body.indexOf("altitude update");
  assert.ok(update >= 0);
  assert.ok(update < body.indexOf("Cursor compatibility setup"));
  assert.ok(update < body.indexOf("--agent cursor"));
  assert.match(body, /never re-run.*without.*--agent/s);
});


test("Cursor connect refreshes the exact registration after every plugin update", async () => {
  const text = await readFile(join(root, "skills/connect/SKILL.md"), "utf8");
  assert.match(text, /after every plugin update/);
  assert.match(text, /~\/\.cursor\/altitude\/plugin\.json/);
});

test("Cursor registration maintenance checks saved pairing before starting a new device flow", async () => {
  const text = await readFile(join(root, "skills/connect/SKILL.md"), "utf8");
  const maintenance = text.slice(text.indexOf("**Cursor pairing decision"), text.indexOf("2. Start the pairing"));
  assert.match(maintenance, /after compatibility setup.*`altitude status`/s);
  assert.match(maintenance, /`connected: true`.*preserve the existing pairing.*skip steps 2–4/s);
  assert.match(maintenance, /explicitly asks to reconnect or change accounts.*continue with pairing/s);
});

test("Cursor maintenance treats status as local token presence, not account or server authentication", async () => {
  const text = await readFile(join(root, "skills/connect/SKILL.md"), "utf8");
  const maintenance = text.slice(text.indexOf("**Cursor pairing decision"), text.indexOf("2. Start the pairing"));
  assert.match(maintenance, /local and cache-only/);
  assert.match(maintenance, /does not identify the account or verify that the server accepts the token/);
  assert.match(maintenance, /`connected: false`.*missing or malformed.*continue with pairing/s);
  assert.match(maintenance, /fresh.*`unauthorized`.*continue with pairing/s);
  assert.match(maintenance, /Offline.*do not imply an invalid token/s);
  assert.match(maintenance, /status command fails.*do not infer disconnection or start pairing/s);
});
