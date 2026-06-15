// MOVEMENT 4 — REVIEW (dynamic Workflow). Parallel multi-dimension review of the
// IMPLEMENTED diff, each finding adversarially verified, then synthesized. Run AFTER
// implementation via: Workflow({ scriptPath: "docs/spell-system-design/wf-review.mjs" })
export const meta = {
  name: 'spell-review',
  description: 'Review the implemented spell-system across correctness, security, UX-fidelity, integration; verify each finding',
  phases: [
    { title: 'Review', detail: 'parallel reviewers per dimension' },
    { title: 'Verify', detail: 'adversarially verify each finding' },
    { title: 'Synthesize', detail: 'final report' },
  ],
}

const CTX = `Agent Maestro. The spell-system redesign has just been implemented. Review the working-tree diff against main (\`git diff main...HEAD\` and uncommitted changes). Ground truth: docs/spell-system-design/DESIGN_BRIEF.md + the 6 *.excalidraw diagrams. Use \`graphify query\` before grepping.`

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['dimension', 'findings'],
  properties: {
    dimension: { type: 'string' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['title', 'file', 'severity', 'detail'],
      properties: {
        title: { type: 'string' }, file: { type: 'string' },
        severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
        detail: { type: 'string' },
      },
    } },
  },
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'isReal', 'reasoning', 'fix'],
  properties: {
    title: { type: 'string' }, isReal: { type: 'boolean' },
    reasoning: { type: 'string' }, fix: { type: 'string' },
  },
}

const DIMS = [
  { key: 'correctness', prompt: `${CTX}\n\nReview for CORRECTNESS bugs: activation lifecycle, hook dispatcher filtering, multi-target invoke, ensemble membership, double-inject removal, schema lockstep (Task.spellIds, spawn). Report findings.` },
  { key: 'security', prompt: `${CTX}\n\nReview for SECURITY: gate fail-open/closed handling, command-permission gating of new CLI commands, input validation on new routes, no injection via prompt templates or ensemble messages. Report findings.` },
  { key: 'ux-fidelity', prompt: `${CTX}\n\nReview UX FIDELITY vs the design: concentric rings on all 3 boxes + cap, ensemble grouping, picker/details, light+dark themes, accessibility, no regressions to selected/needsInput/coordinator visuals. Report findings.` },
  { key: 'integration', prompt: `${CTX}\n\nReview INTEGRATION: server/CLI/UI contracts match, WS events wired, manifest carriage at spawn, build/typecheck per package (tsc -b; do NOT run concurrent build:ui), tests. Report findings.` },
]

phase('Review')
const results = await pipeline(
  DIMS,
  d => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (review) => parallel((review?.findings ?? []).map(f => () =>
    agent(`${CTX}\n\nAdversarially VERIFY this finding — default to isReal:false unless you can prove it from the diff. Propose a minimal fix if real.\n\n${JSON.stringify(f)}`,
      { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      .then(v => ({ ...f, verdict: v }))
  ))
)

phase('Synthesize')
const confirmed = results.flat().filter(Boolean).filter(f => f.verdict?.isReal)
const SUMMARY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['shipReady', 'blockers', 'prioritizedFixes', 'summary'],
  properties: {
    shipReady: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
    prioritizedFixes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}
const summary = await agent(
  `Synthesize the confirmed (verified-real) findings into a ship-readiness report. List blockers first.\n\n${JSON.stringify(confirmed, null, 2)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: SUMMARY_SCHEMA }
)
return { summary, confirmed }
