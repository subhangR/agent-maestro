import { readFile, readdir, stat, open } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { SessionService } from './SessionService';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';

// ── Types ────────────────────────────────────────────────────

export interface TextEntry {
  timestamp: number;
  text: string;
  source: 'assistant' | 'user';
}

export interface StuckSignal {
  silentDurationMs: number;
  toolCallsSinceLastText: number;
  warning: string;
}

export interface TextOnlyDigest {
  sessionId: string;
  workerName?: string;
  taskIds: string[];
  state: 'active' | 'idle' | 'needs_input';
  entries: TextEntry[];
  stuck: StuckSignal | null;
  lastActivityTimestamp: number;
  summary?: string;
}

export interface SessionStatsDigest {
  sessionId: string;
  source: 'claude' | 'codex' | null;
  jsonlFound: boolean;
  partial: boolean;             // True when file was too large and we truncated
  tokens: {
    input: number;
    output: number;
    cacheCreate: number;
    cacheRead: number;
    total: number;
  };
  messageCount: {
    user: number;
    assistant: number;
    total: number;
  };
  toolCallCount: number;
  toolUsage: Array<{ name: string; count: number }>;
  models: string[];
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  lastMessages: TextEntry[];
}

// ── Internal cache type ──────────────────────────────────────

interface PathCacheEntry {
  path: string;
  source: 'claude' | 'codex';
  resolvedAt: number;
}

const PATH_CACHE_TTL_MS = 60_000; // 60s
const TAIL_BYTES = 100 * 1024;    // 100KB tail
const MAX_TAIL_BYTES = 1024 * 1024; // 1MB fallback tail for large tool outputs
const MAX_TEXT_LENGTH = 150;
const CODEX_IDENTITY_HEAD_BYTES = 256 * 1024;
const CODEX_IDENTITY_EXTENDED_HEAD_BYTES = 1024 * 1024;

// ── Tags & patterns to filter out ────────────────────────────

const NOISE_TAG_PATTERNS = [
  /<system-reminder>/,
  /<local-command>/,
  /<local-command-caveat>/,
  /<teammate-message/,
];

const SESSION_ID_REGEX = /<session_id>(sess_[^<]+)<\/session_id>/;
const CODEX_EVENT_NOISE_TYPES = new Set([
  'agent_reasoning',
  'token_count',
  'task_started',
  'turn_context',
  'user_message',
]);
const CODEX_MESSAGE_TEXT_TYPES = new Set([
  'output_text',
  'input_text',
  'text',
  'summary_text',
]);

/**
 * Extract the Codex native session id (the rollout UUID required by
 * `codex resume <SESSION_ID>`) from the head of a rollout `.jsonl` file.
 *
 * A Codex rollout's first line is a `session_meta` record whose `payload.id`
 * is the thread UUID Codex itself assigns (Codex cannot be pre-seeded with an
 * id, so this is the only authoritative source). Pure and side-effect free so
 * the parse can be unit-tested without touching the filesystem.
 */
export function extractCodexSessionIdFromRolloutHead(head: string): string | null {
  for (const raw of head.split('\n')) {
    const line = raw.trim();
    if (!line || !line.includes('"type":"session_meta"')) continue;
    try {
      const parsed = JSON.parse(line);
      const id = parsed?.payload?.id;
      if (typeof id === 'string' && id.trim()) return id.trim();
    } catch {
      // Truncated/partial trailing line in the head window — skip it.
    }
  }
  return null;
}

export interface CodexRolloutIdentity {
  codexSessionId: string;
  maestroSessionId: string;
  cwd: string | null;
  timestamp: number | null;
}

/**
 * Pair a Codex-native rollout id with the Maestro session that owns it.
 *
 * Ownership is accepted only from a user-message task envelope. Raw substring
 * matching is unsafe because coordinator tool calls and command output routinely
 * mention child session ids inside unrelated rollouts.
 */
export function extractCodexRolloutIdentityFromHead(head: string): CodexRolloutIdentity | null {
  let codexSessionId: string | null = null;
  let maestroSessionId: string | null = null;
  let cwd: string | null = null;
  let timestamp: number | null = null;

  for (const raw of head.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A bounded head read can end with a partial JSONL record.
      continue;
    }

    if (parsed?.type === 'session_meta' && !codexSessionId) {
      const nativeId = parsed?.payload?.id;
      if (typeof nativeId === 'string' && nativeId.trim()) {
        codexSessionId = nativeId.trim();
      }
      const metaCwd = parsed?.payload?.cwd;
      cwd = typeof metaCwd === 'string' && metaCwd.trim() ? metaCwd.trim() : null;
      const parsedTimestamp = new Date(parsed?.timestamp ?? parsed?.payload?.timestamp ?? '').getTime();
      timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
      continue;
    }

    const payload = parsed?.type === 'response_item' ? parsed?.payload : null;
    if (payload?.type !== 'message' || payload?.role !== 'user') continue;

    const content = payload.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
          .map((block: any) => typeof block?.text === 'string' ? block.text : '')
          .filter(Boolean)
          .join('\n')
        : '';
    const match = text.match(SESSION_ID_REGEX);
    if (match) {
      maestroSessionId = match[1];
      break;
    }
  }

  if (!codexSessionId || !maestroSessionId) return null;
  return { codexSessionId, maestroSessionId, cwd, timestamp };
}

/**
 * Stateless, on-demand service for reading Claude session JSONL logs
 * and producing text-only digests for coordinator observation.
 */
export class LogDigestService {
  private pathCache = new Map<string, PathCacheEntry>();
  private static readonly MAX_PATH_CACHE_SIZE = 500;

  constructor(
    private sessionService: SessionService,
    private projectRepo: IProjectRepository,
  ) {}

  /**
   * Clear the path cache. Called during container shutdown.
   */
  shutdown(): void {
    this.pathCache.clear();
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Get a text-only digest for a single session.
   * @param options.last - Number of entries to return (default 5)
   * @param options.maxLength - Max chars per entry (0 = unlimited, undefined = default 150)
   */
  async getDigest(sessionId: string, options: { last?: number; maxLength?: number } = {}): Promise<TextOnlyDigest> {
    const last = options.last ?? 5;

    // Fetch session metadata
    const session = await this.sessionService.getSession(sessionId);
    const project = session.projectId ? await this.projectRepo.findById(session.projectId) : null;

    // Resolve JSONL file path
    const jsonlPath = await this.resolveJsonlPath(sessionId, project?.workingDir);

    if (!jsonlPath) {
      return this.emptyDigest(sessionId, session);
    }

    // Read tail of JSONL file
    const lines = await this.readTail(jsonlPath);

    // Determine effective max text length (0 = unlimited, undefined = default)
    const effectiveMaxLength = options.maxLength !== undefined ? options.maxLength : MAX_TEXT_LENGTH;

    // Extract text entries
    const allEntries = this.extractTextEntries(lines, effectiveMaxLength);

    // Detect stuck signal
    const stuck = this.detectStuck(lines);

    // Get last N entries
    const entries = allEntries.slice(-last);

    // Determine state from session status
    const state = this.mapSessionState(session.status, session.needsInput);

    // End-of-job summary (idle sessions only; deterministic, no LLM)
    const summary = this.synthesizeSummary(lines, state, allEntries);

    return {
      sessionId,
      workerName: session.teamMemberSnapshot?.name || session.name,
      taskIds: session.taskIds || [],
      state,
      entries,
      stuck,
      lastActivityTimestamp: entries.length > 0
        ? entries[entries.length - 1].timestamp
        : session.lastActivity || Date.now(),
      summary,
    };
  }

  /**
   * Compute a comprehensive stats digest from the full JSONL transcript.
   * Returns token totals, message/tool counts, last N messages, etc.
   *
   * Reads up to MAX_STATS_FILE_BYTES (default 25MB) of the file in one shot.
   * For larger files we still return what we can, with `partial=true`.
   */
  async getSessionStats(
    sessionId: string,
    options: { lastMessages?: number } = {},
  ): Promise<SessionStatsDigest> {
    const lastMessages = options.lastMessages ?? 10;
    const session = await this.sessionService.getSession(sessionId);
    const project = session.projectId ? await this.projectRepo.findById(session.projectId) : null;
    const jsonlPath = await this.resolveJsonlPath(sessionId, project?.workingDir);

    const empty: SessionStatsDigest = {
      sessionId,
      source: null,
      jsonlFound: false,
      partial: false,
      tokens: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
      messageCount: { user: 0, assistant: 0, total: 0 },
      toolCallCount: 0,
      toolUsage: [],
      models: [],
      firstMessageAt: null,
      lastMessageAt: null,
      lastMessages: [],
    };

    if (!jsonlPath) return empty;

    const MAX_STATS_FILE_BYTES = 25 * 1024 * 1024;
    let content: string;
    let partial = false;
    try {
      const fileStats = await stat(jsonlPath);
      if (fileStats.size > MAX_STATS_FILE_BYTES) {
        const fh = await open(jsonlPath, 'r');
        try {
          const buf = Buffer.alloc(MAX_STATS_FILE_BYTES);
          const offset = fileStats.size - MAX_STATS_FILE_BYTES;
          const { bytesRead } = await fh.read(buf, 0, MAX_STATS_FILE_BYTES, offset);
          content = buf.toString('utf-8', 0, bytesRead);
        } finally {
          await fh.close();
        }
        partial = true;
      } else {
        content = await readFile(jsonlPath, 'utf-8');
      }
    } catch {
      return empty;
    }

    const lines: any[] = [];
    const rawLines = content.split('\n');
    // If partial, drop the first (likely truncated) line.
    const startIdx = partial ? 1 : 0;
    for (let i = startIdx; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {
        // skip malformed
      }
    }

    const source: 'claude' | 'codex' = this.isCodexLog(lines) ? 'codex' : 'claude';

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreate = 0;
    let cacheRead = 0;
    let userCount = 0;
    let assistantCount = 0;
    let toolCallCount = 0;
    const toolCounts = new Map<string, number>();
    const models = new Set<string>();
    let firstMessageAt: number | null = null;
    let lastMessageAt: number | null = null;

    const noteTimestamp = (ts: number) => {
      if (!Number.isFinite(ts) || ts <= 0) return;
      if (firstMessageAt === null || ts < firstMessageAt) firstMessageAt = ts;
      if (lastMessageAt === null || ts > lastMessageAt) lastMessageAt = ts;
    };

    if (source === 'claude') {
      for (const line of lines) {
        const ts = line?.timestamp ? new Date(line.timestamp).getTime() : 0;
        const type = line?.type;

        if (type === 'assistant') {
          assistantCount++;
          noteTimestamp(ts);
          const message = line.message ?? line;
          const usage = message?.usage;
          if (usage && typeof usage === 'object') {
            inputTokens += Number(usage.input_tokens) || 0;
            outputTokens += Number(usage.output_tokens) || 0;
            cacheCreate += Number(usage.cache_creation_input_tokens) || 0;
            cacheRead += Number(usage.cache_read_input_tokens) || 0;
          }
          if (typeof message?.model === 'string') models.add(message.model);
          const content = message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'tool_use') {
                toolCallCount++;
                const name = typeof block.name === 'string' ? block.name : 'unknown';
                toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
              }
            }
          }
        } else if (type === 'user') {
          // Skip synthetic user messages that wrap tool_result content.
          const content = line.message?.content ?? line.content;
          let isToolResultOnly = false;
          if (Array.isArray(content)) {
            isToolResultOnly = content.every(
              (b: any) => b?.type === 'tool_result' || b?.type === 'tool_use',
            );
          }
          if (!isToolResultOnly) {
            userCount++;
            noteTimestamp(ts);
          }
        }
      }
    } else {
      for (const line of lines) {
        const ts = this.parseTimestamp(line, 0);
        const lineType = line?.type;
        if (lineType === 'function_call') {
          toolCallCount++;
          const name = typeof line.name === 'string' ? line.name : 'unknown';
          toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
        } else if (lineType === 'response_item' && line?.payload?.type === 'function_call') {
          toolCallCount++;
          const name = typeof line.payload.name === 'string' ? line.payload.name : 'unknown';
          toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
        } else {
          const msg = this.getCodexMessage(line);
          if (msg) {
            if (msg.role === 'assistant') {
              assistantCount++;
              noteTimestamp(ts);
            } else if (msg.role === 'user') {
              userCount++;
              noteTimestamp(ts);
            }
          }
        }
        const payloadModel = line?.payload?.model;
        if (typeof payloadModel === 'string') models.add(payloadModel);
      }
    }

    const total = inputTokens + outputTokens + cacheCreate + cacheRead;
    const toolUsage = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const allEntries = this.extractTextEntries(lines, 220);
    const lastEntries = allEntries.slice(-lastMessages);

    return {
      sessionId,
      source,
      jsonlFound: true,
      partial,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        cacheCreate,
        cacheRead,
        total,
      },
      messageCount: {
        user: userCount,
        assistant: assistantCount,
        total: userCount + assistantCount,
      },
      toolCallCount,
      toolUsage,
      models: Array.from(models),
      firstMessageAt,
      lastMessageAt,
      lastMessages: lastEntries,
    };
  }

  /**
   * Get digests for multiple sessions in parallel.
   */
  async getDigests(sessionIds: string[], options: { last?: number; maxLength?: number } = {}): Promise<TextOnlyDigest[]> {
    return Promise.all(
      sessionIds.map(id => this.getDigest(id, options).catch(() => this.fallbackDigest(id)))
    );
  }

  /**
   * Get digests for all workers under a coordinator session.
   */
  async getWorkerDigests(coordinatorSessionId: string, options: { last?: number; maxLength?: number } = {}): Promise<TextOnlyDigest[]> {
    // List sessions spawned by this coordinator
    const sessions = await this.sessionService.listSessions({
      parentSessionId: coordinatorSessionId,
    });

    // Filter to active sessions
    const activeIds = sessions
      .filter(s => s.status !== 'completed' && s.status !== 'failed' && s.status !== 'stopped')
      .map(s => s.id);

    if (activeIds.length === 0) {
      return [];
    }

    return this.getDigests(activeIds, options);
  }

  // ── File Discovery ───────────────────────────────────────

  /**
   * Resolve the JSONL log file path for a session ID.
   * Uses a 60s path cache to avoid repeated filesystem scans.
   */
  private async resolveJsonlPath(sessionId: string, workingDir?: string | null): Promise<string | null> {
    // Check cache
    const cached = this.pathCache.get(sessionId);
    if (cached && (Date.now() - cached.resolvedAt) < PATH_CACHE_TTL_MS) {
      // Verify file still exists
      try {
        await stat(cached.path);
        return cached.path;
      } catch {
        this.pathCache.delete(sessionId);
      }
    }

    // Scan Claude JSONL files
    const projectsDirs = await this.getClaudeProjectsDirs(workingDir);

    for (const dir of projectsDirs) {
      try {
        const files = await readdir(dir);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

        for (const file of jsonlFiles) {
          const filePath = join(dir, file);
          try {
            // Read first 256KB to find session ID
            const header = await this.readHead(filePath, 256 * 1024);
            const match = header.match(SESSION_ID_REGEX);
            if (match && match[1] === sessionId) {
              this.pathCache.set(sessionId, { path: filePath, source: 'claude', resolvedAt: Date.now() });
              this.evictOldestIfOverLimit();
              return filePath;
            }
          } catch {
            // Skip unreadable files
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    return this.resolveCodexJsonlPath(sessionId, workingDir);
  }

  /**
   * Resolve a Codex rollout by authoritative task-envelope ownership.
   *
   * If the legacy fresh-start fallback produced several owned rollouts under
   * one Maestro id, prefer the newest rollout in the session's actual cwd: that
   * is the conversation that was active immediately before the next stop.
   */
  private async resolveCodexJsonlPath(
    sessionId: string,
    workingDir?: string | null,
  ): Promise<string | null> {
    const candidates: Array<{
      path: string;
      head: string;
      identity: CodexRolloutIdentity;
      cwdMatches: boolean;
    }> = [];
    const codexFiles = await this.getCodexSessionFiles();
    for (const filePath of codexFiles) {
      try {
        let head = await this.readHead(filePath, CODEX_IDENTITY_HEAD_BYTES);
        let identity = extractCodexRolloutIdentityFromHead(head);
        if (!identity && head.includes('"type":"session_meta"')) {
          head = await this.readHead(filePath, CODEX_IDENTITY_EXTENDED_HEAD_BYTES);
          identity = extractCodexRolloutIdentityFromHead(head);
        }
        if (!identity || identity.maestroSessionId !== sessionId) continue;
        candidates.push({
          path: filePath,
          head,
          identity,
          cwdMatches: !workingDir || identity.cwd === workingDir,
        });
      } catch {
        // Skip unreadable files
      }
    }

    const selected = candidates.sort((a, b) => {
      if (a.cwdMatches !== b.cwdMatches) return a.cwdMatches ? -1 : 1;
      const timestampDelta = (b.identity.timestamp ?? 0) - (a.identity.timestamp ?? 0);
      if (timestampDelta !== 0) return timestampDelta;
      return b.path.localeCompare(a.path);
    })[0];
    if (!selected) return null;

    this.pathCache.set(sessionId, { path: selected.path, source: 'codex', resolvedAt: Date.now() });
    this.evictOldestIfOverLimit();
    await this.captureCodexSessionId(sessionId, selected.head);
    return selected.path;
  }

  /**
   * Best-effort eager capture of the native Codex rollout id onto the session's
   * metadata. Idempotent and corrective: authoritative ownership may repair a
   * value captured by the legacy raw-substring resolver.
   */
  private async captureCodexSessionId(sessionId: string, rolloutHead: string): Promise<void> {
    try {
      const codexId = extractCodexSessionIdFromRolloutHead(rolloutHead);
      if (!codexId) return;
      const session = await this.sessionService.getSession(sessionId);
      if (!session || session.metadata?.codexSessionId === codexId) return;
      await this.sessionService.updateSession(sessionId, {
        metadata: { ...session.metadata, codexSessionId: codexId },
      });
    } catch {
      // Backstop: resume-time resolveCodexSessionId re-scans the rollout.
    }
  }

  /**
   * Resolve the Codex native session id (the rollout `session_meta.payload.id`)
   * for a Maestro session, so a resume can run `codex resume <id>` against the
   * exact prior thread.
   *
   * This reuses the same rollout lookup as digests: the rollout file is located
   * by the `<session_id>sess_…</session_id>` marker Maestro injects into the
   * Codex prompt, then its `session_meta` head record is parsed. Codex assigns
   * this id itself and it cannot be pre-seeded, so it only exists once Codex has
   * written a rollout for the session. Returns null when no matching rollout is
   * found. Callers must fail closed rather than fabricate an id, guess with
   * `codex resume --last`, or silently fresh-start.
   */
  async resolveCodexSessionId(sessionId: string, workingDir?: string | null): Promise<string | null> {
    const jsonlPath = await this.resolveCodexJsonlPath(sessionId, workingDir);
    if (!jsonlPath) return null;
    try {
      const head = await this.readHead(jsonlPath, 1024 * 1024);
      return extractCodexSessionIdFromRolloutHead(head);
    } catch {
      return null;
    }
  }

  /**
   * Get possible Claude projects directories to scan.
   * Encodes the working directory path: / → -
   */
  private async getClaudeProjectsDirs(workingDir?: string | null): Promise<string[]> {
    const claudeProjectsBase = join(homedir(), '.claude', 'projects');
    const dirs: string[] = [];

    if (workingDir) {
      // Encode path: / → - (mirrors Rust extract_maestro_session_id)
      const encoded = workingDir.replace(/\//g, '-');
      // Remove leading dash if present
      const cleanEncoded = encoded.startsWith('-') ? encoded.slice(1) : encoded;
      dirs.push(join(claudeProjectsBase, cleanEncoded));
    }

    // Also try to scan all project directories as fallback
    try {
      const allDirs = await readdir(claudeProjectsBase);
      for (const d of allDirs) {
        const fullPath = join(claudeProjectsBase, d);
        try {
          const s = await stat(fullPath);
          if (s.isDirectory() && !dirs.includes(fullPath)) {
            dirs.push(fullPath);
          }
        } catch {
          // skip
        }
      }
    } catch {
      // ~/.claude/projects doesn't exist
    }

    return dirs;
  }

  /**
   * Enumerate Codex JSONL session files recursively from ~/.codex/sessions.
   */
  private async getCodexSessionFiles(): Promise<string[]> {
    const root = join(homedir(), '.codex', 'sessions');
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries: string[] = [];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }

      await Promise.all(entries.map(async (name) => {
        const fullPath = join(dir, name);
        try {
          const s = await stat(fullPath);
          if (s.isDirectory()) {
            await walk(fullPath);
            return;
          }
          if (s.isFile() && name.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        } catch {
          // skip
        }
      }));
    };

    await walk(root);
    return files;
  }

  // ── File Reading ─────────────────────────────────────────

  /**
   * Read the first N bytes of a file.
   */
  private async readHead(filePath: string, bytes: number): Promise<string> {
    const fh = await open(filePath, 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.toString('utf-8', 0, bytesRead);
    } finally {
      await fh.close();
    }
  }

  /**
   * Read the tail of a JSONL file (last ~100KB, then up to 1MB fallback).
   * Returns parsed JSONL lines (drops first potentially truncated line).
   */
  private async readTail(filePath: string): Promise<any[]> {
    const fileStats = await stat(filePath);
    const fileSize = fileStats.size;

    let windowBytes = Math.min(TAIL_BYTES, fileSize || TAIL_BYTES);
    let parsed: any[] = [];

    // Retry with larger windows when tail is dominated by oversized tool output lines.
    while (true) {
      parsed = await this.readTailWindow(filePath, fileSize, windowBytes);
      const reachedLimit = windowBytes >= MAX_TAIL_BYTES || windowBytes >= fileSize;
      if (parsed.length > 0 || reachedLimit) {
        return parsed;
      }
      windowBytes = Math.min(fileSize, windowBytes * 2, MAX_TAIL_BYTES);
    }
  }

  private async readTailWindow(filePath: string, fileSize: number, windowBytes: number): Promise<any[]> {
    let content: string;
    const offset = Math.max(0, fileSize - windowBytes);

    if (offset === 0) {
      // File is small enough to read entirely
      content = await readFile(filePath, 'utf-8');
    } else {
      const fh = await open(filePath, 'r');
      try {
        const buf = Buffer.alloc(windowBytes);
        const { bytesRead } = await fh.read(buf, 0, windowBytes, offset);
        content = buf.toString('utf-8', 0, bytesRead);
      } finally {
        await fh.close();
      }
    }

    const rawLines = content.split('\n').filter(l => l.trim());

    // Drop first line if we seeked (it's likely truncated)
    const lines = offset > 0 ? rawLines.slice(1) : rawLines;

    const parsed: any[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    return parsed;
  }

  // ── Text Extraction ──────────────────────────────────────

  /**
   * Extract text entries from parsed JSONL lines.
   * Keeps only human-readable text, filters noise.
   * @param maxLength - 0 for unlimited, positive number for max chars per entry
   */
  private extractTextEntries(lines: any[], maxLength: number = MAX_TEXT_LENGTH): TextEntry[] {
    if (this.isCodexLog(lines)) {
      return this.extractCodexTextEntries(lines, maxLength);
    }

    // Claude format
    const entries: TextEntry[] = [];

    for (const line of lines) {
      const type = line.type;
      const timestamp = line.timestamp ? new Date(line.timestamp).getTime() : Date.now();

      if (type === 'assistant') {
        const texts = this.extractAssistantText(line, maxLength);
        for (const text of texts) {
          if (text) {
            entries.push({ timestamp, text, source: 'assistant' });
          }
        }
      } else if (type === 'user') {
        const text = this.extractUserText(line, maxLength);
        if (text) {
          entries.push({ timestamp, text, source: 'user' });
        }
      }
    }

    return entries;
  }

  /**
   * Extract human-readable text entries from Codex JSONL.
   */
  private extractCodexTextEntries(lines: any[], maxLength: number = MAX_TEXT_LENGTH): TextEntry[] {
    const entries: TextEntry[] = [];

    for (const line of lines) {
      const timestamp = this.parseTimestamp(line, Date.now());
      const lineType = line?.type;

      if (lineType === 'event_msg') {
        const eventText = this.extractCodexEventText(line?.payload);
        if (!eventText) continue;

        const firstLine = this.prepareForChat(eventText, maxLength);
        if (!firstLine) continue;

        this.pushEntry(entries, {
          timestamp,
          text: firstLine,
          source: 'assistant',
        });
        continue;
      }

      const message = this.getCodexMessage(line);
      if (!message) continue;

      const role = message.role;
      const text = this.extractCodexMessageText(message.content);

      if (!text) continue;

      if (role === 'assistant') {
        const firstLine = this.prepareForChat(text, maxLength);
        if (firstLine) {
          this.pushEntry(entries, {
            timestamp,
            text: firstLine,
            source: 'assistant',
          });
        }
      } else if (role === 'user') {
        const cleaned = this.humanizeUserPrompt(text);
        if (cleaned && cleaned.length >= 3) {
          this.pushEntry(entries, {
            timestamp,
            text: this.truncateText(cleaned, maxLength),
            source: 'user',
          });
        }
      }
    }

    return entries;
  }

  private isCodexLog(lines: any[]): boolean {
    return lines.some((line) => this.isCodexLine(line));
  }

  private isCodexLine(line: any): boolean {
    if (!line || typeof line !== 'object') return false;

    const type = line.type;
    if (
      type === 'response_item'
      || type === 'session_meta'
      || type === 'event_msg'
      || type === 'function_call'
      || type === 'function_call_output'
      || type === 'reasoning'
    ) {
      return true;
    }

    if (type === 'message' && (line.role === 'assistant' || line.role === 'user')) {
      return true;
    }

    return line.record_type === 'state';
  }

  private getCodexMessage(line: any): { role: string; content: any } | null {
    if (!line || typeof line !== 'object') return null;

    if (line.type === 'response_item') {
      const payload = line.payload || {};
      if (payload.type === 'message' && payload.role) {
        return { role: payload.role, content: payload.content };
      }
      return null;
    }

    if (line.type === 'message' && line.role) {
      return { role: line.role, content: line.content };
    }

    return null;
  }

  private extractCodexMessageText(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';

    return content
      .filter((block: any) => CODEX_MESSAGE_TEXT_TYPES.has(String(block?.type ?? '')))
      .map((block: any) => String(block?.text ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private extractCodexEventText(payload: any): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const eventType = String(payload.type ?? '');
    if (CODEX_EVENT_NOISE_TYPES.has(eventType)) return null;

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }

    return null;
  }

  private parseTimestamp(line: any, fallback: number): number {
    if (!line?.timestamp) return fallback;
    const parsed = new Date(line.timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private pushEntry(entries: TextEntry[], entry: TextEntry): void {
    const prev = entries.length > 0 ? entries[entries.length - 1] : null;
    if (
      prev
      && prev.source === entry.source
      && prev.text === entry.text
      && Math.abs(prev.timestamp - entry.timestamp) <= 1000
    ) {
      return;
    }
    entries.push(entry);
  }

  /**
   * Extract readable text from an assistant message.
   * Only keeps type: 'text' blocks. Drops thinking, tool_use, tool_result.
   * Strips markdown noise and returns the first meaningful line/sentence.
   */
  private extractAssistantText(line: any, maxLength: number = MAX_TEXT_LENGTH): string[] {
    const message = line.message || line;
    const content = message.content;

    if (!content) return [];

    if (typeof content === 'string') {
      const firstLine = this.prepareForChat(content, maxLength);
      return firstLine ? [firstLine] : [];
    }

    if (Array.isArray(content)) {
      const texts: string[] = [];
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          const firstLine = this.prepareForChat(block.text, maxLength);
          if (firstLine) {
            texts.push(firstLine);
          }
        }
      }
      return texts;
    }

    return [];
  }

  /**
   * Extract readable text from a user message.
   * Filters out meta/system messages.
   */
  private extractUserText(line: any, maxLength: number = MAX_TEXT_LENGTH): string | null {
    const message = line.message || line;
    const content = message.content;

    if (!content) return null;

    let text: string;
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      // Concatenate text blocks only
      text = content
        .filter((b: any) => b.type === 'text' && b.text)
        .map((b: any) => b.text)
        .join(' ');
    } else {
      return null;
    }

    const humanized = this.humanizeUserPrompt(text);
    if (!humanized) return null;

    // Filter noise tags
    for (const pattern of NOISE_TAG_PATTERNS) {
      if (pattern.test(humanized)) {
        return null;
      }
    }

    // Skip empty or very short messages
    const cleaned = humanized.trim();
    if (cleaned.length < 3) return null;

    return this.truncateText(cleaned, maxLength);
  }

  /**
   * Turn Maestro's injected XML envelopes into user-facing prose. These
   * envelopes are useful to the agent but should never be rendered as chat.
   */
  private humanizeUserPrompt(text: string): string | null {
    const taskBlock = text.match(/<maestro_task_prompt\b[^>]*>[\s\S]*?<\/maestro_task_prompt>/i)?.[0];
    let taskSummary = '';

    if (taskBlock) {
      const title = this.decodeXmlText(taskBlock.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
      const description = this.decodeXmlText(taskBlock.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
      if (title) {
        taskSummary = `Task: ${title}`;
        if (description && description.toLocaleLowerCase() !== title.toLocaleLowerCase()) {
          taskSummary += ` — ${description}`;
        }
      }
    }

    let remaining = text
      .replace(/<environment_context\b[^>]*>[\s\S]*?<\/environment_context>/gi, '')
      .replace(/<maestro_task_prompt\b[^>]*>[\s\S]*?<\/maestro_task_prompt>/gi, '')
      .trim();

    // Fail closed for malformed or partial internal markup: raw tags are more
    // confusing than omitting a non-human transcript entry.
    if (/<(?:maestro_|environment_context\b|identity_kernel\b|mode_identity\b)/i.test(remaining)) {
      remaining = '';
    }

    const readable = [taskSummary, remaining].filter(Boolean).join('\n');
    return readable || null;
  }

  private decodeXmlText(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Strip markdown formatting from text (code fences, bold, italic, headings).
   * Keeps the readable prose, removes the syntax noise.
   */
  private stripMarkdown(text: string): string {
    let cleaned = text;
    // Remove code fence blocks entirely (they're rarely the meaningful step)
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '').trim();
    // Inline code — keep inner text
    cleaned = cleaned.replace(/`([^`\n]+)`/g, '$1');
    // Bold/italic — keep inner text
    cleaned = cleaned.replace(/\*{1,3}([^*\n]*?)\*{1,3}/g, '$1');
    cleaned = cleaned.replace(/_{1,3}([^_\n]*?)_{1,3}/g, '$1');
    // Heading markers
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    // Blockquote markers
    cleaned = cleaned.replace(/^>\s*/gm, '');
    // Normalize whitespace
    cleaned = cleaned.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
  }

  /**
   * Extract the first line of text that carries meaningful content.
   * Skips blank lines, pure punctuation, and list-marker-only lines.
   */
  private extractFirstMeaningfulLine(text: string): string {
    const lines = text.split('\n');
    for (const line of lines) {
      // Strip leading list/quote markers
      const trimmed = line.replace(/^[\s\-*•>|]+/, '').trim();
      // Must have enough substance to be readable
      if (trimmed.length >= 10) {
        return trimmed;
      }
    }
    // Fallback: collapse entire text to a single line
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Full assistant-text cleaning pipeline: XML noise → markdown → first meaningful line → truncate.
   * Used for both Claude and Codex assistant text entries so chat shows concise step updates.
   */
  private prepareForChat(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
    const xmlCleaned = this.cleanText(text);
    if (!xmlCleaned) return '';
    const mdCleaned = this.stripMarkdown(xmlCleaned);
    if (!mdCleaned) return '';
    const firstLine = this.extractFirstMeaningfulLine(mdCleaned);
    if (!firstLine) return '';
    return this.truncateText(firstLine, maxLength);
  }

  /**
   * Synthesize a plain-language end-of-job summary for idle sessions.
   * Deterministic: derived from tool-call count and last assistant text in the tail.
   * Returns undefined for active sessions (still in progress).
   */
  private synthesizeSummary(lines: any[], state: string, allEntries: TextEntry[]): string | undefined {
    if (state === 'active') return undefined;

    // Count tool calls visible in the transcript tail
    let toolCallCount = 0;
    if (this.isCodexLog(lines)) {
      for (const line of lines) {
        if (line?.type === 'function_call') toolCallCount++;
        if (line?.type === 'response_item' && line?.payload?.type === 'function_call') toolCallCount++;
      }
    } else {
      for (const line of lines) {
        if (line?.type !== 'assistant') continue;
        const content = line.message?.content || line.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'tool_use') toolCallCount++;
          }
        }
      }
    }

    // Last substantive assistant text (already cleaned by extractAssistantText)
    let lastAssistantText = '';
    for (let i = allEntries.length - 1; i >= 0; i--) {
      const entry = allEntries[i];
      if (entry.source === 'assistant' && entry.text.trim().length >= 15) {
        lastAssistantText = entry.text.trim();
        break;
      }
    }

    const prefix = state === 'needs_input' ? 'Waiting for input' : 'Completed';

    const parts: string[] = [];
    if (toolCallCount > 0) {
      parts.push(`${toolCallCount} tool call${toolCallCount !== 1 ? 's' : ''}`);
    }
    if (lastAssistantText) {
      const snippet = lastAssistantText.length > 120
        ? lastAssistantText.substring(0, 120) + '...'
        : lastAssistantText;
      parts.push(snippet);
    }

    if (parts.length === 0) return prefix;
    return `${prefix} — ${parts.join(' — ')}`;
  }

  /**
   * Clean text by removing noise tags and trimming.
   */
  private cleanText(text: string): string {
    let cleaned = text.trim();

    // Remove system-reminder blocks
    cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
    // Remove local-command blocks
    cleaned = cleaned.replace(/<local-command>[\s\S]*?<\/local-command>/g, '').trim();
    // Remove local-command-caveat blocks
    cleaned = cleaned.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '').trim();

    return cleaned;
  }

  /**
   * Truncate text to first sentence or maxLength chars.
   * @param maxLength - 0 for unlimited, positive number for max chars
   */
  private truncateText(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
    // 0 means unlimited — return full text
    if (maxLength === 0) {
      return text;
    }

    // Get first sentence
    const sentenceEnd = text.search(/[.!?]\s/);
    if (sentenceEnd > 0 && sentenceEnd < maxLength) {
      return text.substring(0, sentenceEnd + 1);
    }

    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + '...';
  }

  // ── Stuck Detection ──────────────────────────────────────

  /**
   * Detect if a worker is stuck: many tool calls with no recent text output.
   *
   * Scans backwards from the most recent entry to find consecutive tool calls
   * without any intervening text. Uses Date.now() for real-time silence
   * measurement so a completely idle worker (no new JSONL writes) is still
   * detected as stuck.
   */
  private detectStuck(lines: any[]): StuckSignal | null {
    if (this.isCodexLog(lines)) {
      return this.detectCodexStuck(lines);
    }

    const STUCK_TOOL_CALL_THRESHOLD = 5;
    const STUCK_SILENCE_MS = 30_000; // 30 seconds

    let toolCallsSinceLastText = 0;
    let lastTextTimestamp = 0;
    // Track the most recent tool call timestamp: scanning backwards, the first
    // tool-use entry we encounter IS the most recent one.
    let lastToolCallTimestamp = 0;

    // Scan backwards from most recent to count tool calls since last text
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      if (line.type === 'assistant') {
        const content = line.message?.content || line.content;
        if (Array.isArray(content)) {
          const hasText = content.some((b: any) => b.type === 'text' && b.text?.trim());
          const hasToolUse = content.some((b: any) => b.type === 'tool_use');

          if (hasText) {
            lastTextTimestamp = line.timestamp ? new Date(line.timestamp).getTime() : 0;
            break; // Found last text entry — stop counting
          }
          if (hasToolUse) {
            toolCallsSinceLastText++;
            // The first tool-use found in the backwards scan is the most recent one.
            if (lastToolCallTimestamp === 0) {
              lastToolCallTimestamp = line.timestamp ? new Date(line.timestamp).getTime() : 0;
            }
          }
        }
      }
    }

    if (toolCallsSinceLastText <= STUCK_TOOL_CALL_THRESHOLD) {
      return null;
    }

    // Use real-time measurement so a completely silent worker is always detected.
    // If lastTextTimestamp is 0 (no text found in tail window), the silence
    // duration is unknown — fire without the time guard.
    const silentDurationMs = lastTextTimestamp > 0 ? Date.now() - lastTextTimestamp : 0;

    if (lastTextTimestamp > 0 && silentDurationMs < STUCK_SILENCE_MS) {
      return null; // Recent text found — not stuck yet
    }

    // If tool calls are still arriving recently, the agent is actively working, not stuck.
    // An agent making rapid tool calls with no narration is the MOST productive state —
    // only escalate to stuck when BOTH text AND tool calls have fallen silent.
    const toolCallSilentMs = lastToolCallTimestamp > 0 ? Date.now() - lastToolCallTimestamp : 0;
    if (lastToolCallTimestamp > 0 && toolCallSilentMs < STUCK_SILENCE_MS) {
      return null; // Tool calls still arriving — not stuck
    }

    return {
      silentDurationMs,
      toolCallsSinceLastText,
      warning: `Worker has made ${toolCallsSinceLastText} tool calls without printing status text.`,
    };
  }

  /**
   * Detect stuck signal for Codex JSONL.
   */
  private detectCodexStuck(lines: any[]): StuckSignal | null {
    const STUCK_TOOL_CALL_THRESHOLD = 5;
    const STUCK_SILENCE_MS = 30_000; // 30 seconds

    let toolCallsSinceLastText = 0;
    let lastTextTimestamp = 0;
    // Track the most recent tool call timestamp: scanning backwards, the first
    // tool-use entry we encounter IS the most recent one.
    let lastToolCallTimestamp = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      if (line?.type === 'event_msg') {
        const eventText = this.extractCodexEventText(line?.payload);
        if (eventText) {
          lastTextTimestamp = this.parseTimestamp(line, 0);
          break;
        }
        continue;
      }

      const message = this.getCodexMessage(line);
      if (message?.role === 'assistant') {
        const text = this.cleanText(this.extractCodexMessageText(message.content));
        if (text) {
          lastTextTimestamp = this.parseTimestamp(line, 0);
          break;
        }
      }

      if (line?.type === 'function_call') {
        toolCallsSinceLastText++;
        if (lastToolCallTimestamp === 0) {
          lastToolCallTimestamp = this.parseTimestamp(line, 0);
        }
        continue;
      }

      if (line?.type === 'response_item' && line?.payload?.type === 'function_call') {
        toolCallsSinceLastText++;
        if (lastToolCallTimestamp === 0) {
          lastToolCallTimestamp = this.parseTimestamp(line, 0);
        }
      }
    }

    if (toolCallsSinceLastText <= STUCK_TOOL_CALL_THRESHOLD) {
      return null;
    }

    const silentDurationMs = lastTextTimestamp > 0 ? Date.now() - lastTextTimestamp : 0;
    if (lastTextTimestamp > 0 && silentDurationMs < STUCK_SILENCE_MS) {
      return null;
    }

    // If tool calls are still arriving recently, the agent is actively working, not stuck.
    const toolCallSilentMs = lastToolCallTimestamp > 0 ? Date.now() - lastToolCallTimestamp : 0;
    if (lastToolCallTimestamp > 0 && toolCallSilentMs < STUCK_SILENCE_MS) {
      return null; // Tool calls still arriving — not stuck
    }

    return {
      silentDurationMs,
      toolCallsSinceLastText,
      warning: `Worker has made ${toolCallsSinceLastText} tool calls without printing status text.`,
    };
  }

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Evict the oldest pathCache entry if over the max size limit.
   */
  private evictOldestIfOverLimit(): void {
    if (this.pathCache.size > LogDigestService.MAX_PATH_CACHE_SIZE) {
      const oldestKey = this.pathCache.keys().next().value;
      if (oldestKey) this.pathCache.delete(oldestKey);
    }
  }

  private mapSessionState(status: string, needsInput?: { active: boolean }): 'active' | 'idle' | 'needs_input' {
    // Status is the authoritative source of truth. An actively working session is
    // 'active' regardless of any stale needsInput flag left over from a previous
    // input request (the flag is only cleared when the agent explicitly resumes or
    // when updateSession transitions to 'working').
    if (status === 'working' || status === 'spawning') return 'active';
    if (needsInput?.active) return 'needs_input';
    return 'idle';
  }

  private emptyDigest(sessionId: string, session: any): TextOnlyDigest {
    return {
      sessionId,
      workerName: session.teamMemberSnapshot?.name || session.name,
      taskIds: session.taskIds || [],
      state: this.mapSessionState(session.status, session.needsInput),
      entries: [],
      stuck: null,
      lastActivityTimestamp: session.lastActivity || Date.now(),
    };
  }

  private fallbackDigest(sessionId: string): TextOnlyDigest {
    return {
      sessionId,
      taskIds: [],
      state: 'idle',
      entries: [],
      stuck: null,
      lastActivityTimestamp: Date.now(),
    };
  }
}
