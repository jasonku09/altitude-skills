import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), "utf8"));
}

test("ships a valid, discoverable Claude Code plugin manifest", async () => {
  const manifest = await readJson(".claude-plugin/plugin.json");

  assert.equal(manifest.name, "altitude");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.description.length > 0, true);
  assert.equal(
    Object.hasOwn(manifest, "hooks"),
    false,
    "default hooks/hooks.json is auto-discovered; listing it loads the same file twice",
  );
  assert.equal(
    Object.hasOwn(manifest, "skills"),
    false,
    "default skills/ is auto-discovered without a custom component path",
  );
});

test("ships a Claude Code marketplace manifest serving this repo as the plugin root", async () => {
  const marketplace = await readJson(".claude-plugin/marketplace.json");

  assert.equal(marketplace.name, "altitude");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "altitude");
  assert.equal(marketplace.plugins[0].source, "./");
});

test("declares Claude's documented payload fields without leaking them into core", async () => {
  const mapping = await readJson("hooks/field-mapping.json");

  // This file ships in the marketplace plugin, which auto-updates ahead of the
  // learner's CLI. Every field here must be one the OLDEST CLI still in the
  // wild understands: CLIs at or below 0.3.0 reject a mapping outright if it
  // carries a field they do not know, which silently disables every hook.
  assert.deepEqual(mapping, {
    fields: {
      session_id: "session_id",
      cwd: "cwd",
      tool_name: "tool_name",
      last_assistant_message: "last_assistant_message",
    },
  });
});

test("wires lifecycle and gate hooks to stable exec-form core CLI invocations", async () => {
  const config = await readJson("hooks/hooks.json");
  const mappingPath = "${CLAUDE_PLUGIN_ROOT}/hooks/field-mapping.json";
  const expectedBase = ["--agent", "claude-code", "--mapping", mappingPath];

  assert.deepEqual(config, {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: "command",
              command: "altitude",
              args: [
                "hook",
                "session-start",
                ...expectedBase,
                "--print-context",
                "--nudge",
                "Run /altitude:next-lesson to continue (or /altitude:begin if this is your first session).",
              ],
              timeout: 30,
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: "ExitPlanMode",
          hooks: [
            {
              type: "command",
              command: "altitude",
              args: ["hook", "pre-tool-use", ...expectedBase, "--gate", "plan"],
              timeout: 30,
            },
          ],
        },
        {
          matcher: "Write|Edit",
          hooks: [
            {
              type: "command",
              command: "altitude",
              args: ["hook", "pre-tool-use", ...expectedBase, "--gate", "diff"],
              timeout: 30,
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "altitude",
              args: ["hook", "stop", ...expectedBase, "--gate", "retro"],
              timeout: 30,
            },
          ],
        },
      ],
      SessionEnd: [
        {
          hooks: [
            {
              type: "command",
              command: "altitude",
              args: ["hook", "session-end", ...expectedBase],
              timeout: 30,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: "altitude",
              args: ["hook", "user-prompt-submit", ...expectedBase],
              timeout: 30,
            },
          ],
        },
      ],
    },
  });
});

test("keeps session liveness off the per-tool-call path", async () => {
  const config = await readJson("hooks/hooks.json");

  // PostToolUse fires on EVERY tool call; SessionStart + UserPromptSubmit +
  // Stop already cover liveness without a per-tool CLI process spawn.
  assert.equal(Object.hasOwn(config.hooks, "PostToolUse"), false);
  assert.deepEqual(
    Object.keys(config.hooks).sort(),
    ["PreToolUse", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"],
  );
});

test("ships one connect skill that serves both agents", async () => {
  const connect = await readFile(join(repoRoot, "skills/connect/SKILL.md"), "utf8");

  assert.match(connect, /^---\n/);
  assert.match(connect, /^name: connect$/m);
  assert.doesNotMatch(
    connect,
    /disable-model-invocation/,
    "the model may invoke connect itself (e.g. offering to reconnect a dropped device)",
  );
  assert.match(connect, /altitude connect --agent claude-code/);
  assert.match(connect, /altitude connect --agent codex/);
  assert.match(connect, /claude --version/);
  assert.match(connect, /codex --version/);
  assert.match(connect, /--next-hint/);
  // Each agent's begin command, in its own invocation form.
  assert.match(connect, /\/altitude:begin/);
  assert.match(connect, /\$begin/);
});

test("ships one status skill that serves both agents", async () => {
  const status = await readFile(join(repoRoot, "skills/status/SKILL.md"), "utf8");

  assert.match(status, /^---\n/);
  assert.match(status, /^name: status$/m);
  assert.doesNotMatch(status, /disable-model-invocation/);
  assert.match(status, /altitude status/);
  // Points the user at the right connect invocation for either agent.
  assert.match(status, /\/altitude:connect/);
  assert.match(status, /\$connect/);
});

test("keeps the Claude adapter surface free of server-owned teaching content", async () => {
  const distributable = [
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "hooks/field-mapping.json",
    "hooks/hooks.json",
    "skills/connect/SKILL.md",
    "skills/status/SKILL.md",
  ];
  const forbidden = [
    /what(?:'s| is) missing from this plan/i,
    /walk through the diff/i,
    /planted bug/i,
    /two-minute retro/i,
    /quiz before moving on/i,
  ];

  for (const relativePath of distributable) {
    const contents = await readFile(join(repoRoot, relativePath), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(contents, pattern, `${relativePath} contains server-owned content`);
    }
  }
});
