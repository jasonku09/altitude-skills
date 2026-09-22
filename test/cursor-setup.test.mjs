import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const setup = join(root, "bin/altitude-cursor-setup.mjs");
async function home(t) {
  const value = await mkdtemp(join(tmpdir(), "altitude-cursor-config-"));
  await mkdir(join(value, ".cursor"));
  t.after(() => rm(value, { recursive: true, force: true }));
  return value;
}
function run(home, action) {
  return spawnSync(process.execPath, [setup, action], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
}
async function config(home) { return JSON.parse(await readFile(join(home, ".cursor/hooks.json"), "utf8")); }
async function snapshot(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) return { link: await readlink(path) };
  if (stat.isFile()) return { contents: await readFile(path, "utf8") };
  return Object.fromEntries(await Promise.all((await readdir(path)).sort().map(async (name) => [name, await snapshot(join(path, name))])));
}

test("setup preserves unrelated hooks and config, deduplicates, and uninstall removes only exact owned commands", async (t) => {
  const dir = await home(t);
  const existing = { version: 1, custom: { keep: true }, hooks: { beforeSubmitPrompt: [{ command: "my-hook", timeout: 14 }], stop: [{ command: "other-stop", loop_limit: 3 }] } };
  await writeFile(join(dir, ".cursor/hooks.json"), JSON.stringify(existing));
  const first = run(dir, "install");
  assert.equal(first.status, 0, first.stderr);
  const installed = await config(dir);
  assert.deepEqual(installed.custom, existing.custom);
  assert.deepEqual(installed.hooks.beforeSubmitPrompt[0], existing.hooks.beforeSubmitPrompt[0]);
  assert.deepEqual(installed.hooks.stop[0], existing.hooks.stop[0]);
  assert.equal(installed.hooks.beforeSubmitPrompt.length, 2);
  assert.equal(installed.hooks.stop.length, 2);
  assert.equal(installed.hooks.afterAgentResponse.length, 1);
  assert.equal(run(dir, "install").status, 0);
  assert.deepEqual(await config(dir), installed);
  assert.equal(run(dir, "uninstall").status, 0);
  assert.deepEqual(await config(dir), existing);
});

test("compatibility entries are inert and contain no plugin path or core call", async (t) => {
  const dir = await home(t);
  assert.equal(run(dir, "install").status, 0);
  for (const [event, entries] of Object.entries((await config(dir)).hooks)) {
    for (const entry of entries) {
      assert.doesNotMatch(entry.command, /altitude hook|CURSOR_PLUGIN_ROOT|\/bin\//);
      const output = spawnSync(entry.command, { shell: true, encoding: "utf8" });
      assert.equal(output.status, 0, output.stderr);
      assert.deepEqual(JSON.parse(output.stdout), event === "beforeSubmitPrompt" ? { continue: true } : {});
    }
  }
});

for (const raw of ["{broken", '{"version":2,"hooks":{}}', '{"version":1,"hooks":{"stop":"not-array"}}']) test(`malformed/unsupported config remains byte-for-byte intact: ${raw}`, async (t) => {
  const dir = await home(t);
  await writeFile(join(dir, ".cursor/hooks.json"), raw);
  assert.notEqual(run(dir, "install").status, 0);
  assert.equal(await readFile(join(dir, ".cursor/hooks.json"), "utf8"), raw);
});

test("uninstall with no config creates no user hook file", async (t) => {
  const dir = await home(t);
  assert.equal(run(dir, "uninstall").status, 0);
  await assert.rejects(readFile(join(dir, ".cursor/hooks.json")), { code: "ENOENT" });
});

test("setup refuses a concurrent writer lock without changing config", async (t) => {
  const dir = await home(t);
  const raw = '{"version":1,"hooks":{}}';
  await writeFile(join(dir, ".cursor/hooks.json"), raw);
  await writeFile(join(dir, ".cursor/.altitude-hooks.lock"), "another setup");
  assert.notEqual(run(dir, "install").status, 0);
  assert.equal(await readFile(join(dir, ".cursor/hooks.json"), "utf8"), raw);
});

test("setup works when its source is reached through a symlink", async (t) => {
  const dir = await home(t);
  const linked = join(dir, "setup.mjs");
  await symlink(setup, linked);
  const result = spawnSync(process.execPath, [linked, "install"], { encoding: "utf8", env: { ...process.env, HOME: dir, USERPROFILE: dir } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await config(dir)).hooks.stop.length, 1);
});


test("setup registers the exact source root, refreshes versions, and stale uninstall preserves the newer registration", async (t) => {
  const dir = await home(t);
  const { configure } = await import("../bin/altitude-cursor-setup.mjs");
  const registration = join(dir, ".cursor/altitude/plugin.json");
  configure("install", dir, root);
  assert.deepEqual(JSON.parse(await readFile(registration, "utf8")), { version: 1, owner: "altitude-cursor", pluginRoot: root });
  const newer = join(dir, "new ' version & $(ignored)");
  await mkdir(newer);
  configure("install", dir, newer);
  const installed = await readFile(registration, "utf8");
  const hooks = await readFile(join(dir, ".cursor/hooks.json"), "utf8");
  configure("uninstall", dir, root);
  assert.equal(await readFile(registration, "utf8"), installed);
  assert.equal(await readFile(join(dir, ".cursor/hooks.json"), "utf8"), hooks);
  configure("uninstall", dir, newer);
  await assert.rejects(readFile(registration), { code: "ENOENT" });
  assert.deepEqual((await config(dir)).hooks, {});
});

const protectedPaths = [
  ["hooks.json", /hooks.json is not a regular file/],
  ["altitude/plugin.json", /registration is not a regular file/],
  ["altitude", /registration directory is not a regular directory/],
];
for (const [relative, error] of protectedPaths) {
  for (const action of ["install", "uninstall"]) {
    for (const dangling of [false, true]) test(`${action} refuses ${dangling ? "dangling" : "valid"} ${relative} symlinks without modifying existing state`, async (t) => {
      const dir = await home(t);
      assert.equal(run(dir, "install").status, 0);
      const path = join(dir, ".cursor", relative);
      const target = join(dir, "original-config");
      await rename(path, target);
      await symlink(dangling ? join(dir, "missing-target") : target, path);
      const before = await snapshot(dir);
      const result = run(dir, action);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
      assert.deepEqual(await snapshot(dir), before);
    });
  }
  test(`uninstall refuses an otherwise empty config containing a dangling ${relative} symlink`, async (t) => {
    const dir = await home(t);
    const path = join(dir, ".cursor", relative);
    await mkdir(dirname(path), { recursive: true });
    await symlink(join(dir, "missing-target"), path);
    const before = await snapshot(dir);
    const result = run(dir, "uninstall");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
    assert.deepEqual(await snapshot(dir), before);
  });
}
