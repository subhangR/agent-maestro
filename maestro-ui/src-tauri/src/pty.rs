use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufWriter, Read, Write};
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, State, WebviewWindow};

#[cfg(target_os = "macos")]
#[derive(Default)]
struct LoginPathCache {
    initialized: bool,
    shell: Option<String>,
    path: Option<String>,
}

#[derive(Default)]
struct AppStateInner {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, PtySession>>,
    #[cfg(target_os = "macos")]
    login_path_cache: Mutex<LoginPathCache>,
}

#[derive(Clone, Default)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct PtySession {
    name: String,
    command: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    recording: Option<SessionRecording>,
    closing: bool,
}

struct SessionRecording {
    id: String,
    writer: BufWriter<std::fs::File>,
    started_at: Instant,
    last_flush: Instant,
    unflushed_bytes: usize,
    input_buffer: String,
    enc_key: Option<[u8; 32]>,
}

#[derive(Serialize, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub cwd: Option<String>,
}

#[derive(Serialize, Clone)]
struct PtyOutput {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct PtyExit {
    id: String,
    exit_code: Option<u32>,
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn valid_env_key(key: &str) -> bool {
    let trimmed = key.trim();
    let mut chars = trimmed.chars();
    let first = match chars.next() {
        Some(c) => c,
        None => return false,
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    for c in chars {
        if !(c == '_' || c.is_ascii_alphanumeric()) {
            return false;
        }
    }
    true
}

#[cfg(target_family = "unix")]
#[cfg(target_family = "unix")]
fn shell_from_passwd() -> Option<String> {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .ok()?;
    let prefix = format!("{user}:");
    let contents = fs::read_to_string("/etc/passwd").ok()?;
    for line in contents.lines() {
        if !line.starts_with(&prefix) {
            continue;
        }
        let shell = line.split(':').last()?.trim();
        if shell.is_empty() {
            return None;
        }
        if Path::new(shell).is_file() {
            return Some(shell.to_string());
        }
        return None;
    }
    None
}

fn default_user_shell() -> String {
    // On Windows, use COMSPEC (typically cmd.exe)
    #[cfg(target_family = "windows")]
    {
        return std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
    }

    #[cfg(target_family = "unix")]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            let trimmed = shell.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        if let Some(shell) = shell_from_passwd() {
            return shell;
        }

        #[cfg(target_os = "macos")]
        {
            return "/bin/zsh".to_string();
        }

        #[cfg(not(target_os = "macos"))]
        {
            if Path::new("/bin/bash").is_file() {
                return "/bin/bash".to_string();
            }
            return "/bin/sh".to_string();
        }
    }
}

#[cfg(target_os = "macos")]
fn login_shell_path(shell: &str, base_path: &str) -> Option<String> {
    let shell_name = Path::new(shell)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    const START: &str = "__AGENTS_UI_PATH_START__";
    const END: &str = "__AGENTS_UI_PATH_END__";

    let (script, arg_sets): (String, Vec<Vec<&str>>) = if shell_name.contains("zsh") || shell_name.contains("bash") {
        (format!("printf '{START}%s{END}' \"$PATH\""), vec![vec!["-i", "-l", "-c"]])
    } else if shell_name == "fish" {
        (
            format!("printf '{START}%s{END}' (string join ':' $PATH)"),
            vec![vec!["-i", "-l", "-c"], vec!["-l", "-c"]],
        )
    } else {
        return None;
    };

    let extract_path = |stdout: &str| -> Option<String> {
        let start = stdout.find(START)?;
        let rest = &stdout[start + START.len()..];
        let end = rest.find(END)?;
        let path = rest[..end].trim();
        if path.is_empty() {
            return None;
        }
        Some(path.to_string())
    };

    let run_with_pty = |args: &[&str]| -> Option<String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .ok()?;

        let mut cmd = CommandBuilder::new(shell);
        cmd.args(args);
        cmd.arg(&script);
        cmd.env("PATH", base_path);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("SHELL", shell);

        let mut child = pair.slave.spawn_command(cmd).ok()?;
        let mut reader = pair.master.try_clone_reader().ok()?;

        let mut buf = [0u8; 4096];
        let mut utf8_carry: Vec<u8> = Vec::new();
        let mut output = String::new();
        let start_time = Instant::now();

        loop {
            if start_time.elapsed().as_millis() > 2000 {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    output.push_str(&decode_utf8_stream(&mut utf8_carry, &buf[..n]));
                    if output.contains(START) && output.contains(END) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        if !utf8_carry.is_empty() {
            output.push_str(&String::from_utf8_lossy(&utf8_carry));
        }

        let _ = child.kill();
        let _ = child.wait();

        if output.is_empty() {
            None
        } else {
            Some(output)
        }
    };

    for args in &arg_sets {
        if let Some(stdout) = run_with_pty(args.as_slice()) {
            if let Some(path) = extract_path(&stdout) {
                return Some(path);
            }
        }
    }

    for args in arg_sets {
        let out = Command::new(shell)
            .args(&args)
            .arg(&script)
            .env("PATH", base_path)
            .env("TERM", "xterm-256color")
            .env("COLORTERM", "truecolor")
            .env("SHELL", shell)
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&out.stdout);
        if let Some(path) = extract_path(&stdout) {
            return Some(path);
        }
    }

    None
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersistentSessionInfo {
    pub persist_id: String,
    pub session_name: String,
}

#[tauri::command]
pub fn list_persistent_sessions(_window: WebviewWindow) -> Result<Vec<PersistentSessionInfo>, String> {
    // Persistent sessions (tmux) have been removed. Always return empty.
    Ok(Vec::new())
}

#[tauri::command]
pub fn kill_persistent_session(_window: WebviewWindow, _persist_id: String) -> Result<(), String> {
    // Persistent sessions (tmux) have been removed.
    Err("persistent sessions are no longer supported".to_string())
}

fn write_recording_event(rec: &mut SessionRecording, t: u64, data: &str) -> Result<(), String> {
    let data = match rec.enc_key.as_ref() {
        Some(key) => crate::secure::encrypt_string_with_key(
            key,
            crate::secure::SecretContext::Recording,
            data,
        )?,
        None => data.to_string(),
    };
    let line = crate::recording::RecordingLineV1::Input(crate::recording::RecordingEventV1 {
        t,
        data,
    });
    let json = serde_json::to_string(&line).map_err(|e| format!("serialize failed: {e}"))?;
    rec.writer
        .write_all(json.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    rec.writer
        .write_all(b"\n")
        .map_err(|e| format!("write failed: {e}"))?;
    rec.unflushed_bytes += json.len() + 1;
    Ok(())
}

fn skip_csi(iter: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    while let Some(ch) = iter.next() {
        // CSI sequence terminator is any byte in 0x40..=0x7E.
        if ('@'..='~').contains(&ch) {
            break;
        }
    }
}

fn skip_until_st(iter: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    while let Some(ch) = iter.next() {
        if ch == '\u{1b}' {
            if let Some('\\') = iter.peek().copied() {
                iter.next();
                break;
            }
        }
    }
}

fn skip_osc(iter: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    while let Some(ch) = iter.next() {
        if ch == '\u{7}' {
            break;
        }
        if ch == '\u{1b}' {
            if let Some('\\') = iter.peek().copied() {
                iter.next();
                break;
            }
        }
    }
}

fn skip_escape_sequence(iter: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    match iter.peek().copied() {
        Some('[') => {
            iter.next();
            skip_csi(iter);
        }
        Some(']') => {
            iter.next();
            skip_osc(iter);
        }
        Some('P') | Some('^') | Some('_') => {
            iter.next();
            skip_until_st(iter);
        }
        Some(_) => {
            // Unknown single-char escape sequence.
            iter.next();
        }
        None => {}
    }
}

fn record_user_input(rec: &mut SessionRecording, data: &str) -> Result<(), String> {
    let t = rec.started_at.elapsed().as_millis() as u64;
    let mut wrote_any = false;

    let mut iter = data.chars().peekable();
    while let Some(ch) = iter.next() {
        match ch {
            '\r' => {
                // Treat CRLF as a single enter.
                if iter.peek().copied() == Some('\n') {
                    iter.next();
                }
                let mut line = std::mem::take(&mut rec.input_buffer);
                line.push('\r');
                write_recording_event(rec, t, &line)?;
                wrote_any = true;
            }
            '\n' => {
                let mut line = std::mem::take(&mut rec.input_buffer);
                line.push('\n');
                write_recording_event(rec, t, &line)?;
                wrote_any = true;
            }
            '\u{7f}' | '\u{8}' => {
                rec.input_buffer.pop();
            }
            '\u{15}' => {
                rec.input_buffer.clear();
            }
            '\t' => {}
            '\u{1b}' => skip_escape_sequence(&mut iter),
            c if c.is_control() => {}
            c => rec.input_buffer.push(c),
        }
    }

    let should_flush = wrote_any
        || rec.unflushed_bytes >= 16 * 1024
        || rec.last_flush.elapsed().as_millis() >= 1500;
    if should_flush {
        rec.writer
            .flush()
            .map_err(|e| format!("flush failed: {e}"))?;
        rec.last_flush = Instant::now();
        rec.unflushed_bytes = 0;
    }
    Ok(())
}

fn unique_name(existing: &HashMap<String, PtySession>, base: &str) -> String {
    let taken: std::collections::HashSet<&str> = existing.values().map(|s| s.name.as_str()).collect();
    if !taken.contains(base) {
        return base.to_string();
    }
    let mut n = 2;
    loop {
        let candidate = format!("{base}-{n}");
        if !taken.contains(candidate.as_str()) {
            return candidate;
        }
        n += 1;
    }
}

fn decode_utf8_stream(carry: &mut Vec<u8>, chunk: &[u8]) -> String {
    if chunk.is_empty() {
        return String::new();
    }
    carry.extend_from_slice(chunk);

    let mut out = String::new();
    let mut idx = 0usize;
    while idx < carry.len() {
        match std::str::from_utf8(&carry[idx..]) {
            Ok(s) => {
                out.push_str(s);
                idx = carry.len();
                break;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                if valid > 0 {
                    let end = idx + valid;
                    out.push_str(unsafe { std::str::from_utf8_unchecked(&carry[idx..end]) });
                    idx = end;
                }

                match e.error_len() {
                    None => break,
                    Some(len) => {
                        out.push('\u{fffd}');
                        idx = (idx + len).min(carry.len());
                    }
                }
            }
        }
    }

    if idx > 0 {
        carry.drain(..idx);
    }
    out
}

#[cfg(target_family = "unix")]
fn sh_single_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for ch in s.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

#[cfg(target_family = "unix")]
fn write_zsh_startup_files(temp_dir: &Path, orig_dir: &Path) -> Result<(), String> {
    let zshenv = temp_dir.join(".zshenv");
    let zprofile = temp_dir.join(".zprofile");
    let zlogin = temp_dir.join(".zlogin");
    let zshrc = temp_dir.join(".zshrc");

    let orig_zshenv = orig_dir.join(".zshenv");
    let orig_zprofile = orig_dir.join(".zprofile");
    let orig_zlogin = orig_dir.join(".zlogin");
    let orig_zshrc = orig_dir.join(".zshrc");

    let orig_dir_str = orig_dir.to_string_lossy();

    let source_if_exists = |path: &Path| -> String {
        let path_str = path.to_string_lossy();
        format!(
            "if [ -f {q} ]; then source {q}; fi\n",
            q = sh_single_quote(path_str.as_ref())
        )
    };

    let orig_dir_quoted = sh_single_quote(orig_dir_str.as_ref());

    let wrap_source = |orig_file: &Path, restore_to_temp: bool| -> String {
        let mut out = String::new();
        out.push_str("typeset -g __agents_ui_temp_zdotdir=\"$ZDOTDIR\"\n");
        out.push_str(&format!("export ZDOTDIR={orig_dir_quoted}\n"));
        out.push_str(&source_if_exists(orig_file));
        if restore_to_temp {
            out.push_str("export ZDOTDIR=\"$__agents_ui_temp_zdotdir\"\n");
        }
        out.push_str("unset __agents_ui_temp_zdotdir\n");
        out
    };

    fs::write(&zshenv, wrap_source(&orig_zshenv, true)).map_err(|e| e.to_string())?;
    fs::write(&zprofile, wrap_source(&orig_zprofile, true)).map_err(|e| e.to_string())?;
    fs::write(&zlogin, wrap_source(&orig_zlogin, false)).map_err(|e| e.to_string())?;

    let mut zshrc_contents = wrap_source(&orig_zshrc, false);
    zshrc_contents.push_str(
        r#"
__agents_ui_emit_cwd() {
  printf '\033]1337;CurrentDir=%s\007' "$PWD"
  printf '\033]1337;Command=\007'
}

__agents_ui_emit_command() { printf '\033]1337;Command=%s\007' "$1"; }

typeset -ga precmd_functions preexec_functions
precmd_functions+=__agents_ui_emit_cwd
preexec_functions+=__agents_ui_emit_command
__agents_ui_emit_cwd
"#,
    );
    fs::write(&zshrc, zshrc_contents).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let sessions = state
        .inner
        .sessions
        .lock()
        .map_err(|_| "state poisoned")?;
    Ok(sessions
        .iter()
        .map(|(id, s)| SessionInfo {
            id: id.clone(),
            name: s.name.clone(),
            command: s.command.clone(),
            cwd: None,
        })
        .collect())
}

#[tauri::command]
pub fn create_session(
    window: WebviewWindow,
    state: State<'_, AppState>,
    name: Option<String>,
    command: Option<String>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    env_vars: Option<HashMap<String, String>>,
    persistent: Option<bool>,
    persist_id: Option<String>,
) -> Result<SessionInfo, String> {
    // persistent and persist_id are accepted for API compatibility but ignored
    let _ = persistent;
    let _ = persist_id;

    #[cfg(target_family = "unix")]
    let shell = default_user_shell();
    #[cfg(not(target_family = "unix"))]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());

    let command = command.unwrap_or_default().trim().to_string();
    let is_shell = command.is_empty();

    let cwd = cwd
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .filter(|s| Path::new(s).is_dir())
        .or_else(|| {
            #[cfg(target_family = "unix")]
            {
                std::env::var("HOME").ok().filter(|s| Path::new(s).is_dir())
            }
            #[cfg(not(target_family = "unix"))]
            {
                std::env::var("USERPROFILE").ok().filter(|s| Path::new(s).is_dir())
            }
        });

    #[cfg(target_family = "unix")]
    let (program, args, shown_command) = if is_shell {
        (
            shell.clone(),
            vec!["-l".to_string()],
            format!("{shell} -l"),
        )
    } else {
        // When running a command, always use a POSIX-compatible shell (/bin/sh)
        // because the command string uses POSIX syntax (;, $VAR, exec, etc.)
        let posix_shell = if Path::new("/bin/bash").is_file() {
            "/bin/bash".to_string()
        } else {
            "/bin/sh".to_string()
        };
        // Preserve injected environment variables for spawned Maestro sessions.
        // Login shells can source profile files that overwrite env vars such as
        // MAESTRO_MANIFEST_PATH and MAESTRO_SESSION_ID.
        let shell_flag = if env_vars.is_some() { "-c" } else { "-lc" };
        (
            posix_shell.clone(),
            vec![shell_flag.to_string(), command.clone()],
            format!("{posix_shell} {shell_flag} {command}"),
        )
    };

    #[cfg(not(target_family = "unix"))]
    let (program, args, shown_command) = if is_shell {
        (shell.clone(), Vec::new(), shell.clone())
    } else {
        (
            shell.clone(),
            vec!["/C".to_string(), command.clone()],
            format!("{shell} /C {command}"),
        )
    };

    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("openpty failed: {e}"))?;

    let id = state.inner.next_id.fetch_add(1, Ordering::Relaxed).to_string();

    eprintln!("[PTY] Creating session: id={}, command='{}', cwd={:?}", id, shown_command, cwd);

    let mut cmd = CommandBuilder::new(program);
    cmd.args(args);
    let frontend_set_path = env_vars
        .as_ref()
        .map(|vars| vars.contains_key("PATH"))
        .unwrap_or(false);

    if let Some(vars) = env_vars {
        for (k, v) in vars {
            let key = k.trim();
            if !valid_env_key(key) {
                continue;
            }
            cmd.env(key, v);
        }
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    #[cfg(target_family = "unix")]
    if cmd.get_env("SHELL").is_none() {
        cmd.env("SHELL", shell.clone());
    }

    #[cfg(target_os = "macos")]
    {
        if !frontend_set_path {
            let mut fallback_entries: Vec<String> = std::env::var("PATH")
                .unwrap_or_default()
                .split(':')
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string())
                .collect();

            if let Ok(home) = std::env::var("HOME") {
                for candidate in [format!("{home}/.cargo/bin"), format!("{home}/.local/bin"), format!("{home}/bin")] {
                    if Path::new(&candidate).is_dir() && !fallback_entries.iter().any(|p| p == &candidate) {
                        fallback_entries.insert(0, candidate);
                    }
                }
            }

            for candidate in [
                "/opt/homebrew/bin",
                "/opt/homebrew/sbin",
                "/usr/local/bin",
                "/usr/local/sbin",
            ] {
                if Path::new(candidate).is_dir() && !fallback_entries.iter().any(|p| p == candidate) {
                    fallback_entries.insert(0, candidate.to_string());
                }
            }

            for candidate in ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
                if Path::new(candidate).is_dir() && !fallback_entries.iter().any(|p| p == candidate) {
                    fallback_entries.push(candidate.to_string());
                }
            }

            let fallback_path = fallback_entries.join(":");
            let imported_path = if let Ok(mut cache) = state.inner.login_path_cache.lock() {
                if cache.initialized && cache.shell.as_deref() == Some(shell.as_str()) {
                    cache.path.clone()
                } else {
                    let computed = login_shell_path(&shell, &fallback_path);
                    cache.initialized = true;
                    cache.shell = Some(shell.clone());
                    cache.path = computed.clone();
                    computed
                }
            } else {
                login_shell_path(&shell, &fallback_path)
            };

            let mut path_entries: Vec<String> = Vec::new();
            let mut push_unique = |value: &str| {
                let trimmed = value.trim();
                if trimmed.is_empty()
                    || !trimmed.starts_with('/')
                    || trimmed.contains('\n')
                    || trimmed.contains('\r')
                {
                    return;
                }
                if !path_entries.iter().any(|p| p == trimmed) {
                    path_entries.push(trimmed.to_string());
                }
            };

            if let Some(ref imported) = imported_path {
                for entry in imported.split(':') {
                    push_unique(entry);
                }
            }

            for entry in &fallback_entries {
                push_unique(entry);
            }

            if !path_entries.is_empty() {
                cmd.env("PATH", path_entries.join(":"));
            }
        }
    }

    if cmd.get_env("PATH").is_none() {
        if let Ok(path) = std::env::var("PATH") {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                cmd.env("PATH", trimmed);
            }
        }
    }

    if let Some(ref cwd) = cwd {
        cmd.cwd(cwd);
    }

    #[cfg(target_family = "unix")]
    {
        let shell_name = Path::new(&shell)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if is_shell && shell_name.contains("bash") {
            let orig_prompt = cmd
                .get_env("PROMPT_COMMAND")
                .and_then(|v| v.to_str())
                .map(|s| s.to_string());
            if let Some(orig) = orig_prompt {
                cmd.env("AGENTS_UI_ORIG_PROMPT_COMMAND", orig);
            }
            cmd.env(
                "PROMPT_COMMAND",
                "printf '\\033]1337;CurrentDir=%s\\007' \"$PWD\"; if [ -n \"$AGENTS_UI_ORIG_PROMPT_COMMAND\" ]; then eval \"$AGENTS_UI_ORIG_PROMPT_COMMAND\"; fi",
            );
        }

        if is_shell && shell_name.contains("zsh") {
            let orig_dotdir = std::env::var("ZDOTDIR")
                .ok()
                .filter(|s| Path::new(s).is_dir())
                .or_else(|| std::env::var("HOME").ok().filter(|s| Path::new(s).is_dir()));

            if let Some(orig_dotdir) = orig_dotdir {
                let dotdir = Some(std::env::temp_dir().join(format!("agents-ui-zdotdir-{id}")));

                if let Some(dotdir) = dotdir {
                    if fs::create_dir_all(&dotdir).is_ok()
                        && write_zsh_startup_files(&dotdir, Path::new(&orig_dotdir)).is_ok()
                    {
                        cmd.env("ZDOTDIR", dotdir.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn failed: {e}"))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader failed: {e}"))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take writer failed: {e}"))?;

    let mut sessions = state
        .inner
        .sessions
        .lock()
        .map_err(|_| "state poisoned")?;

    let base_name = name.unwrap_or_else(|| (if is_shell { "shell" } else { "agent" }).to_string());
    let base_trimmed = base_name.trim();
    let base_trimmed = if base_trimmed.is_empty() { "session" } else { base_trimmed };
    let final_name = unique_name(&sessions, base_trimmed);

    sessions.insert(
        id.clone(),
        PtySession {
            name: final_name.clone(),
            command: shown_command.clone(),
            master: pair.master,
            writer,
            child,
            recording: None,
            closing: false,
        },
    );
    drop(sessions);

    let id_for_thread = id.clone();
    let state_for_thread = state.inner().clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut utf8_carry: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = decode_utf8_stream(&mut utf8_carry, &buf[..n]);
                    if !data.is_empty() {
                        let _ = window.emit(
                            "pty-output",
                            PtyOutput {
                                id: id_for_thread.clone(),
                                data,
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }

        if !utf8_carry.is_empty() {
            let data = String::from_utf8_lossy(&utf8_carry).to_string();
            if !data.is_empty() {
                let _ = window.emit(
                    "pty-output",
                    PtyOutput {
                        id: id_for_thread.clone(),
                        data,
                    },
                );
            }
        }

        let session = match state_for_thread.inner.sessions.lock() {
            Ok(mut sessions) => sessions.remove(&id_for_thread),
            Err(_) => None,
        };

        let exit_code = session
            .and_then(|mut s| s.child.wait().ok().map(|status| status.exit_code()));

        let _ = window.emit(
            "pty-exit",
            PtyExit {
                id: id_for_thread,
                exit_code,
            },
        );
    });

    Ok(SessionInfo {
        id,
        name: final_name,
        command: shown_command,
        cwd,
    })
}

#[tauri::command]
pub fn start_session_recording(
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: String,
    recording_id: String,
    recording_name: Option<String>,
    encrypt: Option<bool>,
    project_id: String,
    session_persist_id: String,
    cwd: Option<String>,
    effect_id: Option<String>,
    bootstrap_command: Option<String>,
) -> Result<String, String> {
    let safe_id = crate::recording::sanitize_recording_id(&recording_id);
    let encrypt_enabled = encrypt.unwrap_or(true);
    let enc_key = if encrypt_enabled {
        Some(crate::secure::get_or_create_master_key(&window)?)
    } else {
        None
    };

    let mut sessions = state
        .inner
        .sessions
        .lock()
        .map_err(|_| "state poisoned")?;
    let s = sessions.get_mut(&id).ok_or("unknown session")?;

    if s.recording.is_some() {
        return Err("already recording".to_string());
    }

    let path = crate::recording::recording_file_path(&window, &safe_id)?;
    let dir = path.parent().ok_or("invalid recording path")?;
    fs::create_dir_all(dir).map_err(|e| format!("create dir failed: {e}"))?;

    let file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| format!("open failed: {e}"))?;

    let mut writer = BufWriter::new(file);
    let recording_name = recording_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(120).collect());
    let effect_id = effect_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let bootstrap_command = bootstrap_command
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let meta = crate::recording::RecordingMetaV1 {
        schema_version: 1,
        created_at: now_epoch_ms(),
        name: recording_name,
        project_id,
        session_persist_id,
        cwd,
        effect_id,
        bootstrap_command,
        encrypted: Some(encrypt_enabled),
    };
    let line = crate::recording::RecordingLineV1::Meta(meta);
    let json = serde_json::to_string(&line).map_err(|e| format!("serialize failed: {e}"))?;
    writer
        .write_all(json.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    writer.write_all(b"\n").map_err(|e| format!("write failed: {e}"))?;
    writer.flush().map_err(|e| format!("flush failed: {e}"))?;

    s.recording = Some(SessionRecording {
        id: safe_id.clone(),
        writer,
        started_at: Instant::now(),
        last_flush: Instant::now(),
        unflushed_bytes: 0,
        input_buffer: String::new(),
        enc_key,
    });

    Ok(safe_id)
}

#[tauri::command]
pub fn stop_session_recording(state: State<'_, AppState>, id: String) -> Result<Option<String>, String> {
    let mut sessions = state
        .inner
        .sessions
        .lock()
        .map_err(|_| "state poisoned")?;
    let s = sessions.get_mut(&id).ok_or("unknown session")?;

    let mut rec = match s.recording.take() {
        Some(r) => r,
        None => return Ok(None),
    };
    rec.writer.flush().map_err(|e| format!("flush failed: {e}"))?;
    Ok(Some(rec.id))
}

#[tauri::command]
pub fn write_to_session(
    state: State<'_, AppState>,
    id: String,
    data: String,
    source: Option<String>,
) -> Result<(), String> {
    let mut sessions = state
        .inner
        .sessions
        .lock()
        .map_err(|_| "state poisoned")?;
    let s = sessions.get_mut(&id).ok_or("unknown session")?;
    if s.closing {
        return Ok(());
    }

    s.writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    s.writer.flush().ok();

    let is_user = source.as_deref() == Some("user");
    if is_user {
        let mut rec_err: Option<String> = None;
        if let Some(rec) = s.recording.as_mut() {
            if let Err(e) = record_user_input(rec, &data) {
                rec_err = Some(e);
            }
        }
        if let Some(err) = rec_err {
            eprintln!("Failed to write recording event: {err}");
            s.recording = None;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn resize_session(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .inner
        .sessions
        .lock()
        .map_err(|_| "state poisoned")?;
    let s = sessions.get(&id).ok_or("unknown session")?;
    if s.closing {
        return Ok(());
    }
    s.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn close_session(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut sessions = state
        .inner
        .sessions
        .lock()
        .map_err(|_| "state poisoned")?;
    let Some(session) = sessions.get_mut(&id) else {
        return Ok(());
    };

    if session.closing {
        return Ok(());
    }
    session.closing = true;
    let _ = session.child.kill();
    Ok(())
}

#[tauri::command]
pub fn detach_session(_state: State<'_, AppState>, _id: String) -> Result<(), String> {
    // Detach was tmux-specific. No longer supported.
    Err("detach is no longer supported (tmux removed)".to_string())
}
