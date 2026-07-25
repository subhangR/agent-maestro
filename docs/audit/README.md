# Agent Maestro documentation set

This folder is the audited, plain-English product and engineering reference for the `staging` branch as reviewed on 24 July 2026.

## Documents

- [01_PRODUCT_AND_UX.md](01_PRODUCT_AND_UX.md) — product model, audiences, experience principles, UI inventory, accessibility, and official design-system references.
- [02_FUNCTIONAL_SPECIFICATION.md](02_FUNCTIONAL_SPECIFICATION.md) — feature behavior, user flows, rules, states, failures, and acceptance checks.
- [03_SYSTEM_ARCHITECTURE.md](03_SYSTEM_ARCHITECTURE.md) — frontend, backend, PTY, storage, Firebase, gateway, deployment, security, and operational flows.
- [04_CODEBASE_AUDIT_AND_ROADMAP.md](04_CODEBASE_AUDIT_AND_ROADMAP.md) — codebase map, evidence, risks, documentation gaps, and candid priorities.
- `Agent_Maestro_Product_Functional_Architecture_Audit.docx` — polished consolidated edition for nontechnical and technical readers.

## Reading order

Executives and product leaders should read the consolidated DOCX. Designers should begin with document 01. Engineers and operators should begin with documents 02 and 03. Maintainers planning the next release should read document 04 in full.

## Audit method and limits

The review inventoried all 2,516 tracked paths and approximately 647,000 lines reported by `wc`, then focused semantic review on application source, routes, services, repositories, clients, rules, tests, configuration, and deployment scripts. Binary media, fonts, generated bundles, lockfiles, and historical documents were cataloged rather than narrated line by line. This is more honest and reproducible than claiming that every byte of a PNG or generated lockfile received human-style code analysis.

The source code is the ultimate authority. Where older README text conflicts with implementation, these documents describe the current implementation and flag the drift.
