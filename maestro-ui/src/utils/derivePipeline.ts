import type { PipelineStage, PipelineStageName, PipelineStageStatus } from '../app/types/maestro';

// ---------------------------------------------------------------------------
// Canonical stage order for the pipeline visualization.
// ---------------------------------------------------------------------------
// Design-thinking product build flow. Used for larger builds; simpler tasks
// naturally only reach a subset (e.g. build → test → review), and the
// visualization trims the earlier stages they skip.
export const PIPELINE_STAGE_ORDER: PipelineStageName[] = [
  'empathize', 'define', 'ideate', 'design', 'build',
  'secure', 'test', 'review', 'ship', 'analyze',
];

// ---------------------------------------------------------------------------
// Keyword → stage mapping used when events lack an explicit metadata.stage tag.
// Rules:
//   • Later / more-specific stages (analyze, ship, review) are listed before
//     broader earlier ones (build, design, empathize) so a message resolves to
//     the most precise stage rather than an earlier catch-all.
//   • A single event message may match multiple stages; all matched stages
//     receive the attributed status — the pipeline accumulates evidence.
//   • Add new keywords here to extend coverage without touching any other file.
// ---------------------------------------------------------------------------
const STAGE_KEYWORDS: [PipelineStageName, RegExp][] = [
  // Order: more-specific / later stages first so a message resolves to the most
  // precise stage. Each stage is a single word in the visualization.
  ['analyze',   /analyz|analytics|\bmonitor|\bmetric|measur|observ|retrospect|\binsight|post.?(launch|deploy)|telemetry|dashboard/i],
  ['ship',      /\bship|\bdeploy|\brelease\b|\bpublish|\bproduction\b|go.?live|launch.?(app|prod|release)|rollout|\bhosting\b|\bhost\b|infra|\bcloud\b|docker|kubernetes|nginx|\baws\b|\bfirebase\b/i],
  ['review',    /\breview|code.?review|\baudit|critiqu|\bapprov|inspect|walkthrough|sign.?off|pull.?request|\bpr\b/i],
  ['test',      /\btest|\bspec\b|verif|validat|\bdebug|quality.?assur|\bqa\b|jest|vitest|cypress|playwright|pytest|coverage|\blint\b/i],
  ['secure',    /\bsecur|\bauth|vulnerab|encrypt|sanitiz|\bpermission|\bcsrf|\bxss|\bsecret|credential|\brbac\b|hardening|threat/i],
  ['build',     /\bbuild|\bimplement|\bcoding\b|\bcode\b|\bdevelop|writing code|scaffold|refactor|frontend|backend|full.?stack|\bschema\b|\bdatabase\b|\bdb\b|\bsql\b|\borm\b|migrat|\bapi\b|endpoint|creat.+(component|feature|module|class|function)/i],
  ['design',    /\bdesign\b|\bui\b|\bux\b|wireframe|mockup|prototype|\blayout\b|architect|blueprint|\bdata model\b|interface|user.?flow/i],
  ['ideate',    /ideate|brainstorm|ideation|\bexplor|\bresearch\b|investigat|concept|\boption|approach|feasib|prototype.?idea/i],
  ['define',    /\bdefine\b|problem.?statement|\bscop(e|ing)\b|requirement|\bspec\b|objective|success.?criteri|acceptance|constraint|planning/i],
  ['empathize', /empathi[sz]e|user.?(need|research|pain|goal)|persona|stakeholder|\baudience\b|interview|understand.?(the )?(user|problem)|\bfeedback\b/i],
];

// ---------------------------------------------------------------------------
// Map a raw timeline event type to a pipeline status contribution.
// Returns null for event types that carry no stage-attribution signal.
// ---------------------------------------------------------------------------
function eventTypeToStatusContrib(type: string): PipelineStageStatus | null {
  switch (type) {
    case 'task_completed':
    case 'milestone':
      return 'done';
    case 'task_failed':
    case 'error':
      return 'failed';
    case 'task_started':
    case 'progress':
    case 'needs_input':
    case 'task_blocked':
    case 'session_started':
      return 'active';
    default:
      return null;
  }
}

// Minimal event shape — accepts both server SessionTimelineEvent and the
// stripped-down local TimelineEvent used in SessionActivityPanel.
interface RawEvent {
  type: string;
  message?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface StageAccum {
  statusContribs: PipelineStageStatus[];
  agentLabel?: string;
  firstTs: number;
  lastTs: number;
}

// ---------------------------------------------------------------------------
// Derive PipelineStage[] from a raw timeline event array.
// Only stages with at least one attributed event get a non-pending status;
// the rest remain 'pending'. Returns all 7 stages every time (order is stable).
// ---------------------------------------------------------------------------
export function derivePipeline(events: RawEvent[]): PipelineStage[] {
  const accum: Record<PipelineStageName, StageAccum | undefined> = {} as Record<PipelineStageName, StageAccum | undefined>;

  for (const event of events) {
    const contrib = eventTypeToStatusContrib(event.type);
    if (!contrib) continue;

    const msg = event.message || '';
    const agentLabel = event.metadata?.agentLabel as string | undefined;

    // Explicit stage tag always wins over keywords.
    const explicitStage = event.metadata?.stage as PipelineStageName | undefined;
    const matchedStages: PipelineStageName[] = explicitStage
      ? [explicitStage]
      : STAGE_KEYWORDS.filter(([, re]) => re.test(msg)).map(([name]) => name);

    // session_started with no keyword match seeds 'build' — simpler tasks skip
    // the discovery/design stages and begin at build (or test), so build is the
    // safe default rather than the first stage of the full flow.
    if (matchedStages.length === 0 && event.type === 'session_started') {
      matchedStages.push('build');
    }

    for (const stage of matchedStages) {
      if (!PIPELINE_STAGE_ORDER.includes(stage)) continue;
      const existing = accum[stage];
      if (existing) {
        existing.statusContribs.push(contrib);
        if (agentLabel) existing.agentLabel = agentLabel;
        existing.lastTs = Math.max(existing.lastTs, event.timestamp);
      } else {
        accum[stage] = {
          statusContribs: [contrib],
          agentLabel,
          firstTs: event.timestamp,
          lastTs: event.timestamp,
        };
      }
    }
  }

  return PIPELINE_STAGE_ORDER.map((name) => {
    const a = accum[name];
    if (!a) return { name, status: 'pending' as PipelineStageStatus };

    const contribs = a.statusContribs;
    const hasFailed = contribs.includes('failed');
    const hasDone = contribs.includes('done');
    const hasActive = contribs.includes('active');

    // Terminal statuses override transient ones; failed beats done.
    const status: PipelineStageStatus = hasFailed ? 'failed' : hasDone ? 'done' : hasActive ? 'active' : 'pending';
    return {
      name,
      status,
      agentLabel: a.agentLabel,
      startedAt: a.firstTs,
      completedAt: (hasDone || hasFailed) ? a.lastTs : undefined,
    };
  });
}
