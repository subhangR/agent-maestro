// routes.ts — the explicit route contract between Compass (navigation) and the
// feature streams (Forge). Features import these helpers; they NEVER hardcode a
// path string, and Compass never hardcodes a feature's. The `as Href` casts are
// centralised here (one file) so call sites stay clean and type-checked.
//
// Route tree (expo-router v6, file-based):
//   (tabs)
//     (sessions)/index            · (sessions)/session/[id]
//     (tasks)/index               · (tasks)/task/[id]
//     (members)/index             · (members)/member/[id] · (members)/team/[id]
//     (more)/index
//   terminal/[sessionId]          (fullScreenModal)
//   (connect)/index               (NO-AUTH host-entry gate)
import type { Href } from 'expo-router';

// Entity ids are plain strings across the domain (branding lives only in the id
// helpers), so these builders take `string` — callers pass `session.id` directly.

/** Stable route-name constants (group/segment names) — single source of truth. */
export const ROUTE = {
  tabs: '(tabs)',
  sessions: '(sessions)',
  tasks: '(tasks)',
  members: '(members)',
  more: '(more)',
  connect: 'connect',
  terminal: 'terminal',
} as const;

/** Typed href builders. Use with `router.push(routes.session(id))`. */
export const routes = {
  // Tab homes
  sessions: (): Href => '/(tabs)/(sessions)' as Href,
  tasks: (): Href => '/(tabs)/(tasks)' as Href,
  members: (): Href => '/(tabs)/(members)' as Href,
  more: (): Href => '/(tabs)/(more)' as Href,

  // Detail (pushed) screens
  session: (id: string): Href => `/(tabs)/(sessions)/session/${id}` as Href,
  task: (id: string): Href => `/(tabs)/(tasks)/task/${id}` as Href,
  member: (id: string): Href => `/(tabs)/(members)/member/${id}` as Href,
  team: (id: string): Href => `/(tabs)/(members)/team/${id}` as Href,

  // Full-screen modal route (Relay's terminal body)
  terminal: (sessionId: string): Href => `/terminal/${sessionId}` as Href,

  // Connect gate + project deep-link (intercepted → set active project → Sessions)
  connect: (): Href => '/connect' as Href,
  project: (_id: string): Href => '/(tabs)/(sessions)' as Href,
} as const;

export type Routes = typeof routes;
