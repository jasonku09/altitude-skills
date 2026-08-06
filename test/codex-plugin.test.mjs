import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, delimiter, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shim = join(repoRoot, "bin/altitude-codex-hook.mjs");

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), "utf8"));
}

async function fakeExecutable(directory, name, body) {
  const path = join(directory, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

function runShim(args, options = {}) {
  return spawnSync(process.execPath, [shim, ...args], {
    encoding: "utf8",
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

test("ships a Codex marketplace manifest that serves this repo as its own plugin root", async () => {
  const marketplace = await readJson(".agents/plugins/marketplace.json");

  assert.equal(marketplace.name, "altitude");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "altitude");
  // "." resolves to the marketplace root itself (codex marketplace.rs), so the
  // repo root doubles as the plugin root for both agents.
  assert.equal(marketplace.plugins[0].source, ".");
});

test("ships a Codex plugin manifest pointing hooks at the Codex-specific file", async () => {
  const manifest = await readJson(".codex-plugin/plugin.json");

  assert.equal(manifest.name, "altitude");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.description.length > 0, true);
  // Codex requires manifest resource paths to start with "./" and SILENTLY
  // ignores them otherwise, falling back to hooks/hooks.json — the Claude
  // file, whose exec-form `args` Codex drops. This exact string is
  // load-bearing.
  assert.equal(manifest.hooks, "./hooks/codex.json");
  assert.equal(
    Object.hasOwn(manifest, "skills"),
    false,
    "default skills/ is auto-discovered without a manifest override",
  );
});

test("keeps the two plugin manifests on the same released version", async () => {
  const codex = await readJson(".codex-plugin/plugin.json");
  const claude = await readJson(".claude-plugin/plugin.json");

  assert.equal(codex.version, claude.version);
});

test("declares Codex's documented hook payload fields at the adapter edge", async () => {
  const mapping = await readJson("hooks/codex-field-mapping.json");

  assert.deepEqual(mapping, {
    fields: {
      session_id: "session_id",
      cwd: "cwd",
      tool_name: "tool_name",
      last_assistant_message: "last_assistant_message",
    },
  });
});

test("wires lifecycle and PreToolUse gates through frozen cross-platform shim commands", async () => {
  const config = await readJson("hooks/codex.json");
  const command = (action) => `node "$PLUGIN_ROOT/bin/altitude-codex-hook.mjs" ${action}`;
  const commandWindows = (action) =>
    `node "%PLUGIN_ROOT%\\bin\\altitude-codex-hook.mjs" ${action}`;
  const hook = (action, statusMessage) => ({
    type: "command",
    command: command(action),
    commandWindows: commandWindows(action),
    timeout: 30,
    statusMessage,
  });

  // Codex's hook-trust hash covers exactly this handler config (raw command
  // strings, pre-expansion), keyed by event + POSITION. Any change to a
  // command string silently un-trusts the hook for every installed user, and
  // reordering entries orphans their trust state. Treat this deepEqual as the
  // freeze: iterate inside the shim, never here.
  assert.deepEqual(config, {
    description: "Altitude workshop lifecycle and learning gates.",
    hooks: {
      SessionStart: [
        {
          hooks: [hook("session-start", "Starting Altitude workshop capture")],
        },
      ],
      PreToolUse: [
        {
          matcher: "^update_plan$",
          hooks: [hook("plan", "Checking the Altitude plan gate")],
        },
        {
          matcher: "^(apply_patch|Edit|Write)$",
          hooks: [hook("diff", "Checking the Altitude diff gate")],
        },
      ],
      Stop: [
        {
          hooks: [hook("stop", "Checking the Altitude retro gate")],
        },
      ],
    },
  });
  assert.equal(Object.hasOwn(config.hooks, "PostToolUse"), false);
});

test("the shim forwards exact lifecycle arguments and stdin to workshop-core", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-forward-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const argvPath = join(temp, "argv");
  const stdinPath = join(temp, "stdin");
  await fakeExecutable(
    temp,
    "altitude",
    `printf '%s\\n' "$@" > "${argvPath}"\ncat > "${stdinPath}"`,
  );
  const payload = JSON.stringify({
    session_id: "codex-session-123",
    cwd: "/tmp/project",
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    tool_input: { patch: "*** Begin Patch" },
  });

  const result = runShim(["diff"], {
    input: payload,
    env: { PATH: `${temp}${delimiter}${process.env.PATH}` },
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.deepEqual((await readFile(argvPath, "utf8")).trim().split("\n"), [
    "hook",
    "pre-tool-use",
    "--agent",
    "codex",
    "--mapping",
    join(repoRoot, "hooks/codex-field-mapping.json"),
    "--gate",
    "diff",
  ]);
  assert.equal(await readFile(stdinPath, "utf8"), payload);
});

test("the shim preserves exit 2 and the gate reason", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-block-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await fakeExecutable(temp, "altitude", 'echo "server-authored gate reason" >&2\nexit 2');

  const result = runShim(["plan"], {
    input: JSON.stringify({ session_id: "codex-block" }),
    env: { PATH: `${temp}${delimiter}${process.env.PATH}` },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /server-authored gate reason/);
});

test("SessionStart passes core context through as plain stdout for model injection", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-context-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await fakeExecutable(
    temp,
    "altitude",
    "printf 'Altitude journey: Foundations\\nCurrent task: Ship the adapter\\n'",
  );

  const result = runShim(["session-start"], {
    input: JSON.stringify({ session_id: "codex-context" }),
    env: { PATH: `${temp}${delimiter}${process.env.PATH}` },
  });

  assert.equal(result.status, 0);
  // Codex injects non-JSON SessionStart stdout as additional context for the
  // MODEL (session_start.rs) — the same convention Claude Code uses. Wrapping
  // it in {systemMessage} instead would show the text to the user while the
  // model never sees the journey state.
  assert.equal(
    result.stdout,
    "Altitude journey: Foundations\nCurrent task: Ship the adapter\n",
  );
});

test("SessionStart supplies a Codex-form ($skill) lesson nudge", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-nudge-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const argvPath = join(temp, "argv");
  await fakeExecutable(temp, "altitude", `printf '%s\\n' "$@" > "${argvPath}"`);

  const result = runShim(["session-start"], {
    input: JSON.stringify({ session_id: "codex-nudge", cwd: "/tmp/project" }),
    env: { PATH: `${temp}${delimiter}${process.env.PATH}` },
  });

  assert.equal(result.status, 0);
  const argv = (await readFile(argvPath, "utf8")).trim().split("\n");
  assert.deepEqual(argv.slice(-2), [
    "--nudge",
    "Run $next-lesson to continue (or $begin for your first session).",
  ]);
});

test("the shim fails open when workshop-core is missing entirely", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-missing-"));
  t.after(() => rm(temp, { recursive: true, force: true }));

  // PATH with no `altitude` at all: the spawn fails, the hook must not block.
  const result = runShim(["diff"], {
    input: JSON.stringify({ session_id: "codex-missing" }),
    env: { PATH: temp },
  });

  assert.equal(result.status, 0);
  assert.match(result.stderr, /Altitude could not run/);
});

test("the shim is hooks-only: connect and status are not shim actions", () => {
  for (const retired of ["connect", "status"]) {
    const result = runShim([retired], { input: "" });
    assert.equal(result.status, 1, retired);
    assert.match(result.stderr, /usage: altitude-codex-hook/);
  }
  execFileSync(process.execPath, ["--check", shim]);
});

test("keeps the Codex adapter surface free of server-owned teaching content", async () => {
  const distributable = [
    ".codex-plugin/plugin.json",
    ".agents/plugins/marketplace.json",
    "bin/altitude-codex-hook.mjs",
    "hooks/codex-field-mapping.json",
    "hooks/codex.json",
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

test("README installs Codex through the marketplace, not clone-and-copy", async () => {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");

  assert.match(readme, /codex plugin marketplace add jasonku09\/altitude-skills/);
  assert.match(readme, /codex plugin add altitude@altitude/);
  assert.match(readme, /Trust all and continue/);
  assert.doesNotMatch(
    readme,
    /~\/\.codex\/skills/,
    "the Codex clone-and-copy path is retired; the plugin is the only documented install",
  );
});
