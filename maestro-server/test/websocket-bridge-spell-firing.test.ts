/**
 * D9/FR-7.1/FR-6.6: the bridge must forward spell:rule_fired and spell:loop_reset,
 * and its spell: subscription filter must match the SINGULAR sessionId these two
 * payloads carry (not sessionIds[]/targetSessionId). A client subscribed to the
 * firing session receives them; a client subscribed to a different session does not.
 */

import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';

import { WebSocketBridge } from '../src/infrastructure/websocket/WebSocketBridge';
import { InMemoryEventBus } from '../src/infrastructure/events/InMemoryEventBus';
import { ConsoleLogger } from '../src/infrastructure/common/ConsoleLogger';

describe('WebSocketBridge — spell:rule_fired / spell:loop_reset', () => {
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

  it('subscribes to both events on the event bus', () => {
    expect(eventBus.listenerCount('spell:rule_fired')).toBe(1);
    expect(eventBus.listenerCount('spell:loop_reset')).toBe(1);
  });

  it('forwards spell:rule_fired to a client subscribed to the firing session', (done) => {
    const payload = {
      sessionId: 'sess_fire_1',
      spellId: 'sp1',
      ruleId: 'r1',
      event: 'Stop',
      action: 'continue-loop',
      outcome: 'ok' as const,
      timestamp: Date.now(),
    };

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    client.on('open', () => {
      client.send(JSON.stringify({ type: 'subscribe', sessionIds: ['sess_fire_1'] }));
    });
    client.on('message', (raw) => {
      const batch = JSON.parse(raw.toString());
      const frames = Array.isArray(batch) ? batch : [batch];
      // Ignore the 'subscribed' ack.
      if (frames.some((f: any) => f.type === 'subscribed')) {
        eventBus.emit('spell:rule_fired', payload);
        return;
      }
      const frame = frames.find((f: any) => f.event === 'spell:rule_fired');
      if (!frame) return;
      try {
        expect(frame.data).toMatchObject(payload);
        client.close();
        done();
      } catch (err) {
        client.close();
        done(err as Error);
      }
    });
    client.on('error', (err) => done(err));
  });

  it('forwards spell:loop_reset to a client subscribed to that session', (done) => {
    const payload = {
      spellId: 'sp1',
      sessionId: 'sess_reset_1',
      ruleId: null,
      activeSpell: {
        spellId: 'sp1',
        color: 'amber',
        enabled: true,
        ruleIterations: {},
        castAt: 0,
        castBy: null,
      },
      timestamp: Date.now(),
    };

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    client.on('open', () => {
      client.send(JSON.stringify({ type: 'subscribe', sessionIds: ['sess_reset_1'] }));
    });
    client.on('message', (raw) => {
      const batch = JSON.parse(raw.toString());
      const frames = Array.isArray(batch) ? batch : [batch];
      if (frames.some((f: any) => f.type === 'subscribed')) {
        eventBus.emit('spell:loop_reset', payload);
        return;
      }
      const frame = frames.find((f: any) => f.event === 'spell:loop_reset');
      if (!frame) return;
      try {
        expect(frame.data.sessionId).toBe('sess_reset_1');
        expect(frame.data.ruleId).toBeNull();
        expect(frame.data.activeSpell.ruleIterations).toEqual({});
        client.close();
        done();
      } catch (err) {
        client.close();
        done(err as Error);
      }
    });
    client.on('error', (err) => done(err));
  });

  it('does NOT forward spell:rule_fired to a client subscribed to a different session', (done) => {
    const payload = {
      sessionId: 'sess_other',
      spellId: 'sp1',
      ruleId: 'r1',
      event: 'Stop',
      action: 'feed-context',
      outcome: 'ok' as const,
      timestamp: Date.now(),
    };

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    let acked = false;
    client.on('open', () => {
      client.send(JSON.stringify({ type: 'subscribe', sessionIds: ['sess_mine'] }));
    });
    client.on('message', (raw) => {
      const batch = JSON.parse(raw.toString());
      const frames = Array.isArray(batch) ? batch : [batch];
      if (frames.some((f: any) => f.type === 'subscribed')) {
        acked = true;
        eventBus.emit('spell:rule_fired', payload);
        // Give the bridge a window to (incorrectly) deliver, then pass.
        setTimeout(() => {
          client.close();
          done();
        }, 200);
        return;
      }
      if (acked && frames.some((f: any) => f.event === 'spell:rule_fired')) {
        client.close();
        done(new Error('rule_fired leaked to a non-subscribed session'));
      }
    });
    client.on('error', (err) => done(err));
  });
});
