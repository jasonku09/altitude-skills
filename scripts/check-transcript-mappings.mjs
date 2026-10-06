// Offline interoperability check against T4's actual schema/redactor/locator.
// node scripts/check-transcript-mappings.mjs /path/to/altitude/packages/workshop-core
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2]) throw new Error("Pass the workshop-core package directory.");
const core = resolve(process.argv[2]);
// Optional reviewer evidence: actual sanitized fixtures and adapter/core receipts.
const evidenceDir = process.argv[3] ? resolve(process.argv[3]) : null;
if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
const requireCore = createRequire(join(core, "package.json"));
const { build } = requireCore("esbuild");
const bundle = await build({
  stdin: { contents: 'export * from "./src/transcripts/mapping"; export * from "./src/transcripts/redact"; export * from "./src/transcripts/notice-proof";', resolveDir: core },
  bundle: true, platform: "node", format: "esm", write: false,
});
const { loadTranscriptMapping, redactTranscript, locateRoot, locateTranscript, noticeShownIn } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const mapping = (agent) => loadTranscriptMapping(join(root, `hooks/${agent}-transcript-mapping.json`));
const redact = (agent, records) => redactTranscript(records.map(r => JSON.stringify(r)).join("\n") + "\n", mapping(agent));

for (const agent of ["claude-code", "codex", "cursor"]) {
  test(`${agent}: T4 accepts the mapping and sanitizes its observed transcript shape`, async () => {
    const raw = await readFile(join(root, `test/fixtures/transcripts/${agent}.jsonl`), "utf8");
    const result = redactTranscript(raw, mapping(agent));
    for (const sentinel of ["FAKE_SECRET", "ENV_PRIVATE_CONTENT", "IMAGE_PRIVATE_CONTENT"]) assert.ok(!result.jsonl.includes(sentinel), sentinel);
    assert.match(result.jsonl, /learner message/);
    assert.match(result.jsonl, /assistant message/);
    if (evidenceDir) await writeFile(join(evidenceDir, `${agent}-sanitized.jsonl`), result.jsonl);
  });
}

for (const agent of ["claude-code", "codex", "cursor"]) {
  test(`${agent}: native hook delivers its transcript to the real core redactor`, async (t) => {
    const dir = await mkdtemp(join(root, ".transcript-adapter-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const receipt = join(dir, "receipt.json");
    const executable = join(dir, "altitude");
    // Replace only the CLI transport: the shipped adapter runs as a subprocess,
    // and its selected mapping is consumed by the actual companion core code.
    await writeFile(executable, `#!${process.execPath}
import { readFileSync, writeFileSync } from "node:fs";
import { loadTranscriptMapping, redactTranscript } from ${JSON.stringify(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`)};
const args = process.argv.slice(2);
const flag = name => args[args.indexOf(name) + 1];
const input = JSON.parse(readFileSync(0, "utf8"));
const fields = JSON.parse(readFileSync(flag("--mapping"), "utf8")).fields;
const result = redactTranscript(readFileSync(input[fields.transcript_path], "utf8"), loadTranscriptMapping(flag("--transcript-mapping")));
writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ args, input, result }, null, 2));
if (flag("--agent") === "cursor") process.stdout.write(JSON.stringify({version: 1, exitCode: 0, action: "allow", context: []}));
`);
    await chmod(executable, 0o755);
    const path = join(root, `test/fixtures/transcripts/${agent}.jsonl`);
    const input = agent === "cursor"
      ? { conversation_id: "chat-a", workspace_roots: [root], transcript_path: path }
      : { session_id: "chat-a", cwd: root, transcript_path: path };
    let command = process.execPath;
    let args = [join(root, `bin/altitude-${agent}-hook.mjs`), "session-end"];
    if (agent === "claude-code") {
      const config = JSON.parse(await readFile(join(root, "hooks/hooks.json"), "utf8"));
      command = executable;
      args = config.hooks.SessionEnd[0].hooks[0].args.map(arg => arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", root));
    }
    const env = { ...process.env, PATH: dir };
    delete env.ALTITUDE_CLI_PATH;
    const run = spawnSync(command, args, { input: JSON.stringify(input), env, encoding: "utf8", timeout: 10000 });
    assert.equal(run.status, 0, run.stderr);
    const captured = JSON.parse(await readFile(receipt, "utf8"));
    assert.equal(captured.args[captured.args.indexOf("--agent") + 1], agent);
    assert.equal(captured.args[captured.args.indexOf("--transcript-mapping") + 1], join(root, `hooks/${agent}-transcript-mapping.json`));
    assert.equal(captured.input.transcript_path, path);
    assert.equal(captured.result.jsonl, redactTranscript(await readFile(path, "utf8"), mapping(agent)).jsonl);
    if (agent === "cursor") assert.deepEqual(JSON.parse(run.stdout), {});
    if (evidenceDir) await writeFile(join(evidenceDir, `${agent}-adapter-receipt.json`), JSON.stringify({
      scope: "Synthetic host payload through shipped hook and real companion core redactor; no server upload or live agent trial.",
      ...captured, host_response: run.stdout,
    }, null, 2) + "\n");
  });
}

for (const agent of ["claude-code", "cursor"]) {
  test(`${agent}: keeps chat text, caps tool output, drops nested images and injected skills`, () => {
    const result = redact(agent, [
      { role: "user", message: { role: "user", content: "L".repeat(3000) } },
      { role: "assistant", message: { role: "assistant", content: [{ type: "text", text: "A".repeat(3000) }] } },
      { role: "user", message: { role: "user", content: [
        { type: "tool_result", tool_use_id: "normal", content: [{ type: "text", text: "O".repeat(3000) }, { type: "image", source: { data: "NESTED_IMAGE" } }] },
        { type: "text", text: "Base directory for this skill: /plugin/skills/begin\nPRIVATE_LESSON" },
      ] } },
    ]);
    assert.ok(result.jsonl.includes("L".repeat(3000)));
    assert.ok(result.jsonl.includes("A".repeat(3000)));
    assert.ok(!result.jsonl.includes("O".repeat(2001)));
    assert.ok(!result.jsonl.includes("NESTED_IMAGE"));
    assert.ok(!result.jsonl.includes("PRIVATE_LESSON"));
  });
  test(`${agent}: drops .env result blocks and duplicate structured output`, () => {
    const result = redact(agent, [
      { message: { content: [{ type: "tool_use", id: "env", input: { file_path: ".env.local" } }] } },
      { message: { content: [{ type: "tool_result", tool_use_id: "env", content: [{ type: "text", text: "ENV_PRIVATE_CONTENT" }] }] }, toolUseResult: { file: { content: "ENV_PRIVATE_CONTENT" } } },
      { toolUseResult: { file: { filePath: ".env", content: "ENV_PRIVATE_CONTENT" } } },
    ]);
    assert.ok(!result.jsonl.includes("ENV_PRIVATE_CONTENT"));
  });
}

test("Codex keeps chat and event copies, caps outputs, removes instruction copies and image blocks", () => {
  const result = redact("codex", [
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "L".repeat(3000) }] } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "A".repeat(3000) }] } },
    { type: "event_msg", payload: { type: "user_message", message: "L".repeat(3000), images: ["EVENT_IMAGE"] } },
    { type: "event_msg", payload: { type: "agent_message", message: "A".repeat(3000) } },
    { type: "response_item", payload: { type: "function_call_output", output: "O".repeat(3000) } },
    { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "PRIVATE_LESSON" }] } },
    { type: "session_meta", payload: { base_instructions: { text: "PRIVATE_LESSON" } } },
    { type: "turn_context", payload: { developer_instructions: "PRIVATE_LESSON", user_instructions: "PRIVATE_LESSON" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<skill>PRIVATE_LESSON</skill>" }] } },
    { type: "event_msg", payload: { type: "user_message", message: "<skill>PRIVATE_LESSON</skill>" } },
  ]);
  assert.equal(result.jsonl.split("L".repeat(3000)).length - 1, 2);
  assert.equal(result.jsonl.split("A".repeat(3000)).length - 1, 2);
  for (const value of ["O".repeat(2001), "PRIVATE_LESSON", "EVENT_IMAGE"]) assert.ok(!result.jsonl.includes(value), value.slice(0, 30));
});

for (const agent of ["codex", "cursor"]) {
  test(`${agent}: fallback finds the exact session and refuses ambiguous matches`, async (t) => {
    const home = await mkdtemp(join(root, ".transcript-locate-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    const m = mapping(agent);
    const relative = agent === "codex" ? "sessions/2026/10/05/rollout-time-chat-a.jsonl" : "projects/workspace/agent-transcripts/chat-a/chat-a.jsonl";
    const path = join(home, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{}\n");
    if (agent === "codex") assert.equal(locateRoot(m, { CODEX_HOME: home }), home);
    assert.equal(locateTranscript(m, "chat-a", home), path);
    assert.equal(locateTranscript(m, "chat-b", home), null);
    const duplicate = agent === "codex" ? path.replace("rollout-time", "rollout-other") : path.replace("workspace", "another-workspace");
    await mkdir(dirname(duplicate), { recursive: true });
    await writeFile(duplicate, "{}\n");
    assert.throws(() => locateTranscript(m, "chat-a", home), /Ambiguous/);
  });
}

// `altitude notice ack` proof: the notice counts only in the tutor's own reply.
const NOTICE = "One quick note before we start. Altitude keeps a copy of each lesson conversation.";
const shapes = {
  "claude-code": { said: { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: NOTICE }] } },
    not: [{ type: "user", message: { role: "user", content: NOTICE } }, { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: NOTICE }] }, toolUseResult: { stdout: NOTICE } }] },
  codex: { said: { type: "event_msg", payload: { type: "agent_message", message: NOTICE } },
    not: [{ type: "response_item", payload: { type: "function_call_output", call_id: "c", output: NOTICE } }, { type: "event_msg", payload: { type: "user_message", message: NOTICE } }] },
  cursor: { said: { role: "assistant", message: { content: [{ type: "text", text: NOTICE }] } },
    not: [{ role: "user", message: { content: [{ type: "text", text: NOTICE }] } }] },
};
for (const [agent, shape] of Object.entries(shapes)) {
  test(`${agent}: notice proof reads the tutor's reply, never tool output or learner text`, () => {
    const line = (r) => JSON.stringify(r) + "\n";
    assert.equal(noticeShownIn(line(shape.said), mapping(agent), NOTICE), true);
    for (const record of shape.not) assert.equal(noticeShownIn(line(record), mapping(agent), NOTICE), false);
  });
}
