/**
 * WebSocketBridge delivery guarantees for status transitions.
 *
 * Two defects this covers:
 *  1. session:status_changed was throttled at 500ms and never in IMMEDIATE_EVENTS,
 *     so a turn-end transition could sit behind the throttle. A *meaningful*
 *     status/needsInput transition must reach clients at once.
 *  2. queueBroadcast silently DROPPED a throttled event when its window was open
 *     but the prior batch had already flushed (nothing left in pendingMessages
 *     to coalesce into). Throttling may delay an event; it must never discard it.
 */

import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';

import { WebSocketBridge } from '../src/infrastructure/websocket/WebSocketBridge';
import { InMemoryEventBus } from '../src/infrastructure/events/InMemoryEventBus';
import { ConsoleLogger } from '../src/infrastructure/common/ConsoleLogger';

describe('WebSocketBridge — status transition delivery', () => {
  let wss: WebSocketServer;
  let bridge: WebSocketBridge;
  let eventBus: InMemoryEventBus;
  let port: number;

  beforeEach((done) => {
    const logger = new ConsoleLogger('error');
    eventBus = new InMemoryEventBus(logger);
    wss = new WebSocketServer({ port: 0 }, () => {
      port = (wss.address() as AddressInfo).port;
      done();
    });
    bridge = new WebSocketBridge(wss, eventBus, logger);
  });

  afterEach((done) => {
    bridge.shutdown();
    wss.close(() => done());
  });

  /** Collect every frame a fresh client receives, invoking cb on each. */
  function withClient(onFrame: (frame: any) => void, onOpen: () => void): WebSocket {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    client.on('open', onOpen);
    client.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString());
      const frames = Array.isArray(parsed) ? parsed : [parsed];
      for (const f of frames) onFrame(f);
    });
    return client;
  }

  it('delivers a meaningful session:status_changed on the immediate lane (well under the 500ms throttle)', (done) => {
    const t0 = Date.now();
    const client = withClient(
      (frame) => {
        if (frame.event !== 'session:status_changed') return;
        try {
          expect(frame.data.status).toBe('idle');
          // Immediate lane: no 500ms throttle, no 50ms batch wait to speak of.
          expect(Date.now() - t0).toBeLessThan(200);
          client.close();
          done();
        } catch (err) {
          client.close();
          done(err as Error);
        }
      },
      () => {
        eventBus.emit('session:status_changed', {
          id: 'sess_imm_1',
          status: 'idle',
          lastActivity: new Date().toISOString(),
          needsInput: { active: true },
        });
      }
    );
  });

  it('keeps repeats of the identical status signature OFF the immediate lane (only the transition is immediate)', (done) => {
    // A burst of identical (status, needsInput.active) frames must not each flood
    // the immediate lane. Only one frame may arrive inside the tight immediate
    // window; further repeats are damped onto the batched/throttled lane.
    let openAt = 0;
    const immediateWindowMs = 30; // < the 50ms batch window, so a batched frame lands after.
    const immediateCount = { n: 0 };
    const client = withClient(
      (frame) => {
        if (frame.event !== 'session:status_changed') return;
        if (Date.now() - openAt < immediateWindowMs) immediateCount.n += 1;
      },
      () => {
        openAt = Date.now();
        const payload = {
          id: 'sess_dedupe_1',
          status: 'working',
          lastActivity: new Date().toISOString(),
          needsInput: { active: false },
        };
        // First is a real transition (idle-ish -> working); the rest are repeats.
        for (let i = 0; i < 6; i++) eventBus.emit('session:status_changed', { ...payload });
      }
    );

    setTimeout(() => {
      try {
        // Exactly one frame took the immediate lane despite six identical emits.
        expect(immediateCount.n).toBe(1);
        client.close();
        done();
      } catch (err) {
        client.close();
        done(err as Error);
      }
    }, 250);
  });

  it('CROSS-LANE: a newer status frame is never clobbered by an older queued session:updated', (done) => {
    // Reproduces the exact interleaving the fix targets:
    //   t≈0    a structural session:updated carrying status 'idle' is queued; a
    //          second one lands inside the 500ms window after the batch flushed,
    //          arming a trailing redelivery ~t=500 whose snapshot still says idle.
    //   t≈300  the session resumes: session:status_changed('working') takes the
    //          immediate lane and reaches the UI at once.
    //   t≈500  the trailing timer fires and delivers session:updated — which the
    //          UI FULL-REPLACES from, status included. Without reconciliation it
    //          would carry the stale 'idle' and revert the live 'working' status.
    //
    // Model the client the way useMaestroStore does: session:updated replaces the
    // status wholesale, session:status_changed patches it. Assert the UI never
    // regresses out of 'working' once it gets there.
    const ID = 'sess_xlane_1';
    let uiStatus: string | null = null;
    let sawWorking = false;
    let regressedAfterWorking = false;

    const client = withClient(
      (frame) => {
        if (frame.data?.id !== ID) return;
        if (frame.event === 'session:updated' || frame.event === 'session:status_changed') {
          uiStatus = frame.data.status; // both lanes ultimately set the shown status
          if (uiStatus === 'working') sawWorking = true;
          else if (sawWorking) regressedAfterWorking = true;
        }
      },
      () => {
        // t=0 and t=100: two session:updated(idle); the second arms the trailing timer.
        eventBus.emit('session:updated', { id: ID, name: 's', status: 'idle', needsInput: { active: false } });
        setTimeout(() => {
          eventBus.emit('session:updated', { id: ID, name: 's', status: 'idle', needsInput: { active: false } });
        }, 100);
        // t=300: the real resume — immediate lane.
        setTimeout(() => {
          eventBus.emit('session:status_changed', { id: ID, status: 'working', lastActivity: new Date().toISOString(), needsInput: { active: false } });
        }, 300);
      }
    );

    setTimeout(() => {
      try {
        expect(sawWorking).toBe(true);              // the resume was observed
        expect(regressedAfterWorking).toBe(false);  // and never reverted to idle
        expect(uiStatus).toBe('working');           // final shown status is correct
        client.close();
        done();
      } catch (err) {
        client.close();
        done(err as Error);
      }
    }, 700);
  });

  it('INVARIANT: a throttled event is never dropped — it is redelivered on the trailing edge', (done) => {
    // session:updated is throttled at 500ms. Fire three updates for one session:
    // #1 flushes ~immediately, #2 and #3 arrive inside the window after the batch
    // already flushed. The old code dropped them; the newest state must survive.
    const seen: any[] = [];
    const client = withClient(
      (frame) => {
        if (frame.event === 'session:updated' && frame.data?.id === 'sess_drop_1') {
          seen.push(frame.data.name);
        }
      },
      () => {
        eventBus.emit('session:updated', { id: 'sess_drop_1', name: 'v1' });
        // Let batch #1 flush, then fire two more inside the 500ms throttle window.
        setTimeout(() => {
          eventBus.emit('session:updated', { id: 'sess_drop_1', name: 'v2' });
          eventBus.emit('session:updated', { id: 'sess_drop_1', name: 'v3' });
        }, 120);
      }
    );

    setTimeout(() => {
      try {
        // v1 delivered immediately; the newest post-window state (v3) must also
        // arrive rather than being silently discarded.
        expect(seen).toContain('v1');
        expect(seen[seen.length - 1]).toBe('v3');
        client.close();
        done();
      } catch (err) {
        client.close();
        done(err as Error);
      }
    }, 800);
  });
});
