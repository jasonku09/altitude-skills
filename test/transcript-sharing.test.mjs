import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const json = async (path) => JSON.parse(await read(path));

for (const prefix of ["", "codex-", "cursor-"]) {
  test(`${prefix || "Claude "}field mapping forwards transcript_path`, async () => {
    assert.equal((await json(`hooks/${prefix}field-mapping.json`)).fields.transcript_path, "transcript_path");
  });
}

for (const agent of ["claude-code", "codex", "cursor"]) {
  test(`${agent} ships versioned transcript privacy rules`, async () => {
    const mapping = await json(`hooks/${agent}-transcript-mapping.json`);
    assert.equal(mapping.version, 1);
    assert.equal(mapping.format, `${agent}-jsonl-v1`);
    for (const rules of ["message_text", "tool_calls", "tool_outputs", "images", "drop"]) {
      assert.ok(Array.isArray(mapping[rules]) && mapping[rules].length > 0, rules);
    }
    if (agent !== "claude-code") assert.ok(mapping.locate.pattern.includes("{session_id}"));
    if (agent === "codex") assert.equal(mapping.locate.root.env, "CODEX_HOME");
  });
}

test("every Claude hook selects its own transcript mapping", async () => {
  const config = await json("hooks/hooks.json");
  for (const entries of Object.values(config.hooks)) for (const entry of entries) for (const hook of entry.hooks) {
    const index = hook.args.indexOf("--transcript-mapping");
    assert.notEqual(index, -1);
    assert.equal(hook.args[index + 1], "${CLAUDE_PLUGIN_ROOT}/hooks/claude-code-transcript-mapping.json");
  }
});

