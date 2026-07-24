# Maestro — Social Content Kit

Ready-to-post copy for Twitter/X, LinkedIn, Reddit, Instagram, Facebook, and Snapchat.

**Written to sound like a person, not a press release.** No "unlock", no "revolutionize", no
"in today's fast-paced world". Just a developer explaining a thing they built because the old way
was annoying.

- **Site:** https://maestro-web-fleet.web.app
- **Repo:** https://github.com/subhangR/agent-maestro
- **One-liner:** A local-first command center for running Claude Code, Codex, Gemini and other
  coding agents side by side — so you can actually see what they're doing.

**What Maestro actually does (the honest version):**
- Run several coding agents at once without babysitting a wall of terminals.
- See their work as a readable feed — decisions, file diffs, handoffs, blockers — in plain English. Drop into the raw terminal only when you want to.
- Give agents roles: a coordinator that plans, workers that build. Set permissions. Keep delegation visible.
- Hand work across models: Claude plans, Codex builds, Gemini reviews — and the context carries between them.
- Everything lives on your machine as plain JSON in `~/.maestro/`. Your projects, tasks, and session history stay yours.

---

## A few voice rules (so nothing reads like a bot wrote it)

- Lead with the annoyance, not the feature. People feel "15 terminal tabs" before they feel "orchestration layer".
- Contractions are good. Fragments are fine. One idea per sentence.
- Be specific. "Claude plans, Codex builds, Gemini reviews" beats "leverage multiple AI models".
- Say what it *doesn't* do. Honesty reads as human.
- Hashtags: a couple, at the end, only where the platform expects them. Never a wall.
- On Reddit especially: no logo, no tagline, no CTA button energy. Talk like a person in a thread.

---

## Twitter / X

### Option A — the short one (main tweet)
> I kept ending up with 6 terminal tabs open, each running a different coding agent, and no idea which one broke the build.
>
> So I built Maestro. One window. Claude plans, Codex builds, Gemini reviews — and I can actually read what each one is doing.
>
> Local-first, open source: github.com/subhangR/agent-maestro

### Option B — build-in-public angle
> Running multiple AI coding agents at once is great until you're the human message bus copy-pasting context between five terminals.
>
> Maestro fixes the boring part: it holds the plan, routes the handoffs, and shows the work as a plain feed you can skim.
>
> It runs on your machine. Nothing leaves it.

### Option C — a thread (if you want reach)
1/ Everyone's excited about running multiple coding agents in parallel. Nobody talks about what it's actually like: a wall of terminals and you playing air traffic control at 1am.

2/ I wanted the parallelism without the chaos. So Maestro turns those sessions into one readable view — who's doing what, what changed, what's blocked, what's waiting on you.

3/ You give agents roles. A coordinator breaks the work down. Workers pick it up. Permissions are explicit. Handoffs are visible. The raw terminal is one click away when you actually need it.

4/ Best part for me: cross-model handoffs. Let Claude plan, Codex build, Gemini review. Maestro carries the context between them so you're not re-explaining the task three times.

5/ It's local-first. Your projects, tasks and session logs are just JSON files in ~/.maestro on your own machine. No hosted control plane required.

6/ It's open source and under active development. Clone it, read it, run it: github.com/subhangR/agent-maestro

**Image:** the 1200×630 social card (`maestro-social.jpg`) for the single tweet; for the thread, a short screen recording of the activity feed does better than a static image.
**Hashtags (optional, keep it to 2):** #AI #devtools

---

## LinkedIn

### Option A — first-person, story-led
> A small confession: for weeks my "multi-agent workflow" was just a lot of terminal tabs and a lot of hope.
>
> I'd have one agent planning, one writing code, one reviewing — and I was the glue between them, copy-pasting context back and forth and losing track of which session did what.
>
> So I built Maestro to be the layer I was missing.
>
> It runs your coding agents (Claude Code, Codex, Gemini and others) in one place and translates their work into something a person can actually supervise: decisions, file changes, handoffs and blockers, in plain language. When you want the raw terminal, it's right there. When you don't, you don't have to look at it.
>
> Three things I care about in how it's built:
> • Local-first — it runs on your machine, and your projects and history stay as plain files you own.
> • Provider-neutral — orchestration shouldn't be locked to one AI vendor. Use the right model per task.
> • Human-legible — you should always be able to answer "what happened, and why?"
>
> It's open source and still early. If you're wrangling more than one coding agent and feeling the same friction, I'd genuinely like your take.
>
> https://github.com/subhangR/agent-maestro

### Option B — shorter, for a busy feed
> Running one AI coding agent is easy. Running four without losing the plot is the actual problem.
>
> Maestro is a local-first command center for exactly that: plan the work, hand it to the right models, and watch the whole thing as a readable feed instead of a stack of terminals.
>
> Claude can plan, Codex can build, Gemini can review — and the context follows the work between them. Everything stays on your machine.
>
> Open source, early, and I'd love feedback: https://github.com/subhangR/agent-maestro

**Image:** social card, or a clean screenshot of the activity feed. LinkedIn favors native text + one strong image over links buried in the post.
**Hashtags:** #softwaredevelopment #AI #opensource #developertools (LinkedIn is fine with 3–5 at the very end)

---

## Reddit

> ⚠️ Reddit rule #1: disclose it's yours, drop the marketing voice entirely, and post it where builders actually hang out (r/LocalLLaMA, r/ChatGPTCoding, r/programming with care, r/SideProject). Answer comments like a person, not a brand.

### Title options
- I got tired of running 5 coding agents in 5 terminals, so I built a local-first "command center" for them
- Built an open-source orchestrator so Claude/Codex/Gemini can work on the same project without me being the glue
- Show r/SideProject: Maestro — run multiple coding agents in one readable view, all local

### Body
> Full disclosure: I built this, so I'm biased.
>
> Like a lot of people here I started running more than one coding agent at a time — one to plan, one to write code, one to review. In theory that's a dream team. In practice I had a wall of terminals and I was the human copy-pasting context between them and forgetting which session touched which file.
>
> Maestro is my attempt to fix the coordination part, not replace the agents.
>
> What it does:
> - Runs your agents (Claude Code, Codex, Gemini CLI, others) side by side and shows their work as a plain-language feed — decisions, diffs, handoffs, what's blocked. The real terminal is one click away when you need it.
> - Lets you set up a team: a coordinator that breaks work into tasks, workers that execute, explicit permissions.
> - Passes context across models on handoff, so Claude → Codex → Gemini doesn't mean re-explaining the task three times.
> - Keeps everything local. Your projects/tasks/sessions are just JSON files under ~/.maestro. No hosted backend required.
>
> What it's *not*: it's not a hosted product, it's not magic, and it's still early and rough in places. Desktop app is Tauri, you build from source right now (bun install, bun run dev:all).
>
> Repo's here if you want to poke at it or tell me what's dumb about it: github.com/subhangR/agent-maestro
>
> Genuinely after feedback — especially from anyone already juggling multiple agents. What's your current setup?

**Image:** on Reddit, a real screenshot or a short screen capture beats a designed graphic every time. Skip the logo card here.

---

## Instagram

Instagram is visual-first, so the caption is short and the image/carousel does the work.

### Caption
> The dream: five AI coding agents building your app in parallel.
> The reality (until now): five terminal windows and a headache.
>
> Maestro puts them all in one place — plan the work, hand it to the right model, and actually see what's happening. Runs on your own machine.
>
> Link in bio 👉 open source, early, and built in public.
>
> .
> .
> #coding #ai #developer #buildinpublic #opensource #devtools #softwareengineering

### Carousel idea (5 slides)
1. "Ever had 6 terminals open just to run your AI agents?" (the logo card on dark)
2. "One window instead of six." (screenshot of the activity feed)
3. "Claude plans. Codex builds. Gemini reviews." (the cross-model handoff visual)
4. "Everything stays on your machine." (the ~/.maestro file tree)
5. "Open source. Try it." (logo + repo handle)

### Story (single frame)
> Text overlay: "when your AI agents finally stop fighting for terminal space 😮‍💨"
> Sticker: link to the site. Keep it to one line.

**Image:** slide 1 uses `maestro-social.jpg`; the rest are app screenshots. Bright, high-contrast, minimal text per slide.

---

## Facebook

Facebook skews a bit more explain-it-to-a-friend than LinkedIn.

### Post
> If you've been playing with AI coding tools, you've probably hit this: running one is fine, but the moment you run a few at once you're drowning in terminal windows trying to remember which one is doing what.
>
> I built a thing for that. It's called Maestro.
>
> It's basically a control room for your coding agents. You give them a plan, assign who does what, and watch the whole thing as a simple activity feed instead of a mess of black terminal screens. Claude can plan, Codex can build, Gemini can review — and it keeps track of the handoffs so you don't have to.
>
> It runs entirely on your own computer, and it's free and open source. Still early, still improving, and I'd love for people to try it and tell me what's missing.
>
> Take a look 👇
> https://maestro-web-fleet.web.app

**Image:** the social card (`maestro-social.jpg`). Facebook pulls it automatically from the link, but attaching it directly usually looks cleaner.
**Hashtags:** optional on Facebook — 1 or 2 max (#opensource #AI) or none.

---

## Snapchat

Snapchat is fast, casual, and personal. Short text over an image or clip.

### Snap 1 (photo/screenshot of the terminal chaos)
> "me running 5 AI coding agents at once 💀"

### Snap 2 (screenshot of the Maestro feed)
> "…or just use the thing I built. one window. way calmer."

### Snap 3 (logo card)
> "Maestro — it's free + open source. swipe up 👆"
> (attach link to https://maestro-web-fleet.web.app)

**Tips:** vertical (9:16), big readable text, no paragraphs. Let the before/after do the talking. The
whole story should take under 10 seconds to watch.

---

## Quick reference — where each asset lives

| Asset | File | Best for |
|---|---|---|
| Social / OG card (1200×630) | `website/assets/brand/maestro-social.jpg` | Twitter/X single post, LinkedIn, Facebook, IG slide 1 |
| Loop mark, dark bg (orange 8 + white arrow) | `website/assets/brand/maestro-loop-mark.png` | Avatars, watermarks on dark |
| Loop mark, light bg (orange 8 + black arrow) | `website/assets/brand/maestro-loop-mark-light.png` | Watermarks on light images |
| App icon tile | `website/assets/brand/maestro-favicon.png` | Profile pictures (square) |

**Best-performing content is almost always a screenshot or a 10–20s screen recording of the
activity feed** — the "one window instead of six" moment. Designed cards are good for links and
avatars; motion is what makes people stop scrolling. Record one short clip of a couple of agents
working and reuse it everywhere.

## Posting order that tends to work
1. Reddit + a personal tweet first (they surface honest feedback and early users).
2. LinkedIn a day later, once you can quote a reaction or two.
3. Instagram/Facebook/Snapchat as the visual recap, using whatever screenshots got the best response.
