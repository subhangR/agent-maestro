import * as React from 'react';
import { StatusDot, Text } from 'maestro-mobile-ds';

const Cell = ({ status, label }: { status: any; label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <StatusDot status={status} />
    <Text as="span" variant="label">
      {label}
    </Text>
  </div>
);

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mds-root"
    style={{ background: 'var(--bg-app)', padding: 20, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}
  >
    {children}
  </div>
);

export const Lifecycle = () => (
  <Frame>
    <Cell status="run" label="running" />
    <Cell status="wait" label="waiting" />
    <Cell status="block" label="blocked" />
    <Cell status="info" label="info" />
    <Cell status="idle" label="idle" />
  </Frame>
);

export const Sizes = () => (
  <Frame>
    <StatusDot status="run" size={6} />
    <StatusDot status="run" size={10} />
    <StatusDot status="run" size={14} />
  </Frame>
);
