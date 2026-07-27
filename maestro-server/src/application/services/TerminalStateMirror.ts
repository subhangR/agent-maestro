import { SerializeAddon } from '@xterm/addon-serialize';
import { Terminal } from '@xterm/headless';

// Enough coherent history for a reconnect without giving every live PTY an
// unbounded second scrollback store. The raw byte ring remains the normal replay
// path; this mirror is the eviction fallback.
const DEFAULT_SCROLLBACK = 2_000;
const FULL_RESET = '\u001bc';

/**
 * Headless xterm mirror of one PTY stream.
 *
 * Output and resize operations are serialized through one promise chain so a
 * snapshot requested between two node-pty data events represents that exact
 * raw-stream boundary. Later writes queue behind the snapshot callback instead
 * of mutating the buffer while it is being serialized.
 */
export class TerminalStateMirror {
  private readonly terminal: Terminal;
  private readonly serializer: SerializeAddon;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({
      allowProposedApi: true,
      cols,
      rows,
      scrollback: DEFAULT_SCROLLBACK,
    });
    this.serializer = new SerializeAddon();
    // The serialize addon's public type names the browser Terminal, but its
    // runtime contract is the shared terminal buffer API implemented by the
    // headless build as well.
    this.terminal.loadAddon(
      this.serializer as unknown as Parameters<Terminal['loadAddon']>[0],
    );
  }

  append(data: Buffer): void {
    if (this.disposed || data.length === 0) return;
    this.tail = this.tail.then(
      () =>
        new Promise<void>((resolve) => {
          this.terminal.write(data, resolve);
        }),
    );
  }

  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    this.tail = this.tail.then(() => {
      this.terminal.resize(cols, rows);
    });
  }

  /**
   * Whether the mirrored stream currently has bracketed-paste mode enabled
   * (`ESC[?2004h`), i.e. the foreground program asked terminals to wrap pasted
   * input in `ESC[200~`…`ESC[201~` so it can tell a paste from typing.
   *
   * This is read synchronously off the parsed mode set. It is deliberately NOT a
   * readiness signal — Claude Code (and codex/gemini) assert this mode within
   * their first ~300 bytes, long before the composer can accept a submit — so the
   * prompt-injection path uses it ONLY to decide content framing, never to decide
   * "is the agent ready". Disposed-safe: a disposed mirror reports false.
   */
  get bracketedPaste(): boolean {
    if (this.disposed) return false;
    return this.terminal.modes.bracketedPasteMode;
  }

  /**
   * Read the visible screen text in a small band around the cursor: `rowsAbove`
   * rows above the cursor row through `rowsBelow` rows below it, joined by
   * newlines and right-trimmed per line.
   *
   * Queued through the SAME promise chain as {@link snapshot} so it observes a
   * coherent raw-stream boundary — every write queued before this call has been
   * parsed, and writes queued after it do not mutate the buffer mid-read. The
   * prompt-injection verifier uses this to check whether the text it just pasted
   * is still parked at the cursor (⇒ not submitted) without parsing per-agent
   * composer chrome, which differs across agents. Disposed-safe: returns ''.
   */
  readCursorRegion(rowsAbove = 3, rowsBelow = 1): Promise<string> {
    if (this.disposed) return Promise.resolve('');
    const boundary = this.tail;
    return boundary.then(() => {
      if (this.disposed) return '';
      const buffer = this.terminal.buffer.active;
      // Absolute row of the cursor within the full buffer (scrollback + viewport).
      const cursorRow = buffer.baseY + buffer.cursorY;
      const start = Math.max(0, cursorRow - rowsAbove);
      const end = Math.min(buffer.length - 1, cursorRow + rowsBelow);
      const lines: string[] = [];
      for (let row = start; row <= end; row += 1) {
        const line = buffer.getLine(row);
        // `true` trims trailing whitespace cells so the band reflects real glyphs.
        if (line) lines.push(line.translateToString(true));
      }
      return lines.join('\n');
    });
  }

  /**
   * Serialize the terminal after every operation queued before this call, but
   * before operations queued afterward. Prefixing RIS makes the payload safe
   * even for a client that did not explicitly reset before applying it.
   */
  snapshot(): Promise<Buffer> {
    if (this.disposed) return Promise.reject(new Error('terminal mirror is disposed'));
    const boundary = this.tail;
    return boundary.then(() => {
      const state = this.serializer.serialize({
        scrollback: DEFAULT_SCROLLBACK,
      });
      return Buffer.from(FULL_RESET + state, 'utf8');
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.tail.finally(() => this.terminal.dispose());
  }
}
