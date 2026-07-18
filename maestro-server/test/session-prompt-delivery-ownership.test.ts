/**
 * Integration regression for session:prompt_send delivery ownership.
 *
 * Two UI clients subscribe to the real WebSocketBridge and attach through the
 * real PtyWebSocketServer to one server-hosted PTY. A UI only forwards a prompt
 * to its PTY socket when the event says the UI owns delivery. In server-hosted
 * mode the server must inject once and mark itself as owner, regardless of how
 * many UI subscribers receive the cosmetic/persistence event.
 */

const mockSpawnedProcs: any[] = [];

jest.mock('node-pty', () => ({
  spawn: jest.fn(() => {
    const proc: any = {
      pid: 2000 + mockSpawnedProcs.length,
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn(),
      onData(cb: (data: Buffer) => void) {
        proc._onData = cb;
      },
      onExit(cb: (event: { exitCode: number }) => void) {
        proc._onExit = cb;
      },
    };
    mockSpawnedProcs.push(proc);
    return proc;
  }),
}));

import { AddressInfo } from 'net';
import { WebSocket, WebSocketServer } from 'ws';
import { InMemoryEventBus } from '../src/infrastructure/events/InMemoryEventBus';
import { PtyHostService } from '../src/application/services/PtyHostService';
import { SessionPromptDeliveryService } from '../src/application/services/SessionPromptDeliveryService';
import { WebSocketBridge } from '../src/infrastructure/websocket/WebSocketBridge';
import { PtyWebSocketServer } from '../src/infrastructure/websocket/PtyWebSocketServer';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

function listening(server: WebSocketServer): Promise<number> {
  return new Promise((resolve) => {
    if (server.address()) {
      resolve((server.address() as AddressInfo).port);
      return;
    }
    server.once('listening', () => resolve((server.address() as AddressInfo).port));
  });
}

function opened(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for prompt delivery');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('session prompt delivery ownership', () => {
  let eventWss: WebSocketServer;
  let ptyWss: WebSocketServer;
  let bridge: WebSocketBridge;
  let ptyWsServer: PtyWebSocketServer;
  let promptDelivery: SessionPromptDeliveryService;
  let eventBus: InMemoryEventBus;
  let ptyHost: PtyHostService;
  let sockets: WebSocket[];
  let promptFrames: any[];

  beforeEach(async () => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
    sockets = [];
    promptFrames = [];

    eventBus = new InMemoryEventBus(logger);
    ptyHost = new PtyHostService(
      { updateSession: jest.fn().mockResolvedValue(undefined) } as any,
      logger,
    );
    ptyHost.spawn({
      sessionId: 'sess-target',
      command: 'codex',
      cwd: '/tmp',
      env: {},
    });

    eventWss = new WebSocketServer({ port: 0 });
    ptyWss = new WebSocketServer({ port: 0 });
    const [eventPort, ptyPort] = await Promise.all([
      listening(eventWss),
      listening(ptyWss),
    ]);

    promptDelivery = new SessionPromptDeliveryService(
      eventBus,
      ptyHost,
      'server',
      logger,
    );
    bridge = new WebSocketBridge(eventWss, eventBus, logger, promptDelivery.owner);
    ptyWsServer = new PtyWebSocketServer(ptyWss, ptyHost, logger);

    const eventClients = await Promise.all([
      opened(`ws://127.0.0.1:${eventPort}`),
      opened(`ws://127.0.0.1:${eventPort}`),
    ]);
    const ptyClients = await Promise.all([
      opened(`ws://127.0.0.1:${ptyPort}/pty?sessionId=sess-target`),
      opened(`ws://127.0.0.1:${ptyPort}/pty?sessionId=sess-target`),
    ]);
    sockets.push(...eventClients, ...ptyClients);

    eventClients.forEach((eventClient, index) => {
      eventClient.on('message', (raw) => {
        const frame = JSON.parse(raw.toString());
        if (frame.event === 'session:prompt_send') {
          promptFrames.push(frame);
          if (frame.data.promptDeliveryOwner !== 'server') {
            ptyClients[index].send(Buffer.from(frame.data.content, 'utf8'));
          }
        }
      });
    });
  });

  afterEach(async () => {
    await Promise.all(sockets.map(closeSocket));
    bridge.shutdown();
    promptDelivery.shutdown();
    ptyWsServer.shutdown();
    ptyHost.shutdownAll();
    await Promise.all([
      new Promise<void>((resolve) => eventWss.close(() => resolve())),
      new Promise<void>((resolve) => ptyWss.close(() => resolve())),
    ]);
  });

  it('injects one marker into a server-hosted PTY while both UI clients receive the event', async () => {
    const marker = '[From: coordinator] EXACTLY_ONCE_MULTI_CLIENT_MARKER';

    await eventBus.emit('session:prompt_send', {
      sessionId: 'sess-target',
      content: marker,
      mode: 'paste',
      senderSessionId: 'sess-sender',
      senderProjectId: 'project-a',
      targetProjectId: 'project-a',
      timestamp: Date.now(),
    });

    await waitFor(
      () =>
        mockSpawnedProcs[0].write.mock.calls.length >= 1 &&
        promptFrames.length >= 2,
    );
    expect(promptFrames).toHaveLength(2);
    expect(
      promptFrames.every((frame) => frame.data.promptDeliveryOwner === 'server'),
    ).toBe(true);
    expect(mockSpawnedProcs[0].write).toHaveBeenCalledTimes(1);
    expect(mockSpawnedProcs[0].write).toHaveBeenCalledWith(marker);
  });

  it('queues a prompt event before PTY attach and flushes it once on server spawn', async () => {
    const marker = '[From: coordinator] PROMPT_BEFORE_PTY_MARKER';

    await eventBus.emit('session:spawn', {
      session: { id: 'sess-late' },
    } as any);
    await eventBus.emit('session:prompt_send', {
      sessionId: 'sess-late',
      content: marker,
      mode: 'paste',
      senderSessionId: 'sess-sender',
      senderProjectId: 'project-a',
      targetProjectId: 'project-a',
      timestamp: Date.now(),
    });

    // The server owns delivery, so neither UI client writes to the existing
    // target socket, and the late prompt waits for its own PTY.
    await waitFor(() => promptFrames.some((frame) => frame.data.content === marker));
    expect(mockSpawnedProcs[0].write).not.toHaveBeenCalled();

    ptyHost.spawn({
      sessionId: 'sess-late',
      command: 'codex',
      cwd: '/tmp',
      env: {},
    });
    await waitFor(() => mockSpawnedProcs[1].write.mock.calls.length === 1);
    expect(mockSpawnedProcs[1].write.mock.calls).toEqual([[marker]]);
  });
});

describe('SessionPromptDeliveryService host selection', () => {
  it('leaves Tauri-hosted prompt injection UI-owned', async () => {
    const eventBus = new InMemoryEventBus(logger);
    const ptyHost = {
      deliverPrompt: jest.fn(),
      beginPromptHandoff: jest.fn(),
    } as any;
    const delivery = new SessionPromptDeliveryService(
      eventBus,
      ptyHost,
      'tauri',
      logger,
    );

    expect(delivery.owner).toBe('ui');
    await eventBus.emit('session:spawn', { session: { id: 'tauri-target' } });
    await eventBus.emit('session:prompt_send', {
      sessionId: 'tauri-target',
      content: 'tauri marker',
      mode: 'paste',
    });
    expect(ptyHost.beginPromptHandoff).not.toHaveBeenCalled();
    expect(ptyHost.deliverPrompt).not.toHaveBeenCalled();
    delivery.shutdown();
  });
});
