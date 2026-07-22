import { TerminalStateMirror } from '../src/application/services/TerminalStateMirror';

describe('TerminalStateMirror', () => {
  it('serializes Codex synchronized alternate-screen state as a self-contained replay', async () => {
    const mirror = new TerminalStateMirror(80, 24);
    mirror.append(
      Buffer.from(
        '\u001b[?1049h\u001b[?2026h\u001b[2J\u001b[Hcodex ready\u001b[?2026l',
        'utf8',
      ),
    );

    const snapshot = (await mirror.snapshot()).toString('utf8');
    expect(snapshot.startsWith('\u001bc')).toBe(true);
    expect(snapshot).toContain('codex ready');
    expect(snapshot).toContain('\u001b[?1049h');
    mirror.dispose();
  });

  it('pins a snapshot between writes queued before and after the request', async () => {
    const mirror = new TerminalStateMirror(80, 24);
    mirror.append(Buffer.from('before'));
    const boundary = mirror.snapshot();
    mirror.append(Buffer.from(' after'));

    const first = (await boundary).toString('utf8');
    expect(first).toContain('before');
    expect(first).not.toContain('after');
    expect((await mirror.snapshot()).toString('utf8')).toContain('before after');
    mirror.dispose();
  });
});
