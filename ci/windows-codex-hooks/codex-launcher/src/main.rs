//! Launches one hook command the way Codex's hooks engine does on Windows
//! (openai/codex rust-v0.163.0 codex-rs/hooks/src/engine/command_runner.rs
//! `build_command`). Two shapes, picked by <shell>:
//!   "-"  : no session shell (fallback): Command::new(%COMSPEC% or "cmd.exe"),
//!          .arg("/C"), .raw_arg("\"<command>\"")
//!   path : the session's shell. On Windows Codex's default user shell is always
//!          PowerShell (shell-command/src/shell_detect.rs: pwsh, else
//!          powershell.exe), and core/src/session/mod.rs build_hooks_config
//!          passes derive_exec_args("") minus the empty command, i.e.
//!          Command::new(<shell>).args(["-NoProfile", "-Command"]).arg(<command>)
//! Both: .creation_flags(CREATE_NO_WINDOW), .env_clear() then the env snapshot
//! replayed, stdin/stdout/stderr piped, current_dir = the session cwd.
//! (`${PLUGIN_ROOT}`-style placeholder substitution happens earlier, in
//! discovery.rs; emulate.mjs applies it before writing <command-file>.)
//! Usage: codex-launcher <shell|-> <cwd> <env-file> <command-file>  (hook JSON on stdin)
//! env-file: NUL-separated KEY=VALUE records. command-file: the raw
//! `commandWindows` string. Prints the child's stdout/stderr through and exits
//! with the child's exit code (or 125 if it could not be spawned).
use std::io::{Read, Write};
use std::process::{Command, Stdio};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 5 {
        eprintln!("usage: codex-launcher <shell|-> <cwd> <env-file> <command-file>");
        std::process::exit(124);
    }
    let shell = args[1].clone();
    let args: Vec<String> = args[1..].to_vec(); // args[1]=cwd, [2]=env, [3]=command
    let env_raw = std::fs::read(&args[2]).expect("read env file");
    let env_text = String::from_utf8(env_raw).expect("utf8 env file");
    let env: Vec<(String, String)> = env_text
        .split('\0')
        .filter(|r| !r.is_empty())
        .filter_map(|r| r.split_once('=').map(|(k, v)| (k.to_string(), v.to_string())))
        .collect();
    let command_line = std::fs::read_to_string(&args[3]).expect("read command file");
    let command_line = command_line.trim_end_matches(['\r', '\n']);

    let mut command;
    if shell == "-" {
        let program = env
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("COMSPEC"))
            .map(|(_, v)| v.clone())
            .unwrap_or_else(|| "cmd.exe".to_string());
        command = Command::new(&program);
        command.arg("/C");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.raw_arg(format!(r#""{command_line}""#));
        }
        #[cfg(not(windows))]
        command.arg(command_line);
    } else {
        command = Command::new(&shell);
        command.args(["-NoProfile", "-Command"]);
        command.arg(command_line);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
        .env_clear()
        .envs(env.iter().map(|(k, v)| (k, v)))
        .current_dir(&args[1])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut input = Vec::new();
    std::io::stdin().read_to_end(&mut input).expect("read stdin");
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            eprintln!("codex-launcher: spawn_error: {err}");
            std::process::exit(125);
        }
    };
    {
        let mut stdin = child.stdin.take().expect("stdin");
        let _ = stdin.write_all(&input);
    }
    let output = child.wait_with_output().expect("wait");
    std::io::stdout().write_all(&output.stdout).unwrap();
    std::io::stderr().write_all(&output.stderr).unwrap();
    std::process::exit(output.status.code().unwrap_or(126));
}
