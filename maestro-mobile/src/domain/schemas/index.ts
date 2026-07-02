// Barrel for zod boundary schemas. Deliberately NOT re-exported by the domain
// barrel (src/domain/index.ts) — import these explicitly so type-only screens
// never pull zod into their dependency graph.
export { spawnSessionRequestSchema, type SpawnSessionRequest } from './spawn';
export { parseWsMessage } from './wsEnvelope';
