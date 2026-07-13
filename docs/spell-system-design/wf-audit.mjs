// MOVEMENT 1 — AUDIT (dynamic Workflow). Read-only parallel review of the design
// across server / CLI / UI / UX, then a go/no-go synthesis. Run via:
//   Workflow({ scriptPath: "docs/spell-system-design/wf-audit.mjs" })
export const meta = {
  name: 'spell-audit',
  description: 'Parallel readiness audit of the spell-system design across server, CLI, UI, UX',
  phases: [
    { title: 'Audit', detail: '4 parallel read-only auditors' },
    { title: 'Synthesize', detail: 'go/no-go readiness report' },
  ],
}

const READ = `This repo is Agent Maestro (maestro-server Express/CommonJS; maestro-cli Commander/ESM; maestro-ui Tauri+React/Zustand). Read docs/spell-system-design/DESIGN_BRIEF.md and the 6 docs/spell-system-design/*.excalidraw diagrams for the FULL design. Run \`graphify query "<q>"\` before grepping. Research only — do NOT modify code.`

const AUDIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'feasible', 'risks', 'missingPieces', 'changeList', 'openQuestions'],
  properties: {
    area: { type: 'string' },
    feasible: { type: 'string', enum: ['yes', 'with-caveats', 'no'] },
    risks: { type: 'array', items: { type: 'string' } },
    missingPieces: { type: 'array', items: { type: 'string' } },
    changeList: { type: 'array', items: { type: 'string' }, description: 'concrete file-level changes' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

const DIM = [
  { key: 'server', prompt: `${READ}\n\nAUDIT THE SERVER plan: first-class Spell entity + FileSystemSpellRepository; Session.activeSpells; spellRoutes (invoke/activate/deactivate/trigger); WS events; Task.spellIds + spawn carriage; Ensemble entity + multi-target invoke (targetSessionIds, senderSessionId); fix double-PTY-write + .strict() schema bugs. Give a concrete file-level change list and risks.` },
  { key: 'cli', prompt: `${READ}\n\nAUDIT THE CLI plan: \`maestro hook dispatch\` fixed-wiring dispatcher; binding all hook events in plugin hooks.json; manifest.spells carriage; \`maestro ensemble message\`; spell invoke/create contract fixes; FEASIBILITY of exit-2 gate/continuation in the bundled Claude build (propose how to verify). Change list + risks.` },
  { key: 'ui', prompt: `${READ}\n\nAUDIT THE UI plan: SpellPicker redesign + spell-details view; concentric-ring borders on pn-st / pn-srail-s / .terminalContainer (generalizing coordinator-glow); ensemble grouping; useSpellStore/useEnsembleStore; task-tile spell assignment; custom spell + skill creation surfaces. Component-level change list + risks.` },
  { key: 'ux', prompt: `${READ}\n\nAUDIT THE UX for a top-notch bar: casting flow, multi-select, activation visibility, ring legibility + the cap-4 rule, ensemble mental model, accessibility (WCAG), light/dark theme coherence, motion. Identify gaps and concrete recommendations to make it stunning and properly engineered.` },
]

phase('Audit')
const findings = (await parallel(
  DIM.map(d => () => agent(d.prompt, { label: `audit:${d.key}`, phase: 'Audit', schema: AUDIT_SCHEMA, agentType: 'Explore' }))
)).filter(Boolean)

phase('Synthesize')
const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'blockingUnknowns', 'orderedRisks', 'readinessByArea', 'recommendation'],
  properties: {
    verdict: { type: 'string', enum: ['go', 'go-with-fixes', 'no-go'] },
    blockingUnknowns: { type: 'array', items: { type: 'string' } },
    orderedRisks: { type: 'array', items: { type: 'string' } },
    readinessByArea: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' },
  },
}
const report = await agent(
  `Synthesize these area audits into a single go/no-go readiness report for the spell-system build. Be decisive. Surface the feasibility gate (Claude exit-2 hooks) prominently.\n\n${JSON.stringify(findings, null, 2)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT_SCHEMA }
)
return { report, findings }
