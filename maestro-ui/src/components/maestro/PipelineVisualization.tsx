import React from 'react';
import type { PipelineStage, PipelineStageName } from '../../app/types/maestro';

/* ---------------------------------------------------------------------------
   PipelineVisualization — horizontal strip showing the 7 canonical pipeline
   stages (ideate → design → build → test → host → db → realtime-db) with
   per-stage status: pending / active / done / failed.

   Rendered at the top of the SessionActivityPanel chat feed when at least one
   stage is non-pending (i.e., when the session has real pipeline activity).
   Data is derived by derivePipeline() from the live SessionTimelineEvent stream.
--------------------------------------------------------------------------- */

const STAGE_LABELS: Record<PipelineStageName, string> = {
  'ideate':      'Ideate',
  'design':      'Design',
  'build':       'Build',
  'test':        'Test',
  'host':        'Host',
  'db':          'DB',
  'realtime-db': 'Realtime',
};

const IconDone = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

const IconFailed = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const IconActive = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="pn-pipeline__spin">
    <path d="M12 3a9 9 0 1 0 9 9" opacity=".9" />
  </svg>
);

interface Props {
  stages: PipelineStage[];
}

export function PipelineVisualization({ stages }: Props) {
  // Only render when there is real pipeline activity.
  const hasActivity = stages.some((s) => s.status !== 'pending');
  if (!hasActivity) return null;

  return (
    <div className="pn-pipeline" role="list" aria-label="Pipeline stages">
      {stages.map((stage, i) => {
        const isLast = i === stages.length - 1;
        return (
          <React.Fragment key={stage.name}>
            <div
              className={`pn-pipeline__stage pn-pipeline__stage--${stage.status}`}
              role="listitem"
              title={stage.agentLabel ? `${STAGE_LABELS[stage.name]} · ${stage.agentLabel}` : STAGE_LABELS[stage.name]}
            >
              <div className="pn-pipeline__ic">
                {stage.status === 'done'   && <IconDone />}
                {stage.status === 'failed' && <IconFailed />}
                {stage.status === 'active' && <IconActive />}
              </div>
              <span className="pn-pipeline__label">{STAGE_LABELS[stage.name]}</span>
              {stage.agentLabel && (
                <span className="pn-pipeline__agent">{stage.agentLabel}</span>
              )}
            </div>
            {!isLast && <div className="pn-pipeline__arrow" aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
