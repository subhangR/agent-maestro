import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Server-side port of the Tauri Rust log readers (claude_logs.rs / codex_logs.rs).
 *
 * Why this exists: the Session Log strip discovers and tails an agent's JSONL
 * transcript. In the Tauri desktop app this is done via Rust `invoke` commands,
 * which don't exist in the browser web-ui. These HTTP-friendly methods let the
 * web-ui read the same logs over REST so the strip renders outside Tauri too.
 */

const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const SESSION_ID_RE = /<session_id>(sess_[^<]+)<\/session_id>/;

export type LogProvider = 'claude' | 'codex';

export interface AgentLogFile {
  filename: string;
  relativePath?: string;
  modifiedAt: number;
  size: number;
  maestroSessionId: string | null;
}

export interface LogTailResult {
  content: string;
  newOffset: number;
  fileSize: number;
}

function homeDir(): string {
  return os.homedir();
}

/**
 * Encode a cwd path to match Claude's project directory naming: every
 * non-alphanumeric character in the absolute path becomes `-`. A trailing
 * slash is stripped first so it doesn't produce a trailing `-`.
 */
function encodeProjectPath(cwd: string): string {
  return cwd
    .replace(/\/+$/, '')
    .split('')
    .map((c) => (/[a-zA-Z0-9]/.test(c) ? c : '-'))
    .join('');
}

/** Read the first `bytes` of a file as a UTF-8 (lossy) string. */
async function readPrefix(filePath: string, bytes: number): Promise<string> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

async function extractMaestroSessionId(filePath: string, prefixBytes: number): Promise<string | null> {
  try {
    const text = await readPrefix(filePath, prefixBytes);
    const m = text.match(SESSION_ID_RE);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ── Claude ───────────────────────────────────────────────────────────────────

const CLAUDE_PREFIX_BYTES = 8 * 1024; // 8KB

function claudeProjectsDir(): string {
  return path.join(homeDir(), '.claude', 'projects');
}

async function listClaudeLogs(cwd: string): Promise<AgentLogFile[]> {
  const projectDir = path.join(claudeProjectsDir(), encodeProjectPath(cwd.trim()));
  let entries: string[];
  try {
    entries = await fs.readdir(projectDir);
  } catch {
    return [];
  }

  const files: AgentLogFile[] = [];
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const filePath = path.join(projectDir, name);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    files.push({
      filename: name,
      modifiedAt: stat.mtimeMs,
      size: stat.size,
      maestroSessionId: await extractMaestroSessionId(filePath, CLAUDE_PREFIX_BYTES),
    });
  }
  files.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return files;
}

function resolveClaudeLogPath(cwd: string, filename: string): string {
  const name = filename.trim();
  if (!name.endsWith('.jsonl')) throw new Error('filename must end with .jsonl');
  if (name.includes('/') || name.includes('\\')) throw new Error('filename must not contain path separators');
  return path.join(claudeProjectsDir(), encodeProjectPath(cwd.trim()), name);
}

// ── Codex ──────────────────────────────────────────────────────────────────

const CODEX_PREFIX_BYTES = 256 * 1024; // 256KB

function codexSessionsDir(): string {
  return path.join(homeDir(), '.codex', 'sessions');
}

async function listJsonlFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
    }
  }
  return out;
}

/** Codex tags a log to a cwd via the first line's session_meta.payload.cwd. */
async function fileMatchesCwd(filePath: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    let done = false;
    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      stream.destroy();
      resolve(result);
    };
    stream.on('data', (chunk: string | Buffer) => {
      buffer += chunk.toString();
      const nl = buffer.indexOf('\n');
      if (nl === -1) {
        if (buffer.length > 1024 * 1024) finish(false);
        return;
      }
      const firstLine = buffer.slice(0, nl).trim();
      if (!firstLine) return finish(false);
      try {
        const val = JSON.parse(firstLine);
        if (val?.type !== 'session_meta') return finish(false);
        finish(val?.payload?.cwd === cwd);
      } catch {
        finish(false);
      }
    });
    stream.on('error', () => finish(false));
    stream.on('end', () => finish(false));
  });
}

async function listCodexLogs(cwd: string): Promise<AgentLogFile[]> {
  const sessionsDir = codexSessionsDir();
  let exists = true;
  try {
    const stat = await fs.stat(sessionsDir);
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) return [];

  const trimmed = cwd.trim();
  const allFiles = await listJsonlFilesRecursive(sessionsDir);
  const files: AgentLogFile[] = [];
  for (const filePath of allFiles) {
    if (!(await fileMatchesCwd(filePath, trimmed))) continue;
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }
    const relativePath = path.relative(sessionsDir, filePath).split(path.sep).join('/');
    files.push({
      filename: path.basename(filePath),
      relativePath,
      modifiedAt: stat.mtimeMs,
      size: stat.size,
      maestroSessionId: await extractMaestroSessionId(filePath, CODEX_PREFIX_BYTES),
    });
  }
  files.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return files;
}

async function resolveCodexLogPath(relativePath: string): Promise<string> {
  const rel = relativePath.trim();
  if (!rel.endsWith('.jsonl')) throw new Error('filename must end with .jsonl');
  if (path.isAbsolute(rel)) throw new Error('path must be relative');
  if (rel.split(/[\\/]/).includes('..')) throw new Error("path must not contain '..'");

  const base = codexSessionsDir();
  const joined = path.join(base, rel);
  const canonBase = await fs.realpath(base);
  let canonJoined: string;
  try {
    canonJoined = await fs.realpath(joined);
  } catch {
    throw new Error('log file not found');
  }
  if (!canonJoined.startsWith(canonBase)) throw new Error('path escapes codex sessions directory');
  return canonJoined;
}

// ── Shared read / tail ────────────────────────────────────────────────────────

async function readWhole(filePath: string): Promise<string> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new Error('log file not found');
  }
  if (!stat.isFile()) throw new Error('log file not found');
  if (stat.size > MAX_LOG_FILE_BYTES) {
    throw new Error(`file too large (${stat.size} bytes, max ${MAX_LOG_FILE_BYTES} bytes)`);
  }
  return fs.readFile(filePath, 'utf8');
}

async function tail(filePath: string, offset: number): Promise<LogTailResult> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new Error('log file not found');
  }
  const fileSize = stat.size;
  if (offset >= fileSize) {
    return { content: '', newOffset: offset, fileSize };
  }
  const bytesToRead = fileSize - offset;
  if (bytesToRead > MAX_LOG_FILE_BYTES) throw new Error('too much new content to read');

  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytesToRead);
    await handle.read(buf, 0, bytesToRead, offset);
    return { content: buf.toString('utf8'), newOffset: fileSize, fileSize };
  } finally {
    await handle.close();
  }
}

/**
 * Server-side facade matching the Tauri log commands. `cwd` is the agent's
 * launch directory; `filename` is the discovered log's relative path/name.
 */
export class AgentLogService {
  async list(provider: LogProvider, cwd: string): Promise<AgentLogFile[]> {
    return provider === 'codex' ? listCodexLogs(cwd) : listClaudeLogs(cwd);
  }

  async read(provider: LogProvider, cwd: string, filename: string): Promise<string> {
    if (provider === 'codex') {
      const filePath = await resolveCodexLogPath(filename);
      if (!(await fileMatchesCwd(filePath, cwd.trim()))) {
        throw new Error('log file does not belong to the provided cwd');
      }
      return readWhole(filePath);
    }
    return readWhole(resolveClaudeLogPath(cwd, filename));
  }

  async tail(provider: LogProvider, cwd: string, filename: string, offset: number): Promise<LogTailResult> {
    if (provider === 'codex') {
      const filePath = await resolveCodexLogPath(filename);
      if (!(await fileMatchesCwd(filePath, cwd.trim()))) {
        throw new Error('log file does not belong to the provided cwd');
      }
      return tail(filePath, offset);
    }
    return tail(resolveClaudeLogPath(cwd, filename), offset);
  }
}
