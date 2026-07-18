import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  writeTerminal: vi.fn(),
}));

vi.mock('../platform', () => ({
  IS_TAURI: true,
  platform: {
    isTauri: true,
    terminal: {
      createSession: vi.fn(),
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

  emitPrompt(data: Record<string, unknown>): void {
    this.onmessage?.({
      data: JSON.stringify({ event: 'session:prompt_send', data }),
    } as MessageEvent);
  }
}

import { useMaestroStore } from '../stores/useMaestroStore';
import { usePromptAnimationStore } from '../stores/usePromptAnimationStore';
import { useSessionStore } from '../stores/useSessionStore';

function socket(): MockWebSocket {
  const ws = MockWebSocket.instances.at(-1);
  if (!ws) throw new Error('WebSocket was not initialized');
  return ws;
}

function emitPrompt(
  content: string,
  mode: 'send' | 'paste',
  promptDeliveryOwner?: 'server' | 'ui',
): void {
  socket().emitPrompt({
    sessionId: 'maestro-target',
    content,
    mode,
    senderSessionId: 'maestro-sender',
    senderProjectId: 'project-a',
    targetProjectId: 'project-a',
    ...(promptDeliveryOwner ? { promptDeliveryOwner } : {}),
  });
}

describe('session prompt delivery owner', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instances = [];
    h.writeTerminal.mockReset().mockResolvedValue(undefined);
    useMaestroStore.getState().destroyWebSocket();
    useMaestroStore.setState({
      sessions: {
        'maestro-target': {
          id: 'maestro-target',
          name: 'Target',
          projectId: 'project-a',
        } as any,
      },
      wsConnected: false,
    });
    useSessionStore.setState({
      sessions: [
        {
          id: 'pty-target',
          name: 'Target',
          command: 'codex',
          cwd: '/tmp',
          projectId: 'project-a',
          persistId: '',
          persistent: false,
          createdAt: Date.now(),
          launchCommand: 'codex',
          sshTarget: null,
          sshRootDir: null,
          maestroSessionId: 'maestro-target',
          exited: false,
        },
      ],
      activeId: 'pty-target',
    });
    usePromptAnimationStore.setState({ animations: [] });
    useMaestroStore.getState().initWebSocket();
  });

  afterEach(() => {
    useMaestroStore.getState().destroyWebSocket();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps animation but skips terminal writes when the server owns delivery', () => {
    emitPrompt('server marker', 'paste', 'server');

    expect(h.writeTerminal).not.toHaveBeenCalled();
    expect(usePromptAnimationStore.getState().animations).toHaveLength(1);
    expect(usePromptAnimationStore.getState().animations[0].content).toBe(
      'server marker',
    );
  });

  it('retains Tauri/UI send semantics when the UI owns delivery', async () => {
    vi.useFakeTimers();
    emitPrompt('ui marker\r\n', 'send', 'ui');

    expect(h.writeTerminal.mock.calls).toEqual([
      ['pty-target', 'ui marker', 'system'],
    ]);
    await vi.advanceTimersByTimeAsync(200);
    expect(h.writeTerminal.mock.calls).toEqual([
      ['pty-target', 'ui marker', 'system'],
      ['pty-target', '\r', 'system'],
    ]);
  });

  it('defaults missing ownership to UI delivery for old servers and PR #163 handoff', async () => {
    emitPrompt('legacy marker\n', 'paste');

    await vi.waitFor(() => {
      expect(h.writeTerminal.mock.calls).toEqual([
        ['pty-target', 'legacy marker', 'system'],
      ]);
    });
  });
});
