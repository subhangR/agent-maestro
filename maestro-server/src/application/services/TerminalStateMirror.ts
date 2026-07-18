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
