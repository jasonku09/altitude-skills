// NODE_OPTIONS=--require preload for the real-Codex jobs. `codex exec` only
// prints "hook: <Event> Completed|Failed", never a hook's exit code or stderr.
// This records, for every node process started under a hook (the `node -e`
// bootstrap from hooks/codex.json AND the altitude CLI it spawns), one JSON
// line in ALTITUDE_HOOK_TAP_LOG: argv, whether it is the bootstrap, the
// shell that launched it, its stderr and its exit code. It changes no hook
// behavior. A failure before node starts (e.g. `node` not found by the
// shell) leaves no record — check-real-codex.mjs catches that as a missing
// hook.
const { appendFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const log = process.env.ALTITUDE_HOOK_TAP_LOG;
// The npm `codex` launcher is itself a node script and inherits NODE_OPTIONS.
const isCodexLauncher = process.argv.some((a) => /@openai[\\/]codex|[\\/]codex(\.js)?$/.test(a));
if (log && !isCodexLauncher) {
  const evalIndex = process.execArgv.findIndex((a) => a === "-e" || a === "--eval");
  const bootstrap = evalIndex !== -1;
  const code = bootstrap ? String(process.execArgv[evalIndex + 1] ?? "") : "";
  const action = bootstrap ? (/main\('([a-z-]+)'\)/.exec(code)?.[1] ?? null) : null;

  // The shell Codex launched the hook through (pwsh.exe, powershell.exe or
  // cmd.exe) is the bootstrap's parent. tasklist is fast, but SessionEnd has a
  // 3s hook timeout, so skip the lookup there.
  let parentImage = null;
  if (bootstrap && process.platform === "win32" && action !== "session-end") {
    try {
      const r = spawnSync("tasklist.exe", ["/FI", `PID eq ${process.ppid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
      parentImage = /^"([^"]+)"/.exec((r.stdout ?? "").trim())?.[1] ?? `unknown (${(r.stdout ?? "").trim() || r.error?.message || "no output"})`;
    } catch (error) {
      parentImage = `unknown (${error.message})`;
    }
  }

  let stderr = "";
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return write(chunk, ...rest);
  };
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    stderr += `[${origin}] ${error && error.stack ? error.stack : String(error)}\n`;
  });
  process.on("exit", (exitCode) => {
    try {
      appendFileSync(log, JSON.stringify({ pid: process.pid, ppid: process.ppid, bootstrap, action, parentImage, argv: process.argv, cwd: process.cwd(), exitCode, stderr }) + "\n");
    } catch {}
  });
}
