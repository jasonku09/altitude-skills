import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, delimiter, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// The exact Windows hook command (see the freeze test). It reads the plugin
// root from the PLUGIN_ROOT environment variable Codex sets for every plugin
// hook, so the path never passes through a shell parser: no `$`, `%`, `!`,
// `^`, backtick or inner double quote may appear, because pwsh 7, Windows
// PowerShell 5.1 and cmd (Codex's fallback when it has no session shell) each
// expand a different subset of them inside double quotes.
function windowsBootstrap(action) {
  const script =
    "Promise.resolve().then(()=>{const p=require('node:path'),r=process.env.PLUGIN_ROOT;" +
    "if(typeof r==='string'&&p.isAbsolute(r))" +
    "return import(require('node:url').pathToFileURL(p.join(r,'bin','altitude-codex-hook.mjs')).href);" +
    "throw Error('PLUGIN_ROOT is not an absolute plugin path')})" +
    `.then((m)=>m.main('${action}'))` +
    ".catch((e)=>{process.stderr.write('Altitude hook skipped: '+e.message+'\\n');process.exitCode=0})";
  return `node -e "${script}"`;
}

const actions = ["session-start", "plan", "diff", "stop", "session-end", "user-prompt-submit"];

async function windowsCommands() {
  const config = await readJson("hooks/codex.json");
  const commands = new Map();
  for (const entries of Object.values(config.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const action = hook.command.split(" ").at(-1);
        commands.set(action, hook.commandWindows);
      }
    }
  }
  return commands;
}

// A plugin install whose root path contains every character some Windows
// hook shell would expand or split on inside double quotes. Pass a realpath'd
// temp: Node resolves symlinks (macOS /var -> /private/var) when it imports
// the shim, so the shim's own plugin root is always the real path.
async function trickyPluginRoot(temp) {
  const root = join(temp, "plugin O'Neil $HOME %OS% `x` !y! ^z & (1)");
  await cp(join(repoRoot, "bin"), join(root, "bin"), { recursive: true });
  await cp(join(repoRoot, "hooks"), join(root, "hooks"), { recursive: true });
  return root;
}

// Simulates native Windows for the shim's CLI launch: process.platform is
// read when the CLI is resolved, after this preload has run.
async function win32Preload(temp) {
  const preload = join(temp, "as-win32.mjs");
  await writeFile(preload, 'Object.defineProperty(process, "platform", { value: "win32" });\n');
  return pathToFileURL(preload).href;
}

// An npm global prefix as Windows lays it out: altitude.cmd beside
// node_modules/@learnaltitude/cli. The .cmd must never run.
async function npmWindowsPrefix(directory, cliBody) {
  const pkg = join(directory, "node_modules/@learnaltitude/cli");
  await mkdir(join(pkg, "bin"), { recursive: true });
  await writeFile(join(directory, "altitude.cmd"), "@echo off\r\nREM not executed\r\n");
  await writeFile(
    join(pkg, "package.json"),
    JSON.stringify({ name: "@learnaltitude/cli", bin: { altitude: "bin/altitude.js" } }),
  );
  await writeFile(join(pkg, "bin/altitude.js"), cliBody);
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

  // Both agents pin an installed plugin to its manifest's declared version
  // string — an update whose string has not moved is SKIPPED, so a release
  // that bumps one manifest and not the other silently strands every install
  // on the unbumped agent. The bump is a release-checklist step; this equality
  // is what keeps the two halves from drifting when someone forgets half of it.
  assert.equal(codex.version, claude.version);
});

test("declares Codex's documented hook payload fields at the adapter edge", async () => {
  const mapping = await readJson("hooks/codex-field-mapping.json");

  assert.deepEqual(mapping, {
    fields: {
      session_id: "session_id",
      cwd: "cwd",
      tool_name: "tool_name",
      // The learner's answer to a parked retro question arrives here, so an
      // unmapped `prompt` leaves every Codex question parked until its marker
      // expires — the gate asks and nothing can ever answer.
      prompt: "prompt",
      last_assistant_message: "last_assistant_message",
      // Codex sends the running model on every hook payload; the CLI stamps
      // it on the session for the tutor's recommended-model line. CLIs that
      // predate the field drop it rather than rejecting the mapping (≥0.4.0).
      model: "model",
      transcript_path: "transcript_path",
    },
  });
});

test("wires lifecycle and PreToolUse gates through frozen cross-platform shim commands", async () => {
  const config = await readJson("hooks/codex.json");
  const command = (action) => `node "$PLUGIN_ROOT/bin/altitude-codex-hook.mjs" ${action}`;
  const commandWindows = windowsBootstrap;
  const hook = (action, statusMessage, timeout = 30) => ({
    type: "command",
    command: command(action),
    commandWindows: commandWindows(action),
    timeout,
    statusMessage,
  });

  // Codex's hook-trust hash covers exactly this handler config (raw command
  // strings, pre-expansion), keyed by event + POSITION. Any change to a
  // command string silently un-trusts the hook for every installed user, and
  // reordering entries orphans their trust state. Treat this deepEqual as the
  // freeze: iterate inside the shim, never here.
  //
  // commandWindows moved off cmd's `%PLUGIN_ROOT%` on 2026-10-17: Codex
  // (>=0.131.0) runs Windows hooks through the session shell — PowerShell —
  // which left it literal, so every Windows hook exited 1. Codex hashes the
  // platform's own command, so this re-prompts the one-time hook trust review
  // for Windows installs only (all of which were broken); POSIX `command`
  // strings are untouched and macOS/Linux trust is unaffected.
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
      // Stop is END OF TURN, not end of session: workshop-core removes the
      // session marker and emits `session_ended` only on this lifecycle.
      // Codex caps SessionEnd at 3 s (1 s default) and clamps anything larger
      // with a warning on every launch. `timeout` is inside the trust hash, so
      // this retime re-prompts every existing install ONCE on upgrade —
      // accepted 2026-09-04 (sandbox-aware copy release).
      SessionEnd: [
        {
          hooks: [hook("session-end", "Closing the Altitude workshop session", 3)],
        },
      ],
      // The other half of the retro gate — the turn where the learner answers
      // the parked question — plus the turn-start credit stamp.
      UserPromptSubmit: [
        {
          hooks: [hook("user-prompt-submit", "Recording your Altitude turn")],
        },
      ],
    },
  });
  assert.equal(Object.hasOwn(config.hooks, "PostToolUse"), false);
});

test("the Codex SessionEnd hook fits Codex's documented 3-second ceiling", async () => {
  const config = await readJson("hooks/codex.json");
  const [entry] = config.hooks.SessionEnd;
  const [hook] = entry.hooks;

  // Codex: "SessionEnd and Interrupt use 1 second by default and support up
  // to 3 seconds." A larger value is clamped with a warning on every launch.
  assert.ok(hook.timeout >= 1 && hook.timeout <= 3, `SessionEnd timeout ${hook.timeout} exceeds Codex's 3 s cap`);
});

test("Codex hook entries keep their positions — trust state is positional", async () => {
  const config = await readJson("hooks/codex.json");

  // Codex records trust per event + POSITION over {async, command, timeout,
  // type}. Retiming SessionEnd re-prompts once on upgrade (accepted); moving
  // any entry would silently orphan trust for the entries around it.
  assert.deepEqual(Object.keys(config.hooks), [
    "SessionStart",
    "PreToolUse",
    "Stop",
    "SessionEnd",
    "UserPromptSubmit",
  ]);
  assert.deepEqual(
    config.hooks.PreToolUse.map((entry) => entry.matcher),
    ["^update_plan$", "^(apply_patch|Edit|Write)$"],
  );
  for (const [event, entries] of Object.entries(config.hooks)) {
    assert.equal(entries.length, event === "PreToolUse" ? 2 : 1, `${event} entry count changed`);
    for (const entry of entries) assert.equal(entry.hooks.length, 1, `${event} handler count changed`);
  }
  assert.equal(
    config.hooks.SessionEnd[0].hooks[0].command,
    'node "$PLUGIN_ROOT/bin/altitude-codex-hook.mjs" session-end',
  );
});

test("covers the same lifecycle surface as the Claude plugin", async () => {
  const codex = await readJson("hooks/codex.json");
  const claude = await readJson("hooks/hooks.json");

  // Agent neutrality: a lifecycle wired for one agent and not the other is an
  // adapter bug, and it is invisible until a bound session runs live. Codex
  // 0.145.0 supports every event Claude Code does that we use.
  assert.deepEqual(
    Object.keys(codex.hooks).sort(),
    Object.keys(claude.hooks).sort(),
  );
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
    transcript_path: "/missing/rollout.jsonl",
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
    "--transcript-mapping",
    join(repoRoot, "hooks/codex-transcript-mapping.json"),
  ]);
  assert.equal(await readFile(stdinPath, "utf8"), payload);
});

test("the shim forwards the session-end and user-prompt-submit lifecycles", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-lifecycle-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const argvPath = join(temp, "argv");
  await fakeExecutable(temp, "altitude", `printf '%s\\n' "$@" > "${argvPath}"`);
  const base = ["--agent", "codex", "--mapping", join(repoRoot, "hooks/codex-field-mapping.json")];

  for (const [action, lifecycle] of [
    ["session-end", "session-end"],
    ["user-prompt-submit", "user-prompt-submit"],
  ]) {
    const result = runShim([action], {
      input: JSON.stringify({ session_id: `codex-${action}`, cwd: "/tmp/project" }),
      env: { PATH: `${temp}${delimiter}${process.env.PATH}` },
    });

    assert.equal(result.status, 0, action);
    // No `--gate`: neither lifecycle runs a gate, so neither can ever block.
    assert.deepEqual(
      (await readFile(argvPath, "utf8")).trim().split("\n"),
      ["hook", lifecycle, ...base, "--transcript-mapping", join(repoRoot, "hooks/codex-transcript-mapping.json")],
      action,
    );
  }
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
  assert.deepEqual(argv.slice(argv.indexOf("--nudge"), argv.indexOf("--nudge") + 2), [
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
    // Still a hook invocation from Codex's point of view: a misconfigured
    // action prints usage for a human but never surfaces as a hook failure.
    assert.equal(result.status, 0, retired);
    assert.match(result.stderr, /usage: altitude-codex-hook/);
  }
  execFileSync(process.execPath, ["--check", shim]);
});

test("gates fail OPEN: any CLI exit other than 0 or 2 becomes 0, stderr kept", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-crash-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  // 1 = a crash / old CLI; 3 = anything unexpected; 9009 truncates to an
  // 8-bit status on POSIX, so 137 stands in for "killed by the OS".
  for (const code of [1, 3, 137]) {
    await fakeExecutable(
      temp,
      "altitude",
      `echo "partial context" \necho "TypeError: boom at cli.js:1" >&2\nexit ${code}`,
    );
    for (const action of ["session-start", "plan", "diff", "stop", "session-end", "user-prompt-submit"]) {
      const result = runShim([action], {
        input: JSON.stringify({ session_id: `codex-crash-${code}` }),
        env: { PATH: `${temp}${delimiter}${process.env.PATH}` },
      });
      assert.equal(result.status, 0, `${action} exit ${code}`);
      // The real error stays visible to a human running the hook by hand.
      assert.match(result.stderr, /TypeError: boom at cli\.js:1/, `${action} exit ${code}`);
      assert.match(result.stderr, new RegExp(`exited with code ${code}`), `${action} exit ${code}`);
      // A crashed CLI's stdout is not trusted as model context.
      assert.equal(result.stdout, "", `${action} exit ${code}`);
    }
  }
});

test("gates fail OPEN: a crash inside the shim itself exits 0", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-shim-crash-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await fakeExecutable(temp, "altitude", "exit 0");
  // Preloaded before the shim: reading stdin throws, as a broken host pipe would.
  const preload = join(temp, "broken-stdin.mjs");
  await writeFile(
    preload,
    'Object.defineProperty(process, "stdin", { get() { throw new Error("stdin unavailable: EPIPE"); } });\n',
  );
  for (const action of ["session-start", "diff"]) {
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, shim, action], {
      encoding: "utf8",
      input: "{}",
      env: { ...process.env, PATH: `${temp}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 0, action);
    assert.match(result.stderr, /Altitude hook skipped/, action);
    assert.match(result.stderr, /stdin unavailable: EPIPE/, action);
  }
});

test("keeps the Codex adapter surface free of server-owned teaching content", async () => {
  const distributable = [
    ".codex-plugin/plugin.json",
    ".agents/plugins/marketplace.json",
    "bin/altitude-codex-hook.mjs",
    "bin/altitude-cli.mjs",
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

test("commandWindows carries no syntax any Windows hook shell would expand", async () => {
  const commands = await windowsCommands();
  assert.deepEqual([...commands.keys()].sort(), [...actions].sort());
  for (const [action, command] of commands) {
    // pwsh 7 and PowerShell 5.1 expand `$` and backtick escapes inside double
    // quotes; cmd expands `%VAR%` (and `!VAR!`, `^` under delayed expansion).
    // The plugin path is substituted by nobody: the bootstrap reads it from
    // the PLUGIN_ROOT environment variable, so no path character can matter.
    assert.doesNotMatch(command, /[$%`!^]/, action);
    assert.equal(command.split('"').length, 3, `${action}: exactly one double-quoted argument`);
    assert.match(command, /^node -e "/, action);
    assert.match(command, /process\.env\.PLUGIN_ROOT/, action);
    assert.doesNotMatch(command, /\$\{?PLUGIN_ROOT/, action);
  }
});

test("each Windows hook command runs the shim from a plugin root full of shell metacharacters", async (t) => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "altitude-codex-win-cmd-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = await trickyPluginRoot(temp);
  const argvPath = join(temp, "argv");
  const stdinPath = join(temp, "stdin");
  const cliDir = join(temp, "cli");
  await mkdir(cliDir);
  await fakeExecutable(
    cliDir,
    "altitude",
    `printf '%s\\n' "$@" > "${argvPath}"\ncat > "${stdinPath}"\nexit "\${FAKE_EXIT:-0}"`,
  );
  const commands = await windowsCommands();
  const env = { ...process.env, PLUGIN_ROOT: root, PATH: `${cliDir}${delimiter}${process.env.PATH}` };

  for (const [action, command] of commands) {
    const payload = JSON.stringify({ session_id: `codex-win-${action}`, cwd: "/tmp/project" });
    // The command has no shell-specific syntax, so /bin/sh parses it exactly
    // as pwsh, PowerShell 5.1 and cmd do: node -e <script> with no other args.
    const result = spawnSync("/bin/sh", ["-c", command], { input: payload, encoding: "utf8", env });
    assert.equal(result.status, 0, `${action}: ${result.stderr}`);
    const argv = (await readFile(argvPath, "utf8")).trim().split("\n");
    assert.equal(argv[0], "hook", action);
    assert.equal(argv[argv.indexOf("--mapping") + 1], join(root, "hooks/codex-field-mapping.json"), action);
    assert.equal(
      argv[argv.indexOf("--transcript-mapping") + 1],
      join(root, "hooks/codex-transcript-mapping.json"),
      action,
    );
    assert.equal(await readFile(stdinPath, "utf8"), payload, action);
  }

  // A gate block still reaches Codex as exit 2 through the bootstrap.
  const blocked = spawnSync("/bin/sh", ["-c", commands.get("diff")], {
    input: "{}",
    encoding: "utf8",
    env: { ...env, FAKE_EXIT: "2" },
  });
  assert.equal(blocked.status, 2);
});

test("the Windows bootstrap fails open when the plugin root is unusable", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-win-boot-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const command = (await windowsCommands()).get("diff");
  for (const pluginRoot of [undefined, "relative/plugin", join(temp, "missing-plugin")]) {
    const env = { ...process.env };
    if (pluginRoot === undefined) delete env.PLUGIN_ROOT;
    else env.PLUGIN_ROOT = pluginRoot;
    const result = spawnSync("/bin/sh", ["-c", command], { input: "{}", encoding: "utf8", env, cwd: temp });
    assert.equal(result.status, 0, String(pluginRoot));
    assert.match(result.stderr, /Altitude hook skipped: /, String(pluginRoot));
  }
});

test("importing the shim runs nothing; main(action) is the hook entry point", async () => {
  const { main } = await import(pathToFileURL(shim).href);
  assert.equal(typeof main, "function");
});

test("on Windows the shim runs the npm CLI through node, never through a shell", async (t) => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "altitude codex win32 & $(x) ")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = await trickyPluginRoot(temp);
  const npm = join(temp, "Alty Learner", "AppData", "Roaming", "npm");
  const capture = join(temp, "capture.json");
  await npmWindowsPrefix(
    npm,
    `let input = ""; process.stdin.on("data", (c) => (input += c)).on("end", () => {
      require("node:fs").writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ argv: process.argv.slice(2), input }));
      process.stdout.write("Altitude journey: Foundations\\n");
      process.exitCode = Number(process.env.FAKE_EXIT ?? 0);
    });`,
  );
  const preload = await win32Preload(temp);
  const shimAt = join(root, "bin/altitude-codex-hook.mjs");
  const launch = (action, env = {}) =>
    spawnSync(process.execPath, ["--import", preload, shimAt, action], {
      input: JSON.stringify({ session_id: "codex-win32" }),
      encoding: "utf8",
      env: { ...process.env, ALTITUDE_CLI_PATH: "", PATH: npm, ...env },
    });

  const result = launch("session-start");
  assert.equal(result.status, 0, result.stderr);
  // No shell ever saw the arguments: paths with spaces and the `$skill`
  // nudge arrive intact, and Node raises no shell-with-args deprecation.
  const { argv, input } = JSON.parse(await readFile(capture, "utf8"));
  assert.deepEqual(argv.slice(0, 2), ["hook", "session-start"]);
  assert.equal(argv[argv.indexOf("--mapping") + 1], join(root, "hooks/codex-field-mapping.json"));
  assert.equal(argv[argv.indexOf("--nudge") + 1], "Run $next-lesson to continue (or $begin for your first session).");
  assert.equal(input, JSON.stringify({ session_id: "codex-win32" }));
  assert.equal(result.stdout, "Altitude journey: Foundations\n");
  assert.doesNotMatch(result.stderr, /DEP0190|not recognized/);

  const blocked = launch("diff", { FAKE_EXIT: "2" });
  assert.equal(blocked.status, 2);
});

test("on Windows a missing CLI is a clean fail-open message, exit 0", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-codex-win32-missing-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const preload = await win32Preload(temp);
  // One PATH entry holds nothing; the other a stray altitude.cmd with no
  // installed package beside it — never executed, never a shell fallback.
  const empty = join(temp, "empty");
  const stray = join(temp, "stray");
  await mkdir(empty);
  await mkdir(stray);
  await writeFile(join(stray, "altitude.cmd"), "@echo off\r\nREM not executed\r\n");
  for (const action of actions) {
    const result = spawnSync(process.execPath, ["--import", preload, shim, action], {
      input: "{}",
      encoding: "utf8",
      env: { ...process.env, ALTITUDE_CLI_PATH: "", PATH: [empty, stray].join(delimiter) },
    });
    assert.equal(result.status, 0, action);
    assert.equal(result.stdout, "", action);
    assert.match(
      result.stderr,
      /Altitude could not run the workshop CLI: Altitude CLI was not found; install it with npm install -g @learnaltitude\/cli\./,
      action,
    );
    assert.doesNotMatch(result.stderr, /DEP0190|not recognized/, action);
  }
});

test("the Codex and Cursor shims share one CLI resolver", async () => {
  const shared = await import(pathToFileURL(join(repoRoot, "bin/altitude-cli.mjs")).href);
  const cursor = await import(pathToFileURL(join(repoRoot, "bin/altitude-cursor-hook.mjs")).href);
  assert.equal(typeof shared.resolveCli, "function");
  assert.equal(cursor.resolveCli, shared.resolveCli);
  const source = await readFile(shim, "utf8");
  assert.match(source, /from "\.\/altitude-cli\.mjs"/);
  assert.doesNotMatch(source, /shell:\s*(true|process\.platform)/);
});
