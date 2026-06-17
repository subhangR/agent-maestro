// WhiteboardView — the EDITABLE Excalidraw surface (Phase 5).
//
// Counterpart to the read-only DocsViewer (src/features/docs): where DocsViewer
// statically paints a scene onto a canvas, this hosts the full Excalidraw editor
// inside a WebView and persists edits back to the server as a DOC (the docs API
// on getMaestroClient() — NOT a Tauri save_session_asset; mobile has no Tauri).
//
// SCENE ↔ DOC ROUND-TRIP:
//   load  : getSessionDocs / getTaskDocs / getProjectDocs → pickSceneDoc
//           (isExcalidrawSceneJson) → inject scene JSON into the WebView.
//   save  : WebView posts the serialized scene (debounced) → onMessage →
//           updateDocContent(owningSessionId, docId, content); a brand-new board
//           is created with addSessionDoc / addTaskDoc (kind:'diagram').
//
// EDITING REQUIRES A SESSION: the server's content-update + doc-create routes are
// all session-scoped (/sessions/:id/docs/...). So saving needs an owning session
// id — taken from the `sessionId` prop, else the loaded doc's `addedBy`. When a
// task/project board has neither, the editor opens READ-ONLY-ish (edits can't be
// persisted) and surfaces a clear notice.
//
// ON-DEVICE VALIDATION DEFERRED: this builds on a headless cloud host, so the
// gate here is `tsc --noEmit` + the Android export, not a running editor. The
// WebView loads Excalidraw from a CDN with a graceful offline fallback — see the
// module README for the production "inline the assets" TODO.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components';
import { hasMaestroClient } from '@/state';
import { useTheme, useThemeName } from '@/theme';
import type { DocEntry } from '@/domain';

import { buildEditorHtml, type WebViewOutMessage } from './editorHtml';
import { getDocsClient } from './docsPort';
import { docContent, pickSceneDoc, EMPTY_SCENE } from './scene';

export interface WhiteboardViewProps {
  /** Owning session — required to persist edits (load-only without it). */
  sessionId?: string;
  /** Load scene docs from this task (in addition to / instead of a session). */
  taskId?: string;
  /** Load scene docs from this project (read-only unless a session owns the doc). */
  projectId?: string;
  /** Open a specific doc; otherwise the first Excalidraw scene in the list. */
  docId?: string;
  /** Title used when creating a brand-new scene doc (no existing scene found). */
  newDocTitle?: string;
}

type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; doc: DocEntry | null; scene: string }
  | { phase: 'error'; message: string };

/** Resolve which doc list to fetch from, given the identifying props. */
async function fetchSceneDocs(props: WhiteboardViewProps): Promise<DocEntry[]> {
  const client = getDocsClient();
  if (props.sessionId != null) return client.getSessionDocs(props.sessionId);
  if (props.taskId != null) return client.getTaskDocs(props.taskId);
  if (props.projectId != null) return client.getProjectDocs(props.projectId);
  return [];
}

export function WhiteboardView(props: WhiteboardViewProps): React.JSX.Element {
  const { sessionId, taskId, docId, newDocTitle } = props;
  const theme = useTheme();
  const themeName = useThemeName();

  const connected = hasMaestroClient();
  const [state, setState] = useState<LoadState>({ phase: 'idle' });
  // `soft` notices (read-only / not-yet-saveable) render calm; only genuine
  // persistence failures on an existing doc render as a red error.
  const [saveError, setSaveError] = useState<{ text: string; soft?: boolean } | null>(null);

  // The doc we persist edits to (resolved on load; may be created on first save).
  const docRef = useRef<DocEntry | null>(null);
  // The session that owns the doc — required by every server doc-write route.
  const ownerSessionId = sessionId ?? docRef.current?.addedBy;
  // Guards against overlapping/duplicate saves stomping each other.
  const savingRef = useRef(false);

  const hasIdentity = sessionId != null || taskId != null || props.projectId != null;

  // ── Load: fetch docs → pick the scene → stage it for the WebView ──────────
  useEffect(() => {
    if (!connected || !hasIdentity) return;
    let cancelled = false;
    setState({ phase: 'loading' });
    setSaveError(null);
    (async () => {
      try {
        const docs = await fetchSceneDocs(props);
        if (cancelled) return;
        const doc = pickSceneDoc(docs, docId) ?? null;
        docRef.current = doc;
        const raw = doc ? docContent(doc) : '';
        setState({ phase: 'ready', doc, scene: raw.trim() ? raw : EMPTY_SCENE });
      } catch (err) {
        if (cancelled) return;
        setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-load when the doc location changes. props is stable-enough via primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, hasIdentity, sessionId, taskId, props.projectId, docId]);

  // ── Save: persist a scene posted by the WebView ───────────────────────────
  const persistScene = useCallback(
    async (content: string) => {
      if (savingRef.current) return;
      const owner = sessionId ?? docRef.current?.addedBy;
      savingRef.current = true;
      try {
        const client = getDocsClient();
        const existing = docRef.current;
        if (existing) {
          if (owner == null) {
            setSaveError({ text: 'Edits won’t persist — this scene has no owning session.', soft: true });
            return;
          }
          await client.updateDocContent(owner, existing.id, content);
        } else {
          // Brand-new board: create the doc. Requires a session to own it.
          if (sessionId == null) {
            setSaveError({ text: 'Read-only — open from a session to save a new whiteboard.', soft: true });
            return;
          }
          const title = newDocTitle ?? 'Whiteboard';
          const created =
            taskId != null
              ? await client.addTaskDoc(taskId, sessionId, title, content, 'diagram')
              : await client.addSessionDoc(sessionId, title, content, 'diagram');
          docRef.current = created;
        }
        setSaveError(null);
      } catch (err) {
        // A failure while creating the very first scene (no doc yet) is treated as
        // a calm notice — an empty board hasn't committed anything to lose.
        setSaveError({ text: err instanceof Error ? err.message : String(err), soft: docRef.current == null });
      } finally {
        savingRef.current = false;
      }
    },
    [sessionId, taskId, newDocTitle],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: WebViewOutMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data) as WebViewOutMessage;
      } catch {
        return;
      }
      if (msg.type === 'scene') void persistScene(msg.content);
      else if (msg.type === 'error') setSaveError({ text: `Editor: ${msg.message}` });
    },
    [persistScene],
  );

  const html = useMemo(() => {
    if (state.phase !== 'ready') return null;
    return buildEditorHtml(state.scene, themeName, theme);
  }, [state, themeName, theme]);

  // ── Render states ─────────────────────────────────────────────────────────
  if (!connected) {
    return <Centered>Connect to a Maestro host to open the whiteboard.</Centered>;
  }
  if (!hasIdentity) {
    return <Centered>No whiteboard target — pass a sessionId, taskId, or projectId.</Centered>;
  }
  if (state.phase === 'loading' || state.phase === 'idle') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.brand} />
      </View>
    );
  }
  if (state.phase === 'error') {
    return <Centered tone="error">Couldn’t load whiteboard: {state.message}</Centered>;
  }

  const readOnlyNotice = ownerSessionId == null;

  return (
    <View style={styles.root}>
      <WebView
        originWhitelist={['*']}
        source={{ html: html ?? '' }}
        style={styles.flex}
        javaScriptEnabled
        domStorageEnabled
        onMessage={onMessage}
        setSupportMultipleWindows={false}
        // The editor owns its own gestures/scrolling.
        scrollEnabled={false}
      />
      {(saveError != null || readOnlyNotice) && (
        <View style={styles.banner}>
          <Text variant="label" color={saveError != null && !saveError.soft ? 'block' : 'ink3'} numberOfLines={2}>
            {saveError?.text ??
              'Read-only — edits won’t persist without an owning session. Open from a session to edit.'}
          </Text>
        </View>
      )}
    </View>
  );
}

function Centered({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}): React.JSX.Element {
  return (
    <View style={styles.center}>
      <Text variant="body" color={tone === 'error' ? 'block' : 'ink3'} style={styles.centerText}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.paper },
  flex: { flex: 1, backgroundColor: theme.colors.paper },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space[5],
    backgroundColor: theme.colors.paper,
  },
  centerText: { textAlign: 'center' },
  banner: {
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[2],
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
}));
