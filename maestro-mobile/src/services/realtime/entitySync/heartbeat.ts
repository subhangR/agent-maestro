// App-level heartbeat + liveness watchdog.
//
// The maestro-server bridge pushes NO heartbeat; it only replies `pong` to a
// client `{type:'ping'}`. React Native has no browser keep-alive and the OS
// aggressively suspends background sockets (which can die without a clean
// `onclose`), so we issue our own ping and treat a missing `pong` as a dead
// socket → force reconnect. Keeping the ping cheap also stays under the
// server's "terminate clients stuck >30s" backpressure rule.

export const DEFAULT_PING_INTERVAL_MS = 20_000;

export interface HeartbeatOptions {
  intervalMs?: number;
  /** Send a `{type:'ping'}` frame. */
  sendPing: () => void;
  /** Called when a ping went unanswered by the next tick → socket is dead. */
  onDead: () => void;
}

export interface Heartbeat {
  /** Begin pinging. Call on socket `onopen`. */
  start(): void;
  /** Stop pinging and reset state. Call on `onclose`/disconnect. */
  stop(): void;
  /** Record a `pong` (clears the outstanding-ping flag). */
  notifyPong(): void;
}

export function createHeartbeat(opts: HeartbeatOptions): Heartbeat {
  const intervalMs = opts.intervalMs ?? DEFAULT_PING_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let awaitingPong = false;

  const tick = () => {
    if (awaitingPong) {
      // Previous ping never got a pong within one interval → half-open socket.
      stop();
      opts.onDead();
      return;
    }
    awaitingPong = true;
    opts.sendPing();
  };

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    awaitingPong = false;
  };

  const start = () => {
    stop();
    awaitingPong = false;
    timer = setInterval(tick, intervalMs);
  };

  const notifyPong = () => {
    awaitingPong = false;
  };

  return { start, stop, notifyPong };
}
