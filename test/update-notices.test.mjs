import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Client freshness — the plugin half (docs/client-freshness.md in the altitude
 * repo). Every session the CLI reports its own version and this plugin's; the
 * server answers with what's current plus server-authored copy naming the
 * exact update command for the learner's agent; the CLI compares live and
 * surfaces the result to the skill on `altitude task --json` as
 *
 *   update_notices: [ { severity: "routine" | "urgent", message: "<line>" } ]
 *
 * Two contracts in THIS repo make the mechanism true, and both are pinned
 * here: the next-lesson markdown relays the notices with the same discipline
 * as the existing `update_available` close, and the hook `--mapping` path
 * keeps the exact shape the CLI's plugin-version detection walks.
 */

async function readNextLesson() {
  return readFile(join(repoRoot, "skills/next-lesson/SKILL.md"), "utf8");
}

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading);
  assert.ok(
    start !== -1 && end > start,
    `the "${startHeading}" … "${endHeading}" span moved or vanished`,
  );
  return contents.slice(start, end);
}

test("next-lesson notes update_notices while orienting and holds routine ones for the close", async () => {
  const skill = await readNextLesson();
  const orient = sliceBetween(skill, "## Step 1 — Orient", "## Step 2");

  // Step 1 is where the envelope is read; the notice must be captured there
  // and parked for Step 4 — never surfaced before or inside the lesson.
  assert.match(orient, /`update_notices`/);
  // The one exception to parking: urgent severity may be relayed immediately.
  assert.match(orient, /"urgent"/);
});

test("next-lesson relays server notices verbatim, hands-off, after the recap", async () => {
  const skill = await readNextLesson();
  const close = sliceBetween(skill, "## Step 4 — Close the loop", "## When they broke something");

  assert.match(close, /`update_notices`/);
  // The slot: after the closing recap, same place the update_available line
  // already lives.
  assert.match(close, /after the recap/);
  // The server authored the line knowing the learner's agent and command;
  // relay it as given, no embellishment, no invented changelog.
  assert.match(close, /exactly as the server wrote it/);
  // Dictate, don't do: the learner runs the command themselves, nothing about
  // the lesson loop waits on it.
  assert.match(close, /never run it for them/);
  assert.match(close, /never make the next lesson conditional/);
  // update_available and a CLI notice can both be true at once — one fact,
  // capped at two lines to the learner, never more.
  assert.match(close, /at most two lines/);
  // Urgent may jump the queue; said once, it is not repeated at the close.
  assert.match(close, /"urgent"/);
});

test("a missing or empty update_notices key means silence", async () => {
  const skill = await readNextLesson();
  const close = sliceBetween(skill, "## Step 4 — Close the loop", "## When they broke something");

  // Older CLI builds do not send the field at all. An absent key must read as
  // "nothing to say", never as a reason to speculate about updates.
  assert.match(close, /missing or empty `update_notices`/);
  assert.match(close, /not evidence of anything/);
});

test("the pre-notice update_available close keeps working for older CLIs", async () => {
  const skill = await readNextLesson();

  // 0.5.1/0.5.2 CLIs send only the boolean; the paragraph that serves them
  // survives unchanged alongside the notice relay.
  assert.match(skill, /If Step 1 reported `update_available`/);
  assert.match(skill, /`altitude update` brings it current/);
  assert.match(skill, /Treat a missing key as `false`/);
  // The once-per-session rule governs the flag line and the notices alike —
  // three lessons back to back are not three offers.
  assert.match(skill, /`update_available` line and any server-sent notices/);
  assert.match(skill, /once per session/);
});

test("every Claude hook --mapping path sits exactly one directory below the plugin root", async () => {
  const config = JSON.parse(await readFile(join(repoRoot, "hooks/hooks.json"), "utf8"));

  // Why this shape is load-bearing: the CLI derives THIS PLUGIN'S VERSION
  // from the --mapping argument the hooks already pass — two directory levels
  // up from the mapping file is the plugin root, where the version manifests
  // live. That derivation was chosen because it works on plugin versions that
  // predate the feature (no new argument to ship), and because the
  // alternative — editing hooks/codex.json to add one — changes raw command
  // strings covered by Codex's hook-trust hash, which re-prompts for trust or
  // silently drops it for every installed user. Move the mapping file deeper
  // or shallower and every install keeps working while plugin update notices
  // silently never fire again; this test is where that reorganization fails
  // loudly instead.
  const mappings = [];
  for (const entries of Object.values(config.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const index = hook.args.indexOf("--mapping");
        assert.notEqual(index, -1, "every hook invocation carries --mapping");
        mappings.push(hook.args[index + 1]);
      }
    }
  }

  assert.equal(mappings.length > 0, true, "hooks.json lost its hook entries");
  for (const mapping of mappings) {
    assert.match(
      mapping,
      /^\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/[^/]+\.json$/,
      `${mapping}: must be \${CLAUDE_PLUGIN_ROOT}/hooks/<file>.json, one level below the root`,
    );
    // The declared file really ships, and two dirnames up from it really is
    // where the version manifest lives.
    const onDisk = join(repoRoot, mapping.replace("${CLAUDE_PLUGIN_ROOT}/", ""));
    await access(onDisk);
    assert.equal(dirname(dirname(onDisk)), repoRoot);
    await access(join(dirname(dirname(onDisk)), ".claude-plugin/plugin.json"));
  }
});

test("the Codex shim computes its mapping path two levels below the manifests too", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "altitude-mapping-shape-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const argvPath = join(temp, "argv");
  const fake = join(temp, "altitude");
  await writeFile(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvPath}"`);
  await chmod(fake, 0o755);

  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "bin/altitude-codex-hook.mjs"), "session-end"],
    {
      encoding: "utf8",
      input: JSON.stringify({ session_id: "mapping-shape" }),
      env: { ...process.env, PATH: `${temp}${delimiter}${process.env.PATH}` },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const argv = (await readFile(argvPath, "utf8")).trim().split("\n");
  const mapping = argv[argv.indexOf("--mapping") + 1];

  // Same contract as the Claude hooks, computed in JS instead of declared in
  // JSON: <plugin root>/hooks/<file>.json, so dirname(dirname(mapping)) lands
  // on the directory holding the version manifest the CLI reads.
  assert.equal(mapping, join(repoRoot, "hooks/codex-field-mapping.json"));
  assert.equal(dirname(dirname(mapping)), repoRoot);
  await access(join(dirname(dirname(mapping)), ".codex-plugin/plugin.json"));
});

test("both manifests release the notice-relaying markdown (0.5.3 or later)", async () => {
  // Claude Code pins an installed plugin to the manifest's declared `version`
  // string: /plugin update and auto-update SKIP a plugin whose version has
  // not moved. PRs #12, #13 and #14 all merged without a bump and are
  // invisible to every existing install. The notice relay ships at 0.5.3; a
  // manifest below that floor means this markdown can never reach an
  // installed learner. (codex-plugin.test.mjs pins the two manifests to the
  // SAME version, so they cannot drift apart.)
  const atLeast = (version, floor) => {
    const a = version.split(".").map(Number);
    const b = floor.split(".").map(Number);
    for (let i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return true;
  };

  for (const manifestPath of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = JSON.parse(await readFile(join(repoRoot, manifestPath), "utf8"));
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(
      atLeast(manifest.version, "0.5.3"),
      true,
      `${manifestPath} declares ${manifest.version}, below the 0.5.3 notice-relay release`,
    );
  }
});
