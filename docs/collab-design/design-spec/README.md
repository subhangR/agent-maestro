# Maestro Collaboration ("Collab Space") — Design Requirements

This folder is a **design handoff spec** for the entire Maestro Collaboration feature, end to end. It is written to be handed to Claude (or any designer) to design **every screen and every flow** — from first sign-in to real-time chat, task/agent/spell sharing, members, settings, and the full-vision features (threads, DMs, reactions, presence, unread, search, notifications, agents-in-chat).

It describes **what** each surface must do, its regions, states, interactions, and copy — **not** the visual styling. The visual design (color, type, spacing, components) is the deliverable you'll produce *from* this.

## How to read this

Read in order for a full mental model, or jump to what you're designing:

| File | What it gives you |
|---|---|
| `00-OVERVIEW.md` | Product concept, goals, personas, design principles, glossary |
| `01-INFORMATION-ARCHITECTURE.md` | Navigation model, entry points, the full surface map |
| `02-FLOWS.md` | Every end-to-end user flow, step by step |
| `03-SCREENS.md` | Per-surface spec: regions, controls, every rendered state |
| `04-COMPONENTS.md` | Reusable component inventory (props, variants, states) |
| `05-STATES-AND-EDGECASES.md` | Global state patterns: empty / loading / error / offline / permission |
| `06-CONTENT-AND-COPY.md` | Microcopy: titles, empty states, errors, buttons, hints |
| `07-DATA-MODEL.md` | Entities, fields, relationships, permissions (only what shapes the UI) |
| `08-FULL-VISION-ROADMAP.md` | The not-yet-built features to design: threads, DMs, reactions, presence, unread, search, notifications, admin, invites, agents-in-chat |
| `09-VISUAL-DESIGN-DIRECTION.md` | Layout grids, density, responsive targets, token guidance |

## Scope

**Full end-to-end vision.** Everything currently built on the product (auth, spaces, channels + messaging, members, task/team/spell sharing, invites) PLUS the natural missing pieces (threads, DMs & group DMs, reactions, presence, unread/read-state, search, notifications, member profiles, admin roles, join approvals, email invites, and the Maestro-unique "agents as chat participants / @mention → invoke").

Built vs. aspirational is labeled throughout so you can design Phase 1 and future phases distinctly, but design the **complete product** — assume it all exists.

## The one-line concept

> **Collab Space is a Slack-like collaboration layer scoped to a GitHub repo, where humans *and* AI agents are first-class members** — they chat in channels, share tasks/agents/spells with provenance, and an @mention of an agent actually *invokes* it.

Grounded in the real implementation on the product's `staging` branch as of this writing; every surface below exists in code or is specified in the design docs.
