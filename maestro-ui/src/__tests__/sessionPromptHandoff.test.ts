import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createTerminal: vi.fn(),
  writeTerminal: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../platform', () => ({
  IS_TAURI: false,
  platform: {
    isTauri: false,
    terminal: {
      createSession: h.createTerminal,
      write: h.writeTerminal,
      resize: vi.fn(),
      closeSession: vi.fn(),
      onOutput: vi.fn(async () => () => {}),
      onExit: vi.fn(async () => () => {}),
    },
    logs: {},
    fs: {},
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../services/sessionService', () => ({
  createSession: vi.fn(),
  closeSession: h.closeSession,
}));

vi.mock('../services/soundManager', () => ({
  playEventSound: vi.fn(),
  soundManager: {
    clearSessionInstrument: vi.fn(),
    getOrAssignSessionInstrument: vi.fn(),
    playSessionEventSound: vi.fn(async () => {}),
    playSessionInstrumentSound: vi.fn(async () => {}),
    registerTeamMember: vi.fn(),
    unregisterTeamMember: vi.fn(),
  },
}));

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  send(): void {}

  emit(event: string, data: unknown): void {
    this.onmessage?.({
      data: JSON.stringify({ event, data }),
    } as MessageEvent);
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function terminalInfo(id: string) {
  return {
    id,
    name: 'Codex worker',
    pid: 123,
    cols: 120,
    rows: 40,
  };
}

function maestroSession(id: string) {
  return {
    id,
    name: 'Codex worker',
    projectId: 'proj-1',
    taskIds: [],
    status: 'working',
    env: {},
    startedAt: Date.now(),
    lastActivity: Date.now(),
    completedAt: null,
    hostname: 'localhost',
    platform: 'darwin',
    events: [],
    timeline: [],
  };
}

import {
  spawningSessionsRef,
  useSessionStore,
} from '../stores/useSessionStore';
import { useMaestroStore } from '../stores/useMaestroStore';
import { usePromptAnimationStore } from '../stores/usePromptAnimationStore';

function socket(): MockWebSocket {
  const ws = MockWebSocket.instances.at(-1);
  if (!ws) throw new Error('WebSocket was not initialized');
  return ws;
}

function emitAttach(
  event: 'session:spawn' | 'session:resume',
  maestroSessionId: string,
): void {
  socket().emit(event, {
    session: maestroSession(maestroSessionId),
    command: 'codex',
    cwd: '/tmp/project',
    envVars: {},
    projectId: 'proj-1',
  });
}

describe('session prompt terminal hand-off', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instances = [];
    h.createTerminal.mockReset();
    h.writeTerminal.mockReset().mockResolvedValue(undefined);
    h.closeSession.mockReset().mockResolvedValue(undefined);
    spawningSessionsRef.clear();
    useSessionStore.setState({ sessions: [], activeId: null });
    useMaestroStore.getState().destroyWebSocket();
    useMaestroStore.setState({ sessions: {}, wsConnected: false });
    usePromptAnimationStore.setState({ animations: [] });
    useMaestroStore.getState().initWebSocket();
  });

  afterEach(() => {
    useMaestroStore.getState().destroyWebSocket();
    spawningSessionsRef.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('delivers spawn-time prompts in FIFO order after the PTY attaches', async () => {
    const create = deferred<ReturnType<typeof terminalInfo>>();
    h.createTerminal.mockReturnValue(create.promise);

    emitAttach('session:spawn', 'maestro-spawn');
    socket().emit('session:prompt_send', {
      sessionId: 'maestro-spawn',
      content: 'first',
      mode: 'paste',
    });
    socket().emit('session:prompt_send', {
      sessionId: 'maestro-spawn',
      content: 'second',
      mode: 'paste',
    });

    expect(h.writeTerminal).not.toHaveBeenCalled();

    create.resolve(terminalInfo('pty-spawn'));

    await vi.waitFor(() => {
      expect(h.writeTerminal.mock.calls).toEqual([
        ['pty-spawn', 'first', 'system'],
        ['pty-spawn', 'second', 'system'],
      ]);
    });
  });

  it('hands an immediate resume prompt to the replacement PTY', async () => {
    const create = deferred<ReturnType<typeof terminalInfo>>();
    h.createTerminal.mockReturnValue(create.promise);
    useSessionStore.setState({
      sessions: [
        {
          ...terminalInfo('pty-stale'),
          maestroSessionId: 'maestro-resume',
          projectId: 'proj-1',
          persistId: '',
          persistent: false,
          createdAt: Date.now(),
          launchCommand: 'codex',
          sshTarget: null,
          sshRootDir: null,
          cwd: '/tmp/project',
          agentWorking: false,
          exited: false,
        },
      ],
    });

    emitAttach('session:resume', 'maestro-resume');
    socket().emit('session:prompt_send', {
      sessionId: 'maestro-resume',
      content: 'FIRST_THREAD_RESUMED',
      mode: 'send',
    });

    expect(h.closeSession).toHaveBeenCalledWith('pty-stale');
    expect(useSessionStore.getState().sessions).toHaveLength(0);
    expect(h.writeTerminal).not.toHaveBeenCalled();

    create.resolve(terminalInfo('pty-resumed'));

    await vi.waitFor(() => {
      expect(h.writeTerminal.mock.calls).toEqual([
        ['pty-resumed', 'FIRST_THREAD_RESUMED', 'system'],
        ['pty-resumed', '\r', 'system'],
      ]);
    });
  });

  it('bounds the attach queue while preserving the accepted FIFO prefix', async () => {
    const create = deferred<ReturnType<typeof terminalInfo>>();
    h.createTerminal.mockReturnValue(create.promise);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    emitAttach('session:spawn', 'maestro-bounded');
    for (let index = 0; index < 40; index += 1) {
      socket().emit('session:prompt_send', {
        sessionId: 'maestro-bounded',
        content: `prompt-${index}`,
        mode: 'paste',
      });
    }

    create.resolve(terminalInfo('pty-bounded'));

    await vi.waitFor(() => {
      expect(h.writeTerminal).toHaveBeenCalledTimes(32);
    });
    expect(
      h.writeTerminal.mock.calls.map(([, content]) => content),
    ).toEqual(Array.from({ length: 32 }, (_, index) => `prompt-${index}`));
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
