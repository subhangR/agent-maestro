# Codebase audit and candid roadmap

## Scope and evidence

The staging checkout contained 2,516 tracked paths and approximately 647k lines including code, Markdown, lockfiles, binary/media assets, tests, and generated/reference material. The audit traced the root workspace, application package manifests, server startup/container/config/routes/services/repositories, UI app/platform/stores/hooks/Firebase clients, CLI commands/prompting/spawners, PTY protocol, gateway, mobile, Cloud Functions, Firebase rules, deployment scripts, and representative tests.

Five pre-existing modified UI files were present at audit start and are intentionally excluded from this documentation commit: `SessionActivityPanel.test.tsx`, `AppWorkspace.tsx`, `SessionActivityPanel.tsx`, `styles-maestro-redesign.css`, and `vite.config.ts`.

## What is strong

- The product solves a real, painful multi-agent coordination problem and already spans terminal, tasks, files, agents, teams, collaboration, and remote access.
- The server's domain/application/infrastructure separation is a credible foundation.
- Local JSON storage keeps self-hosting simple and inspectable.
- PTY transport is separated from ordinary event WebSockets, and reconnect/offset tests show attention to streaming correctness.
- Firebase rules demonstrate serious thought about membership, immutable provenance, bounded fan-out, and invitation transactions.
- Provider-specific CLI adapters avoid hard-coding the product to a single agent vendor.
- Deployment documentation recognizes the Node versus Bun `node-pty` constraint and supports pragmatic TLS topologies.

## Honest weaknesses

### 1. Product surface area is ahead of product coherence — critical

The repository contains a very large number of panels, hooks, stores, workflows, provider paths, collaboration entities, and deployment modes. Discoverability and state consistency are likely harder than adding another feature. Freeze net-new surface area for one cycle and measure the core start/resume/share journeys.

### 2. Documentation drift is already visible — high

Some README sections still describe old ports, old repository lineage, older endpoint shapes, or different licensing language. A generated API/config reference and documentation CI are needed. One canonical product name, license statement, supported topology table, and port matrix should exist.

### 3. Local JSON will become the scale ceiling — high

It is suitable for a single trusted host, but multi-process writes, large task/session counts, query performance, migrations, and integrity become difficult. Keep JSON as an export/portable mode, but introduce a repository-compatible SQLite default before pursuing larger teams or hosted multi-tenancy.

### 4. Security posture is thoughtful but operationally incomplete — high

Add a threat model, dependency/SBOM scanning, secret scanning, route-by-route authorization tests, rate limits, audit logging, backup encryption, session revocation documentation, and a release security checklist. Password auth should never be marketed as internet-ready without TLS and brute-force protection.

### 5. State management fragmentation — high

Dozens of Zustand stores and hooks increase cross-store ordering, persistence, and teardown risks. Define ownership: server state in a query/cache layer, durable client preferences in explicit persisted stores, and ephemeral view state local to components. Publish a state/event contract.

### 6. Platform parity can hide divergent behavior — medium/high

Tauri, browser, mobile, gateway, local PTY, remote PTY, native filesystem, server filesystem, SSH, and Firebase each create alternate paths. Maintain a capability matrix and contract tests so unsupported behavior is explicit rather than failing late.

### 7. Observability is not yet enough for remote production — medium/high

Logs and health endpoints exist, but fleet operation needs metrics, traces, error correlation IDs, queue/trigger health, storage integrity, and user-visible diagnostics bundles.

## Recommended target architecture

```mermaid
flowchart LR
  UI[Desktop / Web / Mobile] --> BFF[Authenticated API + realtime gateway]
  CLI[CLI and agent hooks] --> BFF
  BFF --> CORE[Orchestration domain]
  CORE --> DB[(SQLite default; JSON import/export)]
  CORE --> PTY[Isolated PTY workers]
  CORE --> Q[Durable job/event queue]
  COLLAB[Firebase collaboration adapter] <--> CORE
  OBS[Metrics, traces, audit] <-- CORE
```

This preserves self-hosting and provider neutrality while giving reliable transactions, migrations, search, background work, and observability. Firebase remains an adapter for shared resources and presence, not a hidden second source of truth for local orchestration.

## Prioritized roadmap

### 0–30 days: stabilize and explain

1. Reconcile README/product name/license/ports/endpoints with implementation.
2. Publish navigation, capability, data-classification, and deployment matrices.
3. Add smoke tests for start, reconnect/resume, task completion, file edit, and Collab Space share.
4. Create threat model and release checklist; enable dependency and secret scanning.
5. Define telemetry events and a privacy-safe diagnostics bundle.

### 31–90 days: simplify and harden

1. Consolidate UI state ownership and standardize loading/empty/error/offline states.
2. Establish design tokens and an accessible shared component library.
3. Introduce SQLite behind existing repository interfaces with tested migration/export.
4. Add permission/rate-limit/audit coverage for filesystem, Git, PTY, gateway, invite, and voice boundaries.
5. Add schema/version compatibility checks between UI, server, CLI, gateway, mobile, and Firebase functions.

### 3–6 months: operate confidently

1. Isolate PTY/agent processes with quotas and explicit workspace permissions.
2. Add OpenTelemetry, service dashboards, SLOs, and backup/restore drills.
3. Build signed releases, update channels, provenance/SBOM, and rollback automation.
4. Run moderated usability testing and accessibility audits on desktop, browser, and mobile.
5. Decide deliberately whether Maestro is a local developer tool, team self-hosted platform, or managed service; each requires a different security and data model.

## Bold product recommendation

Do not compete by accumulating every agent feature. Win by being the most trustworthy place to understand and control multi-agent work. The differentiator should be legibility: who asked for what, which agent acted, what context and permissions it had, what changed, what evidence passed, what it cost, and how to undo it.

## Definition of a high-quality next release

- A new user can launch a useful agent session within five minutes without reading deployment internals.
- An experienced user can resume ten concurrent sessions without losing identity or output continuity.
- Every destructive or remote action has visible scope and an audit trail.
- Desktop/browser/mobile capability differences are documented in-product.
- A restore drill proves projects, tasks, sessions, and collaboration references survive failure.
- Accessibility and security checks run in CI and block regressions in critical flows.
