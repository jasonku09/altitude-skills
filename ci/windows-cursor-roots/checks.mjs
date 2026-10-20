// Scenario matrix and pass/fail rules for the Windows Cursor workspace-roots
// CI check. Pure functions (no I/O) so test/windows-cursor-roots-checks.test.mjs
// pins every verdict on any OS; check.mjs feeds them real hook and CLI runs.
//
// The bug this guards: native Windows Cursor sends workspace_roots as
// "/c:/Users/.../route-check". The 0.10.3 adapter resolved that to
// "C:\c:\Users\...", the CLI found no .altitude binding there, recorded the
// chat as an unbound observation, and `altitude task` run from the real
// project folder then answered learning_runtime.status "outside_project".
import { posix, win32 } from "node:path";

export const PLUGINS = ["current", "pre-fix"];
export const FORMS = ["uri", "native", "parent-folder"];
export const ACTIONS = ["session-start", "user-prompt-submit"];

const pathFor = (platform) => (platform === "win32" ? win32 : posix);
const label = (s) => `${s.plugin} plugin / ${s.form} / ${s.action}`;
const key = (s) => `${s.plugin} / ${s.form} / ${s.action}`;

/** "C:\Users\x" -> "/c:/Users/x": Cursor's Windows form (lowercase drive). */
export function uriPathForm(nativePath) {
  const match = /^([A-Za-z]):(?:\\(.*))?$/.exec(nativePath);
  if (!match) throw new Error(`not a Windows drive path: ${JSON.stringify(nativePath)}`);
  return `/${match[1].toLowerCase()}:/${(match[2] ?? "").replaceAll("\\", "/")}`;
}

/**
 * The single workspace root Cursor reports for each form. "parent-folder" is
 * a control: the chat really is opened outside the project, so both plugins
 * must land outside it. It proves the harness sees outside_project at all.
 */
export function workspaceRootFor(form, project, platform) {
  if (form === "uri") {
    if (platform !== "win32") throw new Error("The URI-path form only means something on Windows (\"/c:/x\" is a legal POSIX path).");
    return uriPathForm(project);
  }
  if (form === "native") return project;
  if (form === "parent-folder") return pathFor(platform).dirname(project);
  throw new Error(`unknown form ${form}`);
}

/** "bound" = the hook found the project's binding; "outside" = it did not. */
export function expectedPlacement(plugin, form) {
  if (form === "parent-folder") return "outside";
  return plugin === "pre-fix" && form === "uri" ? "outside" : "bound";
}

export function scenarioMatrix(platform) {
  const forms = platform === "win32" ? FORMS : FORMS.filter((form) => form !== "uri");
  return PLUGINS.flatMap((plugin) => forms.flatMap((form) => ACTIONS.map((action) => ({ plugin, form, action, expect: expectedPlacement(plugin, form) }))));
}

function samePath(a, b, platform) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const path = pathFor(platform);
  const norm = (p) => {
    const n = path.normalize(p);
    const trimmed = n.length > path.parse(n).root.length ? n.replace(/[\\/]+$/, "") : n;
    return platform === "win32" ? trimmed.toLowerCase() : trimmed;
  };
  return norm(a) === norm(b);
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

/** Failures for one scenario row (see check.mjs for the row shape). */
export function checkScenario(row, { project, platform }) {
  const failures = [];
  const fail = (message) => failures.push(`${label(row)}: ${message}`);
  const hook = row.hook ?? {};
  // Hooks fail open, so a broken hook still exits 0 and prints {}; these rules
  // tell "the hook refused or crashed" apart from "it saw the wrong folder".
  if (hook.error) fail(`hook could not run: ${hook.error}`);
  else if (hook.exit !== 0) fail(`hook exited ${hook.exit}${hook.stderr ? `; stderr: ${hook.stderr.trim()}` : ""}`);
  else if (typeof parseJson(hook.stdout) !== "object" || parseJson(hook.stdout) === null) fail(`hook printed no JSON response; stdout: ${JSON.stringify(hook.stdout)}`);
  if (/Altitude Cursor hook skipped/.test(hook.stderr ?? "")) fail(`hook skipped the CLI: ${hook.stderr.trim()}`);
  if (failures.length) return failures;

  const task = row.task ?? {};
  const envelope = task.exit === 0 ? parseJson(task.stdout) : undefined;
  const status = envelope?.learning_runtime?.status;
  const negativeControl = row.plugin === "pre-fix" && row.form === "uri";
  if (row.expect === "bound") {
    if (!row.marker) fail("no live session marker for this conversation: the hook did not find the project's .altitude binding");
    if (row.unbound) fail("the CLI recorded an unbound-runtime observation: the hook ran outside the project");
    if (task.error) fail(`altitude task could not run: ${task.error}`);
    else if (task.exit !== 0) fail(`altitude task exited ${task.exit}${task.stderr ? `; stderr: ${task.stderr.trim()}` : ""}`);
    else if (!envelope || typeof envelope !== "object") fail(`altitude task printed no JSON envelope; stdout: ${JSON.stringify(task.stdout)}`);
    else {
      if (!samePath(envelope.binding?.project_root, project, platform)) fail(`task read did not report the project's binding (binding: ${JSON.stringify(envelope.binding ?? null)})`);
      if (status !== "supported") fail(`task read learning_runtime.status ${JSON.stringify(status ?? null)}, expected "supported"${envelope.learning_runtime?.recovery_message ? ` (${envelope.learning_runtime.recovery_message})` : ""}`);
    }
  } else {
    const outside = row.unbound && !row.marker && status === "outside_project" &&
      (envelope.learning_runtime.project_roots ?? []).some((root) => samePath(root, project, platform));
    if (negativeControl && !outside) {
      fail(`negative control: the pre-fix plugin no longer reproduces the bug (marker: ${row.marker}, unbound observation: ${row.unbound}, task status: ${JSON.stringify(status ?? null)}), so this job cannot prove the fix. Check the pinned pre-fix tag.`);
      return failures;
    }
    if (!row.unbound) fail("no unbound-runtime observation: the hook was expected to run outside the project");
    if (row.marker) fail("a live session marker exists: the hook was expected to run outside the project");
    if (task.error) fail(`altitude task could not run: ${task.error}`);
    else if (task.exit !== 0) fail(`altitude task exited ${task.exit}${task.stderr ? `; stderr: ${task.stderr.trim()}` : ""}`);
    else if (!envelope || typeof envelope !== "object") fail(`altitude task printed no JSON envelope; stdout: ${JSON.stringify(task.stdout)}`);
    else if (status !== "outside_project") fail(`task read learning_runtime.status ${JSON.stringify(status ?? null)}, expected "outside_project"`);
    else if (!(envelope.learning_runtime.project_roots ?? []).some((root) => samePath(root, project, platform))) fail(`outside_project read did not name the project (project_roots: ${JSON.stringify(envelope.learning_runtime.project_roots ?? null)})`);
  }
  return failures;
}

/** Every failure in a run: per-scenario rules plus matrix completeness. */
export function checkRun(rows, { project, platform }) {
  const failures = [];
  const expected = scenarioMatrix(platform);
  const counts = new Map();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  for (const s of expected) {
    const n = counts.get(key(s)) ?? 0;
    if (n === 0) failures.push(`missing scenario ${key(s)}`);
    else if (n > 1) failures.push(`scenario ${key(s)} ran ${n} times`);
  }
  const known = new Set(expected.map(key));
  for (const row of rows) {
    if (!known.has(key(row))) { failures.push(`unexpected scenario ${key(row)}`); continue; }
    // The verdict uses the matrix's expectation, never one a row brings along.
    const expect = expectedPlacement(row.plugin, row.form);
    failures.push(...checkScenario({ ...row, expect }, { project, platform }));
  }
  return failures;
}
