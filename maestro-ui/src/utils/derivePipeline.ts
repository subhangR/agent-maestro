import type { PipelineStage, PipelineStageName, PipelineStageStatus } from '../app/types/maestro';

// ---------------------------------------------------------------------------
// Canonical stage order for the pipeline visualization.
// ---------------------------------------------------------------------------
export const PIPELINE_STAGE_ORDER: PipelineStageName[] = [
  'ideate', 'design', 'build', 'test', 'host', 'db', 'realtime-db',
];

// ---------------------------------------------------------------------------
// Keyword → stage mapping used when events lack an explicit metadata.stage tag.
// Rules:
//   • More-specific stages (realtime-db, db, host) are listed before broader
//     ones (build, design, ideate) so that a message about "realtime websocket
//     database" resolves to 'realtime-db' rather than 'db' or 'build'.
//   • A single event message may match multiple stages; all matched stages
//     receive the attributed status — the pipeline accumulates evidence.
//   • Add new keywords here to extend coverage without touching any other file.
// ---------------------------------------------------------------------------
const STAGE_KEYWORDS: [PipelineStageName, RegExp][] = [
  ['realtime-db', /realtime|websocket|socket\.io|\bsocket\b|live.?update|firebase|supabase|real.time.db|streaming.db/i],
  ['db',          /\bdatabase\b|\bdb\b|\bsql\b|mongo|postgres|redis|migrat|data.store|\borm\b|prisma|drizzle|sqlite/i],
  ['host',        /\bdeploy|\bhosting\b|server.?setup|production|release\b|publish|launch.?app|infra|cloud|docker|kubernetes|nginx/i],
  ['test',        /\btest|\bspec\b|verif|validat|debug|quality.?assur|jest|vitest|cypress|pytest|coverage|lint/i],
  ['build',       /\bbuilding\b|\bimplement|\bcoding\b|\bdevelop|\bwriting code|scaffold|refactor|creat.+(component|feature|module|class|function)/i],
  ['design',      /\bdesign\b|architect|blueprint|\bschema\b|\bdata model\b|interface.?design|api.?design|wireframe|mockup|structure/i],
  ['ideate',      /ideate|brainstorm|ideation|requirement|\bscop(e|ing)\b|\bresearch\b|explor|analyz|investigat|planning|initial.?(thought|idea)/i],
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

    // session_started with no keyword match seeds the first stage (ideate).
    if (matchedStages.length === 0 && event.type === 'session_started') {
      matchedStages.push('ideate');
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
