# `@/whiteboard` — editable Excalidraw whiteboard (Phase 5)

The editable counterpart to the read-only `DocsViewer` (`src/features/docs`).
`DocsViewer` statically paints an Excalidraw scene onto a `<canvas>`; this hosts
the **full Excalidraw editor** inside a `react-native-webview` and persists edits
back to the server.

## What it does

- **Host:** `<WhiteboardView sessionId?|taskId?|projectId? docId? newDocTitle? />`
  renders a WebView whose page loads React 18 + ReactDOM 18 + the
  `@excalidraw/excalidraw` UMD bundle and mounts `<Excalidraw>`.
- **Load:** fetches docs via `getMaestroClient().getSessionDocs / getTaskDocs /
  getProjectDocs`, picks the scene doc (`isExcalidrawSceneJson`, else first
  `kind:'diagram'`, else the `docId` match) and injects its JSON as `initialData`.
- **Save:** the WebView serializes the scene on change (debounced ~800 ms) and
  posts it back; `onMessage` persists via `updateDocContent(ownerSessionId,
  docId, content)`, or creates a new doc with `addSessionDoc` / `addTaskDoc`
  (`kind:'diagram'`) when there is no existing scene.

## Persistence model — docs API ONLY

Scenes persist as **server DOCS**, never as Tauri `save_session_asset` (mobile
has no Tauri). All server doc-write routes are **session-scoped**
(`/sessions/:id/docs/...`), so saving requires an **owning session id** — taken
from the `sessionId` prop, else the loaded doc's `addedBy`. A task/project board
with neither opens **read-only** (a banner explains why); pass a `sessionId` to
edit.

## CDN vs. offline caveat (production TODO)

The editor loads Excalidraw + React from **unpkg (CDN)**. On a VPN-only network
with no public internet the scripts fail and the page shows a graceful fallback
(scene preserved, not editable until network returns). **Production should inline
the Excalidraw + React UMD assets** and point `window.EXCALIDRAW_ASSET_PATH` at a
bundled directory. See `editorHtml.ts` (`EXCALIDRAW_VERSION`, the `*_SRC`
constants).

## On-device validation DEFERRED

Built on a headless cloud host, so the gate is **`npx tsc --noEmit` + the Android
export**, not a running editor. The scene↔doc round-trip and the WebView message
protocol are exercised only by types until on-device validation is scheduled.

## Local docs port

`docsPort.ts` declares the exact docs surface the whiteboard consumes and returns
the wired client narrowed to it. The `MaestroClientApi` seam now exposes the docs
methods, so this is a cast-free structural subset — the file is optional and may
be inlined to `getMaestroClient()` if preferred.

## Boundaries

May import `@/state`, `@/theme`, `@/domain`; imported by `features`. Must NOT be
imported by `state`/`services`. Not yet mounted into any route — navigation is a
Stream-B follow-up.
