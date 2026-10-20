// Pass/fail rules of the Windows Cursor workspace-roots CI check
// (.github/workflows/windows-cursor-roots.yml). The workflow only runs on
// Windows; these pin its scenario matrix and verdicts on any OS so a rule
// never silently loosens. The last test drives the real harness against a real
// altitude CLI and runs only off Windows, when ALTITUDE_CURSOR_ROOTS_CLI names one.
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkRun, expectedPlacement, scenarioMatrix, uriPathForm, workspaceRootFor } from "../ci/windows-cursor-roots/checks.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const project = "C:\\Users\\runneradmin\\Documents\\Pi Learning\\π\\Coding Projects\\route-check";
const uri = "/c:/Users/runneradmin/Documents/Pi Learning/π/Coding Projects/route-check";

test("Cursor's Windows URI-path form: slash, lowercase drive, forward slashes, text unchanged", () => {
  assert.equal(uriPathForm(project), uri);
  assert.equal(uriPathForm("D:\\code\\x"), "/d:/code/x");
  assert.equal(uriPathForm("c:\\"), "/c:/");
  for (const notDrive of ["\\\\server\\share\\x", "/home/x", "relative\\x", ""]) {
    assert.throws(() => uriPathForm(notDrive), /drive path/, notDrive);
  }
});

test("workspace roots per form: URI path, native, and the parent-folder control", () => {
  assert.equal(workspaceRootFor("uri", project, "win32"), uri);
  assert.equal(workspaceRootFor("native", project, "win32"), project);
  assert.equal(workspaceRootFor("parent-folder", project, "win32"), "C:\\Users\\runneradmin\\Documents\\Pi Learning\\π\\Coding Projects");
  assert.equal(workspaceRootFor("parent-folder", "/tmp/a b/route-check", "darwin"), "/tmp/a b");
  // "/c:/x" is a legal POSIX path, so the URI form proves nothing off Windows.
  assert.throws(() => workspaceRootFor("uri", "/tmp/route-check", "darwin"), /Windows/);
});

test("only the pre-fix plugin with the URI form, and the parent folder, are outside the project", () => {
  assert.equal(expectedPlacement("current", "uri"), "bound");
  assert.equal(expectedPlacement("current", "native"), "bound");
  assert.equal(expectedPlacement("pre-fix", "native"), "bound");
  assert.equal(expectedPlacement("pre-fix", "uri"), "outside");
  assert.equal(expectedPlacement("current", "parent-folder"), "outside");
  assert.equal(expectedPlacement("pre-fix", "parent-folder"), "outside");
});

test("the matrix covers both plugins, both hooks and every form; URI form on Windows only", () => {
  const key = (s) => `${s.plugin}/${s.form}/${s.action}`;
  const win = scenarioMatrix("win32");
  assert.equal(win.length, 12);
  assert.equal(new Set(win.map(key)).size, 12);
  for (const plugin of ["current", "pre-fix"]) for (const form of ["uri", "native", "parent-folder"]) for (const action of ["session-start", "user-prompt-submit"]) {
    const s = win.find((x) => key(x) === `${plugin}/${form}/${action}`);
    assert.ok(s, `${plugin}/${form}/${action}`);
    assert.equal(s.expect, expectedPlacement(plugin, form));
  }
  const posix = scenarioMatrix("linux");
  assert.equal(posix.length, 8);
  assert.ok(posix.every((s) => s.form !== "uri"));
});

const supportedTask = (root = project) => ({ exit: 0, stdout: JSON.stringify({ binding: { project_root: root, journey_id: "j" }, learning_runtime: { status: "supported" } }), stderr: "" });
const outsideTask = (root = project) => ({ exit: 0, stdout: JSON.stringify({ binding: { project_root: root, journey_id: "j" }, learning_runtime: { status: "outside_project", project_roots: [root] } }), stderr: "" });
const okHook = { exit: 0, stdout: "{}\n", stderr: "" };
function greenRows(platform = "win32") {
  return scenarioMatrix(platform).map((s) => s.expect === "bound"
    ? { ...s, hook: okHook, marker: true, unbound: false, task: supportedTask() }
    : { ...s, hook: okHook, marker: false, unbound: true, task: outsideTask() });
}
const swap = (rows, match, patch) => rows.map((r) => (match(r) ? { ...r, ...patch } : r));

test("a run where every scenario lands where expected passes", () => {
  assert.deepEqual(checkRun(greenRows(), { project, platform: "win32" }), []);
  // Windows paths compare case-insensitively, ignoring a trailing separator.
  const rows = greenRows().map((r) => ({ ...r, task: r.expect === "bound" ? supportedTask(`${project.toLowerCase()}\\`) : r.task }));
  assert.deepEqual(checkRun(rows, { project, platform: "win32" }), []);
});

test("the fixed plugin landing outside the project with Cursor's URI form fails (the learner's bug)", () => {
  const rows = swap(greenRows(), (r) => r.plugin === "current" && r.form === "uri", { marker: false, unbound: true, task: outsideTask() });
  const failures = checkRun(rows, { project, platform: "win32" });
  for (const f of failures) assert.match(f, /^current plugin \/ uri \/ (session-start|user-prompt-submit): /);
  for (const action of ["session-start", "user-prompt-submit"]) {
    for (const pattern of [/no live session marker/, /unbound-runtime observation/, /"outside_project", expected "supported"/]) {
      assert.ok(failures.some((f) => f.includes(`/ ${action}:`) && pattern.test(f)), `${action} ${pattern}`);
    }
  }
});

test("a bound marker alone is not enough: the task read must say supported for this project", () => {
  const cases = [
    [{ task: outsideTask() }, /learning_runtime\.status "outside_project", expected "supported"/],
    [{ task: { ...supportedTask(), stdout: JSON.stringify({ binding: { project_root: project }, learning_runtime: { status: "session_required" } }) } }, /"session_required", expected "supported"/],
    [{ task: { ...supportedTask(), stdout: JSON.stringify({ binding: null }) } }, /task read did not report the project's binding/],
    [{ task: supportedTask("C:\\Users\\runneradmin\\elsewhere") }, /task read did not report the project's binding/],
    [{ task: { exit: 1, stdout: "", stderr: "boom" } }, /altitude task exited 1/],
    [{ task: { exit: 0, stdout: "not json", stderr: "" } }, /altitude task printed no JSON envelope/],
    [{ unbound: true }, /unbound-runtime observation/],
  ];
  for (const [patch, pattern] of cases) {
    const rows = swap(greenRows(), (r) => r.plugin === "current" && r.form === "native" && r.action === "session-start", patch);
    const failures = checkRun(rows, { project, platform: "win32" });
    assert.ok(failures.some((f) => pattern.test(f)), `${pattern}: ${failures.join(" | ")}`);
  }
});

test("hook failures fail every scenario, including the expected-outside ones", () => {
  for (const [hook, pattern] of [
    [{ exit: 1, stdout: "{}", stderr: "" }, /hook exited 1/],
    [{ exit: 0, stdout: "", stderr: "" }, /hook printed no JSON response/],
    [{ exit: 0, stdout: "{}", stderr: "Altitude Cursor hook skipped: Cursor did not provide an unambiguous project.\n" }, /hook skipped the CLI/],
    [{ exit: null, stdout: "", stderr: "", error: "spawnSync node ETIMEDOUT" }, /hook could not run: spawnSync node ETIMEDOUT/],
  ]) {
    const rows = swap(greenRows(), (r) => r.plugin === "pre-fix" && r.form === "parent-folder" && r.action === "user-prompt-submit", { hook });
    const failures = checkRun(rows, { project, platform: "win32" });
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(failures[0], pattern);
  }
});

test("a negative control that stops reproducing the bug fails with an explicit message", () => {
  const rows = swap(greenRows(), (r) => r.plugin === "pre-fix" && r.form === "uri", { marker: true, unbound: false, task: supportedTask() });
  const failures = checkRun(rows, { project, platform: "win32" });
  assert.equal(failures.length, 2);
  for (const f of failures) assert.match(f, /negative control: the pre-fix plugin no longer reproduces the bug/);
});

test("an expected-outside scenario must leave an unbound observation and an outside_project task read naming the project", () => {
  for (const [patch, pattern] of [
    [{ unbound: false }, /no unbound-runtime observation/],
    [{ marker: true }, /live session marker/],
    [{ task: outsideTask("C:\\elsewhere") }, /did not name the project/],
  ]) {
    const rows = swap(greenRows(), (r) => r.plugin === "current" && r.form === "parent-folder" && r.action === "session-start", patch);
    const failures = checkRun(rows, { project, platform: "win32" });
    assert.ok(failures.some((f) => pattern.test(f)), `${pattern}: ${failures.join(" | ")}`);
  }
});

test("a missing, duplicated or unexpected scenario fails, and so does an empty run", () => {
  const rows = greenRows();
  assert.match(checkRun(rows.slice(1), { project, platform: "win32" }).join("\n"), /missing scenario current \/ uri \/ session-start/);
  assert.match(checkRun([...rows, rows[0]], { project, platform: "win32" }).join("\n"), /scenario current \/ uri \/ session-start ran 2 times/);
  assert.match(checkRun(greenRows(), { project: "/tmp/route-check", platform: "linux" }).join("\n"), /unexpected scenario current \/ uri/);
  assert.match(checkRun([], { project, platform: "win32" }).join("\n"), /missing scenario/);
});

const cli = process.env.ALTITUDE_CURSOR_ROOTS_CLI;
// Off Windows only: there the URI form joins the matrix and needs the real
// pre-fix release, which the workflow's harness step checks out.
const realCliSkip = process.platform === "win32" ? "on Windows the workflow's harness step runs the full matrix" : cli ? false : "set ALTITUDE_CURSOR_ROOTS_CLI to an @learnaltitude/cli bin/altitude.js to run";
test("the harness against a real altitude CLI: bound folder is supported, a parent folder is outside_project", { skip: realCliSkip }, async (t) => {
  const { runMatrix } = await import("../ci/windows-cursor-roots/check.mjs");
  const work = realpathSync(mkdtempSync(join(tmpdir(), "cursor roots π ")));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const target = join(work, "Documents", "Pi Learning", "π", "Coding Projects", "route-check");
  // On POSIX there is no URI form, so the same checkout stands in for the
  // pre-fix plugin: this exercises the harness and the CLI, not the fix.
  const rows = await runMatrix({ plugin: repo, preFixPlugin: repo, project: target, work, cli });
  assert.deepEqual(checkRun(rows, { project: target, platform: process.platform }), []);
  assert.equal(rows.length, scenarioMatrix(process.platform).length);
});
