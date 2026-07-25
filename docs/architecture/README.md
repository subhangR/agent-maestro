# Codebase architecture

Maestro is organized as a package-based monorepo. The existing top-level package names remain stable because release scripts, Tauri configuration, deployments, and downstream users depend on them. `architecture.json` is the canonical grouping and the architecture check enforces the important boundaries without breaking those paths.

## Package groups

| Group | Packages | Responsibility |
|---|---|---|
| Frontend | `maestro-ui`, `maestro-web`, `maestro-mobile`, `website` | User interfaces and platform-specific presentation |
| Backend | `maestro-server`, `maestro-gateway`, `functions` | APIs, orchestration, persistence, realtime transport, and cloud adapters |
| Interfaces | `maestro-cli` | Human and automation command surface |
| Shared | `maestro-pty-protocol` | Runtime-independent contracts used across package boundaries |
| Operations | `deploy`, `scripts` | Build, deployment, setup, and maintenance tooling |

## Dependency direction

```text
frontends ─┐
interfaces ├──> shared contracts
backends ──┘

frontends -X-> backends
backends  -X-> frontends
shared    -X-> runtime/application packages
```

Clients communicate with backends through REST, WebSocket, PTY, Firebase, and shared protocol contracts. They must not import backend implementation packages. Backends must not import frontend implementation packages. Shared packages must remain dependency-light and transport/runtime independent.

Within `maestro-server`, dependencies point inward: API and infrastructure adapters depend on application/domain contracts; the domain does not depend on Express, filesystem, WebSocket, or cloud implementations. Within frontend packages, reusable state and behavior belong in hooks/services, presentation belongs in components, and platform-specific behavior belongs behind platform adapters.

## Verification

Run `bun run check:architecture` after changing workspaces or package dependencies. Run `bun run check` for architecture validation plus all primary builds and tests.

The manifest intentionally groups packages logically instead of renaming stable directories. A future physical move to `apps/` and `packages/` should only happen as a dedicated migration with redirects/compatibility shims and deployment validation.
