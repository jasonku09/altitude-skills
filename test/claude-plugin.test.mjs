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
  // wild understands. That floor is 0.4.0: from 0.4.0 the CLI drops unknown
  // mapping fields instead of rejecting the mapping (which on ≤0.3.0 silently
  // disables every hook), and the server's agent-version floor at device
  // connect is how any straggler gets pushed forward. `prompt` requires
  // ≥0.4.0 and is what answer capture rides on — without it the hook never
  // sees the learner's reply to a parked retro question.
  assert.deepEqual(mapping, {
    fields: {
      session_id: "session_id",
      cwd: "cwd",
      tool_name: "tool_name",
      prompt: "prompt",
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

test("README installs the plugin from a terminal, with scope and reload guidance", async () => {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");

  // `/plugin` is a terminal-only command. Telling a learner to type it "inside
  // the agent" sends IDE-extension users to a chat panel that answers "plugin
  // isn't available in this environment", and they cannot find Claude Code at
  // all from there — this is where the first beta tester stranded (2026-08-08).
  // The install has to start by opening a terminal and running `claude`.
  assert.doesNotMatch(readme, /type both lines inside the agent/i);
  assert.match(readme, /Open a terminal and run `claude`/);

  // `/plugin install` prompts for an install scope. Project scope writes
  // `.claude/settings.json` and local scope `.claude/settings.local.json` into
  // whatever folder the learner is standing in — both left behind the moment
  // their first lesson creates its own project folder, which is precisely when
  // the skills are needed. Name the user scope, and the reload follow-up.
  assert.match(readme, /user scope/);
  assert.match(readme, /\/reload-plugins/);
});

test("README fences the direct-copy install off from hooks and subscribers", async () => {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");

  const start = readme.indexOf("**Or copy the skills directly**");
  const end = readme.indexOf("**Using Cursor instead?**");
  assert.ok(start !== -1 && end > start, "the direct-copy install block moved or vanished");
  const copyBlock = readme.slice(start, end);

  // `hooks/` sits outside `skills/`, and every hook command resolves
  // `${CLAUDE_PLUGIN_ROOT}` — a variable only a plugin install defines. So
  // `cp -r skills/*` yields working slash commands and no session hooks: no
  // evidence capture, no gates. Gates fail open by design, so nothing errors;
  // a subscriber's only symptom is a learning map that never fills. The
  // warning has to sit with the commands, not three paragraphs below them.
  assert.match(copyBlock, /no session hooks/i, "must say the copy carries no hooks");
  assert.match(copyBlock, /free standalone method/i, "must scope the copy to the free method");
  assert.match(copyBlock, /subscription/i, "must send subscribers back to the plugin");

  // A copied skill is invoked by its own `name` — `/connect`, not
  // `/altitude:connect`, which exists only under the plugin's namespace. The
  // paid route must not be described as reachable from a copied install.
  assert.doesNotMatch(
    copyBlock,
    /\/altitude:connect/,
    "a copied install has no /altitude: namespace to connect with",
  );
});

test("README scopes the Cursor copy to the free method too", async () => {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");

  const cursorBlock = readme.slice(readme.indexOf("**Using Cursor instead?**"));
  assert.match(cursorBlock, /~\/\.cursor\/skills/, "the Cursor copy block moved or vanished");
  // Same mechanism, same silent loss: skills copy over, hooks do not exist to
  // copy, and Cursor has no Altitude hook adapter at all.
  assert.match(
    cursorBlock.slice(0, cursorBlock.indexOf("## How to use it")),
    /free standalone method/i,
    "must scope the Cursor copy to the free method",
  );
});

test("teaches the `!` shell shortcut only where it exists", async () => {
  // `!` runs a line as a shell command inside a Claude Code session. It is a
  // Claude Code affordance, and these teaching skills ship to Codex too, so
  // every line that mentions it must name Claude Code in the same breath.
  // An unconditional tip is simply wrong for half the learners who read it.
  const teaching = ["skills/begin/SKILL.md", "skills/next-lesson/SKILL.md"];
  let taught = 0;

  for (const relativePath of teaching) {
    const contents = await readFile(join(repoRoot, relativePath), "utf8");
    const lines = contents.split("\n").filter((line) => line.includes("`!"));
    taught += lines.length;

    for (const line of lines) {
      assert.match(
        line,
        /Claude Code/,
        `${relativePath} teaches \`!\` without scoping it to Claude Code`,
      );
    }
  }

  assert.equal(taught > 0, true, "no skill tells a first-session learner about `!`");
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
