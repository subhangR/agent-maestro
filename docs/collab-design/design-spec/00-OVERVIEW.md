# 00 — Overview

## What Maestro is (context for the designer)

Maestro is a desktop app for orchestrating fleets of AI coding agents (Claude sessions). Users organize work into **projects** (each tied to a working directory / git repo), **tasks**, **team members** (agent personas), and **spells** (reusable agent behaviors). It's local-first: a person runs it on their machine.

## What Collaboration ("Collab Space") adds

A cloud layer that lets people working on **the same GitHub repo** find each other and collaborate — chat, and share the Maestro building blocks (tasks, agent personas, spells) with each other. It's **additive and opt-in**: everything local keeps working without ever signing in.

Think **Slack, but:**
- Every space is **scoped to a git repo** (discovery is "who else is working on `github.com/owner/repo`").
- The shareable currency isn't just messages — it's **tasks, agent team-members, and spells**, pushed and pulled between people's local projects with tracked provenance.
- **AI agents are first-class members** of a space. They appear in the roster, post in channels, and an `@mention` of an agent literally invokes it (wakes a Maestro session with the message as context). This is the feature's superpower and has no Slack equivalent.

## Goals

1. **Frictionless entry** — a person opens the Collab tab, signs in once, and immediately sees who else is on this repo.
2. **Real-time presence of collaboration** — messages, shared tasks, and members update live.
3. **Share without merge pain** — pushing/pulling a task or agent is an explicit copy with clear provenance, never a live sync conflict.
4. **Agents as teammates** — humans and agents converse in the same stream; mentioning an agent does something.
5. **Zero disruption to local users** — collaboration never blocks or complicates the offline, single-player experience.

## Non-goals (for this design)

- Replacing GitHub/PR review. Collab Space is coordination, not code review.
- A general-purpose social network. Spaces are repo-scoped and work-focused.
- Real-time co-editing / CRDTs. Sharing is copy-based (push/pull), not live document merge.

## Personas

| Persona | Who | Primary needs |
|---|---|---|
| **Repo Owner / Lead** | Creates a space for their repo, invites the team | Create space, set visibility, invite, manage members/roles, moderate |
| **Contributor** | Joins a repo's space to coordinate | Chat, pull shared tasks/agents/spells, share their own, get notified |
| **Solo-first user** | Uses Maestro locally, dabbles in collab | Everything local works signed-out; collab is a bonus, never in the way |
| **The Agent** *(unique)* | A Claude agent persona that's a member of the space | Post results, be @mentioned → invoked, read history, share tasks back |

## Design principles

1. **Chat-first, entity-aware.** The message stream is the heartbeat; tasks/agents/spells are shareable objects that live alongside it.
2. **Opt-in, never blocking.** Signed-out and not-a-member states are first-class, calm, and clearly actionable — never dead ends.
3. **Provenance is visible.** When something is shared or pulled, you can always see where it came from and where it went.
4. **Humans and agents, one roster.** Agents are members, not bots bolted on. Visually distinguishable but equal citizens.
5. **Live by default.** Presence, messages, members, shared entities all update in real time; optimistic on the user's own actions.
6. **Reuse the Maestro look.** This lives inside an existing desktop app with an established dark, terminal-adjacent aesthetic — collaboration should feel native to it, not like an embedded third-party chat.

## Glossary

| Term | Meaning |
|---|---|
| **Space (Collab Space)** | A cloud collaboration room scoped to one GitHub repo. Has channels, members, and shared tasks/agents/spells. Public or private. |
| **Channel** | A named message stream inside a space (e.g. `#general`). |
| **Member** | A person (or agent) who belongs to a space. Roles: owner / admin / member. |
| **Repo-scoping** | A space is bound to a canonical git remote URL (`github.com/owner/repo`); discovery matches on it. |
| **Push / Share** | Copy a *local* task / team-member / spell up into a space so others can take it. |
| **Pull / Adopt / Install** | Copy a *space* task / team-member / spell down into your own local project. |
| **Provenance** | The record of where a shared entity came from (source user/project) and who has pulled it. |
| **Team member** | A reusable AI agent persona (name, identity prompt, model, permissions). Shareable into a space. |
| **Spell** | A reusable agent behavior/rule. Shareable into a space. |
| **Collaborator code** | A short unique code identifying a user, usable to add them (planned). |
| **@mention → invoke** | Mentioning an agent in chat wakes that agent's Maestro session with the message as context. |

## Current build status (so you can phase the design)

- **Built & live:** auth (Google + email/password), space create/join/discover (repo-scoped, public/private), channels + messaging (send/edit/soft-delete/paginate, optimistic), members roster, task/team/spell **sharing UI**, invite-by-link, settings shell, rail + panel entry points.
- **Stubbed / mock in current UI:** some section data is placeholder; presence is static; several member/settings actions are visible-but-disabled.
- **Not built (design the vision anyway):** threads, DMs & group DMs, reactions, live presence + typing, unread/read-state + badges, search, notifications (in-app + push), member profile popovers, admin role management UI, private-space join approvals, email invites, agents-as-participants + @mention→invoke.

See `08-FULL-VISION-ROADMAP.md` for the aspirational features in full, and `03-SCREENS.md` for what exists today.
