# Maestro UI — Full Feature Tour (video + screenshots)

Automated Playwright tour of the Maestro web UI, driven headless (Chromium) at
1440×900. Covers the flow from the login gate and first-run onboarding, through
**raising (creating) a task**, and across every primary tab and panel in the
left icon-rail.

## How it was produced

- **App under test:** Maestro web UI (Vite dev, browser mode) served at
  `http://127.0.0.1:4571/`, with its `/api` proxied to the already-running
  maestro-server on `127.0.0.1:4570` (master data dir `~/.maestro/data`).
- Launched with: `VITE_APP_MODE=browser MAESTRO_DEV_API_PROXY=http://127.0.0.1:4570 bunx vite --port 4571 --strictPort --host 127.0.0.1`
  (see `start-ui.sh`). Standard `dev:all` was not usable — it launches the
  **Tauri** desktop shell, which cannot run on this headless server.
- Driver script: `tour.mjs` (Playwright JS, `node_modules` install with
  chromium-1223 + ffmpeg-1011). Video via `recordVideo`.
- The tour authenticated through the password gate and completed the two-step
  first-run onboarding, then set `agents-ui-advanced-mode-v1=1` in localStorage
  so the developer-only rail items (**Files**, **Model profiles**) were visible.
- Active project during the tour: **"Will"** (the project selected by default).
  A real demo task, *"UI Tour — Demo Task"*, was created via the modal and saved
  (verified present in the backend).

## Video

| File | Shows |
|------|-------|
| `video/page@7c1b2fb8dcfef6d0e5b9db14d03779ba.webm` | Full end-to-end tour recording (~2.8 MB, 1440×900): login → onboarding → create task → all task sub-tabs → task detail → Lists → Team → Skills → Graphs → Collab → Token analytics → Model profiles → Files. |

## Screenshots (`screens/`)

| # | File | Screen / feature |
|---|------|------------------|
| 01 | `01-login-gate.png` | Password login gate ("Enter password to continue"). |
| 02 | `02-onboarding-step1-theme.png` | First-run onboarding step 1 — app style (Terminal/Material/Glass/Minimal) + color theme + UI scale. |
| 03 | `03-onboarding-step2-sound.png` | First-run onboarding step 2 — sound settings, with Back / Get Started. |
| 04 | `04-dashboard-initial-load.png` | Main dashboard after onboarding: left icon-rail, Tasks panel (default), center session canvas, right Sessions panel. |
| 05 | `05-tasks-panel.png` | **TASKS** tab — task list with New task, search, filter chips (All/High/Overdue/Status), Run / Run as team, "In progress" task cards. |
| 06 | `06-create-task-modal-empty.png` | **RAISING A TASK** — CreateTaskModal just opened (empty). |
| 07 | `07-create-task-modal-filled.png` | Create-task modal filled: title "UI Tour — Demo Task" + description, Attach/Reference, Skills/Ref Tasks/Details, Assign/Options, Cancel / Save for later / Start. |
| 08 | `08-tasks-after-create.png` | Tasks panel after the demo task was created (Save for later). |
| 09 | `09-tasks-current.png` | Tasks → **Current** (active) sub-tab. |
| 10 | `10-tasks-pinned.png` | Tasks → **Pinned** sub-tab. |
| 11 | `11-tasks-completed.png` | Tasks → **Completed** sub-tab. |
| 12 | `12-tasks-archived.png` | Tasks → **Archived** sub-tab. |
| 13 | `13-task-detail-overlay.png` | Task detail overlay opened from a task card (title, description, subtasks, tabs, actions). |
| 14 | `14-lists-panel.png` | **LISTS** tab — Task Lists (empty state for "Will": New list / Create Task List). |
| 15 | `15-team-members.png` | **TEAM** tab → Members sub-tab — 10 members (Simple Worker, Coordinator, Batch/DAG Coordinator, Recruiter, Standup, Remote Controller, VPS Setup Agent, Will Coach Engineer) + global members; New member / Standup. |
| 16 | `16-team-teams.png` | **TEAM** tab → Teams sub-tab. |
| 17 | `17-skills-panel.png` | **SKILLS** tab — Installed (3: frontend-d…, remotion-b…, deploy-will) / Marketplace, filter, project vs global scopes. |
| 18 | `18-graphs-panel.png` | **GRAPHS** tab — task graph / execution workflows (empty state for "Will": New graph). |
| 19 | `19-collab-space.png` | **COLLAB SPACE** tab — "Sign in to Maestro Collab" (Google / email — Firebase auth; not signed in). |
| 20 | `20-token-analytics.png` | **TOKEN ANALYTICS** tab — 1h/24h/7d/30d windows, global in/out/total token totals. |
| 21 | `21-model-profiles.png` | **MODEL PROFILES** tab (advanced) — Balanced (Sonnet 4.6), Fast (Haiku 4.5), Heavy (Opus 4.8), Ultra (Fable 5); New profile / Edit / Delete. |
| 22 | `22-files-panel.png` | **FILES** tab (advanced) — file browser rooted at the project working dir (`~/Will`). |
| 23 | `23-tour-end-tasks.png` | Returned to the Tasks tab — final frame. |

## Coverage notes / what could NOT be fully reached

- **All primary rail destinations were reached:** Tasks, Team (Members + Teams),
  Skills, Lists, Graphs, Collab Space, Token analytics, Model profiles (advanced),
  Files (advanced). Task sub-tabs (Current/Pinned/Completed/Archived), the
  create-task modal, and the task detail overlay were all captured.
- **Right-hand Sessions panel** (Terminals / Agents / Docs / Drawing tabs, and
  Open/Done/Archived/Huddles filters) is visible in every screenshot but was not
  individually driven, because launching a live session would spawn a real Claude
  agent — deliberately avoided during a read-only tour. The demo task was created
  with **"Save for later"** (not "Start") for the same reason.
- **Collab Space** shows the sign-in screen only — it requires a Firebase/Google
  account, which is not authenticated in this environment.
- Several panels show **empty states** (Lists, Graphs, Token analytics) because
  the default active project **"Will"** has no lists/graphs and no completed
  sessions in-window. Richer projects (e.g. "Master") exist in the other top-bar
  project tabs but were not switched into; the empty states themselves are a
  faithful part of the feature surface.
- Spells/settings surfaces are reached through icons/menus (top-bar icons, the
  `…` overflow on panels) rather than a dedicated rail tab; these menus were not
  expanded individually.

## Re-running

```bash
# 1. Ensure the UI is up (proxying to server 4570):
/home/ubuntu/agent-maestro/ui-tour-artifacts/start-ui.sh &   # serves 127.0.0.1:4571
# 2. Run the tour:
cd /home/ubuntu/agent-maestro && node ui-tour-artifacts/tour.mjs
```

Login password is read from the running server's `MAESTRO_AUTH_PASSWORD` env and
is hard-coded in `tour.mjs`. A per-run log is written to `tour-run.log`.
