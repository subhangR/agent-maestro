// TEMP: Phase-1 on-device test harness (Sentinel). Exercises the REAL Phase-1
// modules (@/services/api + @/services/realtime + @/state + @/theme + @/components)
// against a live maestro-server. NOT shipped — Atlas reverts the index.ts entry
// edit before any prod commit. Imports ONLY app modules + react-native (never the
// jest/Maelstrom harness), so Metro can bundle it cleanly.
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { ThemeBoot, useAppFonts, useTheme } from '@/theme';
import { Text, Button, Input, Card, StatusDot } from '@/components';
import {
  buildServerConfig,
  MaestroClient,
  type ServerConfig,
} from '@/services/api';
import {
  createRealtime,
  type Realtime,
  type RealtimeLedger,
  type RealtimeStatus,
} from '@/services/realtime';
import {
  setMaestroClient,
  fetchProjects,
  fetchTasks,
  fetchSessions,
  fetchTeamMembers,
  fetchTeams,
  ingestEvent,
  ingestBatch,
  resyncProject,
  useEntityStore,
} from '@/state';

// ---------------------------------------------------------------------------
// Auth spy: wrap global.fetch ONCE so we can prove on-device that the REST
// client sends ZERO auth machinery (no Authorization, no Cookie, no
// credentials:'include') to the server. This is the v1 NO-AUTH contract check.
// ---------------------------------------------------------------------------
type AuthProbe = { requests: number; authSeen: string[] };
const authProbe: AuthProbe = { requests: 0, authSeen: [] };
let fetchWrapped = false;

function installAuthSpy() {
  if (fetchWrapped) return;
  fetchWrapped = true;
  const orig = global.fetch;
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api') || url.includes(':4569') || url.includes('/health')) {
        authProbe.requests += 1;
        const h = new Headers(init?.headers as HeadersInit | undefined);
        if (h.has('authorization')) authProbe.authSeen.push('Authorization');
        if (h.has('cookie')) authProbe.authSeen.push('Cookie');
        if (init?.credentials === 'include') authProbe.authSeen.push("credentials:'include'");
      }
    } catch {
      /* never let the spy break a request */
    }
    return orig(input as RequestInfo, init);
  }) as typeof fetch;
}

type Phase = 'idle' | 'connecting' | 'connected' | 'error';

export function DevHarness() {
  const theme = useTheme();
  const [host, setHost] = useState('192.168.1.5:4569');
  const [phase, setPhase] = useState<Phase>('idle');
  const [health, setHealth] = useState<boolean | null>(null);
  const [wsStatus, setWsStatus] = useState<RealtimeStatus>('idle');
  const [wsEvents, setWsEvents] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);

  const realtimeRef = useRef<Realtime | null>(null);
  const evCount = useRef(0);

  // Live entity counts straight from the store the REST fetches + WS ingest write.
  const counts = useEntityStore(
    useShallow((s) => ({
      projects: Object.keys(s.projects).length,
      tasks: Object.keys(s.tasks).length,
      sessions: Object.keys(s.sessions).length,
      teamMembers: Object.keys(s.teamMembers).length,
      teams: Object.keys(s.teams).length,
    })),
  );

  const ledger: RealtimeLedger = useMemo(
    () => ({
      ingestBatch: (events) => {
        evCount.current += events.length;
        setWsEvents(evCount.current);
        ingestBatch(events);
      },
      ingestEvent: (event) => {
        evCount.current += 1;
        setWsEvents(evCount.current);
        ingestEvent(event);
      },
      resyncProject: (projectId) => resyncProject(projectId),
    }),
    [],
  );

  const connect = useCallback(async () => {
    setErrorMsg(null);
    setHealth(null);
    setPhase('connecting');
    try {
      installAuthSpy();

      // 1. Build ServerConfig from the bare host:port the user typed.
      const cfg = buildServerConfig(host);
      setConfig(cfg);

      // 2. Instantiate the real client + wire it into @/state.
      const client = new MaestroClient(cfg);
      setMaestroClient(client);

      // 3. GET {serverUrl}/health first (the boot gate).
      const ok = await client.probeHealth();
      setHealth(ok);
      if (!ok) throw new Error('health probe returned false');

      // 4. REST fetch → populates the entity store (counts render below).
      // Projects first so we can scope the project-scoped fetches.
      await fetchProjects();
      const firstProject = Object.keys(useEntityStore.getState().projects)[0];
      if (firstProject) {
        await Promise.all([
          fetchTasks(firstProject),
          fetchSessions({ projectId: firstProject }),
          fetchTeamMembers(firstProject),
          fetchTeams(firstProject),
        ]);
      } else {
        await fetchSessions();
      }

      // 5. Wire realtime (entity-sync WS + /pty) against the SAME config.
      const rt = createRealtime({
        getWsUrl: () => cfg.wsUrl,
        getPtyWsUrl: () => cfg.ptyWsUrl,
        ledger,
      });
      realtimeRef.current = rt;
      rt.entitySync.onStatus((s) => setWsStatus(s));
      rt.entitySync.setActiveProject(firstProject as never);
      rt.start();

      setPhase('connected');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [host, ledger]);

  const disconnect = useCallback(() => {
    realtimeRef.current?.stop();
    realtimeRef.current = null;
    setWsStatus('idle');
    setPhase('idle');
  }, []);

  const wsDotStatus =
    wsStatus === 'connected'
      ? 'run'
      : wsStatus === 'connecting'
        ? 'wait'
        : wsStatus === 'disconnected'
          ? 'block'
          : 'idle';

  const authClean = authProbe.authSeen.length === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.paper }}
      contentContainerStyle={{ padding: theme.space[4], gap: theme.space[3] }}
    >
      <Text variant="display" color="ink">
        Phase-1 Smoke
      </Text>
      <Text variant="eyebrow" color="ink3">
        live server · real modules · zero-auth
      </Text>

      <Card style={{ gap: theme.space[2] }}>
        <Text variant="label" color="ink2">
          Server host
        </Text>
        <Input
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="192.168.1.5:4569"
        />
        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <Button
            label={phase === 'connecting' ? 'Connecting…' : 'Connect'}
            variant="primary"
            onPress={connect}
          />
          <Button label="Disconnect" variant="secondary" onPress={disconnect} />
        </View>
      </Card>

      <Card style={{ gap: theme.space[2] }}>
        <Row label="Phase" value={phase} />
        <Row label="/health" value={health == null ? '—' : health ? '200 OK' : 'FAIL'} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <StatusDot status={wsDotStatus} />
          <Text variant="body" color="ink">
            WS: {wsStatus}
          </Text>
        </View>
        <Row label="WS events received" value={String(wsEvents)} />
        {errorMsg ? (
          <Text variant="body" color="block">
            error: {errorMsg}
          </Text>
        ) : null}
      </Card>

      <Card style={{ gap: theme.space[1] }}>
        <Text variant="label" color="ink2">
          Entity counts (store)
        </Text>
        <Row label="projects" value={String(counts.projects)} />
        <Row label="tasks" value={String(counts.tasks)} />
        <Row label="sessions" value={String(counts.sessions)} />
        <Row label="teamMembers" value={String(counts.teamMembers)} />
        <Row label="teams" value={String(counts.teams)} />
      </Card>

      <Card style={{ gap: theme.space[1] }}>
        <Text variant="label" color="ink2">
          Zero-auth proof
        </Text>
        <Row label="REST requests seen" value={String(authProbe.requests)} />
        <Row
          label="auth bytes"
          value={authClean ? 'NONE ✓' : authProbe.authSeen.join(', ')}
        />
      </Card>

      {config ? (
        <Card style={{ gap: theme.space[1] }}>
          <Text variant="label" color="ink2">
            Derived URLs
          </Text>
          <Mono label="api" value={config.apiBaseUrl} />
          <Mono label="ws" value={config.wsUrl} />
          <Mono label="pty" value={config.ptyWsUrl} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: theme.space[3],
      }}
    >
      <Text variant="body" color="ink3">
        {label}
      </Text>
      <Text variant="body" color="ink">
        {value}
      </Text>
    </View>
  );
}

function Mono({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text variant="eyebrow" color="ink4">
        {label}
      </Text>
      <Text variant="code" color="ink2">
        {value}
      </Text>
    </View>
  );
}

// Root: boots the theme + fonts exactly like RootScaffold, then mounts the harness.
export function DevHarnessRoot() {
  useAppFonts();
  return (
    <ThemeBoot>
      <DevHarness />
    </ThemeBoot>
  );
}
