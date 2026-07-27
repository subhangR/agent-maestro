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

  it('reports bracketed-paste mode once the stream enables it', async () => {
    const mirror = new TerminalStateMirror(80, 24);
    expect(mirror.bracketedPaste).toBe(false);

    mirror.append(Buffer.from('[?2004h', 'latin1'));
    // Flush the queued write (readCursorRegion chains on the same tail promise).
    await mirror.readCursorRegion();
    expect(mirror.bracketedPaste).toBe(true);

    mirror.append(Buffer.from('[?2004l', 'latin1'));
    await mirror.readCursorRegion();
    expect(mirror.bracketedPaste).toBe(false);

    mirror.dispose();
  });

  it('reads the visible text band around the cursor', async () => {
    const mirror = new TerminalStateMirror(80, 24);
    mirror.append(Buffer.from('prompt text at cursor', 'utf8'));

    const region = await mirror.readCursorRegion();
    expect(region).toContain('prompt text at cursor');

    mirror.dispose();
  });

  it('is disposed-safe: bracketedPaste is false and readCursorRegion resolves empty', async () => {
    const mirror = new TerminalStateMirror(80, 24);
    mirror.append(Buffer.from('something', 'utf8'));
    mirror.dispose();

    expect(mirror.bracketedPaste).toBe(false);
    await expect(mirror.readCursorRegion()).resolves.toBe('');
  });
});
