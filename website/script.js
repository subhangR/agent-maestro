(() => {
  "use strict";

  document.documentElement.classList.replace("no-js", "js");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const header = document.querySelector("[data-header]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const siteMenu = document.querySelector("[data-site-menu]");

  const setHeaderState = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 18);
  };

  const closeMenu = ({ restoreFocus = false } = {}) => {
    if (!header || !menuToggle) return;
    header.classList.remove("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.querySelector(".sr-only").textContent = "Open navigation";
    document.body.classList.remove("menu-open");
    if (restoreFocus) menuToggle.focus();
  };

  const toggleMenu = () => {
    if (!header || !menuToggle) return;
    const willOpen = !header.classList.contains("is-menu-open");
    header.classList.toggle("is-menu-open", willOpen);
    menuToggle.setAttribute("aria-expanded", String(willOpen));
    menuToggle.querySelector(".sr-only").textContent = willOpen ? "Close navigation" : "Open navigation";
    document.body.classList.toggle("menu-open", willOpen);
  };

  window.addEventListener("scroll", setHeaderState, { passive: true });
  setHeaderState();
  menuToggle?.addEventListener("click", toggleMenu);
  siteMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) closeMenu();
  });

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px" }
    );
    reveals.forEach((element) => revealObserver.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add("is-visible"));
  }

  const scenarios = {
    launch: {
      title: "Prepare the public launch brief",
      agents: [
        { name: "Planner", letter: "P", task: "Mapped scope and dependencies" },
        { name: "Researcher", letter: "R", task: "Validating product evidence" },
        { name: "Writer", letter: "W", task: "Needs approved research context" }
      ],
      steps: [
        {
          progress: 36,
          states: ["Complete", "Working", "Waiting"],
          agentProgress: [100, 62, 0],
          title: "Research context is ready to share",
          note: "Review the handoff before the writer can continue.",
          action: "Approve handoff"
        },
        {
          progress: 61,
          states: ["Complete", "Complete", "Working"],
          agentProgress: [100, 100, 48],
          title: "The first narrative is ready",
          note: "The writer used only the evidence you approved.",
          action: "Review draft"
        },
        {
          progress: 84,
          states: ["Complete", "Complete", "Reviewing"],
          agentProgress: [100, 100, 84],
          title: "One product claim needs your judgment",
          note: "Approve the wording before the brief is marked ready.",
          action: "Accept outcome"
        },
        {
          progress: 100,
          states: ["Complete", "Complete", "Complete"],
          agentProgress: [100, 100, 100],
          title: "Launch brief accepted—with a receipt",
          note: "The objective, evidence, approvals, and outcome remain linked.",
          action: "Run again"
        }
      ]
    },
    release: {
      title: "Restore the blocked release pipeline",
      agents: [
        { name: "Triage", letter: "T", task: "Isolated the failing build step" },
        { name: "Builder", letter: "B", task: "Preparing a scoped patch" },
        { name: "Reviewer", letter: "V", task: "Waiting for verification evidence" }
      ],
      steps: [
        {
          progress: 28,
          states: ["Complete", "Working", "Waiting"],
          agentProgress: [100, 40, 0],
          title: "Completion is guarded by current evidence",
          note: "Acceptance and expected task version must match before done.",
          action: "Inspect completion gate"
        },
        {
          progress: 57,
          states: ["Complete", "Complete", "Working"],
          agentProgress: [100, 100, 44],
          title: "Verification is running in a worktree",
          note: "The original project remains unchanged while checks run.",
          action: "Inspect checks"
        },
        {
          progress: 81,
          states: ["Complete", "Complete", "Reviewing"],
          agentProgress: [100, 100, 82],
          title: "The change is ready, but not yet complete",
          note: "TM8 will not claim completion until the evidence gate is satisfied.",
          action: "Record verified result"
        },
        {
          progress: 100,
          states: ["Complete", "Complete", "Complete"],
          agentProgress: [100, 100, 100],
          title: "Release restored and outcome linked",
          note: "The task now points to its verified commit and decision trail.",
          action: "Run again"
        }
      ]
    },
    research: {
      title: "Map customer trust signals",
      agents: [
        { name: "Listener", letter: "L", task: "Grouping interview evidence" },
        { name: "Synthesizer", letter: "S", task: "Tracing themes to source notes" },
        { name: "Challenger", letter: "C", task: "Waiting to test assumptions" }
      ],
      steps: [
        {
          progress: 33,
          states: ["Complete", "Working", "Waiting"],
          agentProgress: [100, 57, 0],
          title: "One memory conflicts with pinned evidence",
          note: "Mark the dispute; do not erase the earlier record.",
          action: "Attach evidence"
        },
        {
          progress: 59,
          states: ["Complete", "Complete", "Working"],
          agentProgress: [100, 100, 45],
          title: "Evidence-backed themes are ready",
          note: "The challenger can inspect the pinned source and disputed claim.",
          action: "Review evidence"
        },
        {
          progress: 86,
          states: ["Complete", "Complete", "Reviewing"],
          agentProgress: [100, 100, 88],
          title: "One conclusion lacks enough evidence",
          note: "Keep it as an open question or remove it from the outcome.",
          action: "Mark open question"
        },
        {
          progress: 100,
          states: ["Complete", "Complete", "Complete"],
          agentProgress: [100, 100, 100],
          title: "Research map accepted with caveats",
          note: "Sources, boundaries, open questions, and conclusions stay connected.",
          action: "Run again"
        }
      ]
    }
  };

  const controlRoom = document.querySelector("[data-control-room]");
  const scenarioTabs = Array.from(document.querySelectorAll("[data-scenario]"));
  const demoTitle = document.querySelector("[data-demo-title]");
  const agentNodes = Array.from(document.querySelectorAll("[data-agent]"));
  const gate = document.querySelector("[data-approval-gate]");
  const gateTitle = document.querySelector("[data-gate-title]");
  const gateNote = document.querySelector("[data-gate-note]");
  const gateAction = document.querySelector("[data-demo-action]");
  const progressLabel = document.querySelector("[data-progress-label]");
  const progressBar = document.querySelector("[data-progress-bar]");
  const pauseButton = document.querySelector("[data-pause-run]");
  const pauseLabel = document.querySelector("[data-pause-label]");
  const pauseGlyph = document.querySelector(".pause-glyph");
  const runLabel = document.querySelector("[data-run-label]");
  const demoAnnouncer = document.querySelector("[data-demo-announcer]");
  let activeScenario = "launch";
  let demoStep = 0;
  let demoPaused = false;

  const stateClass = (state) => {
    if (state === "Complete") return "is-complete";
    if (state === "Waiting") return "is-waiting";
    if (state === "Paused") return "is-paused";
    return "is-working";
  };

  const renderDemo = (announce = false) => {
    if (!controlRoom) return;
    const scenario = scenarios[activeScenario];
    const step = scenario.steps[demoStep];
    demoTitle.textContent = scenario.title;

    agentNodes.forEach((node, index) => {
      const agent = scenario.agents[index];
      const state = demoPaused ? "Paused" : step.states[index];
      node.classList.remove("is-complete", "is-waiting", "is-working", "is-paused");
      node.classList.add(stateClass(state));
      node.querySelector(".avatar").textContent = agent.letter;
      node.querySelector("[data-agent-name]").textContent = agent.name;
      node.querySelector("[data-agent-task]").textContent = agent.task;
      node.querySelector("[data-agent-status]").textContent = demoPaused ? "Demo paused" : state;
      node.querySelector(".mini-progress span").style.setProperty("--progress", `${step.agentProgress[index]}%`);
    });

    gateTitle.textContent = step.title;
    gateNote.textContent = step.note;
    gateAction.textContent = step.action;
    gateAction.disabled = demoPaused;
    gate.classList.toggle("is-resolved", demoStep === scenario.steps.length - 1);
    progressLabel.textContent = `${step.progress}%`;
    progressBar.style.setProperty("--progress", `${step.progress}%`);
    controlRoom.classList.toggle("is-paused", demoPaused);
    runLabel.textContent = demoPaused ? "Replay paused" : demoStep === scenario.steps.length - 1 ? "Outcome ready" : "Live run";
    pauseButton.setAttribute("aria-pressed", String(demoPaused));
    pauseLabel.textContent = demoPaused ? "Resume demo" : "Pause demo";
    pauseGlyph.textContent = demoPaused ? "▶" : "Ⅱ";

    if (announce) {
      demoAnnouncer.textContent = demoPaused
        ? "The website demonstration is paused. Resume it to continue."
        : `${step.title}. Objective progress is ${step.progress} percent.`;
    }
  };

  const selectScenario = (key, announce = true) => {
    activeScenario = key;
    demoStep = 0;
    demoPaused = false;
    scenarioTabs.forEach((tab) => {
      const selected = tab.dataset.scenario === key;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    renderDemo(announce);
  };

  scenarioTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectScenario(tab.dataset.scenario));
    tab.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + scenarioTabs.length) % scenarioTabs.length;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % scenarioTabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = scenarioTabs.length - 1;
      scenarioTabs[nextIndex].focus();
      selectScenario(scenarioTabs[nextIndex].dataset.scenario);
    });
  });

  gateAction?.addEventListener("click", () => {
    const lastIndex = scenarios[activeScenario].steps.length - 1;
    demoStep = demoStep === lastIndex ? 0 : demoStep + 1;
    renderDemo(true);
  });

  pauseButton?.addEventListener("click", () => {
    demoPaused = !demoPaused;
    renderDemo(true);
  });

  renderDemo();

  const tourContent = {
    overview: [
      {
        kicker: "01 / A request arrives",
        title: "Start with the conversation.",
        description: "A request enters the shared thread. It is durable, addressable, and attached to the place where the team is already working.",
        objects: [
          { x: 12, y: 35, w: 35, h: 74, meta: "Message", label: "Prepare the launch brief", type: "primary" },
          { x: 64, y: 37, w: 23, h: 68, meta: "Graph", label: "Thread updates" }
        ],
        links: [{ x: 47, y: 50, w: 17, r: 0 }]
      },
      {
        kicker: "02 / Request → task",
        title: "Turn intent into real work.",
        description: "The request becomes a versioned task without leaving the thread. Ownership, status, and acceptance now have an explicit home.",
        objects: [
          { x: 9, y: 27, w: 29, h: 70, meta: "Message", label: "Public launch request" },
          { x: 57, y: 25, w: 34, h: 86, meta: "Task · v1", label: "Prepare launch brief", type: "primary", pulse: true }
        ],
        links: [{ x: 38, y: 43, w: 19, r: 0 }]
      },
      {
        kicker: "03 / Two views, one event",
        title: "The thread and graph agree.",
        description: "One mutation updates both projections. There is no hidden second copy for the interface to reconcile later.",
        objects: [
          { x: 8, y: 21, w: 27, h: 72, meta: "Thread", label: "Task chip added" },
          { x: 38, y: 38, w: 23, h: 70, meta: "Task", label: "Launch brief", type: "primary" },
          { x: 67, y: 21, w: 26, h: 72, meta: "Graph", label: "Entity linked" }
        ],
        links: [{ x: 29, y: 40, w: 14, r: 18 }, { x: 58, y: 46, w: 14, r: -18 }]
      },
      {
        kicker: "04 / On the record",
        title: "Leave a receipt, not a mystery.",
        description: "The event records what changed, where it changed, and which version followed. The team can replay the path instead of reconstructing it.",
        objects: [
          { x: 18, y: 26, w: 64, h: 108, meta: "Durable receipt", label: "Task created · v1 · linked to request", type: "receipt", pulse: true }
        ],
        links: []
      }
    ],
    orchestration: [
      {
        kicker: "01 / One graph",
        title: "Anchor the objective once.",
        description: "Tasks, docs, sessions, messages, and outcomes all connect to the same objective instead of becoming separate provider histories.",
        objects: [
          { x: 32, y: 33, w: 36, h: 86, meta: "Objective", label: "Ship the public release", type: "primary", pulse: true }
        ],
        links: []
      },
      {
        kicker: "02 / Relationships appear",
        title: "See how the work fits together.",
        description: "The graph grows as the work does. Every connection can be opened, discussed, shared, and traced from either direction.",
        objects: [
          { x: 37, y: 37, w: 27, h: 72, meta: "Objective", label: "Public release", type: "primary" },
          { x: 7, y: 15, w: 23, h: 62, meta: "Task", label: "Verify claims" },
          { x: 70, y: 14, w: 23, h: 62, meta: "Doc", label: "Launch brief" },
          { x: 7, y: 66, w: 23, h: 62, meta: "Session", label: "Researcher", type: "agent" },
          { x: 70, y: 66, w: 23, h: 62, meta: "Message", label: "Approval" }
        ],
        links: [
          { x: 27, y: 37, w: 16, r: 28 },
          { x: 61, y: 42, w: 16, r: -28 },
          { x: 25, y: 68, w: 18, r: -27 },
          { x: 60, y: 61, w: 19, r: 27 }
        ]
      },
      {
        kicker: "03 / Context moves",
        title: "Share the entity, not a summary.",
        description: "Drop the research note into the writer’s live session. TM8 delivers its projection and records the handoff on the graph.",
        objects: [
          { x: 8, y: 34, w: 30, h: 84, meta: "Research note", label: "Security model", type: "primary" },
          { x: 62, y: 34, w: 30, h: 84, meta: "Live session", label: "Writer", type: "agent", pulse: true }
        ],
        links: [{ x: 38, y: 51, w: 24, r: 0 }]
      },
      {
        kicker: "04 / The outcome stays linked",
        title: "Finish with the path intact.",
        description: "The accepted outcome still points back to the objective, evidence, sessions, messages, and human decisions that made it trustworthy.",
        objects: [
          { x: 10, y: 38, w: 28, h: 74, meta: "Objective", label: "Public release" },
          { x: 62, y: 30, w: 29, h: 94, meta: "Outcome", label: "Release ready", type: "receipt", pulse: true }
        ],
        links: [{ x: 38, y: 50, w: 24, r: 0 }]
      }
    ],
    control: [
      {
        kicker: "01 / Durable identity",
        title: "A teammate is more than a process.",
        description: "Give the AI teammate a role, profile, and durable place in the graph. Its identity survives the terminal window that happens to run it.",
        objects: [
          { x: 28, y: 25, w: 44, h: 110, meta: "AI teammate", label: "Release reviewer", type: "agent", pulse: true }
        ],
        links: []
      },
      {
        kicker: "02 / Launch manifest",
        title: "Make the run explicit.",
        description: "The manifest resolves the harness, model, project, working directory, profile, and context before execution begins.",
        objects: [
          { x: 13, y: 24, w: 74, h: 118, meta: "Launch manifest", label: "Codex · release-reviewer · project /tm8", type: "primary" }
        ],
        links: []
      },
      {
        kicker: "03 / Real session",
        title: "Execution becomes visible work.",
        description: "TM8 starts the real harness in a live work session. The terminal stays native while the session gains chat, messages, relationships, and activity.",
        objects: [
          { x: 15, y: 28, w: 70, h: 112, meta: "Live work session", label: "Release reviewer · running", type: "agent", pulse: true }
        ],
        links: []
      },
      {
        kicker: "04 / Memory across runs",
        title: "The teammate learns what not to repeat.",
        description: "A later session receives the relevant memory and avoids a known failure path. The old run remains the evidence for why that guidance exists.",
        objects: [
          { x: 7, y: 30, w: 32, h: 92, meta: "Memory", label: "Avoid stale schema path", type: "receipt" },
          { x: 62, y: 31, w: 31, h: 90, meta: "New session", label: "Safe path chosen", type: "agent", pulse: true }
        ],
        links: [{ x: 39, y: 50, w: 23, r: 0 }]
      }
    ],
    teamwork: [
      {
        kicker: "01 / One task · v12",
        title: "Give every hand the same work.",
        description: "A human and two agents open the same task through UI, CLI, and live sessions. They are not editing three copies.",
        objects: [
          { x: 31, y: 31, w: 38, h: 96, meta: "Task · v12", label: "Prepare release", type: "primary", pulse: true }
        ],
        links: []
      },
      {
        kicker: "02 / Coordinated mutation",
        title: "Many hands, one version line.",
        description: "Each mutation advances the entity version. Every surface converges on the same state and names who made the change.",
        objects: [
          { x: 6, y: 22, w: 24, h: 68, meta: "Human · UI", label: "Set acceptance" },
          { x: 38, y: 36, w: 24, h: 72, meta: "Task · v15", label: "In progress", type: "primary" },
          { x: 70, y: 17, w: 24, h: 68, meta: "Agent · CLI", label: "Linked worktree", type: "agent" },
          { x: 70, y: 69, w: 24, h: 68, meta: "Agent · session", label: "Posted blocker", type: "agent" }
        ],
        links: [{ x: 28, y: 40, w: 14, r: 17 }, { x: 60, y: 43, w: 14, r: -18 }, { x: 61, y: 61, w: 14, r: 19 }]
      },
      {
        kicker: "03 / Honest gate",
        title: "A refusal is part of the proof.",
        description: "If a stale version or incomplete gate would make the claim untrue, TM8 refuses the mutation and records why instead of pretending completion.",
        objects: [
          { x: 15, y: 29, w: 70, h: 112, meta: "Completion refused", label: "Required verification receipt is missing", type: "primary", pulse: true }
        ],
        links: []
      },
      {
        kicker: "04 / Durable result",
        title: "Finish where everyone can see it.",
        description: "The coordinator links the verified result, sibling replies, and decisions to the owning task. The next session begins from the receipt, not hearsay.",
        objects: [
          { x: 18, y: 24, w: 64, h: 118, meta: "Task · complete", label: "Result + replies + verification linked", type: "receipt", pulse: true }
        ],
        links: []
      }
    ]
  };

  const modal = document.querySelector("[data-tour-modal]");
  const dialog = document.querySelector("[data-tour-dialog]");
  const scene = document.querySelector("[data-tour-scene]");
  const tourKicker = document.querySelector("[data-tour-kicker]");
  const tourTitle = document.querySelector("[data-tour-title]");
  const tourDescription = document.querySelector("[data-tour-description]");
  const tourProgress = document.querySelector("[data-tour-progress]");
  const tourCurrent = document.querySelector("[data-tour-current]");
  const tourTotal = document.querySelector("[data-tour-total]");
  const tourPrev = document.querySelector("[data-tour-prev]");
  const tourNext = document.querySelector("[data-tour-next]");
  const tourPlay = document.querySelector("[data-tour-play]");
  const tourPlayIcon = document.querySelector("[data-tour-play-icon]");
  const tourPlayLabel = document.querySelector("[data-tour-play-label]");
  const tourScrub = document.querySelector("[data-tour-scrub]");
  const tourAnnouncer = document.querySelector("[data-tour-announcer]");
  const tourSource = document.querySelector("[data-tour-source]");
  const tourSources = {
    overview: [
      "Plate 01 · one-conversation-one-graph",
      "Plate 01 · one-conversation-one-graph",
      "Plate 01 · one-conversation-one-graph",
      "Plate 01 · one-conversation-one-graph"
    ],
    orchestration: [
      "Plate 09 · the-graph-assembling",
      "Plate 09 · the-graph-assembling",
      "Plate 33 · every-entity-is-a-place-to-talk",
      "Plate 49 · sketch-to-reality"
    ],
    control: [
      "Plate 13 · anatomy-of-a-teammate",
      "Plate 17 · spawning",
      "Plate 17 · spawning",
      "Plate 41 · memory-rides-along"
    ],
    teamwork: [
      "Plate 24 · one-task-many-hands",
      "Plate 24 · one-task-many-hands",
      "Plate 26 · the-road-to-done",
      "Plate 31 · the-wave"
    ]
  };
  let activeTour = tourContent.overview;
  let activeTourKey = "overview";
  let tourIndex = 0;
  let tourTimer = null;
  let tourPlaying = false;
  let lastFocusedElement = null;

  const makeSceneObject = (object) => {
    const element = document.createElement("div");
    element.className = "scene-object";
    if (object.type) element.classList.add(`is-${object.type}`);
    if (object.pulse && !reduceMotion.matches) element.classList.add("scene-pulse");
    element.style.left = `${object.x}%`;
    element.style.top = `${object.y}%`;
    element.style.width = `${object.w}%`;
    element.style.minHeight = `${object.h}px`;

    const content = document.createElement("div");
    const meta = document.createElement("small");
    const label = document.createElement("strong");
    meta.textContent = object.meta;
    label.textContent = object.label;
    content.append(meta, label);
    element.append(content);
    return element;
  };

  const makeSceneLink = (link) => {
    const element = document.createElement("span");
    element.className = "scene-link";
    element.style.left = `${link.x}%`;
    element.style.top = `${link.y}%`;
    element.style.width = `${link.w}%`;
    element.style.transform = `rotate(${link.r}deg)`;
    return element;
  };

  const renderTourScene = (step) => {
    const fragment = document.createDocumentFragment();
    step.links.forEach((link) => fragment.append(makeSceneLink(link)));
    step.objects.forEach((object) => fragment.append(makeSceneObject(object)));
    scene.replaceChildren(fragment);
  };

  const renderTour = (announce = false) => {
    const step = activeTour[tourIndex];
    tourKicker.textContent = step.kicker;
    tourTitle.textContent = step.title;
    tourDescription.textContent = step.description;
    tourCurrent.textContent = String(tourIndex + 1);
    tourTotal.textContent = String(activeTour.length);
    tourProgress.style.width = `${((tourIndex + 1) / activeTour.length) * 100}%`;
    tourScrub.max = String(activeTour.length);
    tourScrub.value = String(tourIndex + 1);
    tourScrub.setAttribute("aria-valuetext", `Step ${tourIndex + 1} of ${activeTour.length}`);
    if (tourSource) tourSource.textContent = (tourSources[activeTourKey] || tourSources.overview)[tourIndex];
    tourPrev.disabled = tourIndex === 0;
    tourNext.disabled = tourIndex === activeTour.length - 1;
    renderTourScene(step);
    if (announce) tourAnnouncer.textContent = `Step ${tourIndex + 1} of ${activeTour.length}: ${step.title}`;
  };

  const stopTourTimer = () => {
    if (tourTimer) window.clearInterval(tourTimer);
    tourTimer = null;
  };

  const setTourPlaying = (shouldPlay) => {
    stopTourTimer();
    tourPlaying = Boolean(shouldPlay && !reduceMotion.matches);
    tourPlay.setAttribute("aria-pressed", String(tourPlaying));
    tourPlayIcon.textContent = tourPlaying ? "Ⅱ" : "▶";
    tourPlayLabel.textContent = tourPlaying ? "Pause" : "Play";

    if (tourPlaying) {
      tourTimer = window.setInterval(() => {
        if (tourIndex >= activeTour.length - 1) {
          setTourPlaying(false);
          return;
        }
        tourIndex += 1;
        renderTour(true);
      }, 4400);
    }
  };

  const openTour = (tourKey, trigger) => {
    activeTourKey = tourContent[tourKey] ? tourKey : "overview";
    activeTour = tourContent[tourKey] || tourContent.overview;
    tourIndex = 0;
    lastFocusedElement = trigger;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    renderTour();
    setTourPlaying(true);
    window.requestAnimationFrame(() => dialog.focus());
  };

  const closeTour = () => {
    if (modal.hidden) return;
    setTourPlaying(false);
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    lastFocusedElement?.focus();
  };

  document.querySelectorAll("[data-tour-open]").forEach((trigger) => {
    trigger.addEventListener("click", () => openTour(trigger.dataset.tourOpen, trigger));
  });
  document.querySelectorAll("[data-tour-close]").forEach((button) => button.addEventListener("click", closeTour));

  tourPrev?.addEventListener("click", () => {
    if (tourIndex === 0) return;
    tourIndex -= 1;
    renderTour(true);
  });

  tourNext?.addEventListener("click", () => {
    if (tourIndex >= activeTour.length - 1) return;
    tourIndex += 1;
    renderTour(true);
  });

  tourPlay?.addEventListener("click", () => setTourPlaying(!tourPlaying));
  tourScrub?.addEventListener("input", () => {
    setTourPlaying(false);
    tourIndex = Number(tourScrub.value) - 1;
    renderTour(true);
  });

  dialog?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTour();
      return;
    }

    if (event.key === "ArrowLeft" && event.target.tagName !== "INPUT") {
      event.preventDefault();
      tourPrev.click();
      return;
    }

    if (event.key === "ArrowRight" && event.target.tagName !== "INPUT") {
      event.preventDefault();
      tourNext.click();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header?.classList.contains("is-menu-open")) closeMenu({ restoreFocus: true });
  });

  const captureSection = document.querySelector(".help-captures");
  const captureMore = document.querySelector("[data-capture-more]");
  captureMore?.addEventListener("click", () => {
    const expanded = !captureSection?.classList.contains("is-expanded");
    captureSection?.classList.toggle("is-expanded", expanded);
    captureMore.setAttribute("aria-expanded", String(expanded));
    captureMore.textContent = expanded ? "Show fewer captures" : "Show 4 more captures";
  });

  reduceMotion.addEventListener?.("change", (event) => {
    if (event.matches) {
      setTourPlaying(false);
      reveals.forEach((element) => element.classList.add("is-visible"));
    }
  });
})();
