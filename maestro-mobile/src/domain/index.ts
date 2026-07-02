// Domain barrel — the shared vocabulary for the whole app. Pure TypeScript:
// no React, no fetch, no WebSocket, no platform APIs.
//
// Re-exports primitives, branded ids, enums, entities, wire contracts, and the
// derive/ display reconciliation. It does NOT re-export schemas/ (zod) — import
// those explicitly (`@/domain/schemas/spawn`) so type-only consumers stay free
// of the zod dependency.
export * from './primitives';
export * from './ids';
export * from './enums';
export * from './entities';
export * from './contracts';
export * from './derive';
