// Pass/fail for one real-Codex run: reads the evidence real-codex.ps1 wrote,
// applies checks.mjs, prints every hook process it saw, annotates failures
// and exits 1 if any rule failed.
//
// Usage: node check-real-codex.mjs --dir <out-dir> --label <job label>
//          [--shell pwsh.exe|powershell.exe] [--informational]
// --informational: report failures as warnings (the latest-Codex job); the
// exit code is still 1, the workflow decides whether that blocks.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRealCodexRun } from "./checks.mjs";

const opts = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, "");
  if (key === "informational") opts.informational = true;
  else opts[key] = process.argv[++i];
}
if (!opts.dir || !opts.label) throw new Error("usage: check-real-codex.mjs --dir <out-dir> --label <label> [--shell <exe>] [--informational]");

const read = (name) => (existsSync(join(opts.dir, name)) ? readFileSync(join(opts.dir, name), "utf8").replace(/^﻿/, "") : "");
const lines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const exitText = read("codex-exit.txt").trim();
const codexOutput = read("codex-output.txt");
const tap = lines(read("hook-tap.jsonl")).map((l) => JSON.parse(l));
const diagnostics = lines(read("diagnostics-new.ndjson"));

const failures = checkRealCodexRun({ codexExit: exitText === "" ? null : Number(exitText), codexOutput, tap, diagnostics, expectedShell: opts.shell });

console.log(`== ${opts.label}: hook processes recorded by the tap`);
for (const r of tap) {
  const what = r.bootstrap ? `bootstrap ${r.action} (launched by ${r.parentImage ?? "not looked up"})` : r.argv.slice(1).join(" ");
  console.log(`  exit=${r.exitCode}  ${what}`);
  if (r.stderr) console.log(r.stderr.replace(/^/gm, "      | "));
}
const statusLines = codexOutput.split(/\r?\n/).filter((l) => /^hook: /.test(l.trim()));
console.log(`== ${opts.label}: Codex hook lines\n${statusLines.map((l) => `  ${l.trim()}`).join("\n")}`);

const level = opts.informational ? "warning" : "error";
const escape = (s) => s.replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
for (const f of failures) console.log(`::${level} title=${opts.label}::${escape(f)}`);
console.log(failures.length ? `FAIL ${opts.label}: ${failures.length} problem(s)` : `PASS ${opts.label}: every hook Completed, exited 0 and reached the altitude CLI`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const head = failures.length ? `### ${opts.informational ? "WARN" : "FAIL"}: ${opts.label}${opts.informational ? " (informational, does not block)" : ""}` : `### PASS: ${opts.label}`;
  const body = failures.length ? failures.map((f) => `- ${f.replace(/\n/g, " ⏎ ")}`).join("\n") : `${statusLines.length} hook status lines, ${tap.length} hook processes, all exit 0.`;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${head}\n\n${body}\n`);
}
process.exitCode = failures.length ? 1 : 0;
