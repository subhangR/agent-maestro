import React from 'react';
import type { PipelineStage, PipelineStageName } from '../../app/types/maestro';

/* ---------------------------------------------------------------------------
   PipelineVisualization — horizontal strip showing the product-build pipeline
   stages (empathize → define → ideate → design → build → secure → test →
   review → ship → analyze) with per-stage status: pending / active / done /
   failed. Leading stages a simpler task skips are trimmed (see below).

   Rendered at the top of the SessionActivityPanel chat feed when at least one
   stage is non-pending (i.e., when the session has real pipeline activity).
   Data is derived by derivePipeline() from the live SessionTimelineEvent stream.
--------------------------------------------------------------------------- */

const STAGE_LABELS: Record<PipelineStageName, string> = {
  'empathize': 'Empathize',
  'define':    'Define',
  'ideate':    'Ideate',
  'design':    'Design',
  'build':     'Build',
  'secure':    'Secure',
  'test':      'Test',
  'review':    'Review',
  'ship':      'Ship',
  'analyze':   'Analyze',
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
  const firstReached = stages.findIndex((s) => s.status !== 'pending');
  if (firstReached === -1) return null;

  // Skip the leading stages a (simpler) task never reached: a task that begins
  // at Build or Test shows the flow starting there rather than a row of empty
  // Empathize/Define/Ideate/Design stages. Trailing pending stages remain as the
  // roadmap of what's still ahead.
  const visibleStages = stages.slice(firstReached);

  return (
    <div className="pn-pipeline" role="list" aria-label="Pipeline stages">
      {visibleStages.map((stage, i) => {
        const isLast = i === visibleStages.length - 1;
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
