# Windows Codex hooks check

`.github/workflows/windows-codex-hooks.yml` proves the Codex plugin's hooks
work on native Windows. It exists because plugin 0.10.2 shipped
`commandWindows` lines with cmd-style `%PLUGIN_ROOT%`. Codex runs Windows
hooks through PowerShell, PowerShell leaves `%PLUGIN_ROOT%` as literal text,
and so every hook exited 1 for Windows learners. Nothing caught it before
release because no test had ever run on Windows.

It runs on pull requests that touch `hooks/`, `bin/`, `.codex-plugin/`,
`.agents/plugins/` or this check itself, and by hand via `workflow_dispatch`.
It deliberately has no schedule.

## Jobs

| Job | What it does | Blocks merge? |
|---|---|---|
| Hook launch emulation (no Codex) | `emulate.mjs` launches every hook in `hooks/codex.json` the way Codex does (pwsh 7, Windows PowerShell 5.1, and the `cmd /C` fallback), across five profile paths (plain, spaces, `'` `$HOME` `%OS%`). | yes |
| Codex pinned / {pwsh 7, Windows PowerShell 5.1} / {plain path, space in path} | `real-codex.ps1` runs one real `codex exec` turn at `CODEX_PINNED_VERSION`, then `check-real-codex.mjs` judges it. | yes |
| Codex latest (informational - never blocks) | The same run on `@openai/codex@latest`. Failures show up as warnings and a failed step, but the job still passes. | no |

All the version pins are in the workflow's top-level `env:` block.

## Pass/fail rules (`checks.mjs`, tested in `test/windows-codex-hooks-checks.test.mjs`)

Hooks fail open: a hook may exit only 0 (allow) or 2 (a gate block). CI runs
unpaired, so there is nothing for a gate to block, and every hook must:

- be reported by Codex as `hook: <Event> Completed`. SessionStart,
  UserPromptSubmit, PreToolUse and Stop must all appear, and any other
  status fails the run;
- exit 0. That covers the hook's entry process and the altitude CLI it
  spawns, so a CLI crash that the shim's exit-code clamp hides still fails;
- actually reach `altitude hook <event>`. That covers SessionEnd as well,
  which `codex exec` never prints;
- print no `Altitude hook skipped` or `Altitude could not run the workshop
  CLI` notice, and leave no new records in `~\.altitude\diagnostics.ndjson`;
- be launched by the shell the job targets (`pwsh.exe` or `powershell.exe`).

In the emulation, a hook with no CLI on PATH must still exit 0 and say it
could not run the CLI. That is the fail-open path.

## Workarounds, and what breaks if Codex changes

These three let real Codex run headless in CI. They track Codex internals,
so they are the first thing to look at when the "Codex latest" job goes
yellow.

1. **Stand-in model server** (`mock-responses-server.mjs`). Codex is pointed
   at `http://127.0.0.1:<port>/v1` with `-c model_provider=mock ...`, so it
   needs no account or secret, and PR runs from forks work too. The server
   answers the first request with an `apply_patch` custom tool call (which
   fires PreToolUse and the plugin's diff gate) and the second with a plain
   message (so Stop fires). `-m gpt-5.5` is only there so Codex has model
   metadata and offers `apply_patch`; nothing contacts OpenAI.
   *Breaks if* Codex changes the Responses wire format or the
   `model_providers` config keys, stops offering `apply_patch` to that slug,
   or renames the tool. The usual symptom is a missing `PreToolUse` or a
   non-zero `codex exec` exit. `mock.out` in the job artifact lists what
   Codex sent.
2. **Hook-trust bypass** (`codex exec --dangerously-bypass-hook-trust`).
   Codex runs a plugin hook only after a one-time trust review in its TUI,
   and every change to the command text asks again. CI has no TUI, and the
   flag skips the review for that one invocation.
   *Breaks if* the flag is renamed or removed. Every hook then goes missing
   ("Codex never reported a SessionStart hook result").
3. **Hiding pwsh for the Windows PowerShell 5.1 jobs**. GitHub's Windows
   image ships pwsh 7, but a stock Windows 11 machine does not. Codex picks
   the hook shell by looking for `pwsh` on PATH, then
   `C:\Program Files\PowerShell\7\pwsh.exe`, and only then falls back to
   `powershell.exe`. The step renames `pwsh.exe` (a running exe can be
   renamed) for the length of the run and puts it back in a `finally`.
   *Breaks if* Codex finds pwsh some other way, or starts using cmd. The
   launching-shell rule catches that ("was launched by pwsh.exe, but this
   job targets powershell.exe").

`hook-tap.cjs` is an observer, not a workaround. It is preloaded through
`NODE_OPTIONS` and records each hook process's argv, exit code, stderr and
launching shell, because `codex exec` prints only `Completed`/`Failed`. It
does not change what any hook does. `codex-launcher/` is a small Rust copy of
Codex's Windows hook spawn (`codex-rs/hooks/src/engine/command_runner.rs` at
rust-v0.163.0). If Codex changes how it launches hooks, update the launcher
and keep the comment's version reference current.

## Reproducing a failure

Download the job's artifact. `real-codex-<id>/` holds `codex-output.txt`,
`hook-tap.jsonl`, `diagnostics-new.ndjson` and `mock.out`. Then run
`node ci/windows-codex-hooks/check-real-codex.mjs --dir <that dir> --label x --shell pwsh.exe`
on any OS to get the same verdict.
