// AgentLogView — the raw provider (Claude/Codex) transcript for a session,
// surfaced for the non-Tauri mobile client via GET /agent-logs/list|read|tail.
// It resolves the provider from the session's agent tool and the cwd from the
// owning project's workingDir, finds the log file whose maestroSessionId matches
// this session, reads it, and — while the session is live — polls /tail from the
// last offset to append new output. Read-only, monospace, scrollable.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components';
import { getMaestroClient, hasMaestroClient, useProject, useSession } from '@/state';
import {
  asProjectId,
  asSessionId,
  toUiSessionStatus,
  type LogProvider,
  type Session,
} from '@/domain';

/** Live statuses worth auto-tailing (new output is still arriving). */
const LIVE = new Set(['spawning', 'working', 'run', 'wait']);
const TAIL_INTERVAL_MS = 2500;

/** Map a session's agent tool to a log provider (Codex vs Claude, default Claude). */
function providerFor(session: Session): LogProvider {
  const tool = (session.teamMemberSnapshot?.agentTool ?? '').toLowerCase();
  return tool.includes('codex') ? 'codex' : 'claude';
}

export function AgentLogView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const session = useSession(asSessionId(sessionId));
  const project = useProject(asProjectId(session?.projectId ?? ''));
  const cwd = project?.workingDir ?? '';
  const provider = session ? providerFor(session) : 'claude';
  const isLive = session != null && LIVE.has(toUiSessionStatus(session));

  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const filenameRef = useRef<string | null>(null);

  // Initial resolve + read: find this session's log file, then read it whole.
  useEffect(() => {
    if (!sessionId || !cwd || !hasMaestroClient()) {
      setStatus('empty');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    filenameRef.current = null;
    offsetRef.current = 0;
    const client = getMaestroClient();
    client
      .listAgentLogs(provider, cwd)
      .then((files) => {
        const match = files.find((f) => f.maestroSessionId === sessionId);
        if (!match) {
          if (!cancelled) setStatus('empty');
          return null;
        }
        filenameRef.current = match.filename;
        return client.readAgentLog(provider, cwd, match.filename);
      })
      .then((text) => {
        if (cancelled || text == null) return;
        offsetRef.current = utf8Bytes(text);
        setContent(text);
        setStatus(text.trim().length > 0 ? 'ready' : 'empty');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, cwd, provider]);

  // Live tail: append new bytes from the last offset while the session is active.
  useEffect(() => {
    if (!isLive || status === 'loading' || status === 'error') return;
    if (!cwd || !hasMaestroClient()) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const filename = filenameRef.current;
      if (!filename) return;
      try {
        const res = await getMaestroClient().tailAgentLog(provider, cwd, filename, offsetRef.current);
        if (cancelled || !res.content) return;
        offsetRef.current = res.newOffset;
        setContent((prev) => prev + res.content);
        setStatus('ready');
      } catch {
        /* transient — keep polling */
      }
    };
    const timer = setInterval(() => void tick(), TAIL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isLive, status, cwd, provider]);

  const providerLabel = useMemo(() => (provider === 'codex' ? 'Codex' : 'Claude'), [provider]);

  if (status === 'loading') return <Centered label="Loading logs…" />;
  if (status === 'error') return <Centered label={error ?? 'Could not load logs.'} tone="blockText" />;
  if (status === 'empty') {
    return <Centered label={`No ${providerLabel} log found for this session.`} />;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.metaRow}>
        <Text variant="eyebrow" color="ink3">
          {providerLabel} transcript{isLive ? ' · live' : ''}
        </Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        horizontal={false}
      >
        <ScrollView horizontal contentContainerStyle={styles.hContent}>
          <Text variant="mono" color="ink2" style={styles.log}>
            {content}
          </Text>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function Centered({ label, tone = 'ink3' }: { label: string; tone?: 'ink3' | 'blockText' }): React.JSX.Element {
  return (
    <View style={styles.centered}>
      <Text variant="secondary" color={tone} style={styles.centeredText}>
        {label}
      </Text>
    </View>
  );
}

/** Byte length of a UTF-8 string — the /tail offset is a byte offset server-side. */
function utf8Bytes(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i) ?? 0;
    if (c > 0xffff) i++; // surrogate pair consumed one extra unit
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    minHeight: 360,
    gap: theme.space[2],
  },
  metaRow: {
    paddingHorizontal: theme.space[1],
  },
  scroll: {
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    maxHeight: 520,
  },
  scrollContent: {
    padding: theme.space[3],
  },
  hContent: {
    minWidth: '100%',
  },
  log: {
    fontSize: 12,
    lineHeight: 17,
  },
  centered: {
    paddingVertical: theme.space[8],
    alignItems: 'center',
    paddingHorizontal: theme.space[4],
  },
  centeredText: {
    textAlign: 'center',
  },
}));
