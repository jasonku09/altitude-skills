# Windows Codex hooks check

[The workflow](../../.github/workflows/windows-codex-hooks.yml) checks the
Codex plugin's hook launches on native Windows. The compatibility contract
and the regression this guards against are documented in
[Codex on native Windows](../../WORKSHOP-COMPATIBILITY.md#codex-on-native-windows).

It runs on pull requests that touch `hooks/`, `bin/`, `.codex-plugin/`,
`.agents/plugins/` or this check itself, and by hand via `workflow_dispatch`.
It deliberately has no schedule.

## Jobs

| Job | What it does | Hook failures fail the job? |
|---|---|---|
| Hook launch emulation (no Codex) | `emulate.mjs` launches every hook in `hooks/codex.json` the way Codex does (pwsh 7, Windows PowerShell 5.1, and the `cmd /C` fallback), across profile and install-path combinations defined in its `profiles` object. | yes |
| Codex pinned / {pwsh 7, Windows PowerShell 5.1} / {plain path, space in path} | `real-codex.ps1` runs one real `codex exec` turn at `CODEX_PINNED_VERSION`, then `check-real-codex.mjs` judges it. | yes |
| Codex latest (informational - never blocks) | The same run on `@openai/codex@latest`, using Windows PowerShell 5.1 and a space in the profile path. Hook check failures produce warnings and a failed step whose failure is allowed. | no |

Merge enforcement depends on repository branch protection. Checkout, Node
setup, or artifact-upload failures can still fail the informational job.

The Codex, Altitude CLI and Node versions used by the workflow are configured
in its top-level `env:` block.

## Pass/fail rules (`checks.mjs`, tested in `test/windows-codex-hooks-checks.test.mjs`)

CI runs unpaired, so there is nothing for a gate to block. The real-Codex
scenario exercises the diff gate; the plan gate is covered by emulation.
The real-Codex checks require hooks in that scenario to:

- be reported by Codex as `hook: <Event> Completed`. SessionStart,
  UserPromptSubmit, PreToolUse and Stop must all appear, and any other
  status fails the run;
- exit 0. That covers the hook's entry process and the altitude CLI it
  spawns, so a CLI crash that the shim's exit-code clamp hides still fails;
- actually reach `altitude hook <event>`. That covers SessionEnd as well,
  which `codex exec` never prints;
- print no `Altitude hook skipped` or `Altitude could not run the workshop
  CLI` notice, and leave no new records in `~\.altitude\diagnostics.ndjson`.

The run must have at least one recorded launching shell, with every recorded
shell matching the job's target (`pwsh.exe` or `powershell.exe`). The observer
skips the SessionEnd shell lookup to avoid its short timeout.

The emulation records processes separately for each case and requires the
matching CLI event and gate with exit 0, including the plan gate. These
records are included in `emulate-results.json`. A hook with no CLI on PATH
must still exit 0, say it could not run the CLI, and record no CLI invocation.
That is the fail-open path.

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
   non-zero `codex exec` exit. `mock.out` in the job artifact lists request
   methods, URLs and body lengths, not request bodies.
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
launching shell where looked up, because `codex exec` prints only
`Completed`/`Failed`. It does not change what any hook does.
`codex-launcher/` is a small Rust copy of Codex's Windows hook spawn; its
[module comment](codex-launcher/src/main.rs) identifies the source and
version it replicates. If Codex changes how it launches hooks, update the
launcher and keep that reference current.

## Reproducing a failure

Download and extract the job's `real-codex-<id>` artifact, keeping all files,
including `codex-exit.txt`, which the checker requires. Then run
`node ci/windows-codex-hooks/check-real-codex.mjs --dir "<extracted directory>" --label x --shell <shell executable>`
on any OS. Use `pwsh.exe` for a pwsh 7 job and `powershell.exe` for a Windows
PowerShell 5.1 job to reproduce its verdict. `--informational` changes
failure annotations to warnings but still exits 1 on failure; the workflow
allows that exit for the latest-Codex job.
