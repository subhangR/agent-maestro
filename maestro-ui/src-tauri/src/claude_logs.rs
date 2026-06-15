use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const MAX_LOG_FILE_BYTES: u64 = 10 * 1024 * 1024; // 10MB

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLogFile {
    pub filename: String,
    pub modified_at: u64,
    pub size: u64,
    pub maestro_session_id: Option<String>,
}

// Scan generously: the maestro <session_id> tag is embedded in the first user
// message, which now runs ~20KB+ (CLAUDE.md + skills list + MCP instructions +
// the maestro prompt). An 8KB window missed it, leaving the session log strip
// unrendered. Matches the Codex sibling (see codex_logs.rs).
const SESSION_ID_PREFIX_BYTES: usize = 256 * 1024; // 256KB

/// Read the leading `bytes` of a file as lossy UTF-8. Mirrors the Codex log
/// reader's helper (see codex_logs.rs) so both providers scan logs identically.
fn read_prefix(path: &Path, bytes: usize) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut buf = vec![0u8; bytes];
    let n = file.read(&mut buf).ok()?;
    buf.truncate(n);
    Some(String::from_utf8_lossy(&buf).to_string())
}

/// Read the leading chunk of a JSONL file and look for a Maestro session ID tag.
fn extract_maestro_session_id(path: &Path) -> Option<String> {
    let text = read_prefix(path, SESSION_ID_PREFIX_BYTES)?;
    let re = Regex::new(r"<session_id>(sess_[^<]+)</session_id>").ok()?;
    re.captures(&text).map(|c| c[1].to_string())
}

/// Encode a cwd path to match Claude's project directory naming.
///
/// Claude Code names the project dir by replacing every non-alphanumeric
/// character in the absolute path with `-` (e.g. `/Users/jane.doe/my project`
/// -> `-Users-jane-doe-my-project`). Replacing only `/` would break any path
/// whose segments contain `.`, `_`, or spaces (such as a username like
/// `jane.doe`), because the encoded dir would never match the real one on disk.
/// A trailing slash is stripped first so it doesn't produce a trailing `-`.
fn encode_project_path(cwd: &str) -> String {
    cwd.trim_end_matches(['/', '\\'])
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Get the Claude projects directory.
///
/// Honors `CLAUDE_CONFIG_DIR` (Claude Code relocates the whole `~/.claude` tree
/// there when set), falling back to `<home>/.claude`. On Windows the home dir
/// resolves to `%USERPROFILE%`, so the default is `%USERPROFILE%\.claude\projects`.
fn claude_projects_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("CLAUDE_CONFIG_DIR") {
        let dir = dir.trim();
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir).join("projects"));
        }
    }
    let home = dirs::home_dir().ok_or_else(|| "cannot determine home directory".to_string())?;
    Ok(home.join(".claude").join("projects"))
}

#[tauri::command]
pub fn list_claude_session_logs(cwd: String) -> Result<Vec<ClaudeLogFile>, String> {
    let projects_dir = claude_projects_dir()?;
    let encoded = encode_project_path(cwd.trim());
    let project_dir = projects_dir.join(&encoded);

    if !project_dir.is_dir() {
        return Ok(Vec::new());
    }

    let read_dir = fs::read_dir(&project_dir).map_err(|e| format!("read dir failed: {e}"))?;
    let mut files: Vec<ClaudeLogFile> = Vec::new();

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".jsonl") {
            continue;
        }

        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified_at = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        // Extract maestro session ID from first ~8KB of the file
        let maestro_session_id = extract_maestro_session_id(&path);

        files.push(ClaudeLogFile {
            filename: name,
            modified_at,
            size: meta.len(),
            maestro_session_id,
        });
    }

    // Sort most recent first
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(files)
}

#[tauri::command]
pub fn read_claude_session_log(cwd: String, filename: String) -> Result<String, String> {
    let filename = filename.trim();

    // Validate filename
    if !filename.ends_with(".jsonl") {
        return Err("filename must end with .jsonl".to_string());
    }
    if filename.contains('/') || filename.contains('\\') {
        return Err("filename must not contain path separators".to_string());
    }

    let projects_dir = claude_projects_dir()?;
    let encoded = encode_project_path(cwd.trim());
    let file_path = projects_dir.join(&encoded).join(filename);

    if !file_path.is_file() {
        return Err("log file not found".to_string());
    }

    let meta = fs::metadata(&file_path).map_err(|e| format!("metadata failed: {e}"))?;
    if meta.len() > MAX_LOG_FILE_BYTES {
        return Err(format!(
            "file too large ({} bytes, max {} bytes)",
            meta.len(),
            MAX_LOG_FILE_BYTES
        ));
    }

    fs::read_to_string(&file_path).map_err(|e| format!("read failed: {e}"))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogTailResult {
    pub content: String,
    pub new_offset: u64,
    pub file_size: u64,
}

/// Read new content from a JSONL log file starting at a byte offset.
/// Returns only the bytes added since the last read.
#[tauri::command]
pub fn tail_claude_session_log(
    cwd: String,
    filename: String,
    offset: u64,
) -> Result<LogTailResult, String> {
    let filename = filename.trim();

    if !filename.ends_with(".jsonl") {
        return Err("filename must end with .jsonl".to_string());
    }
    if filename.contains('/') || filename.contains('\\') {
        return Err("filename must not contain path separators".to_string());
    }

    let projects_dir = claude_projects_dir()?;
    let encoded = encode_project_path(cwd.trim());
    let file_path = projects_dir.join(&encoded).join(filename);

    if !file_path.is_file() {
        return Err("log file not found".to_string());
    }

    let meta = fs::metadata(&file_path).map_err(|e| format!("metadata failed: {e}"))?;
    let file_size = meta.len();

    // Nothing new
    if offset >= file_size {
        return Ok(LogTailResult {
            content: String::new(),
            new_offset: offset,
            file_size,
        });
    }

    let bytes_to_read = file_size - offset;
    if bytes_to_read > MAX_LOG_FILE_BYTES {
        return Err("too much new content to read".to_string());
    }

    let mut file = fs::File::open(&file_path).map_err(|e| format!("open failed: {e}"))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("seek failed: {e}"))?;

    let mut buf = vec![0u8; bytes_to_read as usize];
    file.read_exact(&mut buf)
        .map_err(|e| format!("read failed: {e}"))?;

    let content = String::from_utf8(buf).map_err(|_| "content is not valid UTF-8".to_string())?;

    Ok(LogTailResult {
        content,
        new_offset: file_size,
        file_size,
    })
}

#[cfg(test)]
mod tests {
    use super::{encode_project_path, extract_maestro_session_id};
    use std::fs;

    #[test]
    fn encodes_plain_path() {
        assert_eq!(
            encode_project_path("/Users/subhang/Projects/agent-maestro"),
            "-Users-subhang-Projects-agent-maestro"
        );
    }

    #[test]
    fn encodes_dot_in_segment() {
        // A `.` in a path segment (e.g. the username) must become `-`,
        // matching Claude's project directory naming.
        assert_eq!(
            encode_project_path("/Users/jane.doe/Projects/agent-maestro"),
            "-Users-jane-doe-Projects-agent-maestro"
        );
    }

    #[test]
    fn encodes_underscores_and_spaces() {
        assert_eq!(
            encode_project_path("/Users/a_b/my project"),
            "-Users-a-b-my-project"
        );
    }

    #[test]
    fn strips_trailing_slash() {
        assert_eq!(
            encode_project_path("/Users/subhang/Projects/agent-maestro/"),
            "-Users-subhang-Projects-agent-maestro"
        );
    }

    #[test]
    fn finds_session_id_past_legacy_8kb_window() {
        // Regression: the maestro <session_id> tag now lands ~23KB into a real
        // Claude log — pushed down by a large first user message (CLAUDE.md +
        // skills list + MCP instructions + the maestro prompt). The legacy 8KB
        // scan window missed it, so extraction returned None and the session
        // log strip never rendered. Place the tag ~20KB in (past the old 8KB
        // window, inside the current one) and assert we still find it.
        let mut path = std::env::temp_dir();
        path.push(format!(
            "maestro_claude_log_test_{}.jsonl",
            std::process::id()
        ));

        let filler = "x".repeat(20_000);
        let contents = format!(
            "{{\"pad\":\"{filler}\"}}\n{{\"text\":\"<session_id>sess_test_abc123</session_id>\"}}\n"
        );
        fs::write(&path, &contents).unwrap();

        let got = extract_maestro_session_id(&path);
        let _ = fs::remove_file(&path);

        assert_eq!(got.as_deref(), Some("sess_test_abc123"));
    }
}
