// Pass/fail rules for the Windows Codex hooks CI check. Pure functions (no
// I/O) so test/windows-codex-hooks-checks.test.mjs can pin every verdict on
// any OS; check-real-codex.mjs and emulate.mjs feed them on Windows.
//
// The product invariant behind every rule: hooks fail OPEN. A hook may exit
// only 0 (allow) or 2 (an explicit gate block), and the CI runs unpaired, so
// no gate has anything to block: every hook must exit 0, reach the altitude
// CLI, and leave no fail-open notice or CLI diagnostics behind.

const failOpenNotices = [/Altitude hook skipped/, /Altitude could not run the workshop CLI/];

// The scenario the stand-in model server drives: one `codex exec` turn that
// makes one apply_patch call. `codex exec` prints a status line for these...
export const expectedCodexEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Stop"];
// ...and these hook actions (hooks/codex.json) must each run the altitude CLI
// with the matching `altitude hook <event> [--gate <gate>]` (SessionEnd has no
// status line in `codex exec`, so the hook tap is its only witness).
export const expectedActions = {
  "session-start": { event: "session-start" },
  "user-prompt-submit": { event: "user-prompt-submit" },
  diff: { event: "pre-tool-use", gate: "diff" },
  stop: { event: "stop", gate: "retro" },
  "session-end": { event: "session-end" },
};

const expectedEmulationActions = { ...expectedActions, plan: { event: "pre-tool-use", gate: "plan" } };

const excerpt = (text, max = 600) => {
  const clean = String(text ?? "").replace(/\r/g, "").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

// `node <altitude CLI entry> hook <event> ...` (npm's Windows install runs the
// package's JS entry; a POSIX install may go through a bin symlink).
const isCliProcess = (r) => (r.argv ?? [])[2] === "hook" || (r.argv ?? []).some((a) => /@learnaltitude[\\/]cli[\\/]/i.test(a));

function cliInvocation(r) {
  const argv = r.argv ?? [];
  const i = argv.indexOf("hook");
  if (i === -1) return null;
  const g = argv.indexOf("--gate");
  return { event: argv[i + 1], gate: g === -1 ? undefined : argv[g + 1] };
}

// The process Codex's shell started: the `node -e` bootstrap, or (older
// hooks/codex.json shapes) `node <...>/altitude-codex-hook.mjs <action>`.
function entryAction(r) {
  if (r.action) return r.action;
  const argv = r.argv ?? [];
  const i = argv.findIndex((a) => /altitude-codex-hook\.mjs$/i.test(a));
  return i === -1 ? null : (argv[i + 1] ?? null);
}

const describe = (r) => (isCliProcess(r) ? `altitude CLI (${(r.argv ?? []).slice(2, 4).join(" ")})` : `hook entry process (${entryAction(r) ?? (r.argv ?? []).slice(1).join(" ") ?? "?"})`);

/**
 * One real `codex exec` run.
 * @param {{codexExit: number|null, codexOutput: string, tap: object[], diagnostics: string[], expectedShell?: string}} run
 * @returns {string[]} failure messages; empty = pass
 */
export function checkRealCodexRun({ codexExit, codexOutput, tap, diagnostics, expectedShell }) {
  const failures = [];
  if (codexExit !== 0) failures.push(`codex exec exited ${codexExit} (expected 0).`);

  const statusLines = String(codexOutput ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^hook: \S+ \S+/.test(l));
  for (const line of statusLines) {
    if (!/^hook: \S+ Completed$/.test(line)) failures.push(`Codex reported \`${line}\` (every hook must be Completed).`);
  }
  for (const event of expectedCodexEvents) {
    if (!statusLines.some((l) => l.startsWith(`hook: ${event} `))) failures.push(`Codex never reported a ${event} hook result: the hook never ran, or Codex changed what it prints.`);
  }

  if (!tap?.length) {
    failures.push("The hook tap recorded no hook processes: no hook reached node, or the NODE_OPTIONS preload (hook-tap.cjs) never loaded.");
    return failures;
  }

  for (const r of tap) {
    if (r.exitCode !== 0) failures.push(`${describe(r)} exited ${r.exitCode} (expected 0). stderr:\n${excerpt(r.stderr) || "(empty)"}`);
    for (const notice of failOpenNotices) {
      if (notice.test(r.stderr ?? "")) failures.push(`${describe(r)} failed open — stderr:\n${excerpt(r.stderr)}`);
    }
  }

  for (const [action, want] of Object.entries(expectedActions)) {
    if (!tap.some((r) => !isCliProcess(r) && entryAction(r) === action)) failures.push(`The ${action} hook never started node (no hook entry process recorded).`);
    const reached = tap.some((r) => {
      if (!isCliProcess(r)) return false;
      const c = cliInvocation(r);
      return c && c.event === want.event && (!want.gate || c.gate === want.gate);
    });
    if (!reached) failures.push(`The ${action} hook never reached the altitude CLI (\`altitude hook ${want.event}${want.gate ? ` --gate ${want.gate}` : ""}\` not recorded).`);
  }

  if (expectedShell) {
    const launched = tap.filter((r) => !isCliProcess(r) && r.parentImage);
    if (!launched.length) failures.push(`No hook recorded its launching shell, so the ${expectedShell} job proved nothing about ${expectedShell}.`);
    for (const r of launched) {
      if (r.parentImage.toLowerCase() !== expectedShell.toLowerCase()) failures.push(`${describe(r)} was launched by ${r.parentImage}, but this job targets ${expectedShell}.`);
    }
  }

  for (const line of diagnostics ?? []) failures.push(`New altitude CLI diagnostics record: ${excerpt(line, 400)}`);
  return failures;
}

/**
 * Codex's hook launch emulated by codex-launcher.exe, one row per case.
 * env "codex-snapshot" = the CLI is on PATH: the hook must run it cleanly.
 * env "path-without-npm" = no CLI anywhere: the hook must fail OPEN (exit 0)
 * and say it could not run the CLI.
 * @param {object[]} rows
 * @returns {string[]} failure messages; empty = pass
 */
export function checkEmulation(rows) {
  if (!rows?.length) return ["The emulation matrix ran no cases."];
  const failures = [];
  for (const r of rows) {
    const name = `[shell=${r.shell} profile=${r.profile} env=${r.env} action=${r.action}]`;
    const problems = [];
    if (r.error) problems.push(`launcher error: ${r.error}`);
    if (r.exit !== 0) problems.push(`exited ${r.exit} (expected 0)`);
    if (r.env === "path-without-npm") {
      if (!/Altitude could not run the workshop CLI/.test(r.stderr ?? "")) problems.push("did not report that it could not run the CLI (fail-open path not taken)");
      if (r.tap?.some(isCliProcess)) problems.push("unexpectedly reached the altitude CLI with no CLI on PATH");
    } else {
      for (const notice of failOpenNotices) if (notice.test(r.stderr ?? "")) problems.push("failed open with the CLI on PATH");
      if (r.diagnostics?.length) problems.push(`new CLI diagnostics: ${r.diagnostics.join("; ")}`);
      const want = Object.hasOwn(expectedEmulationActions, r.action) ? expectedEmulationActions[r.action] : null;
      if (!want) problems.push("unknown hook action");
      else if (!r.tap?.some((record) => {
        const invocation = isCliProcess(record) && cliInvocation(record);
        return invocation && invocation.event === want.event && invocation.gate === want.gate && record.exitCode === 0;
      })) problems.push(`never recorded a successful altitude CLI invocation (altitude hook ${want.event}${want.gate ? ` --gate ${want.gate}` : ""})`);
      for (const record of r.tap ?? []) {
        if (record.exitCode !== 0) problems.push(`${describe(record)} exited ${record.exitCode} (expected 0)`);
        for (const notice of failOpenNotices) if (notice.test(record.stderr ?? "")) problems.push(`${describe(record)} failed open: ${excerpt(record.stderr)}`);
      }
    }
    if (problems.length) failures.push(`${name} ${problems.join("; ")}. stderr:\n${excerpt(r.stderr) || "(empty)"}`);
  }
  return failures;
}
