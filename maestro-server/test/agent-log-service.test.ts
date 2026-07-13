import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CLAUDE_PREFIX_BYTES,
  extractMaestroSessionId,
} from '../src/application/services/AgentLogService';

/**
 * Regression guard for the server-side Claude log reader (the web-ui path that
 * mirrors claude_logs.rs). The Session Log strip only renders once a log's
 * maestroSessionId is discovered, and that id lives in a `<session_id>` tag
 * embedded in the first user message. In a real Claude log that first message
 * (CLAUDE.md + skills list + MCP instructions + the maestro prompt) now runs
 * ~20KB+, so the tag lands well past the legacy 8KB scan window. When the window
 * was too small, extraction returned null and the strip never appeared for
 * Claude sessions (Codex, with its 256KB window, worked fine).
 *
 * Mirror of claude_logs.rs `finds_session_id_past_legacy_8kb_window`.
 */
describe('AgentLogService — Claude session-id discovery', () => {
  let logPath: string;

  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-als-'));
    logPath = path.join(dir, 'transcript.jsonl');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(logPath), { recursive: true, force: true });
  });

  it('finds the <session_id> marker past the legacy 8KB scan window', async () => {
    // Push the tag ~20KB in — past the old 8KB window, inside the current one.
    const filler = 'x'.repeat(20_000);
    const contents =
      JSON.stringify({ pad: filler }) +
      '\n' +
      JSON.stringify({ text: '<session_id>sess_test_abc123</session_id>' }) +
      '\n';
    await fs.writeFile(logPath, contents, 'utf8');

    const got = await extractMaestroSessionId(logPath, CLAUDE_PREFIX_BYTES);

    expect(got).toBe('sess_test_abc123');
  });
});
