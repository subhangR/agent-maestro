import * as React from 'react';
import { Badge } from 'maestro-mobile-ds';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}
  >
    {children}
  </div>
);

export const Lifecycle = () => (
  <Frame>
    <Badge tone="run" dot>
      running
    </Badge>
    <Badge tone="wait" dot>
      waiting
    </Badge>
    <Badge tone="block" dot>
      blocked
    </Badge>
    <Badge tone="info" dot>
      info
    </Badge>
    <Badge tone="idle" dot>
      idle
    </Badge>
  </Frame>
);

export const Meta = () => (
  <Frame>
    <Badge tone="accent">P1</Badge>
    <Badge tone="neutral">3 subtasks</Badge>
    <Badge tone="neutral">opus-4.8</Badge>
  </Frame>
);

export const Solid = () => (
  <Frame>
    <Badge tone="run" solid>
      live
    </Badge>
    <Badge tone="accent" solid>
      primary
    </Badge>
  </Frame>
);
