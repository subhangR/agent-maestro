# DESIGN B — Single multi-tenant server (uid-scoped repos)

> SLOT: to be produced by the gpt-5.6-sol Worker B. See HANDOFF.md §4 (Option B) for the brief.
> Focus: one server process; container refactored to a per-uid repo factory; every request + realtime room scoped by uid; FileSystem-repo concurrency addressed. Feeds off Firebase Collab Space for the collab plane.
