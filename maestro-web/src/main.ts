import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { routePtyMessage } from './ptyMessage';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4570/api';
const PTY_URL = (import.meta.env.VITE_PTY_URL as string) || 'ws://localhost:4570/pty';

interface SessionSummary {
  id: string;
  name?: string;
  status?: string;
}

const sessionsEl = document.getElementById('sessions') as HTMLUListElement;
const statusBar = document.getElementById('status-bar') as HTMLDivElement;
const terminalEl = document.getElementById('terminal') as HTMLDivElement;
const connInfo = document.getElementById('conn-info') as HTMLDivElement;
const refreshBtn = document.getElementById('refresh') as HTMLButtonElement;
const newShellBtn = document.getElementById('new-shell') as HTMLButtonElement;

connInfo.textContent = `API ${API_BASE}\nPTY ${PTY_URL}`;

let term: Terminal | null = null;
let fit: FitAddon | null = null;
let ws: WebSocket | null = null;
let activeSessionId: string | null = null;
let resizeObserver: ResizeObserver | null = null;
let replayPending = false;

async function loadSessions(): Promise<void> {
  sessionsEl.innerHTML = '<li class="empty">Loading…</li>';
  try {
    const res = await fetch(`${API_BASE}/sessions`);
    const body = await res.json();
    const list: SessionSummary[] = Array.isArray(body) ? body : body.sessions || body.data || [];
    renderSessions(list);
  } catch (err) {
    sessionsEl.innerHTML = `<li class="empty">Failed to load sessions: ${
      err instanceof Error ? err.message : String(err)
    }</li>`;
  }
}

function renderSessions(list: SessionSummary[]): void {
  sessionsEl.innerHTML = '';
  if (list.length === 0) {
    sessionsEl.innerHTML =
      '<li class="empty">No sessions. Use "Launch test shell" to stream a PTY.</li>';
    return;
  }
  for (const s of list) {
    const li = document.createElement('li');
    if (s.id === activeSessionId) li.classList.add('active');
    li.innerHTML = `
      <span><span class="status-dot ${s.status || ''}"></span>${s.name || s.id}</span>
      <span class="sid">${s.id}${s.status ? ` · ${s.status}` : ''}</span>`;
    li.onclick = () => connect(s.id);
    sessionsEl.appendChild(li);
  }
}

function connect(sessionId: string): void {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (term) {
    term.dispose();
    term = null;
  }
  resizeObserver?.disconnect();

  activeSessionId = sessionId;
  replayPending = false;
  statusBar.textContent = `Connecting to ${sessionId}…`;
  highlightActive();

  term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1c1a16',
      foreground: '#e8e2d4',
      cursor: '#cc785c',
      cursorAccent: '#1c1a16',
      selectionBackground: '#3a2a20',
    },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  terminalEl.innerHTML = '';
  term.open(terminalEl);
  fit.fit();

  ws = new WebSocket(`${PTY_URL}?sessionId=${encodeURIComponent(sessionId)}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    statusBar.textContent = `Connected: ${sessionId}`;
    sendResize();
  };
  ws.onmessage = (ev) => {
    // Classify every frame through the shared `/pty` parser so control-frame
    // JSON is interpreted rather than dumped into the terminal as text.
    const action = routePtyMessage(ev.data as string | ArrayBuffer);
    if (action.kind === 'output') {
      if (replayPending && term) {
        replayPending = false;
        const replayTerm = term;
        const element = replayTerm.element;
        if (element) element.style.visibility = 'hidden';
        replayTerm.write(action.data, () => {
          window.requestAnimationFrame(() => {
            if (!replayTerm.element) return;
            replayTerm.scrollToBottom();
            replayTerm.refresh(0, replayTerm.rows - 1);
            replayTerm.element.style.removeProperty('visibility');
          });
        });
      } else {
        term?.write(action.data);
      }
      return;
    }
    // A recognized control frame — interpret, never print.
    if (action.frame.type === 'exit') {
      const code = action.frame.exitCode;
      statusBar.textContent = `Exited: ${sessionId}${code === null ? '' : ` (code ${code})`}`;
      return;
    }
    if (action.frame.type === 'size') {
      term?.resize(action.frame.cols, action.frame.rows);
      return;
    }
    if (action.frame.type === 'attached') {
      replayPending = action.frame.hasReplay;
      if (action.frame.gap > 0 || action.frame.replayKind === 'snapshot') {
        term?.reset();
      }
    }
  };
  ws.onclose = (ev) => {
    statusBar.textContent = `Disconnected: ${sessionId} (code ${ev.code}${
      ev.reason ? ` — ${ev.reason}` : ''
    })`;
  };
  ws.onerror = () => {
    statusBar.textContent = `Connection error: ${sessionId}`;
  };

  // Keystrokes -> binary frame (server treats binary as PTY input).
  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data));
    }
  });

  // Resize -> JSON text control frame.
  resizeObserver = new ResizeObserver(() => {
    fit?.fit();
    sendResize();
  });
  resizeObserver.observe(terminalEl);
}

function sendResize(): void {
  if (!term || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
}

function highlightActive(): void {
  for (const li of Array.from(sessionsEl.children)) {
    li.classList.toggle(
      'active',
      (li as HTMLElement).textContent?.includes(activeSessionId || '\0') ?? false,
    );
  }
}

async function launchTestShell(): Promise<void> {
  statusBar.textContent = 'Launching test shell…';
  try {
    const res = await fetch(`${API_BASE}/dev/pty-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
    connect(body.sessionId);
  } catch (err) {
    statusBar.textContent = `Failed to launch test shell: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}

refreshBtn.onclick = () => void loadSessions();
newShellBtn.onclick = () => void launchTestShell();

void loadSessions();
