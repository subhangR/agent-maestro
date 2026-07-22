# Maestro Trusted-Team Hub — Design Folder

Everything for turning Maestro into a **single-server, multi-user trusted-team hub** (pooled compute + pooled AI subscriptions, per-user isolated workspaces, one Google login shared with Collab, zero-setup onboarding).

## Read in this order
1. **`HANDOFF.md`** — START HERE. Compiled context, the user journey, all locked decisions, the key A/B fork, open risks, phasing, and next steps.
2. **`ARCHITECTURE.md`** — full current-state map + long-term north star. **Part 0** is the reframe (source of truth for intent).
3. **`DESIGN-A.md`** — Process-per-user (gateway + instance-per-user). **✅ FINALIZED L1 spec, ready to build.** This is the chosen design.
4. **`DESIGN-B.md`** — Single multi-tenant server (uid-scoped repos). **Deferred** — A/B collapsed to A for L1; B revisited only when process count hurts.

## One-paragraph summary
Collaboration (Jira + Slack + sharing + Google auth) **already exists** as the shipped Firebase **Collab Space**. The only genuinely-new work is a **shared always-on server** that pools compute + AI subscriptions and gives each user a private server-side workspace, linked to Collab via decision **P6** (server-as-gateway). The main open fork is **how to isolate per-user workspaces** — process-per-user (A) vs single multi-tenant process (B). The must-prove-first crux is **per-session credential isolation** (can 10 concurrent agents each use a different pooled subscription on one box via `CLAUDE_CONFIG_DIR`).

Final home for tasks/handoff: **Agent-maestro project `proj_1770533548982_3bgizuthk`**.
